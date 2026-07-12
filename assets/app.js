import { copyText, hideAlert, initShell, setButtonLoading, showAlert, toast } from './common.js';

initShell('create');

const form = document.querySelector('#ticketForm');
const alertBox = document.querySelector('#formAlert');
const ticketIdInput = document.querySelector('#ticketId');
const regenerateButton = document.querySelector('#regenerateTicket');
const description = document.querySelector('#description');
const descriptionCount = document.querySelector('#descriptionCount');
const submitButton = document.querySelector('#submitButton');
const formView = document.querySelector('#formView');
const successView = document.querySelector('#successView');
const createdTicketId = document.querySelector('#createdTicketId');
const copyTicketButton = document.querySelector('#copyTicketId');
const statusLink = document.querySelector('#statusLink');
const newTicketButton = document.querySelector('#newTicketButton');
const successMessage = document.querySelector('#successMessage');
const turnstileField = document.querySelector('#turnstileField');
const turnstileContainer = document.querySelector('#turnstileContainer');

let turnstileWidgetId = null;
let turnstileToken = '';

function randomTicketId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `TKT-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')}`;
}

function refreshTicketId() {
  ticketIdInput.value = randomTicketId();
}

function validateForm() {
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const email = String(data.get('email') || '').trim();
  const category = String(data.get('category') || '').trim();
  const detail = String(data.get('description') || '').trim();

  if (name.length < 2) return 'Masukkan nama minimal 2 karakter.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return 'Masukkan alamat email yang valid.';
  if (!category) return 'Pilih kategori masalah.';
  if (detail.length < 20) return 'Deskripsi masalah minimal 20 karakter.';
  if (window.ytconvSupportConfig?.turnstileEnabled && !turnstileToken) return 'Selesaikan verifikasi keamanan terlebih dahulu.';
  return '';
}

async function setupTurnstile(config) {
  if (!config?.turnstileEnabled || !config.turnstileSiteKey) return;
  turnstileField.hidden = false;

  await new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  turnstileWidgetId = window.turnstile.render(turnstileContainer, {
    sitekey: config.turnstileSiteKey,
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    callback(token) { turnstileToken = token; },
    'expired-callback'() { turnstileToken = ''; },
    'error-callback'() { turnstileToken = ''; }
  });
}

document.addEventListener('ytconv:config', (event) => {
  setupTurnstile(event.detail).catch(() => {
    showAlert(alertBox, 'Verifikasi keamanan gagal dimuat. Silakan muat ulang halaman.', 'error');
  });
}, { once: true });

refreshTicketId();
regenerateButton.addEventListener('click', refreshTicketId);
description.addEventListener('input', () => { descriptionCount.textContent = String(description.value.length); });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert(alertBox);
  const validationError = validateForm();
  if (validationError) {
    showAlert(alertBox, validationError, 'error');
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const data = new FormData(form);
  const payload = {
    name: String(data.get('name') || '').trim(),
    email: String(data.get('email') || '').trim(),
    ticketId: String(data.get('ticketId') || '').trim(),
    category: String(data.get('category') || '').trim(),
    description: String(data.get('description') || '').trim(),
    turnstileToken
  };

  setButtonLoading(submitButton, true, 'Mengirim tiket...');
  try {
    const response = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Tiket tidak dapat dikirim.');

    createdTicketId.textContent = result.ticket.ticketId;
    statusLink.href = result.ticket.statusUrl || `/ticket-status.html?ticket_id=${encodeURIComponent(result.ticket.ticketId)}`;
    successMessage.textContent = result.message || 'Laporan sudah diterima oleh tim support.';
    if (!result.emailSent) {
      successMessage.textContent += ' Email pemberitahuan belum terkirim, jadi simpan ID tiket ini.';
    }
    formView.hidden = true;
    successView.hidden = false;
    document.querySelector('#ticketPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Tiket berhasil dibuat.', 'success');
  } catch (error) {
    showAlert(alertBox, error.message || 'Tiket tidak dapat dikirim. Silakan coba lagi.', 'error');
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
      turnstileToken = '';
    }
  } finally {
    setButtonLoading(submitButton, false);
  }
});

copyTicketButton.addEventListener('click', () => copyText(createdTicketId.textContent));
newTicketButton.addEventListener('click', () => {
  form.reset();
  descriptionCount.textContent = '0';
  refreshTicketId();
  hideAlert(alertBox);
  formView.hidden = false;
  successView.hidden = true;
  if (window.turnstile && turnstileWidgetId !== null) {
    window.turnstile.reset(turnstileWidgetId);
    turnstileToken = '';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
