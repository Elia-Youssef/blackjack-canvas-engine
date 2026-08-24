/**
 * Chips and chip stacks, drawn as primitives. Item E4, method D: the capture
 * at the demonstration session closes it; this module is the behaviour it
 * captures, and `tests/unit/render-chips.test.ts` is the automated armour
 * under it.
 *
 * E4's criterion: "Chips render in conventional denominational colours and
 * stack with visible offset, so a wager reads as chips rather than only as a
 * number" (SPEC 16). Both halves live here. The colours are `CHIP_FILL` from
 * the token record, the conventional casino set: 10 blue, 50 green, 100 black,
 * 500 purple. The stack is `wagerToChips` plus `chipStackLayout`: a wager
 * decomposes greedily into the four denominations, largest at the bottom as a
 * dealer cuts a stack, and each chip sits a fixed fraction of its radius above
 * the one below, so every chip in the stack shows a sliver of its own fill and
 * ring. The demonstration script's 680 wager is 500 + 100 + 50 + three 10s,
 * five colours of edge in one stack.
 *
 * **The edge ring is load-bearing, not trim** (SPEC 16): no chip fill reaches
 * 3:1 against a felt, so `CHIP_RING` carries the chip's boundary against the
 * table and against the next chip, and nothing here may thin or drop it. The
 * dashes inside it are SPEC 16's "circles with edge dashes", the printed edge
 * spots of a real chip; each chip in a stack turns its dash pattern by a fixed
 * per-position angle, deterministically, so a stack does not read as one
 * extruded cylinder. Nothing in this module draws a number anywhere except the
 * top chip's value glyph, because a wager that "reads as chips rather than
 * only as a number" is the criterion.
 *
 * Wagers arrive on the 10-chip grid or not at all: `wagerToChips` throws on
 * anything else rather than rounding, the same reject-never-adjust stance the
 * wallet takes (SPEC 4.11). A renderer that quietly rounded a wager would draw
 * money the player does not have on the felt.
 *
 * Geometry is proportion, not pixels: every measurement is a fraction of the
 * chip radius the caller chose, shape data in the same sense as the card's
 * (see `card.ts`'s header). Colour resolves through `tokens.ts` and nowhere
 * else (item E1).
 */

import {
  CHIP_DENOMINATIONS,
  CHIP_FILL,
  CHIP_GLYPH,
  CHIP_RING,
  type ChipDenomination,
} from './tokens';
import { font, SANS_FAMILY } from './surface';

/**
 * Every internal proportion, as a fraction of the chip radius. See the header
 * on why these are shape data rather than tokens.
 */
export const CHIP_GEOMETRY = Object.freeze({
  /** Stroke thickness of the solid outer edge ring. */
  ring: 0.16,
  /** Radius of the dash band, measured to its centreline. */
  dashRadius: 0.74,
  /** Stroke thickness of the dashes. */
  dash: 0.18,
  /** How many edge dashes a chip carries. */
  dashCount: 6,
  /** Arc length of one dash, as a fraction of its even share of the circle. */
  dashShare: 0.45,
  /** The turn between one chip's dash pattern and the next chip up. */
  dashTurn: (2 * Math.PI) / 13,
  /** Vertical rise per chip in a stack. Must exceed `ring` to keep every
   *  chip's own fill visible in its sliver, which is E4's "visible offset". */
  stackOffset: 0.34,
  /** Value glyph size on the top chip. */
  glyphFont: 0.55,
} as const);

/**
 * A wager as chips, largest denomination first, which is bottom of the stack.
 *
 * Greedy over 10/50/100/500, which is exact and minimal on this set: every
 * wager the game can build is a multiple of 10 (SPEC 4.11), and each
 * denomination divides the next one's break point. A wager off the grid is a
 * caller defect and throws; zero is a legal absence of chips.
 */
export function wagerToChips(wager: number): readonly ChipDenomination[] {
  if (!Number.isSafeInteger(wager) || wager < 0 || wager % 10 !== 0) {
    throw new Error(`chips: a wager is a non-negative multiple of 10, got ${String(wager)}`);
  }
  const chips: ChipDenomination[] = [];
  let remaining = wager;
  for (let index = CHIP_DENOMINATIONS.length - 1; index >= 0; index -= 1) {
    const denomination = CHIP_DENOMINATIONS[index];
    if (denomination === undefined) {
      continue;
    }
    while (remaining >= denomination) {
      chips.push(denomination);
      remaining -= denomination;
    }
  }
  return chips;
}

/** One stack of chips: where it stands, how big a chip is, what is in it. */
export interface ChipStackSpec {
  /** Centre of the bottom chip, logical units. */
  readonly x: number;
  readonly y: number;
  /** Chip radius, logical units. */
  readonly radius: number;
  /** Bottom of the stack first, as `wagerToChips` returns it. */
  readonly chips: readonly ChipDenomination[];
}

/** Where each chip of a stack is drawn. Index 0 is the bottom chip. */
export interface ChipPlacement {
  readonly denomination: ChipDenomination;
  readonly x: number;
  readonly y: number;
  /** The dash pattern's turn for this position. */
  readonly angle: number;
}

/**
 * The stack layout: chip `i` rises `i * stackOffset * radius` above the base
 * and turns its dash pattern by `i * dashTurn`. Pure arithmetic, exported so
 * the armour and the drawing share one reading of "visible offset".
 */
export function chipStackLayout(spec: ChipStackSpec): readonly ChipPlacement[] {
  return spec.chips.map((denomination, index) => ({
    denomination,
    x: spec.x,
    y: spec.y - index * CHIP_GEOMETRY.stackOffset * spec.radius,
    angle: index * CHIP_GEOMETRY.dashTurn,
  }));
}

function drawChip(ctx: CanvasRenderingContext2D, placement: ChipPlacement, radius: number): void {
  const g = CHIP_GEOMETRY;

  // The fill carries identity only; the ring carries the boundary.
  ctx.fillStyle = CHIP_FILL[placement.denomination];
  ctx.beginPath();
  ctx.arc(placement.x, placement.y, radius, 0, 2 * Math.PI);
  ctx.fill();

  ctx.strokeStyle = CHIP_RING;
  ctx.lineWidth = g.ring * radius;
  ctx.beginPath();
  ctx.arc(placement.x, placement.y, radius * (1 - g.ring / 2), 0, 2 * Math.PI);
  ctx.stroke();

  // The edge dashes, turned per position so a stack reads chip by chip.
  ctx.lineWidth = g.dash * radius;
  const share = (2 * Math.PI) / g.dashCount;
  for (let dash = 0; dash < g.dashCount; dash += 1) {
    const start = placement.angle + dash * share;
    ctx.beginPath();
    ctx.arc(placement.x, placement.y, radius * g.dashRadius, start, start + share * g.dashShare);
    ctx.stroke();
  }
}

/**
 * The stack's shapes: every chip, bottom up, so each chip overlaps the sliver
 * of the one below and the top chip is whole. Runs in the shape pass.
 */
export function drawChipStackShapes(ctx: CanvasRenderingContext2D, spec: ChipStackSpec): void {
  for (const placement of chipStackLayout(spec)) {
    drawChip(ctx, placement, spec.radius);
  }
}

/**
 * The stack's text: the top chip's denomination glyph and nothing else. The
 * chips below it are read by colour and edge, as on a table. Runs in the text
 * pass.
 */
export function drawChipStackText(ctx: CanvasRenderingContext2D, spec: ChipStackSpec): void {
  const placements = chipStackLayout(spec);
  const top = placements[placements.length - 1];
  if (top === undefined) {
    return;
  }
  ctx.fillStyle = CHIP_GLYPH;
  ctx.font = font(CHIP_GEOMETRY.glyphFont * spec.radius, SANS_FAMILY, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(top.denomination), top.x, top.y);
}
