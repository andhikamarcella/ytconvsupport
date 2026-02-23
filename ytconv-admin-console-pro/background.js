const KEYS = {
  TICKETS: 'ticketsDb',
  COUNTER_DATE: 'ticketCounterDate',
  COUNTER_VALUE: 'ticketCounterValue',
  TELEGRAM: 'telegramConfig'
};

const STATUSES = ['Open', 'Investigating', 'Waiting User', 'Resolved', 'Closed'];
const PRIORITY_KEYWORDS = ['urgent', 'cannot login', 'payment', 'error', 'failed', 'crash'];
const DEFAULT_SLA_HOURS = 6;

function nowIso() {
  return new Date().toISOString();
}

function getDateStamp(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

async function nextTicketId() {
  const today = getDateStamp();
  const data = await chrome.storage.local.get([KEYS.COUNTER_DATE, KEYS.COUNTER_VALUE]);
  const previousDate = data[KEYS.COUNTER_DATE];
  const previousCounter = Number(data[KEYS.COUNTER_VALUE] || 0);
  const nextCounter = previousDate === today ? previousCounter + 1 : 1;

  await chrome.storage.local.set({
    [KEYS.COUNTER_DATE]: today,
    [KEYS.COUNTER_VALUE]: nextCounter
  });

  return `YT-${today}-${String(nextCounter).padStart(3, '0')}`;
}

function extractSubject(emailText) {
  const subject = emailText.match(/^subject:\s*(.+)$/im)?.[1]?.trim();
  return subject || 'No Subject';
}

function extractName(emailText) {
  const fromName = emailText.match(/^from:\s*([^<\n]+)(?:<[^>]+>)?/im)?.[1]?.trim();
  if (fromName) return fromName;

  const greeting = emailText.match(/(?:hello|hi|dear)\s+([a-z][a-z\s.'-]{1,45})[,!]/im)?.[1]?.trim();
  return greeting
    ? greeting
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ')
    : 'Customer';
}

function extractEmail(emailText) {
  return emailText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
}

function extractMessage(emailText) {
  const normalized = emailText.replace(/\r\n/g, '\n').trim();
  const withoutHeaders = normalized
    .split('\n')
    .filter((line) => !/^(from|to|subject)\s*:/i.test(line.trim()))
    .join('\n')
    .trim();

  const markerMatch = withoutHeaders.split(/\n\s*(?:message|issue|details?)\s*:\s*/i);
  const candidate = markerMatch.length > 1 ? markerMatch[markerMatch.length - 1] : withoutHeaders;
  return candidate.trim();
}

function detectPriority(message) {
  const lowered = message.toLowerCase();
  return PRIORITY_KEYWORDS.some((kw) => lowered.includes(kw)) ? 'High' : 'Normal';
}

function sanitizeStatus(status) {
  return STATUSES.includes(status) ? status : 'Open';
}

function buildTicket({ id, type, rawEmail }) {
  const createdAt = nowIso();
  const message = extractMessage(rawEmail);
  const priority = detectPriority(message);
  return {
    id,
    type: type || 'General',
    subject: extractSubject(rawEmail),
    name: extractName(rawEmail),
    email: extractEmail(rawEmail),
    message,
    status: 'Open',
    priority,
    createdAt,
    updatedAt: createdAt,
    internalNotes: [],
    important: false,
    slaDeadline: new Date(Date.now() + DEFAULT_SLA_HOURS * 60 * 60 * 1000).toISOString()
  };
}

function composeReply(ticket, tone = 'Professional') {
  const toneBlocks = {
    Professional: 'Our team is currently reviewing the issue and will provide updates as soon as possible.',
    Friendly: 'We really appreciate you reporting this, and we are actively checking it right now.',
    Short: 'We received your report and are currently reviewing it.',
    Detailed:
      'Our support and technical teams have started a full review of your report, including environment checks and reproduction steps.',
    Technical:
      'The report has been queued for technical triage. We are reviewing logs, reproduction path, and system-side dependencies.'
  };

  const middle = toneBlocks[tone] || toneBlocks.Professional;

  const subject = `Re: [${ticket.id}] ${ticket.subject}`;
  const body = [
    `Hello ${ticket.name},`,
    '',
    'Thank you for your report.',
    `Your ticket ID is ${ticket.id}.`,
    middle,
    '',
    `Status: ${ticket.status}`,
    '',
    'Best regards,',
    'YTConv Support Team'
  ].join('\n');

  return { subject, body, full: `Subject: ${subject}\n\n${body}` };
}

async function getTickets() {
  const result = await chrome.storage.local.get(KEYS.TICKETS);
  return Array.isArray(result[KEYS.TICKETS]) ? result[KEYS.TICKETS] : [];
}

async function setTickets(tickets) {
  await chrome.storage.local.set({ [KEYS.TICKETS]: tickets });
}

async function notifyTelegram(ticket) {
  const result = await chrome.storage.local.get(KEYS.TELEGRAM);
  const cfg = result[KEYS.TELEGRAM] || {};
  if (!cfg.enabled) return { success: false, reason: 'Telegram disabled.' };
  if (!cfg.botToken || !cfg.chatId) return { success: false, reason: 'Telegram config incomplete.' };

  const text = ['New Ticket Created', `ID: ${ticket.id}`, `Priority: ${ticket.priority}`, `Status: ${ticket.status}`].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text })
    });

    if (!response.ok) return { success: false, reason: `Telegram API ${response.status}` };
    return { success: true };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

async function createTicket(payload) {
  const id = await nextTicketId();
  const ticket = buildTicket({ id, type: payload.type, rawEmail: payload.rawEmail || '' });
  const tickets = await getTickets();
  await setTickets([ticket, ...tickets]);
  const telegram = await notifyTelegram(ticket);
  return { ticket, telegram };
}

async function updateTicket(payload) {
  const tickets = await getTickets();
  const idx = tickets.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('Ticket not found.');

  const current = tickets[idx];
  const next = { ...current };

  if (payload.status) next.status = sanitizeStatus(payload.status);
  if (payload.important !== undefined) next.important = Boolean(payload.important);

  if (typeof payload.noteText === 'string' && payload.noteText.trim()) {
    next.internalNotes = [...(Array.isArray(next.internalNotes) ? next.internalNotes : []), { text: payload.noteText.trim(), at: nowIso() }];
  }

  next.updatedAt = nowIso();
  tickets[idx] = next;
  await setTickets(tickets);

  return { ticket: next };
}

async function deleteTicket(id) {
  const tickets = await getTickets();
  const filtered = tickets.filter((t) => t.id !== id);
  await setTickets(filtered);
  return { success: true };
}

function ticketsToCsv(tickets) {
  const headers = ['ID', 'Type', 'Name', 'Email', 'Priority', 'Status', 'CreatedAt'];
  const rows = tickets.map((t) => [t.id, t.type, t.name, t.email, t.priority, t.status, t.createdAt]);

  return [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n');
}

function validateImportJson(json) {
  if (!Array.isArray(json)) throw new Error('Backup must be an array.');

  for (const entry of json) {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid ticket object in backup.');
    if (!entry.id || !entry.createdAt) throw new Error('Ticket entry missing required fields.');
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.action) {
        case 'CREATE_TICKET': {
          const output = await createTicket(message.payload || {});
          sendResponse({ success: true, ...output });
          return;
        }
        case 'GET_TICKETS': {
          const tickets = await getTickets();
          sendResponse({ success: true, tickets });
          return;
        }
        case 'UPDATE_TICKET': {
          const output = await updateTicket(message.payload || {});
          sendResponse({ success: true, ...output });
          return;
        }
        case 'DELETE_TICKET': {
          const output = await deleteTicket(message.payload?.id);
          sendResponse({ success: true, ...output });
          return;
        }
        case 'GENERATE_REPLY': {
          const tickets = await getTickets();
          const ticket = tickets.find((t) => t.id === message.payload?.id);
          if (!ticket) throw new Error('Ticket not found.');
          const reply = composeReply(ticket, message.payload?.tone || 'Professional');
          sendResponse({ success: true, reply });
          return;
        }
        case 'SAVE_TELEGRAM': {
          await chrome.storage.local.set({
            [KEYS.TELEGRAM]: {
              enabled: Boolean(message.payload?.enabled),
              botToken: String(message.payload?.botToken || ''),
              chatId: String(message.payload?.chatId || '')
            }
          });
          sendResponse({ success: true });
          return;
        }
        case 'GET_TELEGRAM': {
          const result = await chrome.storage.local.get(KEYS.TELEGRAM);
          sendResponse({ success: true, config: result[KEYS.TELEGRAM] || { enabled: false, botToken: '', chatId: '' } });
          return;
        }
        case 'EXPORT_CSV': {
          const tickets = await getTickets();
          const filterStatus = message.payload?.status || 'All';
          const filtered = filterStatus === 'All' ? tickets : tickets.filter((t) => t.status === filterStatus);
          sendResponse({ success: true, csv: ticketsToCsv(filtered), count: filtered.length });
          return;
        }
        case 'EXPORT_JSON': {
          const tickets = await getTickets();
          sendResponse({ success: true, json: JSON.stringify(tickets, null, 2), count: tickets.length });
          return;
        }
        case 'IMPORT_JSON': {
          const data = message.payload?.json;
          validateImportJson(data);
          await setTickets(data);
          sendResponse({ success: true, count: data.length });
          return;
        }
        default:
          sendResponse({ success: false, error: 'Unknown action.' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message || 'Unexpected error.' });
    }
  })();

  return true;
});
