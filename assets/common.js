const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>'
};

export function initShell(activePage = '') {
  const root = document.documentElement;
  const storedTheme = localStorage.getItem('ytconv-support-theme');
  const preferredDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = storedTheme || (preferredDark ? 'dark' : 'light');

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      localStorage.setItem('ytconv-support-theme', next);
      updateThemeIcons();
    });
  });
  updateThemeIcons();

  document.querySelectorAll('[data-menu-open]').forEach((button) => {
    button.addEventListener('click', () => document.body.classList.add('sidebar-open'));
  });
  document.querySelectorAll('[data-menu-close], .sidebar-overlay').forEach((button) => {
    button.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
  });

  document.querySelectorAll('[data-page]').forEach((link) => {
    link.classList.toggle('active', link.dataset.page === activePage);
  });

  loadPublicConfig();
}

function updateThemeIcons() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>';
  const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    const label = dark ? 'Gunakan tema terang' : 'Gunakan tema gelap';
    button.setAttribute('aria-label', label);
    const icon = dark ? sunIcon : moonIcon;
    button.innerHTML = button.classList.contains('sidebar-link') ? `${icon}<span>${label}</span>` : icon;
  });
}

export async function loadPublicConfig() {
  try {
    const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const config = await response.json();
    document.querySelectorAll('[data-support-email]').forEach((node) => {
      if (node.tagName === 'A') node.href = `mailto:${config.supportEmail}`;
      const textTarget = node.matches('.support-address') ? node : node.querySelector('.support-address');
      if (textTarget) textTarget.textContent = config.supportEmail;
    });
    document.querySelectorAll('[data-main-app]').forEach((node) => {
      node.href = config.mainAppUrl;
    });
    window.ytconvSupportConfig = config;
    document.dispatchEvent(new CustomEvent('ytconv:config', { detail: config }));
    return config;
  } catch {
    return null;
  }
}

export function formatDate(value, includeTime = true) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' } : {})
  }).format(date);
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast('Berhasil disalin.', 'success');
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.className = 'clipboard-fallback';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    toast('Berhasil disalin.', 'success');
  }
}

export function toast(message, type = 'success') {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.innerHTML = `${ICONS[type === 'error' ? 'error' : 'check']}<p></p>`;
  item.querySelector('p').textContent = message;
  region.appendChild(item);
  window.setTimeout(() => item.remove(), 3600);
}

export function setButtonLoading(button, loading, loadingText = 'Memproses...') {
  if (!button) return;
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${loadingText}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
  }
}

export function showAlert(container, message, type = 'error') {
  if (!container) return;
  container.hidden = false;
  container.className = `alert ${type}`;
  container.innerHTML = `${ICONS[type === 'error' ? 'error' : 'check']}<div></div>`;
  container.querySelector('div').textContent = message;
}

export function hideAlert(container) {
  if (!container) return;
  container.hidden = true;
  container.textContent = '';
}
