const STORAGE_KEYS = {
  TICKETS: 'tickets',
  TICKET_COUNTER_DATE: 'ticketCounterDate',
  TICKET_COUNTER: 'ticketCounter',
  TELEGRAM_CONFIG: 'telegramConfig'
};

/**
 * Returns date as YYYYMMDD string for ticket ID generation.
 */
function getDateStamp(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Generates ID in format YT-YYYYMMDD-001 and resets increment every day.
 */
async function generateTicketId() {
  const todayStamp = getDateStamp();
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.TICKET_COUNTER_DATE,
    STORAGE_KEYS.TICKET_COUNTER
  ]);

  const lastDate = data[STORAGE_KEYS.TICKET_COUNTER_DATE];
  const lastCounter = data[STORAGE_KEYS.TICKET_COUNTER] || 0;
  const nextCounter = lastDate === todayStamp ? lastCounter + 1 : 1;

  await chrome.storage.local.set({
    [STORAGE_KEYS.TICKET_COUNTER_DATE]: todayStamp,
    [STORAGE_KEYS.TICKET_COUNTER]: nextCounter
  });

  return `YT-${todayStamp}-${String(nextCounter).padStart(3, '0')}`;
}

/**
 * Sends Telegram message using bot token + chat ID saved in storage.
 */
async function sendTelegramNotification(ticket) {
  const { [STORAGE_KEYS.TELEGRAM_CONFIG]: cfg } = await chrome.storage.local.get(
    STORAGE_KEYS.TELEGRAM_CONFIG
  );

  if (!cfg?.botToken || !cfg?.chatId) {
    return { success: false, reason: 'Telegram config missing.' };
  }

  const text = [
    '🎫 New Ticket Created',
    `ID: ${ticket.id}`,
    `Type: ${ticket.type}`,
    `Status: ${ticket.status}`,
    `User: ${ticket.userName}`,
    `Date: ${ticket.date}`
  ].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text })
    });

    if (!response.ok) {
      return { success: false, reason: `Telegram API error: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.action) {
    return false;
  }

  (async () => {
    if (message.action === 'CREATE_TICKET') {
      const id = await generateTicketId();
      const ticket = {
        id,
        type: message.payload?.type || 'General',
        date: new Date().toISOString(),
        status: message.payload?.status || 'Open',
        userName: message.payload?.userName || 'Unknown'
      };

      const { [STORAGE_KEYS.TICKETS]: existing = [] } = await chrome.storage.local.get(STORAGE_KEYS.TICKETS);
      const updated = [ticket, ...existing];
      await chrome.storage.local.set({ [STORAGE_KEYS.TICKETS]: updated });
      const telegramResult = await sendTelegramNotification(ticket);

      sendResponse({ success: true, ticket, telegramResult });
      return;
    }

    if (message.action === 'GET_TICKETS') {
      const { [STORAGE_KEYS.TICKETS]: tickets = [] } = await chrome.storage.local.get(STORAGE_KEYS.TICKETS);
      sendResponse({ success: true, tickets });
      return;
    }

    if (message.action === 'SAVE_TELEGRAM_CONFIG') {
      await chrome.storage.local.set({ [STORAGE_KEYS.TELEGRAM_CONFIG]: message.payload });
      sendResponse({ success: true });
      return;
    }

    if (message.action === 'GET_TELEGRAM_CONFIG') {
      const { [STORAGE_KEYS.TELEGRAM_CONFIG]: telegramConfig = {} } = await chrome.storage.local.get(
        STORAGE_KEYS.TELEGRAM_CONFIG
      );
      sendResponse({ success: true, telegramConfig });
      return;
    }

    if (message.action === 'SEND_TELEGRAM_TEST') {
      const result = await sendTelegramNotification({
        id: 'TEST-NOTIFICATION',
        type: 'System',
        status: 'Info',
        userName: 'Admin',
        date: new Date().toISOString()
      });
      sendResponse({ success: true, result });
      return;
    }

    sendResponse({ success: false, error: 'Unknown action' });
  })();

  return true;
});
