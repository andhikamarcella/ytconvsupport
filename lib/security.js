import crypto from 'node:crypto';
import { HttpError, parseCookies } from './http.js';

const TICKET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_COOKIE = 'ytconv_support_admin';

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function constantEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function hashIp(ip) {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error('SESSION_SECRET atau ADMIN_JWT_SECRET wajib dikonfigurasi.');
  return crypto.createHmac('sha256', secret).update(String(ip)).digest('hex');
}

export function generateTicketId(length = 12) {
  const bytes = crypto.randomBytes(length);
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length];
  }
  return `TKT-${value}`;
}

export function normalizeTicketId(value) {
  return String(value || '').trim().toUpperCase();
}

export function isValidTicketId(value) {
  return /^TKT-[A-Z0-9]{10,16}$/.test(normalizeTicketId(value));
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function createAdminToken(username) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('ADMIN_JWT_SECRET minimal 32 karakter.');
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(process.env.ADMIN_SESSION_TTL_SECONDS || 86400);
  const payload = base64url(JSON.stringify({ sub: username, iat: now, exp: now + ttl, role: 'admin' }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminToken(token) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || !token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !constantEqual(signature, sign(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.role !== 'admin' || Number(data.exp) <= Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function requireAdmin(req) {
  const authorization = String(req.headers.authorization || '');
  const configuredBearer = process.env.ADMIN_BEARER;
  if (configuredBearer && authorization.startsWith('Bearer ')) {
    const supplied = authorization.slice(7).trim();
    if (constantEqual(supplied, configuredBearer)) return { sub: 'bearer-admin', role: 'admin' };
  }

  const token = parseCookies(req)[SESSION_COOKIE];
  const session = verifyAdminToken(token);
  if (!session) throw new HttpError(401, 'Sesi admin tidak valid atau sudah berakhir.', 'UNAUTHORIZED');
  return session;
}

export function setAdminCookie(res, token) {
  const ttl = Number(process.env.ADMIN_SESSION_TTL_SECONDS || 86400);
  const secure = (process.env.APP_ENV || process.env.NODE_ENV) === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure}`);
}

export function clearAdminCookie(res) {
  const secure = (process.env.APP_ENV || process.env.NODE_ENV) === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function verifyAdminCredentials(username, password) {
  if (!username || !password) return false;
  const hasUserConfig = Boolean(process.env.ADMIN_USER_HASH || process.env.ADMIN_USERNAME);
  const hasPassConfig = Boolean(process.env.ADMIN_PASS_HASH || process.env.ADMIN_PASSWORD);
  if (!hasUserConfig || !hasPassConfig) return false;

  const expectedUserHash = process.env.ADMIN_USER_HASH || sha256(process.env.ADMIN_USERNAME);
  const expectedPassHash = process.env.ADMIN_PASS_HASH || sha256(process.env.ADMIN_PASSWORD);
  return constantEqual(sha256(username), expectedUserHash) && constantEqual(sha256(password), expectedPassHash);
}
