import { query } from '../../lib/db.js';
import { getClientIp, json, readJson, handleError, HttpError } from '../../lib/http.js';
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

async function checkLock(key) {
  const result = await query('SELECT * FROM support_auth_limits WHERE limiter_key = $1', [key]);
  if (!result.rowCount) return null;
  const row = result.rows[0];
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    throw new HttpError(429, 'Terlalu banyak percobaan login. Coba lagi nanti.', 'LOGIN_LOCKED');
  }
  return row;
}

async function recordFailure(key, existing) {
  const maxAttempts = Math.max(1, Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 5));
  const windowMs = Math.max(60_000, Number(process.env.ADMIN_LOGIN_WINDOW_MS || 900000));
  const now = Date.now();
  const windowStart = existing?.window_started_at ? new Date(existing.window_started_at).getTime() : 0;
  const withinWindow = windowStart && now - windowStart < windowMs;
  const attempts = withinWindow ? Number(existing.attempts || 0) + 1 : 1;
  const lockedUntil = attempts >= maxAttempts ? new Date(now + windowMs) : null;

  await query(
    `INSERT INTO support_auth_limits (limiter_key, attempts, window_started_at, locked_until)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (limiter_key) DO UPDATE SET
       attempts = EXCLUDED.attempts,
       window_started_at = CASE
         WHEN support_auth_limits.window_started_at < NOW() - ($4::bigint * INTERVAL '1 millisecond')
         THEN NOW() ELSE support_auth_limits.window_started_at END,
       locked_until = EXCLUDED.locked_until`,
    [key, attempts, lockedUntil, windowMs]
  );
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
    const existing = await checkLock(key);
    const body = await readJson(req, 8_000);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!verifyAdminCredentials(username, password)) {
      await recordFailure(key, existing);
      throw new HttpError(401, 'Username atau password salah.', 'INVALID_CREDENTIALS');
    }

    await query('DELETE FROM support_auth_limits WHERE limiter_key = $1', [key]);
    const token = createAdminToken(username);
    setAdminCookie(res, token);
    return json(res, 200, { ok: true, authenticated: true, username });
  } catch (error) {
    return handleError(res, error);
  }
}
