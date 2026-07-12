import { getClientIp, json, readJson, handleError, HttpError } from '../../lib/http.js';
import { assertNotLocked, clearFailures, recordFailure } from '../../lib/memory-rate-limit.js';
import {
  clearAdminCookie,
  createAdminToken,
  hashIp,
  requireAdmin,
  setAdminCookie,
  verifyAdminCredentials
} from '../../lib/security.js';

function limiterKey(req) {
  return `admin:${hashIp(getClientIp(req)).slice(0, 64)}`;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const session = requireAdmin(req);
      return json(res, 200, { ok: true, authenticated: true, username: session.sub });
    }

    if (req.method === 'DELETE') {
      clearAdminCookie(res);
      return json(res, 200, { ok: true });
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Metode tidak diizinkan.' });

    const key = limiterKey(req);
    if (!assertNotLocked(key)) {
      throw new HttpError(429, 'Terlalu banyak percobaan login. Coba lagi nanti.', 'LOGIN_LOCKED');
    }

    const body = await readJson(req, 8_000);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!verifyAdminCredentials(username, password)) {
      recordFailure(
        key,
        Math.max(1, Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 5)),
        Math.max(60_000, Number(process.env.ADMIN_LOGIN_WINDOW_MS || 900000))
      );
      throw new HttpError(401, 'Username atau password salah.', 'INVALID_CREDENTIALS');
    }

    clearFailures(key);
    const token = createAdminToken(username);
    setAdminCookie(res, token);
    return json(res, 200, { ok: true, authenticated: true, username });
  } catch (error) {
    return handleError(res, error);
  }
}
