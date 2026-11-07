/* Colour maths for the contrast checker.
 *
 * Plain functions on {r, g, b} objects (0-255) or #rrggbb strings. No DOM, no
 * state, so this is tested outside a browser (see the repository README):
 *
 *   - relative luminance and WCAG 2.1 contrast ratios
 *   - OKLab conversion (Ottosson 2020)
 *   - withLightness(): move lightness, preserving hue by reducing chroma
 *     rather than clipping channels when the result leaves the sRGB gamut
 *   - suggestFix() / suggestBackground(): the smallest lightness change that
 *     reaches a target ratio, searched on 8-bit colours so the colour it
 *     reports is the colour you actually get
 *
 * Exposed as globalThis.Colour.
 */
(function (root) {
  'use strict';

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /* --- Parsing and formatting --------------------------------------------- */
  function parseHex(input) {
    if (typeof input !== 'string') return null;
    var value = input.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{3}$/.test(value) && !/^[0-9a-fA-F]{6}$/.test(value)) return null;
    if (value.length === 3) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }
    var n = parseInt(value, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function toHex(c) {
    var part = function (v) {
      return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    };
    return '#' + part(c.r) + part(c.g) + part(c.b);
  }

  /* Snap to the nearest colour a screen can actually show. Every search below
     runs on snapped colours, so a reported ratio is never a rounding artefact. */
  function quantise(c) {
    return parseHex(toHex(c));
  }

  /* --- WCAG 2.1 relative luminance and contrast --------------------------- */
  function channel(v) {
    var c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(c) {
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  }

  function ratio(a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /* --- sRGB <-> OKLab ------------------------------------------------------
     Matrices from Björn Ottosson's "A perceptual color space for image
     processing" (2020). L is 0 for black and 1 for white. */
  function toLinear(v) {
    var c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function fromLinear(v) {
    var c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return c * 255;
  }

  function cbrt(v) {
    return v < 0 ? -Math.pow(-v, 1 / 3) : Math.pow(v, 1 / 3);
  }

  function rgbToOklab(c) {
    var r = toLinear(c.r);
    var g = toLinear(c.g);
    var b = toLinear(c.b);

    var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    var l_ = cbrt(l);
    var m_ = cbrt(m);
    var s_ = cbrt(s);

    return {
      L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
      a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
      b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    };
  }

  /* Linear-light RGB for an OKLab triple; may be outside [0, 1]. */
  function oklabToLinear(lab) {
    var l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
    var m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
    var s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;

    var l = l_ * l_ * l_;
    var m = m_ * m_ * m_;
    var s = s_ * s_ * s_;

    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }

  var EPSILON = 1e-7;

  function inGamut(lab) {
    var lin = oklabToLinear(lab);
    return lin.every(function (v) {
      return v >= -EPSILON && v <= 1 + EPSILON;
    });
  }

  /* Reduce chroma (keeping L and hue) until the colour fits in sRGB. This is a
     cheap stand-in for full chroma clamping, and it keeps the hue that naive
     per-channel clipping would bend. */
  function gamutMap(lab) {
    if (inGamut(lab)) return lab;
    var lo = 0;
    var hi = 1;
    var best = { L: lab.L, a: 0, b: 0 };
    for (var i = 0; i < 28; i++) {
      var mid = (lo + hi) / 2;
      var test = { L: lab.L, a: lab.a * mid, b: lab.b * mid };
      if (inGamut(test)) {
        best = test;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return best;
  }

  function oklabToRgb(lab) {
    var mapped = gamutMap(lab);
    var lin = oklabToLinear(mapped);
    return {
      r: clamp(fromLinear(clamp(lin[0], 0, 1)), 0, 255),
      g: clamp(fromLinear(clamp(lin[1], 0, 1)), 0, 255),
      b: clamp(fromLinear(clamp(lin[2], 0, 1)), 0, 255),
    };
  }

  /* Same hue and chroma pressure, new lightness. */
  function withLightness(c, L) {
    var lab = rgbToOklab(c);
    return oklabToRgb({ L: clamp(L, 0, 1), a: lab.a, b: lab.b });
  }

  /* --- Smallest fix --------------------------------------------------------
     Moves `subject`'s lightness away from `other` until the ratio is met, then
     binary-searches back towards where it started. Candidates are snapped to
     8-bit before being measured, and a final outward step guarantees the
     returned colour passes even when snapping wobbles the boundary. Returns
     null when neither direction can reach the target — which happens when the
     other colour is mid-lightness and no amount of moving helps. */
  function search(subject, other, target) {
    var start = quantise(subject);
    var startL = rgbToOklab(start).L;

    if (ratio(start, other) >= target) {
      return { color: start, deltaL: 0, direction: 'unchanged' };
    }

    var best = null;

    [true, false].forEach(function (lighter) {
      var edgeL = lighter ? 1 : 0;
      var edge = quantise(withLightness(start, edgeL));

      if (ratio(edge, other) < target) return; /* direction cannot reach it */

      var lo = startL;
      var hi = edgeL;
      var found = edge;

      for (var i = 0; i < 32; i++) {
        var mid = (lo + hi) / 2;
        var candidate = quantise(withLightness(start, mid));
        if (ratio(candidate, other) >= target) {
          found = candidate;
          hi = mid;
        } else {
          lo = mid;
        }
      }

      /* Guard the boundary: stepping outward cannot invalidate the result. */
      var step = 0.0005;
      var nudge = 0;
      while (ratio(found, other) < target && nudge < 400) {
        var movedL = rgbToOklab(found).L + (lighter ? step : -step);
        if (movedL < 0 || movedL > 1) break;
        found = quantise(withLightness(start, movedL));
        nudge++;
      }

      var delta = Math.abs(rgbToOklab(found).L - startL);
      if (!delta) return;

      if (!best || delta < best.deltaL) {
        best = { color: found, deltaL: delta, direction: lighter ? 'lighter' : 'darker' };
      }
    });

    return best;
  }

  /* The smallest change to the text colour that reaches the target. */
  function suggestFix(fg, bg, target) {
    var found = search(fg, bg, target);
    if (!found) return null;
    return {
      color: found.color,
      hex: toHex(found.color),
      ratio: ratio(found.color, bg),
      deltaL: found.deltaL,
      direction: found.direction,
    };
  }

  /* The smallest change to the background instead. */
  function suggestBackground(fg, bg, target) {
    var found = search(bg, fg, target);
    if (!found) return null;
    return {
      color: found.color,
      hex: toHex(found.color),
      ratio: ratio(fg, found.color),
      deltaL: found.deltaL,
      direction: found.direction,
    };
  }

  var api = {
    parseHex: parseHex,
    toHex: toHex,
    quantise: quantise,
    luminance: luminance,
    ratio: ratio,
    rgbToOklab: rgbToOklab,
    oklabToRgb: oklabToRgb,
    withLightness: withLightness,
    suggestFix: suggestFix,
    suggestBackground: suggestBackground,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Colour = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
