#!/usr/bin/env node
/* Contrast audit for this site's palette.
 *
 * Reads the token blocks out of assets/styles.css and checks every
 * foreground/background pair the site actually uses, in both palettes.
 * This is the script that produced the figures in the home page colophon;
 * assets/palette.js recomputes the same pairs in the browser.
 *
 *   node tools/audit-contrast.mjs            # human-readable table
 *   node tools/audit-contrast.mjs --json     # machine-readable report
 *   node tools/audit-contrast.mjs --strict   # exit 1 on any failure
 *
 * Exit code is 1 on a failed pair when --strict is given, 2 on a usage error,
 * and 0 otherwise (so it can be run casually without breaking a shell script).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const CSS_PATH = path.join(REPO, 'assets/styles.css');

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const strict = args.has('--strict');
const known = new Set(['--json', '--strict', '--help', '-h']);
for (const arg of args) {
  if (!known.has(arg)) {
    console.error(`unknown argument: ${arg}\nsee --help`);
    process.exit(2);
  }
}
if (args.has('--help') || args.has('-h')) {
  console.log('usage: node tools/audit-contrast.mjs [--json] [--strict]');
  process.exit(0);
}

const css = fs.readFileSync(CSS_PATH, 'utf8');

/* --- Colour maths (WCAG 2.1) --------------------------------------------- */
function hexToRgb(hex) {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* --- Parse the stylesheet ------------------------------------------------ */
function palette(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([\\s\\S]*?)\\n\\}');
  const match = css.match(re);
  if (!match) throw new Error(`token block not found: ${selector}`);

  const tokens = {};
  for (const [, name, value] of match[1].matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[name] = value;
  }
  return tokens;
}

const palettes = {
  light: palette(':root[data-theme="light"]'),
  dark: palette(':root[data-theme="dark"]'),
};

/* --- Pairs the site uses ------------------------------------------------- */
const PAIRS = [
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
  ['--border-strong', '--bg-elevated', 'control borders on raised surfaces', 'ui'],
];

const THRESHOLD = { text: 4.5, ui: 3 };

/* --- Audit --------------------------------------------------------------- */
const report = { stylesheet: 'assets/styles.css', pairsPerPalette: PAIRS.length, palettes: {} };
let failures = 0;

for (const [name, tokens] of Object.entries(palettes)) {
  const missing = [...new Set(PAIRS.flatMap(([fg, bg]) => [fg, bg]))].filter((t) => !tokens[t]);
  if (missing.length) {
    console.error(`${name}: missing tokens ${missing.join(', ')}`);
    process.exit(2);
  }

  const rows = PAIRS.map(([fg, bg, use, role]) => {
    const value = contrast(hexToRgb(tokens[fg]), hexToRgb(tokens[bg]));
    const need = THRESHOLD[role];
    const pass = value >= need;
    if (!pass) failures++;
    return { fg, bg, use, role, ratio: Number(value.toFixed(2)), need, pass };
  });

  const worst = rows.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  report.palettes[name] = { colourTokens: Object.keys(tokens).length, rows, worst, failures: rows.filter((r) => !r.pass).length };
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [name, data] of Object.entries(report.palettes)) {
    console.log(`\n${name.toUpperCase()}  (${data.colourTokens} colour tokens)`);
    console.log('  ratio   need   pair');
    for (const row of data.rows) {
      console.log(
        `  ${row.ratio.toFixed(2).padStart(5)}  ${String(row.need).padStart(4)}   ${row.pass ? ' ' : '!'} ${row.fg} on ${row.bg}  (${row.use})`
      );
    }
    console.log(`  worst: ${data.worst.fg} on ${data.worst.bg} at ${data.worst.ratio}:1, needs ${data.worst.need}`);
  }
  console.log(failures ? `\n${failures} pair(s) below threshold` : '\nall pairs pass');
}

if (strict && failures) process.exit(1);
