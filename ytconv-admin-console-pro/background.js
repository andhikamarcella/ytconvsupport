const STORAGE_KEYS = {
  TICKETS: 'tickets',
  COUNTER_DATE: 'ticketCounterDate',
  COUNTER_VALUE: 'ticketCounterValue',
  TELEGRAM_ENABLED: 'telegramEnabled',
  TELEGRAM_BOT_TOKEN: 'telegramBotToken',
  TELEGRAM_CHAT_ID: 'telegramChatId'
};

function getDateStamp(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function generateTicketId() {
  const today = getDateStamp();
  const stored = await chrome.storage.local.get([STORAGE_KEYS.COUNTER_DATE, STORAGE_KEYS.COUNTER_VALUE]);

  const previousDate = stored[STORAGE_KEYS.COUNTER_DATE];
  const previousCounter = Number(stored[STORAGE_KEYS.COUNTER_VALUE] || 0);
  const nextCounter = previousDate === today ? previousCounter + 1 : 1;

  await chrome.storage.local.set({
    [STORAGE_KEYS.COUNTER_DATE]: today,
    [STORAGE_KEYS.COUNTER_VALUE]: nextCounter
  });

  return `YT-${today}-${String(nextCounter).padStart(3, '0')}`;
}

function extractName(emailText) {
  const fromMatch = emailText.match(/^from:\s*([^<\n]+)(?:<[^>]+>)?/im);
  if (fromMatch?.[1]) {
    return fromMatch[1].trim();
  }

  const greetingMatch = emailText.match(/(?:hello|hi|dear)\s+([a-z][a-z\s.'-]{1,40})[,!]/im);
  if (greetingMatch?.[1]) {
    return greetingMatch[1]
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  return 'Customer';
}

function extractEmail(emailText) {
  const match = emailText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : '';
}

function extractMessage(emailText) {
  const normalized = emailText.replace(/\r\n/g, '\n').trim();

  const bodyFromKeywords = normalized.split(/\n\s*(?:message|issue|details?)\s*:\s*/i);
  const candidate = bodyFromKeywords.length > 1 ? bodyFromKeywords[bodyFromKeywords.length - 1] : normalized;

  const lines = candidate
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^subject\s*:/i.test(line))
    .filter((line) => !/^from\s*:/i.test(line))
    .filter((line) => !/^to\s*:/i.test(line));

  return lines.join('\n').trim();
}

function createReplyTemplate(name, ticketId) {
  return [
    `Subject: Re: Your Report [${ticketId}]`,
    '',
    `Hello ${name},`,
    '',
    'Thank you for your report.',
    `Your ticket ID is ${ticketId}.`,
    '',
    'Our team is reviewing the issue.',
    '',
    'Best regards,',
    'YTConv Support Team'
  ].join('\n');
}

async function sendTelegramNotificationIfEnabled(ticket) {
  const config = await chrome.storage.local.get([
    STORAGE_KEYS.TELEGRAM_ENABLED,
    STORAGE_KEYS.TELEGRAM_BOT_TOKEN,
    STORAGE_KEYS.TELEGRAM_CHAT_ID
  ]);

  const enabled = Boolean(config[STORAGE_KEYS.TELEGRAM_ENABLED]);
  const botToken = config[STORAGE_KEYS.TELEGRAM_BOT_TOKEN] || '';
  const chatId = config[STORAGE_KEYS.TELEGRAM_CHAT_ID] || '';

  if (!enabled) {
    return { success: false, reason: 'Telegram disabled.' };
  }

  if (!botToken || !chatId) {
    return { success: false, reason: 'Telegram config incomplete.' };
  }

  const text = [
    '📩 New YTConv Ticket',
    `Ticket: ${ticket.ticketId}`,
    `Type: ${ticket.ticketType}`,
    `Name: ${ticket.name}`,
    `Email: ${ticket.email || '-'}`,
    `Created: ${ticket.createdAt}`
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });

    if (!res.ok) {
      return { success: false, reason: `Telegram API ${res.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

async function processEmailToTicket(payload) {
  const rawEmail = String(payload?.rawEmail || '').trim();
  const ticketType = String(payload?.ticketType || 'General');

  if (!rawEmail) {
    throw new Error('Email content is required.');
  }

  const ticketId = await generateTicketId();
  const name = extractName(rawEmail);
  const email = extractEmail(rawEmail);
  const message = extractMessage(rawEmail);
  const createdAt = new Date().toISOString();

  const ticket = {
    ticketId,
    ticketType,
    name,
    email,
    message,
    createdAt,
    status: 'Open'
  };

  const existing = await chrome.storage.local.get(STORAGE_KEYS.TICKETS);
  const tickets = Array.isArray(existing[STORAGE_KEYS.TICKETS]) ? existing[STORAGE_KEYS.TICKETS] : [];
  const updated = [ticket, ...tickets];

  await chrome.storage.local.set({ [STORAGE_KEYS.TICKETS]: updated });

  const reply = createReplyTemplate(name, ticketId);
  const telegram = await sendTelegramNotificationIfEnabled(ticket);

  return { ticket, reply, telegram };
}

async function exportTicketsCsv() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TICKETS);
  const tickets = Array.isArray(result[STORAGE_KEYS.TICKETS]) ? result[STORAGE_KEYS.TICKETS] : [];

  const headers = ['Ticket ID', 'Type', 'Name', 'Email', 'Message', 'Status', 'Created At'];
  const rows = tickets.map((t) => [
    t.ticketId,
    t.ticketType,
    t.name,
    t.email,
    t.message,
    t.status,
    t.createdAt
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n');

  return { csv, tickets };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.action === 'PROCESS_EMAIL') {
        const output = await processEmailToTicket(message.payload);
        sendResponse({ success: true, ...output });
        return;
      }

      if (message?.action === 'GET_TICKETS') {
        const result = await chrome.storage.local.get(STORAGE_KEYS.TICKETS);
        const tickets = Array.isArray(result[STORAGE_KEYS.TICKETS]) ? result[STORAGE_KEYS.TICKETS] : [];
        sendResponse({ success: true, tickets });
        return;
      }

      if (message?.action === 'EXPORT_TICKETS_CSV') {
        const output = await exportTicketsCsv();
        sendResponse({ success: true, ...output });
        return;
      }

      if (message?.action === 'SAVE_TELEGRAM_CONFIG') {
        await chrome.storage.local.set({
          [STORAGE_KEYS.TELEGRAM_ENABLED]: Boolean(message.payload?.enabled),
          [STORAGE_KEYS.TELEGRAM_BOT_TOKEN]: String(message.payload?.botToken || ''),
          [STORAGE_KEYS.TELEGRAM_CHAT_ID]: String(message.payload?.chatId || '')
        });
        sendResponse({ success: true });
        return;
      }

      if (message?.action === 'GET_TELEGRAM_CONFIG') {
        const cfg = await chrome.storage.local.get([
          STORAGE_KEYS.TELEGRAM_ENABLED,
          STORAGE_KEYS.TELEGRAM_BOT_TOKEN,
          STORAGE_KEYS.TELEGRAM_CHAT_ID
        ]);

        sendResponse({
          success: true,
          config: {
            enabled: Boolean(cfg[STORAGE_KEYS.TELEGRAM_ENABLED]),
            botToken: cfg[STORAGE_KEYS.TELEGRAM_BOT_TOKEN] || '',
            chatId: cfg[STORAGE_KEYS.TELEGRAM_CHAT_ID] || ''
          }
        });
        return;
      }

      sendResponse({ success: false, error: 'Unknown action.' });
    } catch (error) {
      sendResponse({ success: false, error: error.message || 'Unexpected error.' });
    }
  })();

  return true;
});
