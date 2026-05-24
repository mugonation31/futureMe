# futureMe Design System

## Brand Principles

futureMe is built around a single idea: **make financial discipline feel peaceful**.

The visual language is **calm, hopeful, grown-up, and premium**. Every design decision should reinforce momentum and progress — not anxiety or guilt. Users are doing something hard (getting their finances in order) and the app should feel like a quiet, capable tool, not a dashboard that judges them.

The tone is progress-focused. There are no red warnings, no guilt-inducing alerts, no gamification badges. Just clear information, clean surfaces, and a consistent teal accent that signals something is going well.

---

## Colour Palette

All colour tokens are defined as CSS custom properties on `:root` in `frontend/src/styles.scss`.

### Core Tokens

| Token | Hex | Use |
|---|---|---|
| `--bg-app` | `#FAFAF7` | Page background — the warm white canvas all content sits on |
| `--bg-surface` | `#FFFFFF` | Cards, navigation bar, footer — elevated surfaces |
| `--text-primary` | `#1C1C1E` | All body text, headings, active nav links |
| `--text-muted` | `#6B6B6B` | Secondary text, labels, placeholders, inactive nav links |
| `--accent` | `#0F7168` | Brand colour — CTAs, links, active states, progress fills |
| `--accent-hover` | `#0A5C55` | Hover state on any accent-coloured element |
| `--border` | `rgba(0,0,0,0.07)` | All dividers, card borders when needed, input borders |

### Semantic Tokens

| Token | Resolves to | Use |
|---|---|---|
| `--positive` | `var(--accent)` | Positive values, growth indicators, favourable comparisons |
| `--caution` | `#B45309` | Warnings, overdue states, values that need attention |

### Usage guidance

**Use `--accent` for:**
- Primary buttons
- Links and interactive text
- Progress bar fills
- Active nav indicator (font-weight + `--text-primary`, not accent colour)

**Use `--caution` for:**
- Budget overruns
- Overdue reminders
- Any value that needs attention but is not catastrophic

**Never use red** for financial figures or status indicators. The app is progress-focused. A high debt balance is a fact to work through, not a crisis to flag in red.

```css
/* Correct */
.balance-warning { color: var(--caution); }   /* amber */

/* Wrong */
.balance-warning { color: #ef4444; }          /* red — do not use */
```

---

## Typography

Inter is loaded from Google Fonts with weights 400, 500, 600, and 700 (`display=swap`). The font stack falls back to system UI fonts.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Type Scale

| Role | Size | Weight | Notes |
|---|---|---|---|
| Display numbers (hero stats) | `2rem+` | 700 | Net worth, totals — always use `.tabular-nums` |
| Heading h1 | `1.5rem` | 700 | Page titles |
| Heading h2 | `1.25rem` | 600 | Section headings, card titles |
| Heading h3 | `1rem` | 600 | Sub-section labels |
| Body | `1rem` | 400 | Default paragraph text |
| Body emphasis | `1rem` | 500 | Inline emphasis, table row primary values |
| Muted / secondary | `0.875rem` | 400 | Supporting copy, timestamps, descriptions |
| Labels | `0.8125rem` | 500 | Form labels, column headers, metadata |
| Button text | `0.875rem` | 600 (primary) / 500 (ghost) | Consistent across all button variants |
| Nav links | `0.9rem` | 500 (inactive) / 600 (active) | |

### Financial figures

**Always** apply `.tabular-nums` (or the equivalent CSS) to any element displaying a monetary value, percentage, or count that may change. This prevents layout shifts when numbers update and keeps columns aligned.

```html
<!-- Correct -->
<span class="tabular-nums">{{ balance | currency }}</span>

<!-- Or in CSS -->
.stat-value {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

---

## Spacing Scale

All spacing is expressed through five tokens. Use these consistently — avoid magic numbers.

| Token | Value | Use |
|---|---|---|
| `--space-xs` | `4px` | Tight gaps within a component (icon-to-label, badge padding) |
| `--space-sm` | `8px` | Button padding (vertical), small gaps between related elements |
| `--space-md` | `16px` | Button padding (horizontal), standard internal padding, form field gaps |
| `--space-lg` | `24px` | Card padding, section gaps within a page |
| `--space-xl` | `40px` | Gaps between major sections, nav link spacing on desktop |

```css
/* Example — card internal layout */
.card {
  padding: var(--space-lg);        /* 24px all round */
  gap: var(--space-md);            /* 16px between rows */
}

/* Example — button */
.btn-primary {
  padding: var(--space-sm) var(--space-md);   /* 8px 16px */
}
```

---

## Cards

The `.card` utility class is defined globally in `styles.scss` and should be used for all surface-elevated content blocks.

```css
.card {
  background: var(--bg-surface);           /* #FFFFFF */
  border-radius: var(--radius-card);       /* 16px */
  box-shadow: var(--shadow-card);
  padding: var(--space-lg);                /* 24px */
}
```

### Shadow

```
--shadow-card: 0 1px 4px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.04);
```

This is a two-layer shadow: a tight ambient shadow for grounding and a softer diffuse shadow for depth. It reads cleanly on the `--bg-app` warm white background.

**Do not add a border to cards.** The shadow provides all the elevation signal needed. Adding a border on top of the shadow creates visual noise.

```css
/* Correct */
.my-card {
  /* inherits .card styles — no border needed */
}

/* Wrong */
.my-card {
  border: 1px solid var(--border);   /* shadow already does this job */
}
```

Cards sit on `--bg-app` (`#FAFAF7`). The contrast between the warm white background and the pure white card surface is intentional and sufficient.

---

## Buttons

Two button variants are defined globally. Both share the same border-radius (`--radius-btn: 8px`), font family, font size, and padding.

### `.btn-primary`

The default action button. Filled teal background, white text.

```css
.btn-primary {
  background: var(--accent);        /* #0F7168 */
  color: #fff;
  border: none;
  border-radius: var(--radius-btn); /* 8px */
  padding: var(--space-sm) var(--space-md);
  font-size: 0.875rem;
  font-weight: 600;
  transition: background 0.15s;
}

.btn-primary:hover {
  background: var(--accent-hover);  /* #0A5C55 */
}
```

### `.btn-ghost`

Secondary actions, cancel, logout. Transparent background with a subtle border.

```css
.btn-ghost {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-btn);
  padding: var(--space-sm) var(--space-md);
  font-size: 0.875rem;
  font-weight: 500;
  transition: border-color 0.15s;
}

.btn-ghost:hover {
  border-color: var(--accent);
  color: var(--accent);
}
```

### Rules

- **Never use a red button.** If a destructive action is needed, use `.btn-ghost` with a confirmation step.
- Use `.btn-primary` for the single primary action on a page or card.
- Use `.btn-ghost` for secondary actions, navigation triggers, and cancellation.
- Do not invent additional button variants without updating this document and `styles.scss`.

---

## Navigation

The navigation bar is implemented in `frontend/src/app/shared/navigation/`. It renders only when a user is authenticated (`*ngIf="currentUser"`).

### Layout

The nav uses a three-column layout on desktop:

| Column | Content | Alignment |
|---|---|---|
| Left | Brand name ("futureMe") | `flex-start` |
| Centre | Nav links | Flex with `gap: var(--space-lg)` |
| Right | Greeting + Log out button | `flex-end` |

On mobile (≤768px) the centre and right columns collapse behind a hamburger button. Tapping it reveals a vertically stacked menu with links on top and the greeting / logout at the bottom, separated by a `--border` divider.

### Dimensions

- Height: **60px**
- Max content width: **1100px** (centred, matching `.app-content`)
- Background: `var(--bg-surface)` (`#FFFFFF`)
- Bottom border: `1px solid var(--border)`
- Position: `sticky`, `top: 0`, `z-index: 100`

### Link states

| State | Font weight | Colour |
|---|---|---|
| Inactive | 500 | `var(--text-muted)` |
| Hover | 500 | `var(--text-primary)` |
| Active (current route) | 600 | `var(--text-primary)` |

Active state is applied via Angular's `routerLinkActive="active"` directive. There is no underline or accent-coloured indicator — the weight change is sufficient.

---

## Tone for Numbers

How numbers are coloured is a deliberate editorial choice.

**Positive / growing values** — use `--positive` (which resolves to `var(--accent)`, teal `#0F7168`). This includes: net worth increase, savings progress, debt reduction.

**Values that need attention** — use `--caution` (amber `#B45309`). This includes: budget overruns, upcoming due dates, balances below a threshold.

**Neutral values** — use `--text-primary` or `--text-muted` depending on hierarchy. Most figures should be neutral by default.

**Red is never used for financial data.** A debt balance, a missed target, a negative month — these are all things users are working through. Colouring them red frames the user as failing. The app does not do that.

```html
<!-- Growing net worth -->
<span class="text-positive tabular-nums">+£1,240</span>

<!-- Budget overspend -->
<span class="text-caution tabular-nums">£340 over</span>

<!-- Neutral balance -->
<span class="tabular-nums">£12,500</span>
```

---

## What Not To Do

A short list of things that are explicitly out of scope for futureMe's visual language.

- **No neon colours.** The palette is muted and purposeful. Do not introduce bright greens, electric blues, or fluorescent anything.
- **No red for financial figures.** See the section above.
- **No busy gradients.** Backgrounds and surfaces are flat. Gradients on interactive elements (buttons, charts) should be used only when the design rationale is clear and documented.
- **No dark mode in v1.** The design is built for a single light theme. Do not add `prefers-color-scheme` overrides until a dark palette has been designed and approved.
- **No gamification.** No points, streaks, achievement badges, or confetti. These mechanisms cheapen a premium tool and can feel patronising to adults managing real financial stress.
- **No clutter.** Every element on a surface should be there because it earns its place. Default to removing things rather than adding them.
- **No magic numbers.** Use the spacing scale and colour tokens. If you find yourself writing `margin: 12px` or `color: #333`, stop and find the right token.
