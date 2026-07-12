import { query } from '../lib/db.js';
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

    const result = await query(
      `SELECT ticket_id, category, status, public_note, created_at, updated_at
       FROM support_tickets
       WHERE ticket_id = $1
       LIMIT 1`,
      [ticketId]
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Tiket tidak ditemukan. Periksa kembali ID tiket.', 'TICKET_NOT_FOUND');
    }

    return json(res, 200, { ok: true, ticket: publicTicket(result.rows[0]) });
  } catch (error) {
    return handleError(res, error);
  }
}
