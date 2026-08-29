# Blackjack design contract

This compact fixture is the independent source used to verify the committed design-token implementations.

## 5. Responsive and adaptive layout

The four breakpoints, resolved by width first. Orientation distinguishes only the two cases below the
medium floor, so a viewport at or above the wide floor in portrait, which a 1024 x 1366 tablet
produces in its natural orientation, resolves to `wide`.

| Name | Range |
|---|---|
| `wide` | width >= 1024 px |
| `medium` | width 768 to 1023 px |
| `compact` | width < 768 px, landscape |
| `portrait` | width < 768 px, portrait |

The thresholds those ranges are written on, and the two the same section fixes elsewhere.

| Threshold | Value |
|---|---|
| `wide-min-width` | 1024px |
| `medium-min-width` | 768px |
| `sticky-bars-min-height` | 400px |
| `small-viewport-width` | 320px |
| `small-viewport-height` | 256px |
| `surface-min-height` | 192px |

`surface-min-height` is the height the play-surface row keeps when the shell has no space to divide,
per DESIGN section 4. It is three of the largest spacing step rather than a number of its own, and
`src/ui/tokens.css` declares it that way; it is pinned here because the layout has to know it in both
places, as a CSS length and as a number the sticky-bar decision is made against.

The play-surface size setting, per section 4. Percentages of the logical-to-CSS scale the layout would
otherwise choose.

| Setting | Values |
|---|---|
| `play-surface-size` | 100 / 125 / 150 / 200 |

The card-legibility fan floor, per DESIGN section 4 and item `E8`'s appended clause. Card width is in
CSS pixels; the pitch fractions are of the card width the pitch separates.

| Threshold | Value |
|---|---|
| `card-width-floor` | 60 |
| `fan-pitch-natural` | 0.42 |
| `fan-pitch-floor` | 0.26 |
| `ten-index-px-at-floor` | 8.0 |

`fan-pitch-floor` is the corner-index column of the card beneath, which is twice `indexX`, the
column's centre. At the width floor the ten's corner index, the smallest glyph on any card, renders
at 8.0 px bold: `indexFont` 0.17 times `indexTenScale` 0.78 times 60.

## 6. Measured thresholds

Every number the `BJ-22` measurement reports grade against, with the section or item that owns it.
The reports are `scripts/report/*.mjs` and `tests/unit/report-gates.test.ts` pins each constant here,
exactly as `tests/unit/tokens.test.ts` pins every colour: a threshold quietly loosened in a script is
then a red suite rather than a gate that stopped gating.

| Threshold | Value | Owner |
|---|---|---|
| `javascript-gzip-kb` | 40 | QUALITY-BAR 6 |
| `total-transfer-gzip-kb` | 60 | QUALITY-BAR 6 |
| `lcp-ms` | 1500 | QUALITY-BAR 6 |
| `total-blocking-time-ms` | 150 | QUALITY-BAR 6 |
| `app-work-p95-ms` | 8 | QUALITY-BAR 6 |
| `slow-frame-share-percent` | 1 | QUALITY-BAR 6 |
| `slow-frame-factor` | 1.5 | QUALITY-BAR 6 |
| `retained-growth-mb` | 2 | QUALITY-BAR 6 |
| `frame-p95-ms` | 16.7 | item `H1` |
| `frame-p99-ms` | 33 | item `H1` |
| `long-task-ms` | 50 | item `H4` |
| `touch-target-px` | 44 | QUALITY-BAR 3 |
| `touch-clearance-px` | 8 | QUALITY-BAR 3 |
| `text-contrast-ratio` | 4.5 | QUALITY-BAR 4 |
| `non-text-contrast-ratio` | 3 | QUALITY-BAR 4 |
| `cpu-throttle` | 4 | QUALITY-BAR 2 |
| `memory-checkpoint-minutes` | 15 | item `H5` |

The Lighthouse mobile preset item `H3` names, which the report asserts out of the result rather than
setting, so a tool whose defaults moved fails on the mismatch instead of grading something else.

| Setting | Value |
|---|---|
| `lighthouse-rtt-ms` | 150 |
| `lighthouse-throughput-kbps` | 1638.4 |
| `lighthouse-cpu-slowdown` | 4 |

## 15. Design tokens

| Token | Value |
|---|---|
| `--type-xs` | 0.694rem |
| `--type-sm` | 0.833rem |
| `--type-base` | 1rem |
| `--type-md` | 1.2rem |
| `--type-lg` | 1.44rem |
| `--type-xl` | 1.728rem |
| `--type-2xl` | 2.074rem |
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |
| `--space-8` | 64px |
| `--radius-sm` | 4px |
| `--radius-md` | 8px |
| `--radius-lg` | 14px |
| `--radius-pill` | 999px |
| `--border-hair` | 1px |
| `--border-thin` | 2px |
| `--border-thick` | 3px |
| `--focus-ring` | 2px solid, 2px offset |
| `--dur-0` | 0ms |
| `--dur-1` | 80ms |
| `--dur-2` | 140ms |
| `--dur-3` | 220ms |
| `--dur-4` | 320ms |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |

## 16. Visual direction

### Chrome palette

| Token | Dark | Ratio on ground | Light | Ratio on ground |
|---|---|---|---|---|
| `--bj-ground` | `#0E1512` | - | `#F2F5F1` | - |
| `--bj-elevated` | `#18231D` | - | `#FFFFFF` | - |
| `--bj-text` | `#E8EFEA` | **15.83:1** | `#1A231E` | **14.66:1** |
| `--bj-text-muted` | `#A9BBB1` | **9.19:1** | `#4C5F55` | **6.21:1** |
| `--bj-accent` | `#E8B33C` | **9.65:1** | `#7A5406` | **6.17:1** |
| `--bj-positive` | `#4FD3A0` | **9.83:1** | `#0E6B45` | **5.96:1** |
| `--bj-negative` | `#FF6B70` | **6.69:1** | `#A3232A` | **6.75:1** |

### Play surface palette

| Token | Value |
|---|---|
| `--felt-bronze` | `#14503A` |
| `--felt-silver` | `#133F55` |
| `--felt-gold` | `#4A1526` |
| `--felt-rail` | `#C2A86A` |
| `--card-margin` | `#F6F3EC` |
| `--card-face` | `#F6F3EC` |
| `--card-back` | `#7A2230` |
| `--rank-black` | `#1A1A1A` |
| `--rank-red` | `#B3121B` |
| `--felt-print` | `#F3F7F4` |
| `--chip-ring` | `#F0EDE4` |

| Chip | Fill | Ring against fill | White glyph on fill |
|---|---|---|---|
| 10 | `#2E6DA4` | **4.67:1** | **5.47:1** |
| 50 | `#1F7A49` | **4.56:1** | **5.33:1** |
| 100 | `#23272B` | **12.85:1** | **15.04:1** |
| 500 | `#6B4FA8` | **5.42:1** | **6.35:1** |

### High-contrast play surface (forced colors)

The set the renderer selects under `forced-colors: active`. The felt flattens: the gradient and the
grain are suppressed, so the audit measures a flat fill. Chip fills keep their base identity values;
the ring and the glyph are white.

| Token | Forced-colors value | What carries its contrast |
|---|---|---|
| `--felt-bronze` | `#0B2C1F` | rail, see below |
| `--felt-silver` | `#0B2434` | rail |
| `--felt-gold` | `#2A0C16` | rail |
| `--felt-rail` | `#FFD34D` | **12.93:1** on the dark ground, **10.53:1** on the darkest felt |
| `--card-margin` | `#FFFFFF` | **15.06 / 15.96 / 18.06:1** on bronze / silver / gold |
| `--card-face` | `#FFFFFF` | as above |
| `--card-back` | `#4A0A12` | **15.63:1** against its own card margin |
| `--rank-black` | `#000000` | **21.00:1** on the card face |
| `--rank-red` | `#8F0009` | **9.67:1** on the card face |
| `--felt-print` | `#FFFFFF` | **15.06:1** on bronze, the darkest felt |
| `--chip-ring` | `#FFFFFF` | **15.06 / 15.96 / 18.06:1** on the three felts |

The three felts stay below 3:1 against the dark ground on purpose, at **1.23 / 1.16 / 1.02:1**; the
rail, the margin and the ring are the carriers. White ring and white glyph against the unchanged
chip fills measure **5.47 / 5.33 / 15.04 / 6.35:1** for 10 / 50 / 100 / 500.
