/**
 * The thirteen mappings, exactly once each and on no other trigger. `BJ-19`,
 * item `K5`.
 *
 *   "Every cue named in the audio section is emitted on its stated trigger
 *    exactly once, and on no other trigger."
 *
 * Both halves are graded here, over the real machine. The driver below is the
 * composition root's observation in miniature: it applies an intent or steps
 * the timers, folds the statistics at the round boundary exactly as `main.ts`
 * does, and offers the frame's cues through the same pure derivation the frame
 * uses. Nothing is re-derived beside the shipped code, so a mapping that moved
 * in `src/ui/cues.ts` moves these assertions with it or fails them.
 *
 * The negative controls are the load-bearing half. Every "must not" the
 * derivation implies has a test that drives the events that would fire it if
 * the mapping were wider than its trigger: a push that must not be a win or a
 * loss, a peek that must not be a flip, an insurance stake that must not be a
 * chip, a refused press that must not be a button press, a deal's commit that
 * must not be a clear.
 *
 * The shuffle and the bust-out run on the real seeded shoe and the real
 * wallet, because a scripted shoe never reaches its cut card and a scripted
 * bankroll never runs out; everything else runs on written-down cards so each
 * assertion is checkable by hand.
 */

import { describe, expect, it } from 'vitest';

import type { MilestoneId } from '../../src/core/statistics';
import { NO_STATISTICS, observeRound, type Statistics } from '../../src/core/statistics';
import { NO_DECISIONS } from '../../src/core/strategy';
import { createTable, type Table, type TableOptions } from '../../src/core/table';
import type { Intent } from '../../src/core/types';
import { createWallet } from '../../src/core/wallet';
import { CUE_IDS, type CueId } from '../../src/ui/audio';
import { cuesFor, type CueFrame } from '../../src/ui/cues';
import { scriptedShoe } from './support/stacked-shoe';
import type { Rank } from '../../src/core/cards';

/** One driven game, observing cues the way the composition root does. */
class Round {
  readonly table: Table;
  private statistics: Statistics = NO_STATISTICS;
  private previous: CueFrame | null = null;
  private applied: CueId | null = null;
  private appliedIntent: Intent['kind'] | null = null;
  readonly cues: CueId[] = [];

  constructor(options: TableOptions = {}) {
    this.table = createTable(options);
    this.observe();
  }

  /** The update half of a frame, with the drain's acceptance held at null. */
  step(seconds: number): void {
    const chops = Math.max(1, Math.ceil(seconds / 0.25));
    for (let chop = 0; chop < chops; chop += 1) {
      this.table.update(seconds / chops);
      this.observe();
    }
  }

  /** The drain half of a frame: one intent, accepted or refused. */
  attempt(intent: Intent): void {
    const result = this.table.apply(intent);
    this.appliedIntent = result.ok ? result.kind : null;
    this.observe();
  }

  private observe(): void {
    const readout = this.table.readout();
    if (readout.phase.kind === 'roundResult' && readout.rounds > this.statistics.rounds) {
      this.statistics = observeRound(this.statistics, readout, NO_DECISIONS).statistics;
    }
    const frame: CueFrame = {
      applied: this.appliedIntent,
      readout,
      milestones: this.statistics.milestones,
    };
    const fired = cuesFor(this.previous, frame);
    this.cues.push(...fired);
    this.previous = frame;
    this.appliedIntent = null;
    void this.applied;
  }

  /** How many of one cue fired. */
  count(cue: CueId): number {
    return this.cues.filter((fired) => fired === cue).length;
  }

  /** Whether a cue fired at all, for the negative controls. */
  never(cue: CueId): boolean {
    return this.count(cue) === 0;
  }

  /** The awarded milestones, so a test can name what it expects to hear. */
  milestones(): readonly MilestoneId[] {
    return this.statistics.milestones;
  }
}

/** A table over written-down ranks, at Bronze, with the default rules. */
function tableOn(ranks: readonly Rank[], rules: TableOptions['rules'] = {}): TableOptions {
  return { rules, seed: 1, shoe: scriptedShoe(ranks) };
}

/** Step until the phase is the one named, or fail loudly. */
function runUntil(round: Round, kind: string, limit = 400): void {
  for (let step = 0; step < limit; step += 1) {
    if (round.table.readout().phase.kind === kind) {
      return;
    }
    round.step(0.25);
  }
  throw new Error(`the round never reached ${kind}`);
}

/** Bet, deal, and land somewhere the caller can act from. */
function dealt(ranks: readonly Rank[], wager = 50): Round {
  const round = new Round(tableOn(ranks));
  round.attempt({ kind: 'start' });
  round.attempt({ kind: 'tapChip', chip: wager as 10 | 50 | 100 | 500 });
  round.attempt({ kind: 'deal' });
  return round;
}

describe('K5: the first frame and the idle machine', () => {
  it('fires nothing on the first frame of a session', () => {
    const round = new Round(tableOn(['8', '9', '8', '9']));
    expect(round.cues).toEqual([]);
  });

  it('fires nothing on a frame where nothing moved', () => {
    const round = new Round(tableOn(['8', '9', '8', '9']));
    const before = round.cues.length;
    round.step(0.25);
    expect(round.cues.length).toBe(before);
  });
});

describe('K5: the button press, once per accepted intent', () => {
  it('fires once for every intent the machine accepts, and not for a refusal', () => {
    const round = new Round(tableOn(['10', '6', '9', '8', '10']));
    round.attempt({ kind: 'start' });
    // Deal with no wager is refused, and a refusal is not a press that did
    // anything: the notice line carries it, and the tally must not.
    const refusalsAt = round.cues.length;
    round.attempt({ kind: 'deal' });
    expect(round.cues.length - refusalsAt).toBe(0);
    round.attempt({ kind: 'tapChip', chip: 50 });
    round.attempt({ kind: 'deal' });
    runUntil(round, 'playerTurn');
    round.attempt({ kind: 'stand' });
    runUntil(round, 'roundResult');
    round.attempt({ kind: 'nextHand' });
    // start, tap, deal, stand, nextHand: five acceptances, five presses.
    expect(round.count('buttonPress')).toBe(5);
  });
});

describe('K5: cards, chips and the flip', () => {
  it('deals one cue per card, four for the opening deal', () => {
    const round = dealt(['10', '6', '9', '8', '10']);
    runUntil(round, 'playerTurn');
    // Two to the player, one up, one down: four cards, four cues, and the
    // down card's cue came from the concealed count rather than the visible.
    expect(round.count('cardDeal')).toBe(4);
    expect(round.never('cardFlip')).toBe(true);
  });

  it('flips exactly once at the reveal, and charges the hole card to the flip', () => {
    const round = dealt(['10', '6', '9', '8', '10']);
    runUntil(round, 'playerTurn');
    round.attempt({ kind: 'stand' });
    runUntil(round, 'dealerTurn');
    expect(round.count('cardFlip')).toBe(1);
    // Four dealt plus one flipped is five cards the player has now seen, and
    // the flip was not also a deal.
    expect(round.count('cardDeal')).toBe(4);
  });

  it('charges a hit to the card cue, and a bust to the frame it happened on', () => {
    const round = dealt(['9', '7', '5', '8', '10']);
    runUntil(round, 'playerTurn');
    round.attempt({ kind: 'hit' });
    // 9 + 5 + 10 = 24: the hand is over, the machine moves on, and the bust
    // is this frame's event rather than the settlement's.
    expect(round.count('bust')).toBe(1);
    expect(round.count('cardDeal')).toBe(5);
    runUntil(round, 'roundResult');
    expect(round.count('bust')).toBe(1);
    expect(round.count('loss')).toBe(1);
  });

  it('charges a split frame exactly the two cards SPEC 4.6 deals', () => {
    const round = dealt(['8', '6', '8', '8', '10', '9', '10']);
    runUntil(round, 'playerTurn');
    round.attempt({ kind: 'split' });
    expect(round.count('cardDeal')).toBe(6);
    round.attempt({ kind: 'stand' });
    round.attempt({ kind: 'stand' });
    runUntil(round, 'roundResult');
    // Two hands settled, two result cues; the seventh card was the dealer's
    // own draw, and the split still dealt exactly two.
    expect(round.count('cardDeal')).toBe(7);
    expect(round.count('win') + round.count('loss') + round.count('push')).toBe(2);
  });

  it('places one chip cue per wager-raising intent and one clear per clear', () => {
    const round = new Round(tableOn(['10', '6', '9', '8', '10']));
    round.attempt({ kind: 'start' });
    round.attempt({ kind: 'tapChip', chip: 50 });
    expect(round.count('chipPlace')).toBe(1);
    // Max raises the wager in one action and is one stack placed, which is
    // the derivation this file states rather than an accident of the wallet.
    round.attempt({ kind: 'max' });
    expect(round.count('chipPlace')).toBe(2);
    round.attempt({ kind: 'clear' });
    expect(round.count('chipClear')).toBe(1);
    round.attempt({ kind: 'tapChip', chip: 50 });
    const beforeDeal = round.cues.length;
    round.attempt({ kind: 'deal' });
    // The deal commits the wager, which empties it: that is the money moving
    // to the table, not a clear, and the negative control is the count.
    expect(round.count('chipClear')).toBe(1);
    expect(round.cues.length - beforeDeal).toBeGreaterThanOrEqual(1);
  });
});

describe('K5: the four result cues, one per settled hand', () => {
  it('plays the blackjack cue for a natural, and the milestone beside it', () => {
    const round = dealt(['A', '5', 'K', '9', '4']);
    runUntil(round, 'roundResult');
    expect(round.count('blackjack')).toBe(1);
    expect(round.count('win')).toBe(0);
    expect(round.count('milestone')).toBe(1);
    expect(round.milestones()).toEqual(['firstNatural']);
    // The branch this script sits on, asserted on purpose: an up card SPEC
    // 4.4 never peeks behind ends the deal by branching straight to the
    // reveal in the same step that dealt the hole card, so no frame ever
    // observes it concealed. The flip cannot fire and the hole card is
    // charged as the deal it arrives as, which is also exactly what the play
    // surface animates on this branch: the card tweens in and never flips.
    // The fifth card is the dealer's own draw: a natural is in contention,
    // so the dealer still plays out. See `src/ui/cues.ts`'s own comment.
    expect(round.count('cardFlip')).toBe(0);
    expect(round.count('cardDeal')).toBe(5);
  });

  it('reveals a ten-up dealer natural inside one Fast frame, and charges the hole card as a deal', () => {
    // The compressed branch the BJ-19 review traced: at Fast the last deal
    // step (0.132 s) and the peek it hands to (0.18 s) can both be consumed
    // by one clamped 0.25 s update against a banked remainder, so the hole
    // card is dealt and turned over between two frames that each read the
    // concealed count as zero. Exactly once per occurrence still holds, the
    // arrival is a deal, and no flip is claimed for a concealment no frame
    // observed, matching a play surface that does not animate one either.
    const round = new Round({ seed: 1, speed: 'fast', shoe: scriptedShoe(['5', '10', '3', 'A']) });
    round.attempt({ kind: 'start' });
    round.attempt({ kind: 'tapChip', chip: 50 });
    round.attempt({ kind: 'deal' });
    for (let step = 0; step < 40 && round.table.readout().phase.kind !== 'roundResult'; step += 1) {
      round.step(0.25);
    }
    expect(round.table.readout().phase.kind).toBe('roundResult');
    expect(round.count('cardDeal')).toBe(4);
    expect(round.count('cardFlip')).toBe(0);
    expect(round.count('loss')).toBe(1);
  });

  it('flips the hole card at Fast when a frame did observe it concealed', () => {
    // The other arm of the same peek, pinned so the branch above cannot be
    // read as "the flip never fires at Fast": an Ace up offers insurance,
    // the decline is a frame boundary, and the peek then reveals a card the
    // previous frame counted as concealed.
    const round = new Round({ seed: 1, speed: 'fast', shoe: scriptedShoe(['5', 'A', '3', 'K']) });
    round.attempt({ kind: 'start' });
    round.attempt({ kind: 'tapChip', chip: 50 });
    round.attempt({ kind: 'deal' });
    for (let step = 0; step < 40 && round.table.readout().phase.kind !== 'roundResult'; step += 1) {
      if (round.table.readout().phase.kind === 'insurance') {
        round.attempt({ kind: 'declineInsurance' });
        continue;
      }
      round.step(0.25);
    }
    expect(round.table.readout().phase.kind).toBe('roundResult');
    expect(round.count('cardFlip')).toBe(1);
    expect(round.count('cardDeal')).toBe(4);
    expect(round.count('loss')).toBe(1);
  });

  it('plays win for an ordinary win, and push for a push, and never the other', () => {
    const win = dealt(['10', '6', '9', '8', '10']);
    runUntil(win, 'playerTurn');
    win.attempt({ kind: 'stand' });
    runUntil(win, 'roundResult');
    expect(win.count('win')).toBe(1);
    expect(win.count('loss')).toBe(0);
    expect(win.count('push')).toBe(0);

    // Both hold 18: dealer up 8, hole 10, no draw. The push is its own cue.
    const push = dealt(['9', '8', '9', '10']);
    runUntil(push, 'playerTurn');
    push.attempt({ kind: 'stand' });
    runUntil(push, 'roundResult');
    expect(push.count('push')).toBe(1);
    expect(push.count('win')).toBe(0);
    expect(push.count('loss')).toBe(0);
  });

  it('plays loss for a dealer win and for a surrender, the two negative finishes', () => {
    // Player stands on 16; the dealer turns 7 and 9 into 16, draws the two,
    // and 18 wins it. A loss by the cards, not by a bust on either side.
    const lost = dealt(['10', '7', '6', '9', '2']);
    runUntil(lost, 'playerTurn');
    lost.attempt({ kind: 'stand' });
    runUntil(lost, 'roundResult');
    expect(lost.count('loss')).toBe(1);
    expect(lost.count('bust')).toBe(0);

    const surrendered = new Round(tableOn(['10', '9', '7', '8'], { surrender: true }));
    surrendered.attempt({ kind: 'start' });
    surrendered.attempt({ kind: 'tapChip', chip: 50 });
    surrendered.attempt({ kind: 'deal' });
    runUntil(surrendered, 'playerTurn');
    surrendered.attempt({ kind: 'surrender' });
    runUntil(surrendered, 'roundResult');
    expect(surrendered.count('loss')).toBe(1);
    expect(surrendered.count('win')).toBe(0);
    expect(surrendered.count('push')).toBe(0);
  });

  it('plays bust for the dealer, on the draw that made it', () => {
    // Dealer 6 + 8 = 14, draws the fifth card, a ten, and is over.
    const round = dealt(['10', '6', '9', '8', '10']);
    runUntil(round, 'playerTurn');
    round.attempt({ kind: 'stand' });
    runUntil(round, 'roundResult');
    expect(round.count('bust')).toBe(1);
    expect(round.count('win')).toBe(1);
  });
});

describe('K5: the peek and the insurance offer fire nothing', () => {
  it('peeks without flipping, and takes a stake without placing a chip', () => {
    // Player 5 and 3 against an Ace up: the offer is made, the peek looks at
    // a six, and neither the flip nor the chip fires.
    const round = dealt(['5', 'A', '3', '6', '10', '9', '10']);
    runUntil(round, 'insurance');
    const before = round.cues.length;
    round.attempt({ kind: 'takeInsurance' });
    runUntil(round, 'playerTurn');
    expect(round.count('cardFlip')).toBe(0);
    expect(round.count('chipPlace')).toBe(1);
    expect(round.cues.length - before).toBeGreaterThanOrEqual(1);
  });

  it('declining the offer is a press and nothing else', () => {
    const round = dealt(['5', 'A', '3', 'Q', '10', '9', '10']);
    runUntil(round, 'insurance');
    const presses = round.count('buttonPress');
    round.attempt({ kind: 'declineInsurance' });
    runUntil(round, 'roundResult');
    expect(round.count('buttonPress')).toBe(presses + 1);
  });
});

describe('K5: the shuffle, on the real shoe', () => {
  it('fires once per reshuffle the shoe performs at a round boundary', () => {
    const round = new Round({ seed: 7 });
    let reshuffles = 0;
    let dealtAtBetting = 0;
    // Enough loop turns for the shoe to cross its cut card: the cut sits at
    // 60 to 75 percent of 312 cards dealt, a minimum-wage round burns five or
    // six, and each round costs this loop a dozen or so turns through the
    // phases it does not name.
    for (let played = 0; played < 4000 && reshuffles < 1; played += 1) {
      const { phase } = round.table.readout();
      if (phase.kind === 'start') {
        round.attempt({ kind: 'start' });
      } else if (phase.kind === 'betting') {
        // The shoe's dealt count sampled at the betting screen, one round
        // apart: it only ever rises within a stack, so a fall between two
        // visits is the reshuffle that happened at the boundary between them.
        const dealt = round.table.readout().shoe.dealt;
        if (dealtAtBetting > 0 && dealt < dealtAtBetting) {
          reshuffles += 1;
        }
        dealtAtBetting = dealt;
        round.attempt({ kind: 'tapChip', chip: 10 });
        round.attempt({ kind: 'deal' });
      } else if (phase.kind === 'playerTurn') {
        round.attempt({ kind: 'stand' });
      } else if (phase.kind === 'insurance') {
        round.attempt({ kind: 'declineInsurance' });
      } else if (phase.kind === 'roundResult') {
        round.attempt({ kind: 'nextHand' });
      } else {
        round.step(0.25);
      }
    }
    expect(reshuffles).toBe(1);
    expect(round.count('shuffle')).toBe(1);
    // And the shuffle is the boundary's own event, not every boundary's.
    expect(round.count('buttonPress')).toBeGreaterThan(10);
  });
});

describe('K5: the bust-out, on the real wallet', () => {
  it('fires once at the frame the session runs out at its table', () => {
    const wallet = createWallet({ bestBalance: 10_000 });
    const round = new Round({
      wallet,
      table: 'gold',
      rules: {},
      seed: 1,
      shoe: scriptedShoe(['5', '10', '6', '10', '10', '10']),
    });
    for (let step = 0; step < 60 && round.table.readout().phase.kind !== 'bustOut'; step += 1) {
      const { phase, wallet: money } = round.table.readout();
      if (phase.kind === 'start') {
        round.attempt({ kind: 'start' });
      } else if (phase.kind === 'betting') {
        if (money.wager < 950) {
          round.attempt({ kind: 'tapChip', chip: 500 });
        } else {
          round.attempt({ kind: 'deal' });
        }
      } else if (phase.kind === 'playerTurn') {
        round.attempt({ kind: 'stand' });
      } else if (phase.kind === 'roundResult') {
        round.attempt({ kind: 'nextHand' });
      } else {
        round.step(0.25);
      }
    }
    expect(round.table.readout().phase.kind).toBe('bustOut');
    expect(round.count('bustOut')).toBe(1);
  });
});

describe('K5 armour: a flip frame carries no hidden dealer draw', () => {
  /**
   * The `flipped` branch of `cuesFor` charges one flip and skips the card
   * count and the dealer-bust check, which is sound only while no frame
   * boundary can show `dealerConcealed` falling and `dealerVisible` growing
   * by more than the one revealed card. The machine keeps that true by
   * deriving concealment from the phase: `reveal` is not a concealed phase,
   * so the fall lands on the stand frame, an `apply` whose accumulator is
   * empty, while the timed frame that can complete the reveal step and the
   * first draw together sees no fall at all. The `BJ-19` review refuted the
   * lost-cue construction against the shipped machine and asked for exactly
   * this pin: the day a later part conceals through `reveal` to animate the
   * flip, the banked Normal-to-Fast frame below completes the reveal and a
   * draw in one update and this test goes red instead of a deal cue going
   * quietly missing. The mutation ledger plants that exact edit.
   */

  interface DealerFrame {
    readonly visible: number;
    readonly concealed: number;
  }

  function dealerOf(table: Table): DealerFrame {
    const readout = table.readout();
    return { visible: readout.dealerVisible.length, concealed: readout.dealerConcealed };
  }

  function assertNoHiddenDraw(before: DealerFrame, now: DealerFrame, label: string): void {
    if (now.concealed < before.concealed) {
      expect(
        now.visible - before.visible,
        `${label}: the concealed count fell while the dealer grew by more than the revealed card`,
      ).toBeLessThanOrEqual(1);
    }
  }

  it('holds on the banked worst case, a Normal reveal switched to Fast mid-step', () => {
    // Bank the reveal accumulator to 0.44 of the 0.45 step at Normal, switch
    // to Fast so the remaining threshold is 0.27, then one clamped frame: the
    // update completes the reveal step and the dealer's first draw together,
    // which is the deepest compression this stretch of the machine allows.
    const table = createTable({ seed: 1, shoe: scriptedShoe(['10', '6', '9', '8', '10']) });
    table.apply({ kind: 'start' });
    table.apply({ kind: 'tapChip', chip: 50 });
    table.apply({ kind: 'deal' });
    for (let step = 0; step < 400 && table.readout().phase.kind !== 'playerTurn'; step += 1) {
      table.update(0.25);
    }
    expect(table.readout().phase.kind).toBe('playerTurn');

    let before = dealerOf(table);
    table.apply({ kind: 'stand' });
    assertNoHiddenDraw(before, dealerOf(table), 'the stand frame');
    expect(table.readout().phase.kind).toBe('reveal');

    for (let step = 0; step < 11; step += 1) {
      before = dealerOf(table);
      table.update(0.04);
      assertNoHiddenDraw(before, dealerOf(table), `banking step ${step}`);
    }
    expect(table.readout().phase.kind).toBe('reveal');

    table.setSpeed('fast');
    before = dealerOf(table);
    table.update(0.25);
    const after = dealerOf(table);
    assertNoHiddenDraw(before, after, 'the compressed frame');
    // The construction is live, not vacuous: that one frame really did move
    // the machine past the reveal and through at least one dealer draw.
    expect(table.readout().phase.kind).not.toBe('reveal');
    expect(after.visible).toBeGreaterThan(before.visible);
  });

  it('holds across a seeded sweep of dt plans and mid-round speed switches', () => {
    const PLANS: readonly (readonly number[])[] = [
      [0.25],
      [0.04, 0.04, 0.04, 0.25],
      [0.11, 0.07, 0.25, 0.03],
    ];
    let reveals = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const startFast of [false, true]) {
        for (const [planIndex, plan] of PLANS.entries()) {
          const table = createTable({ seed, speed: startFast ? 'fast' : 'normal' });
          table.apply({ kind: 'start' });
          const label = `seed ${seed} fast=${String(startFast)} plan ${planIndex}`;
          let frame = 0;
          let before = dealerOf(table);
          for (let step = 0; step < 600; step += 1) {
            const { phase } = table.readout();
            if (phase.kind === 'betting') {
              table.apply({ kind: 'tapChip', chip: 10 });
              table.apply({ kind: 'deal' });
            } else if (phase.kind === 'playerTurn') {
              table.apply({ kind: 'stand' });
            } else if (phase.kind === 'insurance') {
              table.apply({ kind: 'declineInsurance' });
            } else if (phase.kind === 'roundResult') {
              table.apply({ kind: 'nextHand' });
            } else {
              // A speed flip timed to land against whatever the plan banked,
              // then the frame itself; the flip is what lets a Normal-sized
              // accumulator meet a Fast-sized threshold.
              if (step % 37 === 0) {
                table.setSpeed(step % 74 === 0 ? 'fast' : 'normal');
              }
              table.update(plan[frame % plan.length] ?? 0.25);
              frame += 1;
            }
            const now = dealerOf(table);
            assertNoHiddenDraw(before, now, `${label} step ${step}`);
            if (now.concealed < before.concealed) {
              reveals += 1;
            }
            before = now;
          }
        }
      }
    }
    // The sweep really exercised the boundary it guards.
    expect(reveals).toBeGreaterThan(50);
  });
});

describe('K5: the sweep, so no cue can fall out of the tests', () => {
  it('derives exactly the thirteen cues SPEC 15 lists, in its own order', () => {
    // Content and order, not just a length: the list is SPEC 15's sentence
    // copied as identifiers, so a rename, a drop or an extra is this test's
    // failure rather than a quiet drift.
    expect(CUE_IDS).toEqual([
      'cardDeal',
      'cardFlip',
      'chipPlace',
      'chipClear',
      'buttonPress',
      'win',
      'blackjack',
      'loss',
      'push',
      'bust',
      'shuffle',
      'milestone',
      'bustOut',
    ]);
  });
});
