export function setApiHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

export function json(res, status, payload) {
  setApiHeaders(res);
  return res.status(status).json(payload);
}

export async function readJson(req, maxBytes = 32_000) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > maxBytes) throw new HttpError(413, 'Permintaan terlalu besar.');
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      throw new HttpError(400, 'Format JSON tidak valid.');
    }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Permintaan terlalu besar.');
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Format JSON tidak valid.');
  }
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) return forwarded[0] || 'unknown';
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

export class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function handleError(res, error) {
  if (error instanceof HttpError) {
    return json(res, error.status, { ok: false, error: error.message, code: error.code });
  }

  if (error?.publicStatus && error?.publicCode && error?.publicMessage) {
    console.error('[api]', error.cause || error);
    return json(res, error.publicStatus, {
      ok: false,
      error: error.publicMessage,
      code: error.publicCode
    });
  }

  console.error('[api]', error);
  return json(res, 500, {
    ok: false,
    error: 'Terjadi gangguan pada server. Silakan coba lagi.',
    code: 'INTERNAL_ERROR'
  });
}
