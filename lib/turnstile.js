import { HttpError } from './http.js';

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const strict = boolEnv('TURNSTILE_STRICT', true);

  if (!secret) {
    if (strict) throw new Error('TURNSTILE_SECRET_KEY belum dikonfigurasi.');
    return true;
  }
  if (!token) throw new HttpError(400, 'Verifikasi keamanan belum diselesaikan.', 'TURNSTILE_REQUIRED');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TURNSTILE_TIMEOUT_MS || 8000));
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal
    });
    const result = await response.json();
    if (!result.success) {
      throw new HttpError(400, 'Verifikasi keamanan gagal. Silakan muat ulang dan coba lagi.', 'TURNSTILE_FAILED');
    }
    return true;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.name === 'AbortError') {
      throw new HttpError(504, 'Verifikasi keamanan terlalu lama. Silakan coba lagi.', 'TURNSTILE_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
