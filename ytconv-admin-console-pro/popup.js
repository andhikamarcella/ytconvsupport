const UI_KEYS = {
  THEME: 'uiTheme',
  ACTIVE_TAB: 'uiActiveTab',
  ADMIN_PIN: 'adminPin',
  LAST_ACTIVITY: 'lastActivityAt',
  LOCKED: 'isLocked'
};

const INACTIVITY_MS = 10 * 60 * 1000;
const STATUS_LIST = ['Open', 'Investigating', 'Waiting User', 'Resolved', 'Closed'];

const els = {
  tabs: [...document.querySelectorAll('.tab')],
  panels: [...document.querySelectorAll('.panel')],
  themeToggle: document.getElementById('themeToggle'),
  lockButton: document.getElementById('lockButton'),
  statusText: document.getElementById('statusText'),
  ticketType: document.getElementById('ticketType'),
  statusFilter: document.getElementById('statusFilter'),
  rawEmail: document.getElementById('rawEmail'),
  createTicketBtn: document.getElementById('createTicketBtn'),
  ticketCount: document.getElementById('ticketCount'),
  ticketList: document.getElementById('ticketList'),
  replyTicketSelect: document.getElementById('replyTicketSelect'),
  replyTone: document.getElementById('replyTone'),
  generateReplyBtn: document.getElementById('generateReplyBtn'),
  copySubjectBtn: document.getElementById('copySubjectBtn'),
  copyReplyBtn: document.getElementById('copyReplyBtn'),
  replyPreview: document.getElementById('replyPreview'),
  telegramEnabled: document.getElementById('telegramEnabled'),
  telegramBot: document.getElementById('telegramBot'),
  telegramChat: document.getElementById('telegramChat'),
  saveTelegramBtn: document.getElementById('saveTelegramBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  jsonImportInput: document.getElementById('jsonImportInput'),
  importJsonBtn: document.getElementById('importJsonBtn'),
  pinInput: document.getElementById('pinInput'),
  savePinBtn: document.getElementById('savePinBtn'),
  lockOverlay: document.getElementById('lockOverlay'),
  unlockPin: document.getElementById('unlockPin'),
  unlockBtn: document.getElementById('unlockBtn'),
  lockMessage: document.getElementById('lockMessage'),
  statToday: document.getElementById('statToday'),
  statHigh: document.getElementById('statHigh'),
  statResolvedRate: document.getElementById('statResolvedRate'),
  statOpenClosed: document.getElementById('statOpenClosed'),
  statusBars: document.getElementById('statusBars')
};

let ticketsCache = [];
let selectedReply = { subject: '', full: '' };

function setStatus(text, tone = '') {
  els.statusText.textContent = text;
  els.statusText.classList.remove('success', 'error');
  if (tone) els.statusText.classList.add(tone);
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setTab(tabName) {
  els.tabs.forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  els.panels.forEach((panel) => {
    const active = panel.id === tabName;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });

  chrome.storage.local.set({ [UI_KEYS.ACTIVE_TAB]: tabName });
}

function applyTheme(theme) {
  const neon = theme === 'neon';
  document.documentElement.dataset.theme = neon ? 'neon' : '';
  els.themeToggle.textContent = neon ? 'Dark' : 'Neon';
}

async function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'neon' ? 'neon' : 'dark';
  const next = current === 'neon' ? 'dark' : 'neon';
  applyTheme(next);
  await chrome.storage.local.set({ [UI_KEYS.THEME]: next });
}

function getSlaState(ticket) {
  const created = new Date(ticket.createdAt).getTime();
  const elapsedHours = (Date.now() - created) / 3600000;
  let label = 'Normal';
  let cls = '';
  if (elapsedHours >= 2 && elapsedHours <= 6) {
    label = 'Warning';
    cls = 'warning';
  }
  if (elapsedHours > 6) {
    label = 'Overdue';
    cls = 'overdue';
  }
  const percent = Math.min(100, Math.max(0, (elapsedHours / 6) * 100));
  return { elapsedHours, label, cls, percent };
}

function statusBadgeClass(status) {
  return `status-${status.toLowerCase().replaceAll(' ', '-')}`;
}

function priorityBadgeClass(priority) {
  return priority === 'High' ? 'priority-high' : 'priority-normal';
}

function renderTicketList() {
  const filter = els.statusFilter.value;
  const list = filter === 'All' ? ticketsCache : ticketsCache.filter((t) => t.status === filter);

  els.ticketCount.textContent = `${list.length} ticket${list.length === 1 ? '' : 's'}`;

  if (!list.length) {
    els.ticketList.className = 'ticket-list empty';
    els.ticketList.textContent = 'No tickets for selected filter.';
    return;
  }

  els.ticketList.className = 'ticket-list';
  els.ticketList.innerHTML = list
    .map((t) => {
      const sla = getSlaState(t);
      const notes = Array.isArray(t.internalNotes) ? t.internalNotes : [];
      const latestNote = notes.length ? `${notes[notes.length - 1].text} (${new Date(notes[notes.length - 1].at).toLocaleString()})` : '-';

      return `
      <div class="ticket-item" data-ticket-id="${esc(t.id)}">
        <div class="ticket-head">
          <div class="ticket-id">${esc(t.id)} ${t.important ? '⭐' : ''}</div>
          <div>
            <span class="badge ${priorityBadgeClass(t.priority)}">${esc(t.priority)}</span>
            <span class="badge ${statusBadgeClass(t.status)}">${esc(t.status)}</span>
          </div>
        </div>

        <div class="ticket-meta">
          <span>${esc(t.name)} (${esc(t.email || '-')})</span>
          <span>${new Date(t.createdAt).toLocaleString()}</span>
          <span>${esc(t.type)} · ${esc(t.subject || 'No Subject')}</span>
          <span>Updated: ${new Date(t.updatedAt).toLocaleString()}</span>
        </div>

        <p class="ticket-msg">${esc(t.message)}</p>

        <div class="sla">
          <div class="sla-top"><span>SLA: ${esc(sla.label)}</span><span>${sla.elapsedHours.toFixed(1)}h elapsed</span></div>
          <div class="sla-bar"><div class="sla-fill ${sla.cls}" style="width:${sla.percent}%"></div></div>
        </div>

        <div class="grid two">
          <label>
            Status
            <select data-action="status" data-id="${esc(t.id)}">
              ${STATUS_LIST.map((s) => `<option ${s === t.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
          </label>
          <label>
            Internal note
            <textarea rows="2" data-action="note" data-id="${esc(t.id)}" placeholder="Add private note..."></textarea>
          </label>
        </div>

        <small>Latest note: ${esc(latestNote)}</small>

        <div class="ticket-actions">
          <button class="btn btn-secondary" data-action="regen" data-id="${esc(t.id)}">Regenerate Reply</button>
          <button class="btn btn-secondary" data-action="copySubject" data-id="${esc(t.id)}">Copy Subject</button>
          <button class="btn btn-secondary" data-action="copyId" data-id="${esc(t.id)}">Copy Ticket ID</button>
          <button class="btn btn-secondary" data-action="copyFull" data-id="${esc(t.id)}">Copy Full Reply</button>
          <button class="btn btn-secondary" data-action="important" data-id="${esc(t.id)}">${t.important ? 'Unmark Important' : 'Mark Important'}</button>
          <button class="btn btn-secondary" data-action="saveNote" data-id="${esc(t.id)}">Save Note</button>
          <button class="btn btn-secondary" data-action="delete" data-id="${esc(t.id)}">Delete</button>
        </div>
      </div>`;
    })
    .join('');
}

function renderReplyTicketOptions() {
  els.replyTicketSelect.innerHTML = ticketsCache.length
    ? ticketsCache.map((t) => `<option value="${esc(t.id)}">${esc(t.id)} · ${esc(t.name)}</option>`).join('')
    : '<option value="">No tickets</option>';
}

function renderAnalytics() {
  const now = new Date();
  const todayStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const totalToday = ticketsCache.filter((t) => t.createdAt.startsWith(todayStamp)).length;
  const high = ticketsCache.filter((t) => t.priority === 'High').length;
  const resolved = ticketsCache.filter((t) => ['Resolved', 'Closed'].includes(t.status)).length;
  const open = ticketsCache.filter((t) => ['Open', 'Investigating', 'Waiting User'].includes(t.status)).length;
  const closed = ticketsCache.filter((t) => t.status === 'Closed').length;
  const resolvedRate = ticketsCache.length ? Math.round((resolved / ticketsCache.length) * 100) : 0;

  els.statToday.textContent = String(totalToday);
  els.statHigh.textContent = String(high);
  els.statResolvedRate.textContent = `${resolvedRate}%`;
  els.statOpenClosed.textContent = `${open}:${closed}`;

  const statusCounts = STATUS_LIST.map((status) => ({ status, count: ticketsCache.filter((t) => t.status === status).length }));
  const max = Math.max(1, ...statusCounts.map((v) => v.count));

  els.statusBars.innerHTML = statusCounts
    .map((row) => {
      const width = (row.count / max) * 100;
      return `
      <div class="bar-row">
        <span>${esc(row.status)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        <strong>${row.count}</strong>
      </div>`;
    })
    .join('');
}

async function refreshTickets() {
  const response = await chrome.runtime.sendMessage({ action: 'GET_TICKETS' });
  if (!response?.success) {
    setStatus(response?.error || 'Failed to load tickets.', 'error');
    return;
  }
  ticketsCache = response.tickets || [];
  renderTicketList();
  renderReplyTicketOptions();
  renderAnalytics();
}

async function createTicket() {
  const rawEmail = els.rawEmail.value.trim();
  if (!rawEmail) {
    setStatus('Paste complaint email content first.', 'error');
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: 'CREATE_TICKET',
    payload: { type: els.ticketType.value, rawEmail }
  });

  if (!response?.success) {
    setStatus(response?.error || 'Ticket creation failed.', 'error');
    return;
  }

  setStatus(
    response.telegram?.success
      ? `Created ${response.ticket.id} and Telegram notification sent.`
      : `Created ${response.ticket.id}. ${response.telegram?.reason || ''}`.trim(),
    'success'
  );

  els.rawEmail.value = '';
  await refreshTickets();
}

async function generateReplyByTicketId(ticketId, copyMode = null) {
  if (!ticketId) return;
  const response = await chrome.runtime.sendMessage({
    action: 'GENERATE_REPLY',
    payload: { id: ticketId, tone: els.replyTone.value }
  });

  if (!response?.success) {
    setStatus(response?.error || 'Reply generation failed.', 'error');
    return;
  }

  selectedReply = response.reply;
  els.replyPreview.value = response.reply.full;

  if (copyMode === 'subject') await copyText(response.reply.subject);
  if (copyMode === 'id') await copyText(ticketId);
  if (copyMode === 'full') await copyText(response.reply.full);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Copied to clipboard.', 'success');
  } catch {
    setStatus('Copy failed.', 'error');
  }
}

async function updateTicket(payload) {
  const response = await chrome.runtime.sendMessage({ action: 'UPDATE_TICKET', payload });
  if (!response?.success) {
    setStatus(response?.error || 'Update failed.', 'error');
    return;
  }
  setStatus(`Ticket ${payload.id} updated.`, 'success');
  await refreshTickets();
}

async function deleteTicket(id) {
  const response = await chrome.runtime.sendMessage({ action: 'DELETE_TICKET', payload: { id } });
  if (!response?.success) {
    setStatus(response?.error || 'Delete failed.', 'error');
    return;
  }
  setStatus(`Ticket ${id} deleted.`, 'success');
  await refreshTickets();
}

async function saveTelegram() {
  const response = await chrome.runtime.sendMessage({
    action: 'SAVE_TELEGRAM',
    payload: {
      enabled: Boolean(els.telegramEnabled.checked),
      botToken: els.telegramBot.value.trim(),
      chatId: els.telegramChat.value.trim()
    }
  });

  if (!response?.success) {
    setStatus(response?.error || 'Failed to save Telegram settings.', 'error');
    return;
  }
  setStatus('Telegram settings saved.', 'success');
}

async function loadTelegram() {
  const response = await chrome.runtime.sendMessage({ action: 'GET_TELEGRAM' });
  if (!response?.success) return;
  els.telegramEnabled.checked = Boolean(response.config.enabled);
  els.telegramBot.value = response.config.botToken || '';
  els.telegramChat.value = response.config.chatId || '';
}

async function exportCsv() {
  const response = await chrome.runtime.sendMessage({
    action: 'EXPORT_CSV',
    payload: { status: els.statusFilter.value }
  });
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
  setStatus(`CSV exported (${response.count} tickets).`, 'success');
}

async function exportJson() {
  const response = await chrome.runtime.sendMessage({ action: 'EXPORT_JSON' });
  if (!response?.success) {
    setStatus(response?.error || 'JSON export failed.', 'error');
    return;
  }

  const blob = new Blob([response.json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ytconv_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`JSON backup exported (${response.count} tickets).`, 'success');
}

async function importJson() {
  const raw = els.jsonImportInput.value.trim();
  if (!raw) {
    setStatus('Paste JSON before importing.', 'error');
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const response = await chrome.runtime.sendMessage({ action: 'IMPORT_JSON', payload: { json: parsed } });

    if (!response?.success) {
      setStatus(response?.error || 'JSON import failed.', 'error');
      return;
    }

    setStatus(`JSON imported (${response.count} tickets).`, 'success');
    await refreshTickets();
  } catch {
    setStatus('Invalid JSON format.', 'error');
  }
}

async function savePin() {
  const pin = els.pinInput.value.trim();
  if (!/^\d{4}$/.test(pin)) {
    setStatus('PIN must be exactly 4 digits.', 'error');
    return;
  }

  await chrome.storage.local.set({ [UI_KEYS.ADMIN_PIN]: pin });
  els.pinInput.value = '';
  setStatus('Admin PIN saved.', 'success');
}

async function lockNow() {
  const { [UI_KEYS.ADMIN_PIN]: pin = '' } = await chrome.storage.local.get(UI_KEYS.ADMIN_PIN);
  if (!pin) {
    setStatus('Set a 4-digit PIN first in Settings.', 'error');
    return;
  }
  await chrome.storage.local.set({ [UI_KEYS.LOCKED]: true });
  els.lockOverlay.classList.remove('hidden');
}

async function unlock() {
  const entered = els.unlockPin.value.trim();
  const { [UI_KEYS.ADMIN_PIN]: pin = '' } = await chrome.storage.local.get(UI_KEYS.ADMIN_PIN);

  if (entered !== pin) {
    els.lockMessage.textContent = 'Incorrect PIN.';
    els.lockMessage.classList.add('error');
    return;
  }

  await chrome.storage.local.set({ [UI_KEYS.LOCKED]: false, [UI_KEYS.LAST_ACTIVITY]: Date.now() });
  els.unlockPin.value = '';
  els.lockMessage.textContent = '';
  els.lockMessage.classList.remove('error');
  els.lockOverlay.classList.add('hidden');
}

async function touchActivity() {
  await chrome.storage.local.set({ [UI_KEYS.LAST_ACTIVITY]: Date.now() });
}

async function checkAutoLock() {
  const data = await chrome.storage.local.get([UI_KEYS.ADMIN_PIN, UI_KEYS.LAST_ACTIVITY, UI_KEYS.LOCKED]);
  const hasPin = Boolean(data[UI_KEYS.ADMIN_PIN]);
  const locked = Boolean(data[UI_KEYS.LOCKED]);
  if (!hasPin || locked) return;

  const last = Number(data[UI_KEYS.LAST_ACTIVITY] || Date.now());
  if (Date.now() - last > INACTIVITY_MS) {
    await chrome.storage.local.set({ [UI_KEYS.LOCKED]: true });
    els.lockOverlay.classList.remove('hidden');
  }
}

function bindTicketDelegation() {
  els.ticketList.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!id) return;

    if (action === 'regen') await generateReplyByTicketId(id);
    if (action === 'copySubject') await generateReplyByTicketId(id, 'subject');
    if (action === 'copyId') await copyText(id);
    if (action === 'copyFull') await generateReplyByTicketId(id, 'full');
    if (action === 'important') {
      const ticket = ticketsCache.find((t) => t.id === id);
      if (ticket) await updateTicket({ id, important: !ticket.important });
    }
    if (action === 'delete') await deleteTicket(id);
    if (action === 'saveNote') {
      const noteEl = els.ticketList.querySelector(`textarea[data-action="note"][data-id="${CSS.escape(id)}"]`);
      if (noteEl?.value.trim()) {
        await updateTicket({ id, noteText: noteEl.value.trim() });
      } else {
        setStatus('Write a note first.', 'error');
      }
    }
  });

  els.ticketList.addEventListener('change', async (event) => {
    const select = event.target.closest('select[data-action="status"]');
    if (!select) return;
    await updateTicket({ id: select.dataset.id, status: select.value });
  });
}

function bindEvents() {
  els.tabs.forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.tab)));
  els.themeToggle.addEventListener('click', toggleTheme);
  els.lockButton.addEventListener('click', lockNow);
  els.unlockBtn.addEventListener('click', unlock);
  els.createTicketBtn.addEventListener('click', createTicket);
  els.statusFilter.addEventListener('change', renderTicketList);
  els.generateReplyBtn.addEventListener('click', () => generateReplyByTicketId(els.replyTicketSelect.value));
  els.copySubjectBtn.addEventListener('click', () => copyText(selectedReply.subject || ''));
  els.copyReplyBtn.addEventListener('click', () => copyText(selectedReply.full || els.replyPreview.value));
  els.saveTelegramBtn.addEventListener('click', saveTelegram);
  els.exportCsvBtn.addEventListener('click', exportCsv);
  els.exportJsonBtn.addEventListener('click', exportJson);
  els.importJsonBtn.addEventListener('click', importJson);
  els.savePinBtn.addEventListener('click', savePin);

  document.addEventListener('click', touchActivity);
  document.addEventListener('keydown', touchActivity);

  bindTicketDelegation();
}

async function bootstrap() {
  const state = await chrome.storage.local.get([UI_KEYS.THEME, UI_KEYS.ACTIVE_TAB, UI_KEYS.LOCKED]);
  applyTheme(state[UI_KEYS.THEME] || 'dark');
  setTab(state[UI_KEYS.ACTIVE_TAB] || 'tickets');

  if (state[UI_KEYS.LOCKED]) {
    els.lockOverlay.classList.remove('hidden');
  }

  await Promise.all([loadTelegram(), refreshTickets(), touchActivity()]);
  await checkAutoLock();

  setInterval(() => {
    renderTicketList();
    renderAnalytics();
    checkAutoLock();
  }, 60000);
}

(async function init() {
  bindEvents();
  await bootstrap();
})();
