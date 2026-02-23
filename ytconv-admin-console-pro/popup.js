const STORAGE_KEYS = {
  THEME: 'uiTheme',
  ACTIVE_TAB: 'uiActiveTab'
};

const els = {
  tabs: [...document.querySelectorAll('.tab')],
  panels: [...document.querySelectorAll('.panel')],
  themeToggle: document.getElementById('themeToggle'),
  generateAi: document.getElementById('generateAi'),
  copyAi: document.getElementById('copyAi'),
  aiPrompt: document.getElementById('aiPrompt'),
  aiOutput: document.getElementById('aiOutput'),
  openDashboard: document.getElementById('openDashboard')
};

function setActiveTab(tabName) {
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

  chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_TAB]: tabName });
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
  await chrome.storage.local.set({ [STORAGE_KEYS.THEME]: next });
}

function buildMockReply(inputText) {
  const short = inputText.replace(/\s+/g, ' ').trim();
  return [
    'Hello,',
    '',
    `Thank you for your report: "${short.slice(0, 140)}${short.length > 140 ? '…' : ''}".`,
    'We have reviewed the issue and logged it under active monitoring.',
    'Our team will provide the next update after validation is complete.',
    '',
    'Regards,',
    'YTConv Admin Support'
  ].join('\n');
}

function generateAiReply() {
  const value = els.aiPrompt?.value.trim();
  if (!value) {
    if (els.aiOutput) {
      els.aiOutput.value = 'Please provide report text first.';
    }
    return;
  }

  if (els.aiOutput) {
    els.aiOutput.value = buildMockReply(value);
  }
}

async function copyAiReply() {
  const value = els.aiOutput?.value.trim();
  if (!value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    if (els.copyAi) {
      els.copyAi.textContent = 'Copied';
      setTimeout(() => {
        els.copyAi.textContent = 'Copy';
      }, 900);
    }
  } catch {
    if (els.copyAi) {
      els.copyAi.textContent = 'Failed';
      setTimeout(() => {
        els.copyAi.textContent = 'Copy';
      }, 900);
    }
  }
}

function openFullDashboard() {
  chrome.tabs.create({ url: 'dashboard.html' });
}

function bindEvents() {
  els.tabs.forEach((tab) => tab.addEventListener('click', () => setActiveTab(tab.dataset.tab)));
  els.themeToggle?.addEventListener('click', toggleTheme);
  els.generateAi?.addEventListener('click', generateAiReply);
  els.copyAi?.addEventListener('click', copyAiReply);
  els.openDashboard?.addEventListener('click', openFullDashboard);
}

async function bootstrap() {
  const { [STORAGE_KEYS.THEME]: theme = 'dark', [STORAGE_KEYS.ACTIVE_TAB]: tab = 'tickets' } =
    await chrome.storage.local.get([STORAGE_KEYS.THEME, STORAGE_KEYS.ACTIVE_TAB]);

  applyTheme(theme);
  setActiveTab(tab);
}

(async function init() {
  bindEvents();
  await bootstrap();
})();
