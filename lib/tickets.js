import { HttpError } from './http.js';

export const CATEGORIES = {
  download: 'Masalah unduhan',
  conversion: 'Masalah konversi',
  account: 'Akun dan login',
  playlist: 'Playlist',
  subtitle: 'Subtitle',
  privacy: 'Privasi dan keamanan',
  suggestion: 'Saran dan masukan',
  other: 'Lainnya'
};

export const STATUSES = {
  open: 'Tiket diterima',
  in_review: 'Sedang diperiksa',
  waiting_user: 'Menunggu balasan pengguna',
  resolved: 'Selesai',
  closed: 'Ditutup'
};

function cleanText(value) {
  return String(value || '').replace(/\u0000/g, '').trim();
}

export function validateTicketInput(input) {
  const name = cleanText(input.name);
  const email = cleanText(input.email).toLowerCase();
  const category = cleanText(input.category);
  const description = cleanText(input.description);
  const requestedTicketId = cleanText(input.ticketId || input.ticket_id).toUpperCase();

  if (name.length < 2 || name.length > 80) {
    throw new HttpError(400, 'Nama harus berisi 2–80 karakter.', 'INVALID_NAME');
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
    throw new HttpError(400, 'Alamat email tidak valid.', 'INVALID_EMAIL');
  }
  if (!Object.hasOwn(CATEGORIES, category)) {
    throw new HttpError(400, 'Kategori tiket tidak valid.', 'INVALID_CATEGORY');
  }
  if (description.length < 20 || description.length > 3000) {
    throw new HttpError(400, 'Deskripsi harus berisi 20–3000 karakter.', 'INVALID_DESCRIPTION');
  }

  return { name, email, category, description, requestedTicketId };
}

export function publicTicket(row) {
  return {
    ticketId: row.ticket_id,
    category: row.category,
    categoryLabel: CATEGORIES[row.category] || row.category,
    status: row.status,
    statusLabel: STATUSES[row.status] || row.status,
    publicNote: row.public_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function adminTicket(row) {
  return {
    ...publicTicket(row),
    name: row.name,
    email: row.email,
    description: row.description,
    emailSent: Boolean(row.email_sent),
    emailError: row.email_error || ''
  };
}
