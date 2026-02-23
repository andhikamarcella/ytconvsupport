const els = {
  tabs: [...document.querySelectorAll('.tab')],
  panels: [...document.querySelectorAll('.panel')],
  themeToggle: document.getElementById('themeToggle'),
  createTicket: document.getElementById('createTicket'),
  ticketType: document.getElementById('ticketType'),
  ticketStatus: document.getElementById('ticketStatus'),
  userName: document.getElementById('userName'),
  ticketTable: document.getElementById('ticketTable'),
  ticketCreatedMessage: document.getElementById('ticketCreatedMessage'),
  exportCsv: document.getElementById('exportCsv'),
  printPdf: document.getElementById('printPdf'),
  reportInput: document.getElementById('reportInput'),
  generateReply: document.getElementById('generateReply'),
  aiResult: document.getElementById('aiResult'),
  botToken: document.getElementById('botToken'),
  chatId: document.getElementById('chatId'),
  saveTelegram: document.getElementById('saveTelegram'),
  testTelegram: document.getElementById('testTelegram'),
  telegramNotice: document.getElementById('telegramNotice')
};

let ticketCache = [];

function formatDate(isoString) {
  const d = new Date(isoString);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function switchTab(tabId) {
  els.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  els.panels.forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
}

function renderTickets(tickets) {
  ticketCache = tickets;
  if (!tickets.length) {
    els.ticketTable.innerHTML = '<tr><td colspan="5">No tickets yet.</td></tr>';
    return;
  }

  els.ticketTable.innerHTML = tickets
    .map(
      (ticket) => `
      <tr>
        <td>${ticket.id}</td>
        <td>${ticket.type}</td>
        <td>${formatDate(ticket.date)}</td>
        <td>${ticket.status}</td>
        <td>${ticket.userName}</td>
      </tr>`
    )
    .join('');
}

async function getTickets() {
  const response = await chrome.runtime.sendMessage({ action: 'GET_TICKETS' });
  renderTickets(response.tickets || []);
}

async function createTicket() {
  const payload = {
    type: els.ticketType.value,
    status: els.ticketStatus.value,
    userName: els.userName.value.trim() || 'Unknown'
  };

  const response = await chrome.runtime.sendMessage({ action: 'CREATE_TICKET', payload });

  if (response.success) {
    const telegramNote = response.telegramResult?.success
      ? 'Telegram sent.'
      : response.telegramResult?.reason || 'Telegram skipped.';
    els.ticketCreatedMessage.textContent = `Created ${response.ticket.id}. ${telegramNote}`;
    els.userName.value = '';
    await getTickets();
  }
}

function exportCsv() {
  const headers = ['Ticket ID', 'Type', 'Date', 'Status', 'User Name'];
  const rows = ticketCache.map((t) => [t.id, t.type, t.date, t.status, t.userName]);
  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ytconv_tickets_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function generateDailyPdfReport() {
  const today = new Date().toLocaleDateString();
  const openCount = ticketCache.filter((t) => t.status === 'Open').length;
  const pendingCount = ticketCache.filter((t) => t.status === 'Pending').length;
  const resolvedCount = ticketCache.filter((t) => t.status === 'Resolved').length;

  const reportWindow = window.open('', '_blank', 'width=860,height=700');
  reportWindow.document.write(`
    <html>
    <head>
      <title>YTConv Daily Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 30px; color:#0f172a; }
        .card { border:1px solid #dbeafe; border-radius:16px; padding:18px; margin-bottom:16px; }
        h1 { margin:0 0 6px; }
        table { width:100%; border-collapse:collapse; margin-top:12px; }
        th,td { border:1px solid #e2e8f0; padding:8px; text-align:left; font-size:12px; }
        .stats { display:flex; gap:12px; }
      </style>
    </head>
    <body>
      <h1>YTConv Admin Console PRO - Daily Summary</h1>
      <p>Date: ${today}</p>
      <div class="stats">
        <div class="card">Total: <strong>${ticketCache.length}</strong></div>
        <div class="card">Open: <strong>${openCount}</strong></div>
        <div class="card">Pending: <strong>${pendingCount}</strong></div>
        <div class="card">Resolved: <strong>${resolvedCount}</strong></div>
      </div>
      <div class="card">
        <h3>Ticket List</h3>
        <table>
          <thead><tr><th>ID</th><th>Type</th><th>Date</th><th>Status</th><th>User</th></tr></thead>
          <tbody>
            ${ticketCache
              .map(
                (t) =>
                  `<tr><td>${t.id}</td><td>${t.type}</td><td>${formatDate(t.date)}</td><td>${
                    t.status
                  }</td><td>${t.userName}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <script>window.print()</script>
    </body>
    </html>
  `);
  reportWindow.document.close();
}

async function generateAiReply() {
  const reportText = els.reportInput.value.trim();
  if (!reportText) {
    els.aiResult.value = 'Please enter a report first.';
    return;
  }

  els.aiResult.value = 'Generating...';

  try {
    // Replace with your own secured backend endpoint that injects API keys server-side.
    const AI_ENDPOINT = 'https://your-ai-endpoint.example.com/reply';
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: reportText })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    els.aiResult.value = data.reply || 'No reply returned from AI service.';
  } catch (error) {
    // Graceful fallback keeps UI usable without blocking operators.
    els.aiResult.value =
      `Unable to reach AI endpoint (${error.message}).\n\n` +
      'Template reply:\n' +
      'Thank you for your report. Our team has reviewed the issue and created a ticket. ' +
      'We will update you shortly with the next steps.';
  }
}

async function loadTelegramConfig() {
  const response = await chrome.runtime.sendMessage({ action: 'GET_TELEGRAM_CONFIG' });
  els.botToken.value = response.telegramConfig?.botToken || '';
  els.chatId.value = response.telegramConfig?.chatId || '';
}

async function saveTelegramConfig() {
  await chrome.runtime.sendMessage({
    action: 'SAVE_TELEGRAM_CONFIG',
    payload: {
      botToken: els.botToken.value.trim(),
      chatId: els.chatId.value.trim()
    }
  });
  els.telegramNotice.textContent = 'Telegram configuration saved.';
}

async function sendTelegramTest() {
  const response = await chrome.runtime.sendMessage({ action: 'SEND_TELEGRAM_TEST' });
  els.telegramNotice.textContent = response.result?.success
    ? 'Test message sent successfully.'
    : `Failed: ${response.result?.reason || 'Unknown error'}`;
}

async function loadTheme() {
  const { uiTheme = 'dark' } = await chrome.storage.local.get('uiTheme');
  document.documentElement.dataset.theme = uiTheme === 'neon' ? 'neon' : '';
  els.themeToggle.textContent = uiTheme === 'neon' ? 'Admin Dark' : 'Neon Mode';
}

async function toggleTheme() {
  const isNeon = document.documentElement.dataset.theme === 'neon';
  const next = isNeon ? 'dark' : 'neon';
  document.documentElement.dataset.theme = next === 'neon' ? 'neon' : '';
  els.themeToggle.textContent = next === 'neon' ? 'Admin Dark' : 'Neon Mode';
  await chrome.storage.local.set({ uiTheme: next });
}

function bindEvents() {
  els.tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  els.createTicket.addEventListener('click', createTicket);
  els.exportCsv.addEventListener('click', exportCsv);
  els.printPdf.addEventListener('click', generateDailyPdfReport);
  els.generateReply.addEventListener('click', generateAiReply);
  els.saveTelegram.addEventListener('click', saveTelegramConfig);
  els.testTelegram.addEventListener('click', sendTelegramTest);
  els.themeToggle.addEventListener('click', toggleTheme);
}

(async function init() {
  bindEvents();
  await Promise.all([getTickets(), loadTelegramConfig(), loadTheme()]);
})();
