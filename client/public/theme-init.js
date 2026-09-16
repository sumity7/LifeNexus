(function () {
  try {
    var stored = JSON.parse(localStorage.getItem('lifeos:appearance') || '{}');
    var theme = stored.theme || 'system';
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.accent = stored.accent || 'indigo';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
