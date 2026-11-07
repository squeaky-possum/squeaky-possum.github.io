/* Palette audit: resolves this site's own colour tokens in the browser and
   computes WCAG 2.1 contrast ratios for the pairs the site uses.
   The figures on the home page come from tools/audit-contrast.mjs, which
   checks the same pairs from the stylesheet at build time. */
(function () {
  'use strict';

  /* --- Token and pair definitions ----------------------------------------- */
  var TOKENS = [
    '--bg', '--bg-elevated', '--bg-sunken', '--text', '--text-muted', '--text-faint',
    '--border', '--border-strong', '--accent', '--accent-soft', '--accent-ink',
    '--accent-text', '--ring'
  ];

  var PAIRS = [
    ['--text', '--bg', 'body copy', 'text'],
    ['--text', '--bg-elevated', 'colophon values', 'text'],
    ['--text-muted', '--bg', 'lede, prose', 'text'],
    ['--text-muted', '--bg-elevated', 'colophon labels', 'text'],
    ['--text-muted', '--bg-sunken', 'nav on hover', 'text'],
    ['--text-faint', '--bg', 'eyebrow, footer, table head', 'text'],
    ['--accent', '--bg', 'links', 'text'],
    ['--accent', '--bg-elevated', 'links on raised surfaces', 'text'],
    ['--accent-ink', '--accent-soft', 'verdict chips', 'text'],
    ['--accent-text', '--accent', 'primary button, selection', 'text'],
    ['--ring', '--bg', 'focus ring', 'ui'],
    ['--border-strong', '--bg', 'control borders', 'ui'],
    ['--border-strong', '--bg-elevated', 'control borders on raised surfaces', 'ui']
  ];

  var THRESHOLD = { text: 4.5, ui: 3 };

  /* --- Colour maths ------------------------------------------------------- */
  var probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;width:0;height:0;pointer-events:none;';
  document.body.appendChild(probe);

  function resolve(token) {
    probe.style.color = 'var(' + token + ')';
    return getComputedStyle(probe).color;
  }

  function parse(rgb) {
    var m = rgb.match(/-?[\d.]+/g);
    if (!m) return [0, 0, 0];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }

  function luminance(rgb) {
    var lin = rgb.map(function (v) {
      var c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function ratio(a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    var hi = Math.max(la, lb);
    var lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  function hex(rgb) {
    return (
      '#' +
      rgb
        .map(function (v) {
          return Math.round(v).toString(16).padStart(2, '0');
        })
        .join('')
    );
  }

  /* --- DOM building ------------------------------------------------------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function swatch(color, label) {
    var s = el('span', 'swatch');
    s.style.background = 'var(' + color + ')';
    s.title = color;
    s.setAttribute('aria-label', label || color);
    var cell = el('td');
    cell.appendChild(s);
    return cell;
  }

  function verdict(ratioValue, role) {
    var need = THRESHOLD[role];
    var chip = el('span', 'verdict');
    var text;

    if (ratioValue < need) {
      chip.classList.add('verdict-fail');
      text = 'fail';
    } else {
      chip.classList.add('verdict-pass');
      text = role === 'text' ? (ratioValue >= 7 ? 'AAA' : 'AA') : '3:1';
    }

    chip.textContent = text;
    return chip;
  }

  /* --- Render ------------------------------------------------------------- */
  function renderTokens() {
    var body = document.getElementById('token-rows');
    if (!body) return;
    body.textContent = '';

    TOKENS.forEach(function (token) {
      var rgb = parse(resolve(token));
      var row = el('tr');

      row.appendChild(swatch(token, token + ' swatch'));
      row.appendChild(el('td', 'token-name', token));

      var value = el('td', 'token-value');
      value.textContent = hex(rgb) + '  rgb(' + rgb.map(Math.round).join(', ') + ')';
      row.appendChild(value);

      body.appendChild(row);
    });
  }

  function renderPairs() {
    var body = document.getElementById('pair-rows');
    if (!body) return;
    body.textContent = '';

    PAIRS.forEach(function (pair) {
      var fg = parse(resolve(pair[0]));
      var bg = parse(resolve(pair[1]));
      var value = ratio(fg, bg);
      var row = el('tr');

      var label = el('td');
      var pairLabel = el('span', 'token-name', pair[0] + ' on ' + pair[1]);
      var note = el('span', 'pair-note', pair[2] + ' · needs ' + THRESHOLD[pair[3]] + ':1');
      label.appendChild(pairLabel);
      label.appendChild(note);
      row.appendChild(label);

      row.appendChild(el('td', 'ratio', value.toFixed(2) + ':1'));
      var cell = el('td');
      cell.appendChild(verdict(value, pair[3]));
      row.appendChild(cell);

      body.appendChild(row);
    });
  }

  function render() {
    renderTokens();
    renderPairs();
  }

  render();

  /* Re-audit whenever the active palette changes (toggle, or the OS
     preference shifting while no explicit choice is stored). */
  document.addEventListener('themechange', render);

  if (window.matchMedia) {
    var query = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { render(); };
    if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
    else if (typeof query.addListener === 'function') query.addListener(onChange);
  }
})();
