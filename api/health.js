import { query } from '../lib/db.js';
import { json, handleError } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Metode tidak diizinkan.' });
    await query('SELECT 1 AS ok');
    return json(res, 200, { ok: true, service: 'ytconv-support', time: new Date().toISOString() });
  } catch (error) {
    return handleError(res, error);
  }
}
