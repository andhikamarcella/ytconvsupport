import { query } from '../lib/db.js';
import { sendTicketEmails, emailMustSucceed } from '../lib/emailjs.js';
import { getClientIp, json, readJson, handleError, HttpError } from '../lib/http.js';
import { generateTicketId, hashIp, isValidTicketId } from '../lib/security.js';
import { CATEGORIES, STATUSES, validateTicketInput } from '../lib/tickets.js';
import { verifyTurnstile } from '../lib/turnstile.js';

async function uniqueTicketId(requestedTicketId) {
  let candidate = isValidTicketId(requestedTicketId) ? requestedTicketId : generateTicketId();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const existing = await query('SELECT 1 FROM support_tickets WHERE ticket_id = $1 LIMIT 1', [candidate]);
    if (existing.rowCount === 0) return candidate;
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
    const recent = await query(
      `SELECT COUNT(*)::int AS count
       FROM support_tickets
       WHERE ip_hash = $1
         AND created_at >= NOW() - ($2::bigint * INTERVAL '1 millisecond')`,
      [ipHash, windowMs]
    );
    if (recent.rows[0].count >= limit) {
      throw new HttpError(429, 'Terlalu banyak tiket dibuat. Silakan coba lagi beberapa menit lagi.', 'RATE_LIMITED');
    }

    const ticketId = await uniqueTicketId(input.requestedTicketId);
    const inserted = await query(
      `INSERT INTO support_tickets
        (ticket_id, name, email, category, description, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [ticketId, input.name, input.email, input.category, input.description, ipHash]
    );

    const row = inserted.rows[0];
    let emailSent = false;
    let emailError = '';
    let statusUrl = `${(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')}/ticket-status.html?ticket_id=${encodeURIComponent(ticketId)}`;

    try {
      const delivery = await sendTicketEmails({
        ticketId,
        name: row.name,
        email: row.email,
        category: row.category,
        categoryLabel: CATEGORIES[row.category],
        description: row.description,
        createdAt: row.created_at
      });
      emailSent = true;
      statusUrl = delivery.statusUrl;
    } catch (error) {
      emailError = String(error.message || error).slice(0, 500);
      console.error(`[ticket ${ticketId}] email failed:`, emailError);
    }

    await query(
      `UPDATE support_tickets
       SET email_sent = $2, email_error = $3, updated_at = NOW()
       WHERE ticket_id = $1`,
      [ticketId, emailSent, emailError || null]
    );

    if (!emailSent && emailMustSucceed()) {
      throw new HttpError(502, `Tiket ${ticketId} tersimpan, tetapi email belum terkirim. Simpan ID tiket ini dan coba hubungi support.`, 'EMAIL_DELIVERY_FAILED');
    }

    return json(res, 201, {
      ok: true,
      ticket: {
        ticketId,
        status: 'open',
        statusLabel: STATUSES.open,
        category: row.category,
        categoryLabel: CATEGORIES[row.category],
        createdAt: row.created_at,
        statusUrl
      },
      emailSent,
      message: emailSent
        ? 'Tiket berhasil dibuat dan dikirim ke tim support.'
        : 'Tiket berhasil dibuat. Pengiriman email sedang bermasalah, tetapi tiket tetap tersimpan.'
    });
  } catch (error) {
    return handleError(res, error);
  }
}
