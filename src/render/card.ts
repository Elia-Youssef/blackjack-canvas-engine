/**
 * Card faces and backs, drawn as primitives. Item E3, method D: the capture at
 * the demonstration session closes it; this module is the behaviour it
 * captures, and `tests/unit/render-card.test.ts` is the automated armour under
 * it.
 *
 * E3's criterion is the drawing: "Cards carry rank and suit indices in both
 * opposing corners and a correct centre pip layout for number cards" (SPEC 16).
 * The corner index is a rank above a small suit pip, and the second corner is
 * the first rotated a half turn about the card's centre, which is what a
 * printed card does. The centre pip layouts are the classic ones, committed as
 * data in `PIP_LAYOUTS` below so a test can hold their structure: pip count
 * equals the rank's pip value, the lower half mirrors the upper with its pips
 * inverted, every layout is symmetric under a half turn except the 7, whose
 * odd pip sits in the upper half only.
 *
 * **Colour resolves through `tokens.ts` and nowhere else** (item E1): the face
 * and margin, the back, and the two index inks are the SPEC 16 palette. The
 * margin is load-bearing, not trim: no felt clears 3:1 against the dark ground
 * and the card's light boundary is what separates it from all three felts, so
 * nothing here may thin or drop it.
 *
 * **Geometry is proportion, not pixels.** A card is drawn at any width the
 * caller chooses, so every internal measurement is a fraction of that width in
 * `CARD_GEOMETRY`, the way a print die scales with the card. These fractions
 * are shape data in the same sense as the pip outlines, not design tokens: the
 * token scales of QUALITY-BAR 15 own chrome sizes, and the play surface's
 * internal proportions have no home there. The one absolute length here is the
 * hairline on the back's inner frame, which is `BORDER.hair`.
 *
 * A face-down card draws the margin and the back and nothing else: no rank, no
 * suit, nothing derived from either, however the spec was populated. That is
 * SPEC 4.3's concealment reaching the renderer, and the armour asserts the
 * absence.
 */

import type { Rank, Suit } from '../core/cards';

import { BORDER, type Hex, type SurfaceTokens } from './tokens';
import { font, roundedRectPath, SANS_FAMILY } from './surface';

/** One card to draw, in logical units. Height follows from `CARD_ASPECT`. */
export interface CardSpec {
  readonly rank: Rank;
  readonly suit: Suit;
  /** False draws the back and conceals everything else in this record. */
  readonly faceUp: boolean;
  /** Top-left corner. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/**
 * Height over width of a poker-size playing card, 3.5 over 2.5 inches. A
 * physical constant of the object being drawn, not a tunable.
 */
export const CARD_ASPECT = 3.5 / 2.5;

/** The height a spec's width implies. */
export function cardHeight(width: number): number {
  return width * CARD_ASPECT;
}

/**
 * Every internal proportion, as a fraction of card width, with exactly two
 * exceptions named `...Y`: `fieldY` and `frameInsetY` are fractions of card
 * height, because the regions they place stretch with the card. The corner
 * block's two `...Drop` distances run down from the top edge but are width
 * fractions on purpose, so the whole index scales as one unit with its glyph
 * and pip sizes. (`fieldHeightY` is the field's height, also a height
 * fraction.) See the header on why these are shape data rather than tokens.
 */
export const CARD_GEOMETRY = Object.freeze({
  /** Corner radius of the card outline. */
  cornerRadius: 0.055,
  /** The light margin between the card edge and the back's dark fill. */
  margin: 0.07,
  /** Centre of the corner index column, from the near vertical edge. */
  indexX: 0.13,
  /** Centre of the corner rank glyph, down from the top edge. A width
   *  fraction, like everything else in the corner block. */
  indexRankDrop: 0.115,
  /** Centre of the corner suit pip, down from the top edge. Width fraction. */
  indexPipDrop: 0.27,
  /** Corner rank glyph size. */
  indexFont: 0.17,
  /** The 10 is two glyphs wide and takes a narrower face. */
  indexTenScale: 0.78,
  /** Corner suit pip size. */
  indexPip: 0.1,
  /** The pip field: the region the centre layouts map into. */
  fieldX: 0.24,
  fieldY: 0.14,
  fieldWidth: 0.52,
  fieldHeightY: 0.72,
  /** Centre pip size on number cards. */
  pip: 0.17,
  /** The Ace's single centre pip. */
  acePip: 0.36,
  /** Court cards: inner frame inset, centre glyph and its two frame pips. */
  frameInsetX: 0.2,
  frameInsetY: 0.14,
  courtFont: 0.34,
  courtPip: 0.13,
  /** Inset of the back's pinstripe frame, inside the back fill. */
  backFrameInset: 0.14,
} as const);

/** A pip position inside the unit pip field. */
export interface PipPosition {
  /** 0 is the field's left edge, 1 its right. */
  readonly x: number;
  /** 0 is the field's top edge, 1 its bottom. */
  readonly y: number;
}

/** The ranks that carry a centre pip layout. Court cards carry a frame. */
export type PipRank = Exclude<Rank, 'J' | 'Q' | 'K'>;

const L = 0.18;
const C = 0.5;
const R = 0.82;
const T = 0.13;
const M = 0.5;
const B = 0.87;
/** Upper and lower middles, used by the 7 and the 8. */
const UM = 0.315;
const LM = 0.685;
/** The four-row grid of the 9 and the 10. */
const R1 = 0.13;
const R2 = 0.38;
const R3 = 0.62;
const R4 = 0.87;
/** The 10's two centre pips, between the grid rows. */
const TC1 = 0.255;
const TC2 = 0.745;

const at = (x: number, y: number): PipPosition => Object.freeze({ x, y });

/**
 * The classic layouts, one per pip rank. The 7's odd pip is upper-half only,
 * which is the one deliberate asymmetry in the set; every other layout maps to
 * itself under a half turn. `tests/unit/render-card.test.ts` asserts both
 * halves of that sentence, plus count, uniqueness and bounds, against
 * `core/cards.ts`'s pip values rather than against this table's own length.
 */
export const PIP_LAYOUTS: Readonly<Record<PipRank, readonly PipPosition[]>> = Object.freeze({
  A: Object.freeze([at(C, M)]),
  '2': Object.freeze([at(C, T), at(C, B)]),
  '3': Object.freeze([at(C, T), at(C, M), at(C, B)]),
  '4': Object.freeze([at(L, T), at(R, T), at(L, B), at(R, B)]),
  '5': Object.freeze([at(L, T), at(R, T), at(C, M), at(L, B), at(R, B)]),
  '6': Object.freeze([at(L, T), at(R, T), at(L, M), at(R, M), at(L, B), at(R, B)]),
  '7': Object.freeze([at(L, T), at(R, T), at(C, UM), at(L, M), at(R, M), at(L, B), at(R, B)]),
  '8': Object.freeze([
    at(L, T), at(R, T), at(C, UM), at(L, M), at(R, M), at(C, LM), at(L, B), at(R, B),
  ]),
  '9': Object.freeze([
    at(L, R1), at(R, R1), at(L, R2), at(R, R2), at(C, M), at(L, R3), at(R, R3), at(L, R4), at(R, R4),
  ]),
  '10': Object.freeze([
    at(L, R1), at(R, R1), at(C, TC1), at(L, R2), at(R, R2), at(L, R3), at(R, R3), at(C, TC2),
    at(L, R4), at(R, R4),
  ]),
});

/** True when a pip in the lower half is printed inverted, as on a real card. */
export function pipInverted(position: PipPosition): boolean {
  return position.y > 0.5;
}

/**
 * The ink a suit prints in. Identity is carried by the pip's shape as well
 * (QUALITY-BAR 4: colour is never the only carrier), so the two inks only have
 * to separate from the face, which SPEC 16 measures at 15.71:1 and 6.28:1.
 */
export function suitColour(suit: Suit, tokens: SurfaceTokens): Hex {
  return suit === 'hearts' || suit === 'diamonds' ? tokens.rankRed : tokens.rankBlack;
}

/**
 * The heart outline, point at the bottom, centred on the origin, `size` tall.
 * Path proportions are the pip's outline, the same class of data as a glyph in
 * a font. The spade reuses it under a half turn.
 */
function heartPath(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-1.05 * s, 0.15 * s, -0.6 * s, -0.9 * s, 0, -0.35 * s);
  ctx.bezierCurveTo(0.6 * s, -0.9 * s, 1.05 * s, 0.15 * s, 0, s * 0.9);
  ctx.closePath();
}

/** The stem the two dark suits stand on, pointing down from the body. */
function stemPath(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(0, 0.1 * s);
  ctx.lineTo(0.36 * s, 0.95 * s);
  ctx.lineTo(-0.36 * s, 0.95 * s);
  ctx.closePath();
}

/** The three lobes of a club, centred on the origin. The stem is separate. */
function clubPath(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 2;
  const r = 0.34 * s;
  ctx.beginPath();
  ctx.moveTo(r, -0.5 * s);
  ctx.arc(0, -0.5 * s, r, 0, 2 * Math.PI);
  ctx.moveTo(-0.42 * s + r, 0.1 * s);
  ctx.arc(-0.42 * s, 0.1 * s, r, 0, 2 * Math.PI);
  ctx.moveTo(0.42 * s + r, 0.1 * s);
  ctx.arc(0.42 * s, 0.1 * s, r, 0, 2 * Math.PI);
}

/** The diamond, centred on the origin. */
function diamondPath(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(0.72 * s, 0);
  ctx.lineTo(0, s);
  ctx.lineTo(-0.72 * s, 0);
  ctx.closePath();
}

/**
 * Draw one pip. An inverted pip is the whole figure rotated a half turn about
 * its own centre, which is how the lower half of a printed card reads. The
 * spade's body is the heart under its own half turn while its stem stays on
 * the bottom, so the two rotations are deliberately separate.
 */
function drawPip(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  cx: number,
  cy: number,
  size: number,
  inverted: boolean,
  tokens: SurfaceTokens,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (inverted) {
    ctx.rotate(Math.PI);
  }
  ctx.fillStyle = suitColour(suit, tokens);

  if (suit === 'hearts') {
    heartPath(ctx, size);
    ctx.fill();
  } else if (suit === 'diamonds') {
    diamondPath(ctx, size);
    ctx.fill();
  } else if (suit === 'clubs') {
    clubPath(ctx, size);
    ctx.fill();
    stemPath(ctx, size);
    ctx.fill();
  } else {
    ctx.save();
    ctx.rotate(Math.PI);
    heartPath(ctx, size);
    ctx.fill();
    ctx.restore();
    stemPath(ctx, size);
    ctx.fill();
  }

  ctx.restore();
}

/** Runs `draw` under a half-turn about the card centre: the far corner. */
function rotatedAboutCentre(
  ctx: CanvasRenderingContext2D,
  spec: CardSpec,
  draw: () => void,
): void {
  const height = cardHeight(spec.width);
  ctx.save();
  ctx.translate(spec.x + spec.width / 2, spec.y + height / 2);
  ctx.rotate(Math.PI);
  ctx.translate(-(spec.x + spec.width / 2), -(spec.y + height / 2));
  draw();
  ctx.restore();
}

function drawCornerPip(
  ctx: CanvasRenderingContext2D,
  spec: CardSpec,
  tokens: SurfaceTokens,
): void {
  const g = CARD_GEOMETRY;
  drawPip(
    ctx,
    spec.suit,
    spec.x + g.indexX * spec.width,
    spec.y + g.indexPipDrop * spec.width,
    g.indexPip * spec.width,
    false,
    tokens,
  );
}

function drawFacePips(
  ctx: CanvasRenderingContext2D,
  spec: CardSpec,
  rank: PipRank,
  tokens: SurfaceTokens,
): void {
  const g = CARD_GEOMETRY;
  const height = cardHeight(spec.width);
  const layout = PIP_LAYOUTS[rank];
  const fieldX = spec.x + g.fieldX * spec.width;
  const fieldY = spec.y + g.fieldY * height;
  const fieldW = g.fieldWidth * spec.width;
  const fieldH = g.fieldHeightY * height;
  const size = (rank === 'A' ? g.acePip : g.pip) * spec.width;
  for (const position of layout) {
    drawPip(
      ctx,
      spec.suit,
      fieldX + position.x * fieldW,
      fieldY + position.y * fieldH,
      size,
      pipInverted(position),
      tokens,
    );
  }
}

function drawCourtFrame(
  ctx: CanvasRenderingContext2D,
  spec: CardSpec,
  tokens: SurfaceTokens,
): void {
  const g = CARD_GEOMETRY;
  const height = cardHeight(spec.width);
  const x = spec.x + g.frameInsetX * spec.width;
  const y = spec.y + g.frameInsetY * height;
  const w = spec.width - 2 * g.frameInsetX * spec.width;
  const h = height - 2 * g.frameInsetY * height;

  ctx.strokeStyle = suitColour(spec.suit, tokens);
  ctx.lineWidth = BORDER.hair;
  ctx.strokeRect(x, y, w, h);

  // The mirrored halves of a portrait, reduced to their suit marks: one pip
  // upright in the frame's upper left, one inverted in its lower right.
  const inset = g.courtPip * spec.width;
  drawPip(ctx, spec.suit, x + inset, y + inset, g.courtPip * spec.width, false, tokens);
  drawPip(ctx, spec.suit, x + w - inset, y + h - inset, g.courtPip * spec.width, true, tokens);
}

function isPipRank(rank: Rank): rank is PipRank {
  return rank !== 'J' && rank !== 'Q' && rank !== 'K';
}

/**
 * The card's shapes: base, back or face content, both corner suit pips. Runs
 * in the shape pass; the rank glyphs are `drawCardText`'s, in the text pass.
 */
export function drawCardShapes(
  ctx: CanvasRenderingContext2D,
  spec: CardSpec,
  tokens: SurfaceTokens,
): void {
  const g = CARD_GEOMETRY;
  const height = cardHeight(spec.width);

  // The base is the margin token edge to edge; the face is the same hex by
  // SPEC 16, so the light boundary against the felt is the whole outline.
  ctx.fillStyle = tokens.cardMargin;
  roundedRectPath(ctx, spec.x, spec.y, spec.width, height, g.cornerRadius * spec.width);
  ctx.fill();

  if (!spec.faceUp) {
    const m = g.margin * spec.width;
    ctx.fillStyle = tokens.cardBack;
    roundedRectPath(
      ctx,
      spec.x + m,
      spec.y + m,
      spec.width - 2 * m,
      height - 2 * m,
      g.cornerRadius * spec.width,
    );
    ctx.fill();

    // A pinstripe frame in the margin ink, the back's one ornament.
    const f = g.backFrameInset * spec.width;
    ctx.strokeStyle = tokens.cardMargin;
    ctx.lineWidth = BORDER.hair;
    ctx.strokeRect(spec.x + f, spec.y + f, spec.width - 2 * f, height - 2 * f);
    return;
  }

  drawCornerPip(ctx, spec, tokens);
  rotatedAboutCentre(ctx, spec, () => {
    drawCornerPip(ctx, spec, tokens);
  });

  if (isPipRank(spec.rank)) {
    drawFacePips(ctx, spec, spec.rank, tokens);
  } else {
    drawCourtFrame(ctx, spec, tokens);
  }
}

function drawCornerRank(
  ctx: CanvasRenderingContext2D,
  spec: CardSpec,
  tokens: SurfaceTokens,
): void {
  const g = CARD_GEOMETRY;
  const scale = spec.rank === '10' ? g.indexTenScale : 1;
  ctx.fillStyle = suitColour(spec.suit, tokens);
  ctx.font = font(g.indexFont * spec.width * scale, SANS_FAMILY, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.rank, spec.x + g.indexX * spec.width, spec.y + g.indexRankDrop * spec.width);
}

/**
 * The card's text: the rank glyph of both corner indices, and the court
 * card's centre letter. A face-down card draws nothing here at all.
 */
export function drawCardText(
  ctx: CanvasRenderingContext2D,
  spec: CardSpec,
  tokens: SurfaceTokens,
): void {
  if (!spec.faceUp) {
    return;
  }

  drawCornerRank(ctx, spec, tokens);
  rotatedAboutCentre(ctx, spec, () => {
    drawCornerRank(ctx, spec, tokens);
  });

  if (!isPipRank(spec.rank)) {
    const g = CARD_GEOMETRY;
    const height = cardHeight(spec.width);
    ctx.fillStyle = suitColour(spec.suit, tokens);
    ctx.font = font(g.courtFont * spec.width, SANS_FAMILY, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.rank, spec.x + spec.width / 2, spec.y + height / 2);
  }
}
