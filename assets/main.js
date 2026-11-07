/* Theme toggle, sticky-header state, footer year.
   No dependencies, no build step. */
(function () {
  'use strict';

  var root = document.documentElement;
  var KEY = 'theme';

  function readTheme() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function currentTheme() {
    return root.dataset.theme || systemTheme();
  }

  var toggle = document.getElementById('theme-toggle');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }

  function paintChrome() {
    var dark = currentTheme() === 'dark';

    if (toggle) {
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }

    meta.setAttribute('content', dark ? '#0d1014' : '#fbfaf7');
  }

  function announce() {
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: currentTheme() } }));
  }

  function apply(theme, persist) {
    root.dataset.theme = theme;
    if (persist) {
      try { localStorage.setItem(KEY, theme); } catch (e) {}
    }
    paintChrome();
    announce();
  }

  paintChrome();

  if (toggle) {
    toggle.addEventListener('click', function () {
      apply(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }

  if (window.matchMedia) {
    var query = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) {
      if (!readTheme()) apply(e.matches ? 'dark' : 'light', false);
    };

    if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
    else if (typeof query.addListener === 'function') query.addListener(onChange);
  }

  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
