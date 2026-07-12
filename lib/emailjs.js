const EMAILJS_SEND_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';
const EMAILJS_HISTORY_ENDPOINT = 'https://api.emailjs.com/api/v1.1/history';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envValue(name) {
  const value = String(process.env[name] || '').trim();
  const lower = value.toLowerCase();
  const placeholders = new Set([
    'service_xxxxxxx',
    'template_xxxxxxx',
    'xxxxxxxxxxxxxxxxxxxx',
    'your_service_id',
    'your_template_id',
    'your_public_key',
    'your_private_key'
  ]);
  if (!value || placeholders.has(lower) || lower.startsWith('replace-with-') || lower.startsWith('change-me')) return '';
  return value;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function maskEmail(value) {
  const [name = '', domain = ''] = String(value || '').split('@');
  if (!domain) return '';
  return `${name.slice(0, 2)}***@${domain}`;
}

export function getEmailConfiguration() {
  const serviceId = envValue('EMAILJS_SERVICE_ID');
  const adminTemplateId = envValue('EMAILJS_ADMIN_TEMPLATE_ID') || envValue('EMAILJS_TEMPLATE_ID');
  const publicKey = envValue('EMAILJS_PUBLIC_KEY');
  const privateKey = envValue('EMAILJS_PRIVATE_KEY');
  const inboxEmail = envValue('TICKET_INBOX_EMAIL') || envValue('SUPPORT_EMAIL') || 'help.ytconv@proton.me';
  const missing = [];
  if (!serviceId) missing.push('EMAILJS_SERVICE_ID');
  if (!adminTemplateId) missing.push('EMAILJS_ADMIN_TEMPLATE_ID');
  if (!publicKey) missing.push('EMAILJS_PUBLIC_KEY');

  return {
    configured: missing.length === 0,
    missing,
    serviceId,
    adminTemplateId,
    userTemplateId: envValue('EMAILJS_USER_TEMPLATE_ID'),
    statusTemplateId: envValue('EMAILJS_STATUS_TEMPLATE_ID'),
    publicKey,
    privateKey,
    inboxEmail,
    inboxMasked: maskEmail(inboxEmail)
  };
}

function assertConfig(templateId, label = 'template') {
  const config = getEmailConfiguration();
  const missing = [...config.missing];
  if (!templateId) missing.push(label);
  if (missing.length) {
    const error = new Error(`Konfigurasi EmailJS belum lengkap: ${[...new Set(missing)].join(', ')}.`);
    error.code = 'EMAILJS_NOT_CONFIGURED';
    error.publicStatus = 503;
    error.publicCode = error.code;
    error.publicMessage = error.message;
    throw error;
  }
  return config;
}

async function sendTemplate(templateId, params) {
  const config = assertConfig(templateId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5_000, Number(process.env.EMAILJS_TIMEOUT_MS || 15_000)));

  const payload = {
    service_id: config.serviceId,
    template_id: templateId,
    user_id: config.publicKey,
    template_params: params
  };
  if (config.privateKey) payload.accessToken = config.privateKey;

  try {
    const response = await fetch(EMAILJS_SEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`EmailJS menolak permintaan (${response.status}): ${text.slice(0, 500)}`);
      error.code = 'EMAILJS_SEND_FAILED';
      error.publicStatus = 502;
      error.publicCode = error.code;
      error.publicMessage = `EmailJS menolak pengiriman (${response.status}). Periksa Service ID, Template ID, Public Key, dan EmailJS History.`;
      throw error;
    }
    return { accepted: true, providerResponse: text.slice(0, 100) || 'OK' };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('EmailJS tidak merespons sebelum batas waktu habis.');
      timeoutError.code = 'EMAILJS_TIMEOUT';
      timeoutError.publicStatus = 504;
      timeoutError.publicCode = timeoutError.code;
      timeoutError.publicMessage = timeoutError.message;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function templateParams(ticket, toEmail) {
  const appName = process.env.APP_NAME || 'YTConv';
  const supportEmail = process.env.SUPPORT_EMAIL || 'help.ytconv@proton.me';
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const statusUrl = `${baseUrl}/ticket-status.html?ticket_id=${encodeURIComponent(ticket.ticketId)}`;
  const createdAt = new Date(ticket.createdAt || Date.now()).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const title = `[${ticket.ticketId}] ${ticket.categoryLabel || ticket.category || 'Tiket bantuan'}`;
  const message = String(ticket.description || 'Email pengujian YTConv Support');
  const customerName = String(ticket.name || 'Pengujian YTConv Support');
  const customerEmail = String(ticket.email || supportEmail);

  // Alias sengaja dibuat lengkap agar cocok dengan template Contact Us EmailJS bawaan maupun template khusus.
  return {
    app_name: appName,
    ticket_id: ticket.ticketId,
    title,
    subject: title,
    to_email: toEmail,
    recipient_email: toEmail,
    support_email: supportEmail,
    name: customerName,
    from_name: customerName,
    customer_name: customerName,
    email: customerEmail,
    from_email: customerEmail,
    customer_email: customerEmail,
    reply_to: customerEmail,
    category: String(ticket.categoryLabel || ticket.category || '-'),
    description: message,
    message,
    status_url: statusUrl,
    created_at: createdAt
  };
}

async function inspectRecentHistory(ticketId) {
  const config = getEmailConfiguration();
  if (!config.privateKey) return { checked: false, reason: 'EMAILJS_PRIVATE_KEY tidak diisi' };
  try {
    await delay(700);
    const url = new URL(EMAILJS_HISTORY_ENDPOINT);
    url.searchParams.set('user_id', config.publicKey);
    url.searchParams.set('accessToken', config.privateKey);
    url.searchParams.set('page', '1');
    url.searchParams.set('count', '10');
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return { checked: false, reason: `history ${response.status}` };
    const payload = await response.json();
    const row = (payload.rows || []).find((entry) => String(entry.template_params || '').includes(ticketId));
    if (!row) return { checked: false, reason: 'belum muncul di history' };
    if (Number(row.result) === 2 || row.error) {
      const error = new Error(`Provider email gagal: ${String(row.error || 'unknown provider error').slice(0, 500)}`);
      error.code = 'EMAIL_PROVIDER_FAILED';
      error.publicStatus = 502;
      error.publicCode = error.code;
      error.publicMessage = 'EmailJS menerima permintaan, tetapi layanan email yang terhubung gagal mengirim. Periksa EmailJS History dan koneksi Email Service.';
      throw error;
    }
    return { checked: true, delivered: Number(row.result) === 1 };
  } catch (error) {
    if (error.code === 'EMAIL_PROVIDER_FAILED') throw error;
    return { checked: false, reason: error.message };
  }
}

export async function sendAdminTicketEmail(ticket) {
  const config = getEmailConfiguration();
  assertConfig(config.adminTemplateId, 'EMAILJS_ADMIN_TEMPLATE_ID');
  const result = await sendTemplate(config.adminTemplateId, templateParams(ticket, config.inboxEmail));
  const history = await inspectRecentHistory(ticket.ticketId);
  return { ...result, history, to: config.inboxMasked };
}

export async function sendTicketEmails(ticket) {
  const config = getEmailConfiguration();
  const admin = await sendAdminTicketEmail(ticket);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const statusUrl = `${baseUrl}/ticket-status.html?ticket_id=${encodeURIComponent(ticket.ticketId)}`;

  let userSent = false;
  let userError = '';
  if (config.userTemplateId) {
    await delay(1100);
    try {
      await sendTemplate(config.userTemplateId, {
        ...templateParams(ticket, ticket.email),
        title: `Tiket ${ticket.ticketId} sudah diterima`,
        subject: `Tiket ${ticket.ticketId} sudah diterima`
      });
      userSent = true;
    } catch (error) {
      userError = String(error.message || error).slice(0, 500);
      console.error(`[ticket ${ticket.ticketId}] user confirmation email failed:`, userError);
    }
  }

  return { sent: true, statusUrl, admin, userSent, userError };
}

export function emailMustSucceed() {
  return boolEnv('EMAIL_REQUIRED', true);
}

export async function sendStatusUpdateEmail(ticket) {
  const config = getEmailConfiguration();
  if (!config.statusTemplateId) return { sent: false, skipped: true };
  await sendTemplate(config.statusTemplateId, {
    ...templateParams(ticket, ticket.email),
    title: `Pembaruan tiket ${ticket.ticketId}: ${ticket.statusLabel}`,
    subject: `Pembaruan tiket ${ticket.ticketId}: ${ticket.statusLabel}`,
    status: String(ticket.statusLabel || ticket.status || '-'),
    public_note: String(ticket.publicNote || '-')
  });
  return { sent: true, skipped: false };
}

export async function sendEmailTest() {
  const ticketId = `TEST-${Date.now()}`;
  return sendAdminTicketEmail({
    ticketId,
    name: 'YTConv Support Test',
    email: process.env.SUPPORT_EMAIL || 'help.ytconv@proton.me',
    category: 'test',
    categoryLabel: 'Pengujian email',
    description: 'Email ini dikirim dari panel admin untuk memastikan integrasi EmailJS YTConv Support berfungsi.',
    createdAt: new Date().toISOString()
  });
}
