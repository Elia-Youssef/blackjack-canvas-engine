/**
 * The demonstration session's seeds, asserted rather than written down. `BJ-23`.
 *
 * `BlackJack/ACCEPTANCE.md` section 4 is ten scripted captures, and the run
 * sheets that drive them quote exact boot parameters: a seed per capture, the
 * wagers each round places, the table the session is seated at, the mark that
 * seats it, and the limits the felt prints. **A number in a document is a
 * number nothing checks.** Every figure the sheets carry is re-derived here
 * from `src/core/` on every unit run, so a rule change, a table retune or a
 * shoe change turns a stale sheet into a red test on the day it goes stale
 * rather than on the day someone tries to record with it.
 *
 * The searches live where the suite's other searches live, under
 * `tests/browser/support/`: `peek-seeds.ts`, `flow-seeds.ts` and, added at this
 * part, `capture-seeds.ts`. All three import `core/` alone and run in plain
 * Node, so importing them here costs nothing and re-deriving their journeys in
 * a second place would be the real hazard. `capture-seeds.ts` has two consumers
 * for the same reason: `tests/browser/capture-route.spec.ts` walks the `E3`
 * journey on the real page.
 *
 * Nothing here opens a browser. What it asserts is that the sheets can be
 * followed, not that following them produces a good recording.
 */

import { describe, expect, it } from 'vitest';

import { wagerToChips } from '../../src/render/chips';
import { canEnter, STARTING_CHIPS, tableLimits } from '../../src/core/wallet';
import {
  CAPTURE_MARK,
  cardSpreadRound,
  screenReaderSession,
  SPREAD_WAGER,
} from '../browser/support/capture-seeds';
import { doubleBustJourney, JOURNEY_MARK } from '../browser/support/flow-seeds';
import { peekSeed } from '../browser/support/peek-seeds';

/** The wager item `E4`'s capture builds. ACCEPTANCE section 4 step 5's own figure. */
const DEMONSTRATION_WAGER = 680;

describe('the demonstration run sheets', () => {
  it('E6: the two peek arms are the seeds the sheet names', () => {
    // One round whose peek finds a natural and one whose peek finds nothing,
    // which is the pair item `E6`'s "identical in motion and pacing on both
    // branches" is captured on.
    expect(peekSeed('natural')).toBe(7);
    expect(peekSeed('none')).toBe(4);
  });

  it('C4: the double-bust journey is the seed and the two offers the sheet names', () => {
    expect(doubleBustJourney()).toEqual({
      seed: 6,
      hits: 2,
      firstOffer: ['bronze', 'silver'],
      secondOffer: ['bronze'],
    });
    // The sheets that seat a session at Gold all bring one mark, so one figure
    // governs all of them rather than two that could drift.
    expect(JOURNEY_MARK).toBe(CAPTURE_MARK);
  });

  it('G4: one session reaches the offer, the split, a result and the bust-out', () => {
    expect(screenReaderSession()).toEqual({
      seed: 33,
      wagers: [100, 100, 650],
      hits: 2,
      offer: ['bronze', 'silver'],
    });
  });

  it('E3: one real hand carries an Ace, a face card and a number card in every suit', () => {
    // The adopted parse, ruled at `BJ-23`: "a number card of each suit" means a
    // number card in each of the four suits, not twelve cards. The search
    // states the property; this pins the answer the sheet quotes.
    expect(cardSpreadRound()).toEqual({
      seed: 11_199,
      hits: 4,
      ranks: ['K', '2', '2', '4', 'A', '2'],
      cards: ['K-spades', '2-clubs', '2-hearts', '4-spades', 'A-spades', '2-diamonds'],
    });
    expect(SPREAD_WAGER).toBe(10);
  });

  it('E4: the 680 wager is a Gold wager, and these are its chips', () => {
    // The sheet says boot at Gold, and this is why rather than a preference:
    // SPEC 4.11 caps the initial wager at the table maximum, and 680 is over
    // both lower tables' ceilings. It is inside the starting bankroll, so no
    // played-up balance is needed either.
    expect(tableLimits('bronze').maximum).toBeLessThan(DEMONSTRATION_WAGER);
    expect(tableLimits('silver').maximum).toBeLessThan(DEMONSTRATION_WAGER);
    expect(tableLimits('gold').maximum).toBeGreaterThanOrEqual(DEMONSTRATION_WAGER);
    expect(STARTING_CHIPS).toBeGreaterThanOrEqual(DEMONSTRATION_WAGER);
    // The tap sequence the sheet lists. 680 is ACCEPTANCE section 4's own
    // figure and needs no derivation; what it does need is to be a stack the
    // capture can show all four denominational colours in, and it is.
    expect(wagerToChips(DEMONSTRATION_WAGER)).toEqual([500, 100, 50, 10, 10, 10]);
    expect(new Set(wagerToChips(DEMONSTRATION_WAGER)).size).toBe(4);
  });

  it('E5: the mark seats all three tables, and these are the limits the felt prints', () => {
    // Item `E5` prints the felt at each of the three tables in one sitting,
    // which SPEC 6 only allows on a mark that has unlocked all three. The
    // sheets bring the mark rather than playing 10,000 chips up on camera.
    for (const id of ['bronze', 'silver', 'gold'] as const) {
      expect(canEnter(id, CAPTURE_MARK, STARTING_CHIPS), `${id} is enterable`).toBe(true);
      // And the control: the same balance on a fresh mark reaches Bronze only,
      // so the mark is doing the work the sheet says it is.
      expect(canEnter(id, 0, STARTING_CHIPS), `${id} without the mark`).toBe(id === 'bronze');
    }
    // The six figures run sheet 6 asks the operator to read off the felt. They
    // were transcribed before the review and nothing checked them, which is the
    // exact failure mode this file's header claims to prevent: a table retune
    // moves the felt and leaves the sheet telling the operator to confirm a
    // number the game no longer prints.
    expect({
      bronze: tableLimits('bronze'),
      silver: tableLimits('silver'),
      gold: tableLimits('gold'),
    }).toMatchObject({
      bronze: { minimum: 10, maximum: 100 },
      silver: { minimum: 50, maximum: 500 },
      gold: { minimum: 100, maximum: 2000 },
    });
  });
});
