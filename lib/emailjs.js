const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeEmailText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function emailConfig(templateId) {
  return {
    serviceId: process.env.EMAILJS_SERVICE_ID,
    templateId,
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY
  };
}

async function sendTemplate(templateId, params) {
  const config = emailConfig(templateId);
  if (!config.serviceId || !config.templateId || !config.publicKey) {
    throw new Error('Konfigurasi EmailJS belum lengkap.');
  }

  const payload = {
    service_id: config.serviceId,
    template_id: config.templateId,
    user_id: config.publicKey,
    template_params: params
  };
  if (config.privateKey) payload.accessToken = config.privateKey;

  const response = await fetch(EMAILJS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`EmailJS ${response.status}: ${text.slice(0, 300)}`);
  }
  return true;
}

export async function sendTicketEmails(ticket) {
  const appName = process.env.APP_NAME || 'YTConv';
  const supportEmail = process.env.SUPPORT_EMAIL || 'help.ytconv@proton.me';
  const baseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const statusUrl = `${baseUrl}/ticket-status.html?ticket_id=${encodeURIComponent(ticket.ticketId)}`;
  const createdAt = new Date(ticket.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const common = {
    app_name: appName,
    ticket_id: ticket.ticketId,
    customer_name: safeEmailText(ticket.name),
    customer_email: ticket.email,
    reply_to: ticket.email,
    category: safeEmailText(ticket.categoryLabel),
    description: safeEmailText(ticket.description),
    status_url: statusUrl,
    created_at: createdAt,
    support_email: supportEmail
  };

  const adminTemplateId = process.env.EMAILJS_ADMIN_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID;
  await sendTemplate(adminTemplateId, {
    ...common,
    to_email: supportEmail,
    subject: `[${ticket.ticketId}] ${ticket.categoryLabel}`
  });

  const userTemplateId = process.env.EMAILJS_USER_TEMPLATE_ID;
  let userSent = false;
  let userError = '';
  if (userTemplateId) {
    // EmailJS REST API membatasi pengiriman menjadi sekitar satu request per detik.
    await delay(1100);
    try {
      await sendTemplate(userTemplateId, {
        ...common,
        to_email: ticket.email,
        subject: `Tiket ${ticket.ticketId} sudah diterima`
      });
      userSent = true;
    } catch (error) {
      userError = String(error.message || error).slice(0, 300);
      console.error(`[ticket ${ticket.ticketId}] user confirmation email failed:`, userError);
    }
  }

  return { sent: true, statusUrl, userSent, userError };
}

export function emailMustSucceed() {
  return boolEnv('EMAIL_REQUIRED', false);
}

export async function sendStatusUpdateEmail(ticket) {
  const templateId = process.env.EMAILJS_STATUS_TEMPLATE_ID;
  if (!templateId) return { sent: false, skipped: true };

  const appName = process.env.APP_NAME || 'YTConv';
  const supportEmail = process.env.SUPPORT_EMAIL || 'help.ytconv@proton.me';
  const baseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const statusUrl = `${baseUrl}/ticket-status.html?ticket_id=${encodeURIComponent(ticket.ticketId)}`;

  await sendTemplate(templateId, {
    app_name: appName,
    ticket_id: ticket.ticketId,
    customer_name: safeEmailText(ticket.name),
    customer_email: ticket.email,
    to_email: ticket.email,
    reply_to: supportEmail,
    status: safeEmailText(ticket.statusLabel),
    public_note: safeEmailText(ticket.publicNote || '-'),
    status_url: statusUrl,
    support_email: supportEmail,
    subject: `Pembaruan tiket ${ticket.ticketId}: ${ticket.statusLabel}`
  });
  return { sent: true, skipped: false };
}
