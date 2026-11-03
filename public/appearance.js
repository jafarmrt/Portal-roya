// Puts the person's own look (dark mode, larger text, their colour) on the page before it is drawn, so a dark
// page never flashes white. Saved on this device by src/lib/appearance.ts.
(function () {
  try {
    var theme = localStorage.getItem('roya.theme');
    var size = localStorage.getItem('roya.textSize');
    var accent = localStorage.getItem('roya.accent');
    var root = document.documentElement;
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) root.classList.add('dark');
    if (/^(graphite|navy|teal|green|violet)$/.test(accent || '')) root.setAttribute('data-accent', accent);
    if (size === 'large' || size === 'larger') root.setAttribute('data-text-size', size);
  } catch (e) {
    // Storage blocked: the default look.
  }
})();
