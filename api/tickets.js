import { countRecentTicketsByIp, ticketExists, writeTicket } from '../lib/cloudinary-store.js';
import { sendTicketEmails, emailMustSucceed } from '../lib/emailjs.js';
import { getClientIp, json, readJson, handleError, HttpError } from '../lib/http.js';
import { generateTicketId, hashIp, isValidTicketId } from '../lib/security.js';
import { CATEGORIES, STATUSES, validateTicketInput } from '../lib/tickets.js';
import { verifyTurnstile } from '../lib/turnstile.js';

async function uniqueTicketId(requestedTicketId) {
  let candidate = isValidTicketId(requestedTicketId) ? requestedTicketId : generateTicketId();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (!await ticketExists(candidate)) return candidate;
    candidate = generateTicketId();
  }
  throw new Error('Tidak dapat membuat ID tiket unik.');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Metode tidak diizinkan.' });

    const body = await readJson(req);
    const input = validateTicketInput(body);
    const clientIp = getClientIp(req);
    await verifyTurnstile(body.turnstileToken, clientIp);

    const ipHash = hashIp(clientIp);
    const windowMs = Math.max(60_000, Number(process.env.TICKET_RATE_LIMIT_WINDOW_MS || 300000));
    const limit = Math.max(1, Number(process.env.TICKET_RATE_LIMIT_MAX || 5));
    const recentCount = await countRecentTicketsByIp(ipHash, windowMs);
    if (recentCount >= limit) {
      throw new HttpError(429, 'Terlalu banyak tiket dibuat. Silakan coba lagi beberapa menit lagi.', 'RATE_LIMITED');
    }

    const ticketId = await uniqueTicketId(input.requestedTicketId);
    const now = new Date().toISOString();
    const ticket = {
      storageVersion: 1,
      ticketId,
      name: input.name,
      email: input.email,
      category: input.category,
      description: input.description,
      status: 'open',
      publicNote: '',
      ipHash,
      emailSent: false,
      emailError: '',
      createdAt: now,
      updatedAt: now
    };

    await writeTicket(ticket);

    let statusUrl = `${(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')}/ticket-status.html?ticket_id=${encodeURIComponent(ticketId)}`;
    try {
      const delivery = await sendTicketEmails({
        ticketId,
        name: ticket.name,
        email: ticket.email,
        category: ticket.category,
        categoryLabel: CATEGORIES[ticket.category],
        description: ticket.description,
        createdAt: ticket.createdAt
      });
      ticket.emailSent = true;
      statusUrl = delivery.statusUrl;
    } catch (error) {
      ticket.emailError = String(error.message || error).slice(0, 500);
      console.error(`[ticket ${ticketId}] email failed:`, ticket.emailError);
    }

    ticket.updatedAt = new Date().toISOString();
    await writeTicket(ticket);

    if (!ticket.emailSent && emailMustSucceed()) {
      throw new HttpError(502, `Tiket ${ticketId} tersimpan, tetapi email belum terkirim. Simpan ID tiket ini dan coba hubungi support.`, 'EMAIL_DELIVERY_FAILED');
    }

    return json(res, 201, {
      ok: true,
      ticket: {
        ticketId,
        status: ticket.status,
        statusLabel: STATUSES.open,
        category: ticket.category,
        categoryLabel: CATEGORIES[ticket.category],
        createdAt: ticket.createdAt,
        statusUrl
      },
      emailSent: ticket.emailSent,
      message: ticket.emailSent
        ? 'Tiket berhasil dibuat dan dikirim ke tim support.'
        : 'Tiket berhasil dibuat. Pengiriman email sedang bermasalah, tetapi tiket tetap tersimpan.'
    });
  } catch (error) {
    return handleError(res, error);
  }
}
