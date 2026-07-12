import { listTickets, readTicket, writeTicket } from '../../lib/cloudinary-store.js';
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
      const search = String(req.query?.q || '').trim().toLowerCase().slice(0, 120);

      let tickets = await listTickets();
      if (status && Object.hasOwn(STATUSES, status)) {
        tickets = tickets.filter((ticket) => ticket.status === status);
      }
      if (search) {
        tickets = tickets.filter((ticket) => [
          ticket.ticketId,
          ticket.name,
          ticket.email,
          ticket.description,
          ticket.category
        ].some((value) => String(value || '').toLowerCase().includes(search)));
      }

      const total = tickets.length;
      return json(res, 200, {
        ok: true,
        tickets: tickets.slice(offset, offset + limit).map(adminTicket),
        total,
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

      const ticketData = await readTicket(ticketId);
      ticketData.status = status;
      ticketData.publicNote = publicNote;
      ticketData.updatedAt = new Date().toISOString();
      await writeTicket(ticketData);

      const ticket = adminTicket(ticketData);
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
