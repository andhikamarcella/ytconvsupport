import { query } from '../../lib/db.js';
import { sendStatusUpdateEmail } from '../../lib/emailjs.js';
import { json, readJson, handleError, HttpError } from '../../lib/http.js';
import { requireAdmin, isValidTicketId, normalizeTicketId } from '../../lib/security.js';
import { adminTicket, STATUSES } from '../../lib/tickets.js';

export default async function handler(req, res) {
  try {
    requireAdmin(req);

    if (req.method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 50)));
      const offset = Math.max(0, Number(req.query?.offset || 0));
      const status = String(req.query?.status || '').trim();
      const search = String(req.query?.q || '').trim();

      const conditions = [];
      const params = [];
      if (status && Object.hasOwn(STATUSES, status)) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search.slice(0, 120)}%`);
        const i = params.length;
        conditions.push(`(ticket_id ILIKE $${i} OR name ILIKE $${i} OR email ILIKE $${i} OR description ILIKE $${i})`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit, offset);
      const result = await query(
        `SELECT * FROM support_tickets
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      const countParams = params.slice(0, -2);
      const countResult = await query(`SELECT COUNT(*)::int AS count FROM support_tickets ${where}`, countParams);

      return json(res, 200, {
        ok: true,
        tickets: result.rows.map(adminTicket),
        total: countResult.rows[0].count,
        limit,
        offset
      });
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req, 16_000);
      const ticketId = normalizeTicketId(body.ticketId || body.ticket_id);
      const status = String(body.status || '').trim();
      const publicNote = String(body.publicNote ?? body.public_note ?? '').replace(/\u0000/g, '').trim();

      if (!isValidTicketId(ticketId)) throw new HttpError(400, 'ID tiket tidak valid.', 'INVALID_TICKET_ID');
      if (!Object.hasOwn(STATUSES, status)) throw new HttpError(400, 'Status tiket tidak valid.', 'INVALID_STATUS');
      if (publicNote.length > 1000) throw new HttpError(400, 'Catatan publik maksimal 1000 karakter.', 'NOTE_TOO_LONG');

      const result = await query(
        `UPDATE support_tickets
         SET status = $2, public_note = $3, updated_at = NOW()
         WHERE ticket_id = $1
         RETURNING *`,
        [ticketId, status, publicNote]
      );
      if (!result.rowCount) throw new HttpError(404, 'Tiket tidak ditemukan.', 'TICKET_NOT_FOUND');

      const ticket = adminTicket(result.rows[0]);
      let notificationSent = false;
      try {
        const notification = await sendStatusUpdateEmail(ticket);
        notificationSent = notification.sent;
      } catch (error) {
        console.error(`[ticket ${ticketId}] status email failed:`, error.message);
      }

      return json(res, 200, { ok: true, ticket, notificationSent });
    }

    return json(res, 405, { ok: false, error: 'Metode tidak diizinkan.' });
  } catch (error) {
    return handleError(res, error);
  }
}
