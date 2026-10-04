/* ChaskaBox shared theme (dark/light) — loaded in <head> before CSS to avoid flash */
(function () {
  var KEY = 'chaskabox-theme';
  function current() {
    try { return localStorage.getItem(KEY) || 'light'; }
    catch (e) { return 'light'; }
  }
  function syncIcons(t) {
    var icons = document.querySelectorAll('.ticon');
    for (var i = 0; i < icons.length; i++) icons[i].textContent = (t === 'dark') ? '☀️' : '🌙';
    var btns = document.querySelectorAll('.tbtn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].setAttribute('title', t === 'dark' ? 'Light mode' : 'Dark mode');
      btns[j].setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }
  function apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    syncIcons(t);
  }
  window.toggleTheme = function () {
    apply(current() === 'dark' ? 'light' : 'dark');
  };
  window.syncThemeIcons = function () { syncIcons(current()); };
  apply(current());
  document.addEventListener('DOMContentLoaded', function () { syncIcons(current()); });
})();
