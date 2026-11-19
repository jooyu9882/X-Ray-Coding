# Code X-Ray Design System: "Radiograph"

This file is the source of truth for every visual decision in the frontend.
New UI (including the phase 2 auth, snippet, and error screens) must use these
tokens and patterns. If something here is missing, add it here first, then use it.

## Concept

The screen is a dark reading room. The code is a radiograph (film) on a backlit
panel. Execution is light: the line about to run is the **exposed spot** (cyan),
and lines that ran many times are **brighter** on the film (heatmap).

Rules that follow from the concept:

- **Dark only.** There is no light theme. `color-scheme: dark`.
- **One accent.** Exposure cyan means "now / active / focus / primary action".
  Never use it for decoration.
- **Light = information.** Brightness on the film always means something
  (current line or execution count). Backgrounds stay flat and quiet.
- **Calm, not cyberpunk.** No glitch, scanlines, neon text-shadow, or
  animated backgrounds.

## Color tokens

All colors are CSS custom properties on `:root` in `frontend/src/styles.css`.
Components never use raw hex values. The only exception is the Monaco theme in
`frontend/src/components/CodeFilm.tsx`, because Monaco cannot read CSS
variables. It copies the hex values below and must be kept in sync.

### Surfaces

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0B1620` | Page background (the dark room) |
| `--surface` | `#111F2B` | The film: editor, program output, error panel base |
| `--raised` | `#18293A` | Controls: buttons, selects, list cells, call-tree nodes |
| `--raised-hover` | `#20344A` | Hover state of `--raised` controls |
| `--border` | `#22384A` | Dividers between panels (decorative) |
| `--border-control` | `#56758A` | Outline of interactive controls (3:1 on bg and raised) |

### Text

| Token | Hex | Use |
|---|---|---|
| `--text` | `#DCE7EC` | Body text, code, values |
| `--text-muted` | `#8BA3B1` | Labels, hints, secondary info |
| `--text-faint` | `#6A8A9C` | Line numbers and tiny captions only |

### Accent and status

| Token | Value | Use |
|---|---|---|
| `--accent` | `#7FD3E6` | Exposure cyan: current line bar, focus ring, Run button, active stack frame, current call-tree node |
| `--accent-hover` | `#A6E3F0` | Hover on filled accent buttons |
| `--accent-soft` | `rgba(127, 211, 230, 0.16)` | Background of "just changed" variables |
| `--on-accent` | `#0B1620` | Text on a filled accent background |
| `--error` | `#FF8A80` | Error headings, raised exceptions in the call tree |
| `--error-soft` | `rgba(255, 138, 128, 0.14)` | Error panel background |
| `--error-line` | `rgba(255, 138, 128, 0.22)` | Editor line where an exception was raised |

### Heatmap

Five steps of a pale cyan-white (`#D6EEF3`) laid over `--surface`. It is a
different hue and has no gutter bar, so it never looks like the current line.

| Token | Alpha |
|---|---|
| `--heat-1` | 0.04 |
| `--heat-2` | 0.08 |
| `--heat-3` | 0.12 |
| `--heat-4` | 0.18 |
| `--heat-5` | 0.24 |

The top step is capped at 0.24 so every syntax color keeps 4.5:1 contrast on
the hottest line (measured below). The legend also states the busiest line in
words, so the heatmap never depends on color alone.

### Measured contrast (WCAG 2.x formula)

Computed with a small script (relative luminance, `(L1 + 0.05) / (L2 + 0.05)`).

| Pair | Ratio |
|---|---|
| `--text` on `--surface` | 13.30 |
| `--text-muted` on `--surface` | 6.35 |
| `--text-muted` on `--raised` | 5.63 |
| `--text-faint` on `--surface` | 4.57 |
| `--accent` on `--surface` | 9.85 |
| `--on-accent` on `--accent` (Run button) | 10.75 |
| `--error` on `--surface` | 7.33 |
| `--border-control` on `--bg` | 3.75 |
| `--border-control` on `--raised` | 3.04 |
| `--text` on `--raised-hover` | 10.10 |
| `--text` on `--accent-soft` (changed variable) | 9.20 |
| `--error` on `--error-soft` | 5.82 |
| `--text` on hottest heat line (`--heat-5`) | 6.55 |
| keyword `#8FCBE0` on `--heat-5` | 4.63 |
| number `#E6CB92` on `--heat-5` | 5.23 |
| `--text` on current line (strongest point, 0.30 cyan) | 6.38 |
| keyword on current line | 4.51 |
| comment `#7894A5` on `--surface` | 5.24 |

Monaco syntax colors: keyword `#8FCBE0`, string `#BCD9C5`, number `#E6CB92`,
comment `#7894A5` (italic), selection `#2B4A60` (`--text` on it: 7.41).

## Typography

| Token | Value | Use |
|---|---|---|
| `--font-ui` | Atkinson Hyperlegible Next, then system sans | All interface text |
| `--font-code` | JetBrains Mono, then system mono | Code, variable names and values, stack, output, call tree |

Atkinson Hyperlegible was designed for legibility (distinct `l / I / 1`,
`0 / O`), which matters for a learning tool. JetBrains Mono has the same
property for code. Both load from Google Fonts in `frontend/index.html`.

Type scale (1.2 ratio from 16px):

| Token | Size | Use |
|---|---|---|
| `--size-small` | 0.833rem | Legends, hints, cell indices |
| `--size-base` | 1rem | Body, panel headings |
| `--size-lead` | 1.2rem | Tagline, step narration |
| `--size-title` | 2.074rem | App title |

- Body line-height 1.5. Prose max width 60ch.
- Weights: 400 body, 600 emphasis and buttons, 700 headings.
- Numbers that change while stepping use `font-variant-numeric: tabular-nums`.

## Spacing, radius, elevation

- Spacing scale: `4, 8, 12, 16, 24, 32, 48` px (`--space-1` … `--space-7`).
  Use only these values.
- Radius: `--radius-sm` 4px (cells, chips), `--radius-md` 6px (buttons,
  inputs, panels), `--radius-lg` 10px (the film).
- Elevation: dark UIs show depth with **lighter surfaces and borders**, not
  drop shadows. The only glow is the film's backlight
  (`--film-glow`), a faint cyan halo that marks the editor as the main object.

## Motion

- `--duration-fast` 150ms, `--ease` `ease-out`, for color, border, and
  background transitions only. Never animate layout (width, height, top).
- Hover never moves or scales anything.
- `prefers-reduced-motion: reduce` turns transitions off.

## Components

| Component | Rule |
|---|---|
| Button (default) | `--raised` fill, `--border-control` outline, `--text`. Hover: `--raised-hover`. Disabled: 45% opacity, default cursor. |
| Button (primary / Run) | `--accent` fill, `--on-accent` text, weight 600. Hover: `--accent-hover`. At most one per region: Run in the header, Next in the step controls. |
| Select / input | Same as default button. Always has a visible `<label>`. |
| Checkbox / range | `accent-color: var(--accent)`. |
| Focus | Every interactive element: `outline: 2px solid var(--accent); outline-offset: 2px` via `:focus-visible`. |
| Film (editor) | `--surface` background, `--border` outline, `--radius-lg`, `--film-glow`. |
| Current line | Cyan gradient (0.30 → 0.04 alpha) plus a 4px `--accent` gutter bar. |
| Error line | `--error-line` background. |
| Panel | Separated by a 1px `--border` top rule, `--space-3` padding-top. |
| Changed variable | `--accent-soft` background. |
| Active stack frame | `--text`, weight 600, 3px `--accent` left border. Other frames `--text-muted`. |
| Program output | `--surface` with `--border` outline, monospace, `pre-wrap`. |
| Error panel | `--error-soft` background, 4px `--error` left border, heading in `--error`, `role="alert"`. |
| Call-tree node | `--raised` fill, `--border-control` stroke. Running: `--accent` stroke 1.5px. Current: `--accent` fill with `--on-accent` text. Raised: result text in `--error`. |
| Icons | SVG only (Lucide style, 1.5–2px stroke, 16 or 20px). No emoji as icons. Icon-only buttons need `aria-label`. |

## Accessibility checklist (every change)

- [ ] Text contrast ≥ 4.5:1; control outlines ≥ 3:1 (use the tokens above)
- [ ] Visible `:focus-visible` ring on every interactive element
- [ ] Color is never the only signal (heatmap has words, errors have text)
- [ ] All clickable elements have `cursor: pointer`
- [ ] Works at 375px, 768px, 1024px, 1440px with no horizontal page scroll
- [ ] `prefers-reduced-motion` respected

## Known limits

- A trailing comment on a very hot line or on the current line falls below
  4.5:1 (comment on `--heat-5` measures 2.58:1). Comment-only lines never run,
  so they are never heated or current. Only inline comments are affected.
- Monaco theme colors are duplicated in `CodeFilm.tsx` (see above).
