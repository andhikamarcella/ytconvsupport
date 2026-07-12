import crypto from 'node:crypto';

const STORAGE_VERSION = 1;
const DEFAULT_LIST_MAX = 500;
const MAX_LIST_MAX = 2000;
let cachedResources = null;
let cachedResourcesAt = 0;

function numberEnv(name, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function publicStorageError(code, message, status = 503, cause) {
  const error = new Error(message);
  error.cause = cause;
  error.publicStatus = status;
  error.publicCode = code;
  error.publicMessage = message;
  return error;
}

function isPlaceholder(value) {
  return !value || /^(generate|change|replace|your[_-]|xxxx|example)/i.test(String(value).trim());
}

function parseCloudinaryUrl() {
  const raw = process.env.TICKET_CLOUDINARY_URL || process.env.CLOUDINARY_URL;
  if (!raw) {
    throw publicStorageError(
      'CLOUDINARY_URL_MISSING',
      'Cloudinary belum dikonfigurasi. Isi CLOUDINARY_URL pada Environment Variables Vercel.'
    );
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (cause) {
    throw publicStorageError('CLOUDINARY_URL_INVALID', 'Format CLOUDINARY_URL tidak valid.', 503, cause);
  }

  if (parsed.protocol !== 'cloudinary:' || !parsed.username || !parsed.password || !parsed.hostname) {
    throw publicStorageError(
      'CLOUDINARY_URL_INVALID',
      'CLOUDINARY_URL harus berbentuk cloudinary://API_KEY:API_SECRET@CLOUD_NAME.'
    );
  }

  return {
    apiKey: decodeURIComponent(parsed.username),
    apiSecret: decodeURIComponent(parsed.password),
    cloudName: parsed.hostname
  };
}

function ticketFolder() {
  const base = process.env.CLOUDINARY_TICKET_FOLDER
    || `${process.env.CLOUDINARY_UPLOAD_FOLDER || 'ytconv'}/tickets`;
  const cleaned = String(base).trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (!cleaned || !/^[A-Za-z0-9_./-]+$/.test(cleaned)) {
    throw publicStorageError('CLOUDINARY_FOLDER_INVALID', 'CLOUDINARY_TICKET_FOLDER tidak valid.');
  }
  return cleaned;
}

function encryptionKey() {
  const source = process.env.TICKET_ENCRYPTION_KEY
    || process.env.ENCRYPTION_KEY
    || process.env.SESSION_SECRET
    || process.env.ADMIN_JWT_SECRET;

  if (isPlaceholder(source) || String(source).length < 32) {
    throw publicStorageError(
      'TICKET_ENCRYPTION_KEY_MISSING',
      'TICKET_ENCRYPTION_KEY belum aman. Buat secret acak minimal 32 karakter dan jangan mengubahnya setelah tiket tersimpan.'
    );
  }

  return crypto.createHash('sha256').update(String(source)).digest();
}

function publicId(ticketId) {
  return `${ticketFolder()}/${ticketId}.json`;
}

function encryptTicket(ticket) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(ticket), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({
    version: STORAGE_VERSION,
    algorithm: 'A256GCM',
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    data: ciphertext.toString('base64url')
  }), 'utf8');
}

function decryptTicket(buffer) {
  try {
    const envelope = JSON.parse(Buffer.from(buffer).toString('utf8'));
    if (envelope.version !== STORAGE_VERSION || envelope.algorithm !== 'A256GCM') {
      throw new Error('Versi data tiket tidak didukung.');
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(envelope.iv, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64url')),
      decipher.final()
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch (cause) {
    throw publicStorageError(
      'TICKET_DECRYPT_FAILED',
      'Data tiket tidak dapat dibuka. Pastikan TICKET_ENCRYPTION_KEY tidak berubah.',
      500,
      cause
    );
  }
}

function signature(params, apiSecret) {
  const canonical = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : String(value)}`)
    .join('&');
  return crypto.createHash('sha1').update(`${canonical}${apiSecret}`).digest('hex');
}

async function parseResponse(response, fallbackMessage) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || fallbackMessage;
    const error = publicStorageError(
      response.status === 404 ? 'TICKET_NOT_FOUND' : 'CLOUDINARY_ERROR',
      response.status === 404 ? 'Tiket tidak ditemukan.' : `Cloudinary gagal merespons: ${message}`,
      response.status === 404 ? 404 : 503
    );
    error.cloudinaryStatus = response.status;
    throw error;
  }
  return payload;
}

async function adminRequest(path, query = {}) {
  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl();
  const url = new URL(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(numberEnv('CLOUDINARY_TIMEOUT_MS', 15_000, 3_000, 50_000))
    });
  } catch (cause) {
    throw publicStorageError('CLOUDINARY_UNAVAILABLE', 'Cloudinary sedang tidak dapat dijangkau.', 503, cause);
  }
  return parseResponse(response, 'Permintaan Admin API gagal.');
}

async function uploadEncryptedTicket(ticket) {
  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl();
  const timestamp = Math.floor(Date.now() / 1000);
  const id = publicId(ticket.ticketId);
  const tags = [
    'ytconv_support_ticket',
    ticket.ipHash ? `ip_${String(ticket.ipHash).slice(0, 32)}` : ''
  ].filter(Boolean).join(',');

  const signed = {
    invalidate: 'true',
    overwrite: 'true',
    public_id: id,
    tags,
    timestamp
  };

  const form = new FormData();
  form.set('file', `data:application/json;base64,${encryptTicket(ticket).toString('base64')}`);
  form.set('api_key', apiKey);
  form.set('timestamp', String(timestamp));
  form.set('signature', signature(signed, apiSecret));
  form.set('public_id', id);
  form.set('overwrite', 'true');
  form.set('invalidate', 'true');
  form.set('tags', tags);

  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/raw/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(numberEnv('CLOUDINARY_TIMEOUT_MS', 15_000, 3_000, 50_000))
    });
  } catch (cause) {
    throw publicStorageError('CLOUDINARY_UNAVAILABLE', 'Tiket gagal disimpan karena Cloudinary tidak dapat dijangkau.', 503, cause);
  }

  const result = await parseResponse(response, 'Upload tiket gagal.');
  cachedResources = null;
  cachedResourcesAt = 0;
  return result;
}

async function resourceDetails(ticketId) {
  return adminRequest(`/resources/raw/upload/${encodeURIComponent(publicId(ticketId))}`);
}

async function downloadEncryptedResource(resource) {
  const url = new URL(resource.secure_url || resource.url);
  url.searchParams.set('_ticket_version', String(resource.version || Date.now()));

  let response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json, application/octet-stream;q=0.9' },
      signal: AbortSignal.timeout(numberEnv('CLOUDINARY_TIMEOUT_MS', 15_000, 3_000, 50_000))
    });
  } catch (cause) {
    throw publicStorageError('CLOUDINARY_UNAVAILABLE', 'Data tiket gagal diunduh dari Cloudinary.', 503, cause);
  }

  if (!response.ok) {
    throw publicStorageError(
      response.status === 404 ? 'TICKET_NOT_FOUND' : 'CLOUDINARY_DOWNLOAD_FAILED',
      response.status === 404 ? 'Tiket tidak ditemukan.' : 'Data tiket gagal diunduh dari Cloudinary.',
      response.status === 404 ? 404 : 503
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function writeTicket(ticket) {
  await uploadEncryptedTicket(ticket);
  return ticket;
}

export async function readTicket(ticketId) {
  const resource = await resourceDetails(ticketId);
  return decryptTicket(await downloadEncryptedResource(resource));
}

export async function ticketExists(ticketId) {
  try {
    await resourceDetails(ticketId);
    return true;
  } catch (error) {
    if (error?.publicCode === 'TICKET_NOT_FOUND') return false;
    throw error;
  }
}

export async function listTicketResources({ force = false } = {}) {
  const cacheMs = numberEnv('CLOUDINARY_LIST_CACHE_MS', 8_000, 0, 60_000);
  if (!force && cachedResources && Date.now() - cachedResourcesAt < cacheMs) return cachedResources;

  const maxTotal = numberEnv('CLOUDINARY_TICKET_LIST_MAX', DEFAULT_LIST_MAX, 1, MAX_LIST_MAX);
  const resources = [];
  let nextCursor = '';

  do {
    const remaining = maxTotal - resources.length;
    if (remaining <= 0) break;
    const page = await adminRequest('/resources/raw/upload', {
      prefix: `${ticketFolder()}/`,
      max_results: Math.min(500, remaining),
      next_cursor: nextCursor,
      tags: true
    });
    resources.push(...(page.resources || []));
    nextCursor = page.next_cursor || '';
  } while (nextCursor);

  resources.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  cachedResources = resources;
  cachedResourcesAt = Date.now();
  return resources;
}

export async function listTickets({ force = false } = {}) {
  const resources = await listTicketResources({ force });
  const concurrency = numberEnv('CLOUDINARY_READ_CONCURRENCY', 8, 1, 20);
  const tickets = await mapConcurrent(resources, concurrency, async (resource) => {
    try {
      return decryptTicket(await downloadEncryptedResource(resource));
    } catch (error) {
      console.error(`[cloudinary] gagal membaca ${resource.public_id}:`, error.message);
      return null;
    }
  });
  return tickets.filter(Boolean).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export async function countRecentTicketsByIp(ipHash, windowMs) {
  const tag = `ip_${String(ipHash).slice(0, 32)}`;
  const threshold = Date.now() - windowMs;
  const resources = await listTicketResources({ force: true });
  return resources.filter((resource) => {
    const tags = Array.isArray(resource.tags) ? resource.tags : [];
    return tags.includes(tag) && new Date(resource.created_at || 0).getTime() >= threshold;
  }).length;
}

export async function storageHealth() {
  const startedAt = Date.now();
  await adminRequest('/resources/raw/upload', {
    prefix: `${ticketFolder()}/`,
    max_results: 1
  });
  const { cloudName } = parseCloudinaryUrl();
  return {
    ok: true,
    provider: 'cloudinary',
    cloudName,
    folder: ticketFolder(),
    encrypted: true,
    latencyMs: Date.now() - startedAt
  };
}

export const __test = { encryptTicket, decryptTicket, signature };
