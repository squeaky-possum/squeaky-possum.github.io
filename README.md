# squeaky-possum.github.io

The source of **<https://squeaky-possum.github.io/>**.

A small site about one measurable thing: **text contrast**. Why 4.5:1 is the number, the six
ways a site usually misses it, how to fix a palette without redesigning it, and a checker that
does the arithmetic for you.

Hand-written HTML and CSS, a little JavaScript, no build step, no dependencies, no
third-party requests. What's committed is what's served.

## Pages

| Page | What it is |
| --- | --- |
| `index.html` | The rule, the numbers, the usual failures, and how to fix them. |
| `checker.html` | Two colours in, WCAG ratios out — plus the smallest lightness change that makes a failing pair pass. |
| `palette.html` | Worked example: this site's own tokens, resolved in the browser, with the ratio for every pair it uses. |
| `404.html` | Served by GitHub Pages for unknown paths. |

## The checker

`assets/colour.js` does the maths with no DOM and no dependencies:

- **WCAG 2.1 contrast** — sRGB channels linearised, weighted 0.2126 / 0.7152 / 0.0722, ratio
  `(L1 + 0.05) / (L2 + 0.05)`.
- **OKLab** (Ottosson 2020) for moving lightness while holding hue. Out-of-gamut results
  reduce chroma instead of clipping channels, so the hue does not bend.
- **`suggestFix()`** — binary-searches the nearest lightness that reaches a target, then
  *checks its answer on 8-bit colours*. That last part matters: an unrounded search returns
  `#777777` for a pair that then measures 4.48:1. Searching on real values means the colour
  it reports is the colour you get.

`assets/checker.js` is only the UI: inputs, URL state (`?fg=rrggbb&bg=rrggbb`), verdicts,
and the preview.

## The audit

The site's own palette is checked by two independent implementations:

```bash
node tools/audit-contrast.mjs            # human-readable table
node tools/audit-contrast.mjs --json     # machine-readable report
node tools/audit-contrast.mjs --strict   # exit 1 if any pair fails
```

`tools/audit-contrast.mjs` parses the token blocks out of `assets/styles.css`.
`assets/palette.js` resolves the same tokens through `getComputedStyle` in the browser, so
`color-mix()` and anything else the stylesheet does is resolved by the browser rather than
guessed at. Both check the same 13 foreground/background pairs in each palette: 26 pairs,
4.5:1 for text and 3:1 for non-text UI.

Current state: **all 26 pass**, worst is 3.37:1 — control borders in the light palette,
against a 3:1 requirement. Before that token was darkened it measured 1.8:1. That failure is
the reason this site has an audit at all.

## Palettes and files

| Path | What it is |
| --- | --- |
| `assets/styles.css` | All the styling. Tokens first; everything else refers to them. |
| `assets/main.js` | Theme toggle with persistence, sticky-header state, footer year. |
| `assets/colour.js` | Contrast and OKLab maths, shared by the checker. |
| `assets/checker.js` | Checker UI. |
| `assets/palette.js` | The in-browser half of the palette audit. |
| `assets/favicon.svg` | The face in the tab. |
| `tools/audit-contrast.mjs` | The build-time half of the audit. |
| `.nojekyll` | Serve the files verbatim; skip the Jekyll build. |

Two palettes, one token set: light by default, dark following `prefers-color-scheme`, and an
explicit toggle choice stored in `localStorage` and winning over the OS. Each palette defines
14 colour tokens — 13 solid colours plus one shadow.

## Deploying

This repository is a GitHub Pages user site: the root of `main` is served as-is. There is no
workflow, no action, and nothing to install. That is the point.

## Licence

[AGPL-3.0](LICENSE).
