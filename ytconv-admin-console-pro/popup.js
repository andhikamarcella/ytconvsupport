const UI_STORAGE_KEYS = {
  THEME: 'uiTheme',
  ACTIVE_TAB: 'uiActiveTab'
};

const elements = {
  tabs: [...document.querySelectorAll('.tab')],
  panels: [...document.querySelectorAll('.panel')],
  themeToggle: document.getElementById('themeToggle'),
  generateAi: document.getElementById('generateAi'),
  copyAi: document.getElementById('copyAi'),
  aiPrompt: document.getElementById('aiPrompt'),
  aiOutput: document.getElementById('aiOutput')
};

function setActiveTab(tabName) {
  elements.tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  elements.panels.forEach((panel) => {
    const isActive = panel.id === tabName;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  });

  chrome.storage.local.set({ [UI_STORAGE_KEYS.ACTIVE_TAB]: tabName });
}

function applyTheme(theme) {
  const isNeon = theme === 'neon';
  document.documentElement.dataset.theme = isNeon ? 'neon' : '';
  elements.themeToggle.textContent = isNeon ? 'Dark' : 'Neon';
}

async function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme === 'neon' ? 'neon' : 'dark';
  const nextTheme = currentTheme === 'neon' ? 'dark' : 'neon';
  applyTheme(nextTheme);
  await chrome.storage.local.set({ [UI_STORAGE_KEYS.THEME]: nextTheme });
}

function bindTabEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveTab(tab.dataset.tab);
    });
  });
}

function buildMockAiReply(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return [
    'Hello,',
    '',
    `Thank you for your report regarding: "${cleaned.slice(0, 130)}${cleaned.length > 130 ? '…' : ''}".`,
    'Our admin team has reviewed the issue and opened a support ticket for tracking.',
    'We will provide an update after verification and next-step confirmation.',
    '',
    'Best regards,',
    'YTConv Support Team'
  ].join('\n');
}

function handleGenerateAi() {
  const source = elements.aiPrompt.value.trim();
  if (!source) {
    elements.aiOutput.value = 'Please enter a user report first.';
    return;
  }

  elements.aiOutput.value = buildMockAiReply(source);
}

async function handleCopyAi() {
  const value = elements.aiOutput.value.trim();
  if (!value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    elements.copyAi.textContent = 'Copied';
    window.setTimeout(() => {
      elements.copyAi.textContent = 'Copy';
    }, 1000);
  } catch {
    elements.copyAi.textContent = 'Failed';
    window.setTimeout(() => {
      elements.copyAi.textContent = 'Copy';
    }, 1000);
  }
}

function bindUiEvents() {
  bindTabEvents();
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.generateAi.addEventListener('click', handleGenerateAi);
  elements.copyAi.addEventListener('click', handleCopyAi);
}

async function bootstrapUiState() {
  const { [UI_STORAGE_KEYS.THEME]: savedTheme = 'dark', [UI_STORAGE_KEYS.ACTIVE_TAB]: savedTab = 'tickets' } =
    await chrome.storage.local.get([UI_STORAGE_KEYS.THEME, UI_STORAGE_KEYS.ACTIVE_TAB]);

  applyTheme(savedTheme);
  setActiveTab(savedTab);
}

(async function initPopupUi() {
  bindUiEvents();
  await bootstrapUiState();
})();
