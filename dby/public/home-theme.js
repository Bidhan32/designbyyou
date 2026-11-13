(() => {
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try { preference = localStorage.getItem('theme'); } catch { /* Storage may be unavailable. */ }
  const valid = value => value === 'dark' || value === 'light';
  let explicit = valid(preference);
  const update = theme => {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.hidden = false;
      button.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
      button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    }
  };
  // Run before styles render to avoid a flash of the opposite theme.
  update(explicit ? preference : system.matches ? 'dark' : 'light');
  document.addEventListener('DOMContentLoaded', () => {
    update(root.dataset.theme);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      explicit = true;
      const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', theme); } catch { /* Keep the choice for this visit. */ }
      update(theme);
    });
  }, { once: true });
  system.addEventListener('change', () => {
    if (!explicit) update(system.matches ? 'dark' : 'light');
  });
  window.addEventListener('storage', event => {
    if (event.key !== 'theme' && event.key !== null) return;
    explicit = valid(event.newValue);
    update(explicit ? event.newValue : system.matches ? 'dark' : 'light');
  });
})();
