import { readTicket, writeTicket } from '../../lib/cloudinary-store.js';
import { sendTicketEmails } from '../../lib/emailjs.js';
import { json, readJson, handleError, HttpError } from '../../lib/http.js';
import { requireAdmin, normalizeTicketId, isValidTicketId } from '../../lib/security.js';
import { CATEGORIES } from '../../lib/tickets.js';

export default async function handler(req, res) {
  try {
    requireAdmin(req);
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Metode tidak diizinkan.' });
    const body = await readJson(req, 8000);
    const ticketId = normalizeTicketId(body.ticketId || body.ticket_id);
    if (!isValidTicketId(ticketId)) throw new HttpError(400, 'ID tiket tidak valid.', 'INVALID_TICKET_ID');

    const ticket = await readTicket(ticketId);
    const delivery = await sendTicketEmails({
      ticketId: ticket.ticketId,
      name: ticket.name,
      email: ticket.email,
      category: ticket.category,
      categoryLabel: CATEGORIES[ticket.category] || ticket.category,
      description: ticket.description,
      createdAt: ticket.createdAt
    });
    ticket.emailSent = true;
    ticket.emailError = '';
    ticket.emailRetriedAt = new Date().toISOString();
    ticket.updatedAt = ticket.emailRetriedAt;
    await writeTicket(ticket);
    return json(res, 200, { ok: true, message: 'Email tiket berhasil dikirim ulang.', delivery });
  } catch (error) {
    return handleError(res, error);
  }
}
