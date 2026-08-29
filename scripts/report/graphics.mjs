/**
 * The enumerated graphics list item `G2` requires, committed beside the audit.
 *
 *   "Measured contrast meets 4.5:1 for body text and 3:1 for large text,
 *    interactive component boundaries and every graphical object required to
 *    understand the play surface, in both themes and on every table felt. The
 *    enumerated graphics list is committed alongside the audit script and
 *    includes the card margin, the chip edge ring, the felt rail and the hand
 *    value pill, each measured against rendered pixels rather than against its
 *    token."
 *
 * **A list rather than a scan, and that is the point of the clause.** An audit
 * that walked the page and measured whatever it found would grade what it
 * happened to see: the four objects the criterion names are drawn on a canvas,
 * where nothing announces itself, and a canvas scanner that missed the chip's
 * edge ring would report a clean sweep. So the objects are enumerated here, the
 * audit fails if any entry produces no sample, and adding a graphic to the play
 * surface without adding it here is a review question rather than a silent gap.
 *
 * **Every entry says what it is measured against, and the answer is pixels.**
 * The felt is a gradient with grain over it, so the token `--felt-bronze` is not
 * the colour behind anything: `#14503A` never appears on the table. Each canvas
 * entry therefore names an ink, which does render as a flat fill and so appears
 * exactly, and takes its ground from the **worst** pixel adjacent to that ink in
 * the rendered image. The worst rather than the average, because a contrast
 * requirement is about the hardest place to read the boundary.
 *
 * ## The thresholds, and why each entry has the one it has
 *
 * WCAG 2.2 gives text 4.5:1, large text 3:1, and non-text contrast, which covers
 * "user interface components and graphical objects", 3:1. QUALITY-BAR section 4
 * repeats those and the criterion above states them. Where a mark is a glyph
 * rather than a shape, it is graded as text: the card's corner index is a
 * character at 8.0 px bold at the fan floor, which is not large text by any
 * reading, so it takes 4.5:1.
 */

/** WCAG's two numbers, so no entry can carry a threshold nobody wrote down. */
export const TEXT_RATIO = 4.5;
export const NON_TEXT_RATIO = 3;

/**
 * The play-surface graphics, in the order the audit measures them.
 *
 * `ink` names the token whose rendered pixels are the object; `ground` says what
 * the object is measured against. `felt` means the worst adjacent pixel that is
 * not one of this game's own flat fills, which is the table under the object,
 * gradient, grain and all.
 */
export const CANVAS_GRAPHICS = [
  {
    id: 'card-margin',
    what: 'the card margin against the table it sits on',
    ink: 'cardMargin',
    ground: 'felt',
    ratio: NON_TEXT_RATIO,
    why: 'No felt clears 3:1 against the page, so the card boundary is what separates a card from the table. SPEC 16 calls it load-bearing rather than trim.',
  },
  {
    id: 'chip-edge-ring-on-felt',
    what: 'the chip edge ring against the table',
    ink: 'chipRing',
    ground: 'felt',
    ratio: NON_TEXT_RATIO,
    why: 'No chip fill reaches 3:1 against a felt, so the ring is what separates a chip from the table and from the chip beneath it.',
  },
  {
    id: 'chip-edge-ring-on-fill',
    what: 'the chip edge ring against its own chip fill',
    ink: 'chipRing',
    ground: 'chipFill',
    ratio: NON_TEXT_RATIO,
    why: 'The same ring, the other side of it. A ring that vanished into its own chip would leave the stack one extruded cylinder.',
  },
  {
    id: 'table-edge-on-page',
    what: 'the table against the page behind it, by whichever of the rail and the felt carries it',
    ink: 'rail',
    ground: 'page',
    ratio: NON_TEXT_RATIO,
    carriers: ['rail', 'felt'],
    why: 'SPEC 16 states which side carries this boundary in which theme: "Against the light ground the felts clear 3:1 unaided at 8.54, 10.22 and 13.39:1, and the rail is decorative there." So the requirement is that the table is separable from the page, and the row reports both readings and takes the carrier. On the dark ground the rail carries it at 8.02:1 and the felts are 1.97, 1.65 and 1.26:1 by design.',
  },
  {
    id: 'felt-rail-on-felt',
    what: 'the felt rail against the table it rings',
    ink: 'rail',
    ground: 'felt',
    ratio: NON_TEXT_RATIO,
    why: 'The other side of the same boundary, and the side the grain and the vignette are on.',
  },
  {
    id: 'card-back-on-margin',
    what: 'the face-down card back against its own margin',
    ink: 'cardBack',
    ground: 'cardMargin',
    ratio: NON_TEXT_RATIO,
    why: 'SPEC 4.3 makes the hole card the one concealed object in the game, and its back has to read as a back.',
  },
  {
    id: 'rank-black-on-face',
    what: 'a black rank index on the card face',
    ink: 'rankBlack',
    ground: 'cardFace',
    ratio: TEXT_RATIO,
    why: 'A character, graded as text. At the fan floor it renders at 8.0 px bold.',
  },
  {
    id: 'rank-red-on-face',
    what: 'a red rank index on the card face',
    ink: 'rankRed',
    ground: 'cardFace',
    ratio: TEXT_RATIO,
    why: 'The same character in the other ink, which is the one the palette had to work hardest for.',
  },
  {
    id: 'felt-print-on-felt',
    what: 'the printed house rules on the table',
    ink: 'print',
    ground: 'felt',
    ratio: TEXT_RATIO,
    why: 'Text on the canvas. SPEC 16 calls the print a decorative repeat of DOM text, and it is still text.',
  },
  {
    id: 'chip-glyph-on-fill',
    what: 'the value glyph on the top chip',
    ink: 'chipGlyph',
    ground: 'chipFill',
    ratio: TEXT_RATIO,
    why: 'A digit, graded as text, and the carrier of a chip identity that colour alone must never carry.',
  },
];

/**
 * The chrome graphics, measured in both themes on the rendered page.
 *
 * `where` is a CSS selector the audit resolves, and `kind` says how the pair is
 * taken: `text` reads the box's own foreground against its own background,
 * `boundary` reads the control's edge against the page beside it, and `ring`
 * takes the difference a focus makes.
 *
 * `crossing` says where a `boundary` row cuts the control. `edge` crosses its top
 * border and stops before its label, which is what a button's boundary is;
 * `body` crosses the whole control from above to below, which is what a slider
 * needs, because its track is drawn as a thin bar through the middle of a box
 * whose top edge is empty.
 *
 * `overlay` says the graphic only exists while the settings panel is open. It
 * matters for more than presence: `BJ-17` traps `Tab` inside an open overlay, so
 * a focus ring measured on a control outside one can never be reached by
 * keyboard, and the ring is the one graphic that only appears for a keyboard.
 */
export const CHROME_GRAPHICS = [
  {
    id: 'body-text',
    what: 'a continuous readout value, which is the smallest body text on the page',
    where: '[data-readout="chips"] .bj-readout__value',
    kind: 'text',
    ratio: TEXT_RATIO,
    why: 'SPEC 11 keeps this on screen at every phase, and it is the number a player reads most.',
  },
  {
    id: 'hand-value-pill',
    what: 'the hand value readout the criterion names',
    where: '[data-readout="hand-value"] .bj-readout__value',
    kind: 'text',
    ratio: TEXT_RATIO,
    why: 'Named in the criterion. It is the one readout whose value changes inside a round, and it is what a player checks before every decision.',
  },
  {
    id: 'large-text',
    what: 'an overlay heading, which is the largest text the chrome renders',
    where: '.bj-panel__heading',
    kind: 'text',
    overlay: true,
    ratio: NON_TEXT_RATIO,
    why: 'Large text takes the 3:1 threshold. Measuring it separately is what stops a heading colour from being excused by the body-text row above.',
  },
  {
    id: 'control-boundary',
    what: 'a button boundary against the page behind it',
    where: '[data-open-overlay="settings"]',
    kind: 'boundary',
    crossing: 'edge',
    ratio: NON_TEXT_RATIO,
    why: 'An interactive component boundary, in the criterion\'s own words. A control whose edge disappears is a control nobody can see the extent of.',
  },
  {
    id: 'focus-ring',
    what: 'the focus indicator, measured as the pixels focusing changes',
    where: '[data-open-overlay="settings"]',
    kind: 'ring',
    ratio: NON_TEXT_RATIO,
    why: 'QUALITY-BAR section 3 requires an indicator that is never removed. `BJ-17` measured it at 6.17:1 in the light theme; the dark twin was a carry-forward this part owns.',
  },
  {
    id: 'range-track',
    what: 'the volume slider track against the panel behind it',
    where: '[data-control="volume"]',
    kind: 'boundary',
    crossing: 'body',
    overlay: true,
    ratio: NON_TEXT_RATIO,
    why: '`color-scheme` is never declared, which the `BJ-20` report parked: the platform draws this control light in both themes, so the dark theme is where a light track on a dark panel has to be measured rather than assumed.',
  },
];
