const STORAGE_KEYS = {
  THEME: 'uiTheme'
};

const els = {
  themeToggle: document.getElementById('themeToggle'),
  ticketType: document.getElementById('ticketType'),
  rawEmail: document.getElementById('rawEmail'),
  processTicket: document.getElementById('processTicket'),
  statusText: document.getElementById('statusText'),
  ticketSummary: document.getElementById('ticketSummary'),
  replyPreview: document.getElementById('replyPreview'),
  copyReply: document.getElementById('copyReply'),
  telegramEnabled: document.getElementById('telegramEnabled'),
  telegramBotToken: document.getElementById('telegramBotToken'),
  telegramChatId: document.getElementById('telegramChatId'),
  saveTelegram: document.getElementById('saveTelegram'),
  exportCsv: document.getElementById('exportCsv'),
  ticketHistoryBody: document.getElementById('ticketHistoryBody')
};

function setStatus(text, tone = '') {
  els.statusText.textContent = text;
  els.statusText.classList.remove('success', 'error');
  if (tone) {
    els.statusText.classList.add(tone);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderSummary(ticket) {
  const items = [
    ['Ticket ID', ticket.ticketId],
    ['Type', ticket.ticketType],
    ['Name', ticket.name],
    ['Email', ticket.email || '-'],
    ['Status', ticket.status],
    ['Created', new Date(ticket.createdAt).toLocaleString()],
    ['Message', ticket.message || '-']
  ];

  els.ticketSummary.innerHTML = items
    .map(
      ([label, value]) =>
        `<div class="summary-item"><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</div>`
    )
    .join('');
}

function renderHistory(tickets) {
  if (!tickets.length) {
    els.ticketHistoryBody.innerHTML = '<tr><td colspan="4" class="empty-state">No tickets yet.</td></tr>';
    return;
  }

  els.ticketHistoryBody.innerHTML = tickets
    .map(
      (t) => `
      <tr>
        <td>${escapeHtml(t.ticketId)}</td>
        <td>${escapeHtml(t.ticketType)}</td>
        <td>${escapeHtml(t.name)}</td>
        <td>${escapeHtml(t.email || '-')}</td>
      </tr>
    `
    )
    .join('');
}

async function loadHistory() {
  const response = await chrome.runtime.sendMessage({ action: 'GET_TICKETS' });
  if (!response?.success) {
    setStatus(response?.error || 'Failed to load ticket history.', 'error');
    return;
  }
  renderHistory(response.tickets || []);
}

async function processTicketFromEmail() {
  const rawEmail = els.rawEmail.value.trim();
  const ticketType = els.ticketType.value;

  if (!rawEmail) {
    setStatus('Please paste user email content first.', 'error');
    return;
  }

  setStatus('Processing email...', '');

  const response = await chrome.runtime.sendMessage({
    action: 'PROCESS_EMAIL',
    payload: { rawEmail, ticketType }
  });

  if (!response?.success) {
    setStatus(response?.error || 'Failed to process email.', 'error');
    return;
  }

  renderSummary(response.ticket);
  els.replyPreview.value = response.reply;
  await loadHistory();

  if (response.telegram?.success) {
    setStatus(`Ticket ${response.ticket.ticketId} created and Telegram sent.`, 'success');
  } else {
    setStatus(`Ticket ${response.ticket.ticketId} created. ${response.telegram?.reason || ''}`.trim(), 'success');
  }
}

async function copyReply() {
  const text = els.replyPreview.value.trim();
  if (!text) {
    setStatus('Nothing to copy. Generate a ticket first.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus('Reply copied to clipboard.', 'success');
  } catch {
    setStatus('Failed to copy reply.', 'error');
  }
}

async function saveTelegramConfig() {
  const payload = {
    enabled: Boolean(els.telegramEnabled.checked),
    botToken: els.telegramBotToken.value.trim(),
    chatId: els.telegramChatId.value.trim()
  };

  const response = await chrome.runtime.sendMessage({ action: 'SAVE_TELEGRAM_CONFIG', payload });
  if (response?.success) {
    setStatus('Telegram settings saved.', 'success');
  } else {
    setStatus(response?.error || 'Failed to save Telegram settings.', 'error');
  }
}

async function loadTelegramConfig() {
  const response = await chrome.runtime.sendMessage({ action: 'GET_TELEGRAM_CONFIG' });
  if (!response?.success) {
    return;
  }

  els.telegramEnabled.checked = Boolean(response.config?.enabled);
  els.telegramBotToken.value = response.config?.botToken || '';
  els.telegramChatId.value = response.config?.chatId || '';
}

async function exportCsv() {
  const response = await chrome.runtime.sendMessage({ action: 'EXPORT_TICKETS_CSV' });
  if (!response?.success) {
    setStatus(response?.error || 'CSV export failed.', 'error');
    return;
  }

  const blob = new Blob([response.csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ytconv_tickets_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  setStatus(`Exported ${response.tickets.length} tickets to CSV.`, 'success');
}

async function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'neon' ? 'neon' : 'dark';
  const next = current === 'neon' ? 'dark' : 'neon';

  document.documentElement.dataset.theme = next === 'neon' ? 'neon' : '';
  els.themeToggle.textContent = next === 'neon' ? 'Dark' : 'Neon';
  await chrome.storage.local.set({ [STORAGE_KEYS.THEME]: next });
}

async function loadTheme() {
  const { [STORAGE_KEYS.THEME]: theme = 'dark' } = await chrome.storage.local.get(STORAGE_KEYS.THEME);
  document.documentElement.dataset.theme = theme === 'neon' ? 'neon' : '';
  els.themeToggle.textContent = theme === 'neon' ? 'Dark' : 'Neon';
}

function bindEvents() {
  els.themeToggle.addEventListener('click', toggleTheme);
  els.processTicket.addEventListener('click', processTicketFromEmail);
  els.copyReply.addEventListener('click', copyReply);
  els.saveTelegram.addEventListener('click', saveTelegramConfig);
  els.exportCsv.addEventListener('click', exportCsv);
}

(async function init() {
  bindEvents();
  await Promise.all([loadTheme(), loadTelegramConfig(), loadHistory()]);
})();
