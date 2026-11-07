/* The checker's UI. All maths lives in colour.js; this file only reads inputs,
 * writes results, and keeps the URL in sync so a pair can be shared.
 *
 * The pure part — compute() — is exposed as window.Checker so it can be tested
 * without a browser. */
(function (root) {
  'use strict';

  var Colour = root.Colour;

  var THRESHOLDS = {
    normal: 4.5, // WCAG 2.1 AA, text under 24px (or under 18.66px bold)
    large: 3, // AA, text at or above 24px (or 18.66px bold)
    ui: 3, // AA, non-text: borders, focus rings, icons
    aaaNormal: 7,
    aaaLarge: 4.5,
  };

  function verdict(ratio, threshold) {
    return ratio >= threshold ? 'pass' : 'fail';
  }

  /* Everything the page needs to know about one pair, with no DOM involved. */
  function compute(fgHex, bgHex) {
    var fg = Colour.parseHex(fgHex);
    var bg = Colour.parseHex(bgHex);
    if (!fg || !bg) return null;

    var ratio = Colour.ratio(fg, bg);
    var fix = ratio >= THRESHOLDS.normal ? null : Colour.suggestFix(fg, bg, THRESHOLDS.normal);
    var bgFix =
      ratio >= THRESHOLDS.normal || fix
        ? null
        : Colour.suggestBackground(fg, bg, THRESHOLDS.normal);

    return {
      fg: Colour.toHex(fg),
      bg: Colour.toHex(bg),
      ratio: ratio,
      normal: verdict(ratio, THRESHOLDS.normal),
      large: verdict(ratio, THRESHOLDS.large),
      ui: verdict(ratio, THRESHOLDS.ui),
      aaaNormal: verdict(ratio, THRESHOLDS.aaaNormal),
      aaaLarge: verdict(ratio, THRESHOLDS.aaaLarge),
      fix: fix,
      bgFix: bgFix,
    };
  }

  root.Checker = { compute: compute, thresholds: THRESHOLDS };

  /* --- UI ----------------------------------------------------------------- */
  var ids = ['fg-hex', 'fg-color', 'bg-hex', 'bg-color'];
  if (!ids.every(function (id) { return document.getElementById(id); })) return;

  var els = {
    fgHex: document.getElementById('fg-hex'),
    fgColor: document.getElementById('fg-color'),
    bgHex: document.getElementById('bg-hex'),
    bgColor: document.getElementById('bg-color'),
    swap: document.getElementById('swap'),
    ratio: document.getElementById('ratio-value'),
    summary: document.getElementById('ratio-summary'),
    preview: document.getElementById('preview'),
    normal: document.getElementById('check-normal'),
    large: document.getElementById('check-large'),
    ui: document.getElementById('check-ui'),
    fix: document.getElementById('fix'),
    presets: document.querySelectorAll('[data-preset]'),
  };

  var state = { fg: '#999999', bg: '#ffffff' };

  function normalise(input) {
    var parsed = Colour.parseHex(input);
    return parsed ? Colour.toHex(parsed) : null;
  }

  function setField(which, hex) {
    state[which] = hex;
    els[which + 'Hex'].value = hex;
    els[which + 'Color'].value = hex;
    els[which + 'Hex'].removeAttribute('aria-invalid');
  }

  function chip(el, passText, failText, pass) {
    el.textContent = pass ? passText : failText;
    el.className = 'verdict ' + (pass ? 'verdict-pass' : 'verdict-fail');
  }

  function swatchPair(fg, bg, label) {
    var wrap = document.createElement('span');
    wrap.className = 'swatch-pair';
    wrap.style.background = bg;
    var text = document.createElement('span');
    text.style.color = fg;
    text.textContent = 'Aa';
    wrap.appendChild(text);
    if (label) {
      var cap = document.createElement('span');
      cap.className = 'visually-hidden';
      cap.textContent = label;
      wrap.appendChild(cap);
    }
    return wrap;
  }

  function renderFix(result) {
    els.fix.textContent = '';

    if (result.normal === 'pass') {
      var ok = document.createElement('p');
      ok.className = 'fix-line';
      ok.textContent = result.aaaNormal === 'pass'
        ? 'Passes AA and AAA for normal text. Nothing to fix.'
        : 'Passes AA for normal text at ' + result.ratio.toFixed(2) + ':1. AAA would need 7:1.';
      els.fix.appendChild(ok);
      return;
    }

    var heading = document.createElement('p');
    heading.className = 'fix-heading';
    heading.textContent = 'Smallest fix for normal text (4.5:1)';

    if (result.fix) {
      var line = document.createElement('p');
      line.className = 'fix-line';
      line.appendChild(document.createTextNode('Change the text colour '));
      var from = document.createElement('code');
      from.textContent = result.fg;
      line.appendChild(from);
      line.appendChild(document.createTextNode(' → '));
      var to = document.createElement('code');
      to.textContent = result.fix.hex;
      line.appendChild(to);
      line.appendChild(
        document.createTextNode(
          ' — ' + result.fix.ratio.toFixed(2) + ':1, ' + result.fix.direction + '.'
        )
      );

      var apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-small';
      apply.textContent = 'Apply';
      apply.addEventListener('click', function () {
        setField('fg', result.fix.hex);
        update('fg');
      });

      var row = document.createElement('div');
      row.className = 'fix-row';
      row.appendChild(swatchPair(result.fix.hex, result.bg, 'suggested pair'));
      row.appendChild(line);
      row.appendChild(apply);

      els.fix.appendChild(heading);
      els.fix.appendChild(row);
      return;
    }

    if (result.bgFix) {
      var bgLine = document.createElement('p');
      bgLine.className = 'fix-line';
      bgLine.appendChild(document.createTextNode('The text colour cannot reach 4.5:1 on this background. Move the background '));
      var fromBg = document.createElement('code');
      fromBg.textContent = result.bg;
      bgLine.appendChild(fromBg);
      bgLine.appendChild(document.createTextNode(' → '));
      var toBg = document.createElement('code');
      toBg.textContent = result.bgFix.hex;
      bgLine.appendChild(toBg);
      bgLine.appendChild(
        document.createTextNode(' — ' + result.bgFix.ratio.toFixed(2) + ':1.')
      );

      var applyBg = document.createElement('button');
      applyBg.type = 'button';
      applyBg.className = 'btn btn-small';
      applyBg.textContent = 'Apply';
      applyBg.addEventListener('click', function () {
        setField('bg', result.bgFix.hex);
        update('bg');
      });

      var bgRow = document.createElement('div');
      bgRow.className = 'fix-row';
      bgRow.appendChild(swatchPair(result.fg, result.bgFix.hex, 'suggested pair'));
      bgRow.appendChild(bgLine);
      bgRow.appendChild(applyBg);

      els.fix.appendChild(heading);
      els.fix.appendChild(bgRow);
      return;
    }

    var none = document.createElement('p');
    none.className = 'fix-line';
    none.textContent = 'No lightness change fixes this pair. Both colours have to move.';
    els.fix.appendChild(heading);
    els.fix.appendChild(none);
  }

  function update(source) {
    if (source === 'fg-hex' || source === 'bg-hex') {
      var key = source === 'fg-hex' ? 'fg' : 'bg';
      var hex = normalise(els[source].value);
      if (!hex) {
        els[source].setAttribute('aria-invalid', 'true');
        return;
      }
      setField(key, hex);
    }

    var result = compute(state.fg, state.bg);
    if (!result) return;

    els.ratio.textContent = result.ratio.toFixed(2) + ':1';
    els.summary.textContent =
      result.normal === 'pass'
        ? 'Passes AA for normal text.'
        : result.large === 'pass'
        ? 'Fails for normal text; passes for large text only.'
        : 'Fails for normal and large text.';

    chip(els.normal, 'AA pass', 'AA fail', result.normal === 'pass');
    chip(els.large, 'AA pass', 'AA fail', result.large === 'pass');
    chip(els.ui, '3:1 pass', '3:1 fail', result.ui === 'pass');

    els.preview.style.background = result.bg;
    els.preview.style.color = result.fg;

    renderFix(result);

    var query = '?fg=' + result.fg.slice(1) + '&bg=' + result.bg.slice(1);
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', query);
    }
  }

  els.fgHex.addEventListener('input', function () { update('fg-hex'); });
  els.bgHex.addEventListener('input', function () { update('bg-hex'); });
  els.fgColor.addEventListener('input', function () { setField('fg', els.fgColor.value); update('color'); });
  els.bgColor.addEventListener('input', function () { setField('bg', els.bgColor.value); update('color'); });

  els.swap.addEventListener('click', function () {
    var fg = state.fg;
    setField('fg', state.bg);
    setField('bg', fg);
    update('swap');
  });

  Array.prototype.forEach.call(els.presets, function (button) {
    button.addEventListener('click', function () {
      setField('fg', '#' + button.dataset.presetFg);
      setField('bg', '#' + button.dataset.presetBg);
      update('preset');
    });
  });

  /* Initial state: ?fg=rrggbb&bg=rrggbb, or the defaults. */
  var params = new URLSearchParams(window.location.search);
  var startFg = normalise(params.get('fg') || '');
  var startBg = normalise(params.get('bg') || '');
  setField('fg', startFg || state.fg);
  setField('bg', startBg || state.bg);
  update('init');
})(typeof globalThis !== 'undefined' ? globalThis : this);
