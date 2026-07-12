import { readTicket } from '../lib/cloudinary-store.js';
import { json, handleError, HttpError } from '../lib/http.js';
import { isValidTicketId, normalizeTicketId } from '../lib/security.js';
import { publicTicket } from '../lib/tickets.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Metode tidak diizinkan.' });
    const ticketId = normalizeTicketId(req.query?.ticket_id || req.query?.ticketId);
    if (!isValidTicketId(ticketId)) {
      throw new HttpError(400, 'Format ID tiket tidak valid.', 'INVALID_TICKET_ID');
    }

    const ticket = await readTicket(ticketId);
    return json(res, 200, { ok: true, ticket: publicTicket(ticket) });
  } catch (error) {
    return handleError(res, error);
  }
}
