const btn = document.getElementById('dashTheme');
btn?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'neon' ? '' : 'neon';
  document.documentElement.dataset.theme = next;
});
