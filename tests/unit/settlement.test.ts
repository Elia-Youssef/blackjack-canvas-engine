/**
 * Item B13, severity Critical, 15 points.
 *
 *   "All nine settlement rungs resolve in the specified order with the exact
 *    chip delta, including equal naturals, dealer bust after a player bust, and
 *    three-card 21 against a natural."
 *
 * SPEC 4.10. The criterion is two claims joined by "in the specified order", and
 * the second is the one that needs the work. A ladder with two rungs swapped
 * still returns a correct outcome for every hand that reaches only one of them,
 * so it passes every test written hand by hand and pays wrong on the hands that
 * reach both. There are exactly three such reorderings that SPEC 4.10 warns
 * about, and all three are written out below as controls and run beside the
 * shipped ladder over the same sweep, each required to disagree on **exactly**
 * its own set of inputs and nowhere else:
 *
 *   1. Rungs 2 and 3 swapped, so a natural beats a natural instead of pushing.
 *      It must disagree on exactly the equal-naturals inputs, 48 of them.
 *   2. Rungs 5 and 6 swapped, so a player who busted first is paid when the
 *      dealer busts after. Exactly the both-bust inputs that were not
 *      surrendered, 144 of them.
 *   3. Rung 1 without its dealer-natural qualifier, so a surrendered hand keeps
 *      half its wager against a dealer natural. Exactly the surrendered inputs
 *      facing a dealer natural, 480 of them.
 *
 * **The expected values come from outside the code under test.** The ladder in
 * this file is written from SPEC 4.10's table, and the naturals, totals and bust
 * verdicts it reads come from `tests/unit/reference/hand-evaluator.ts`, the
 * second implementation this project keeps for SPEC 4.2, which imports nothing
 * from `src/` and searches every reading of the Aces where `hand.ts` adds 10 at
 * most once. A ladder checked against the totals its own evaluator produced
 * would agree with a shared misreading forever. Rung numbers and outcome words
 * are plain numbers and strings here rather than the game's `Rung` and `Outcome`
 * types, so this file shares no declaration with what it is checking.
 *
 * **The sweep includes inputs play cannot reach, deliberately.** SPEC 4.10 says
 * rungs 1 and 4 can never both apply in play, because SPEC 4.4's peek resolves a
 * dealer natural before surrender, split or double is offered, and that the
 * qualifier on rung 1 exists so the ladder is correct anyway when driven as a
 * pure function. So surrender is crossed with a dealer natural here, a split
 * origin is crossed with everything, and both sides are given hands a settled
 * round never holds, down to one card and none.
 *
 * **Scope.** This is the ladder as arithmetic. Everything it hands on is
 * someone else's:
 *
 *   - Applying a delta to a balance, crediting `wager + net` per SPEC 4.11, and
 *     the conservation of `chips + committed + insuranceStake - deferredStake`
 *     are `BJ-6`'s to build. They are graded by `B15`, whose criterion carries
 *     the identity in as many words, and by the soak `H6` at `BJ-12`.
 *   - Even money and the deferred stake of SPEC 4.7 are item `B11` at `BJ-8`,
 *     whose criterion names both, including that settlement subtracts the
 *     shortfall. Neither is built or tested here.
 *   - That insurance settles before the ladder at all is a property of a running
 *     round rather than of a pure function. Item `C1` at `BJ-20` grades the
 *     phase order end to end, insurance before settlement, in the browser.
 *   - Which hands exist, whether the dealer drew, and SPEC 4.9's contention gate
 *     are the phase machine's at `BJ-7`.
 */

import { describe, expect, it } from 'vitest';

import type { Card } from '../../src/core/cards';
import { RANKS, SUITS, card } from '../../src/core/cards';
import { settle } from '../../src/core/settlement';

import type { ReferenceHand } from './reference/hand-evaluator';
import { evaluate } from './reference/hand-evaluator';

// ---------------------------------------------------------------------------
// The alphabet, carried here rather than taken from the code
// ---------------------------------------------------------------------------

/**
 * The 13 rank labels, written out.
 *
 * Deliberately not `RANKS`: a sweep that took its alphabet from the module it
 * checks would shrink to match a rank gone missing and still pass. The first
 * test compares the two lists, which is the one place that comparison proves
 * something.
 */
const RANK_LABELS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

type RankLabel = (typeof RANK_LABELS)[number];

const SUIT_LABELS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;

// ---------------------------------------------------------------------------
// SPEC 4.10's table, as this file reads it
// ---------------------------------------------------------------------------

/** One hand of a settlement, as the ladder needs to see it. */
interface Case {
  readonly player: readonly RankLabel[];
  readonly dealer: readonly RankLabel[];
  readonly wager: number;
  readonly surrendered: boolean;
  readonly fromSplit: boolean;
}

/** What a rung decides: which rung it was, its outcome word, and the net. */
interface Verdict {
  readonly rung: number;
  readonly outcome: string;
  readonly net: number;
}

/** The five outcome words of SPEC 4.10, written out. */
const OUTCOMES = ['SURRENDER', 'PUSH', 'BLACKJACK', 'DEALER_WIN', 'PLAYER_WIN'] as const;

/** SPEC 4.11: a natural pays 3:2, insurance 2:1, and surrender returns a half. */
const NATURAL_NUMERATOR = 3;
const NATURAL_DENOMINATOR = 2;
const SURRENDER_DIVISOR = 2;

/**
 * The two sides read through the second implementation.
 *
 * The dealer holds one hand all round, so its origin is never a split. The
 * player's is whatever the case says, which is what makes a two-card 21 a
 * natural on an unsplit hand and a plain 21 on a split one, per SPEC 4.6.
 */
function sides(input: Case): { player: ReferenceHand; dealer: ReferenceHand } {
  return {
    player: evaluate(input.player, { fromSplit: input.fromSplit }),
    dealer: evaluate(input.dealer, { fromSplit: false }),
  };
}

/**
 * SPEC 4.10's nine rungs, top to bottom, as this file reads the table.
 *
 * Rung 1 carries the "and the dealer holds no natural" qualifier the table
 * prints. Rung 9 is the only unconditional return, so the ladder is total.
 */
function ladder(input: Case): Verdict {
  const { player, dealer } = sides(input);
  const w = input.wager;
  if (input.surrendered && !dealer.natural) {
    return { rung: 1, outcome: 'SURRENDER', net: -(w / SURRENDER_DIVISOR) };
  }
  if (player.natural && dealer.natural) {
    return { rung: 2, outcome: 'PUSH', net: 0 };
  }
  if (player.natural) {
    return { rung: 3, outcome: 'BLACKJACK', net: (w * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR };
  }
  if (dealer.natural) {
    return { rung: 4, outcome: 'DEALER_WIN', net: -w };
  }
  if (player.bust) {
    return { rung: 5, outcome: 'DEALER_WIN', net: -w };
  }
  if (dealer.bust) {
    return { rung: 6, outcome: 'PLAYER_WIN', net: w };
  }
  if (player.total > dealer.total) {
    return { rung: 7, outcome: 'PLAYER_WIN', net: w };
  }
  if (player.total < dealer.total) {
    return { rung: 8, outcome: 'DEALER_WIN', net: -w };
  }
  return { rung: 9, outcome: 'PUSH', net: 0 };
}

/**
 * Control 1: rungs 2 and 3 in the other order.
 *
 * The single natural is tested before the equal naturals, so a player natural
 * facing a dealer natural is paid 3:2 instead of pushing. Every other input
 * reaches the same rung by the same route, which is what makes the required
 * disagreement set exact.
 */
function naturalBeatsNatural(input: Case): Verdict {
  const { player, dealer } = sides(input);
  const w = input.wager;
  if (input.surrendered && !dealer.natural) {
    return { rung: 1, outcome: 'SURRENDER', net: -(w / SURRENDER_DIVISOR) };
  }
  if (player.natural) {
    return { rung: 3, outcome: 'BLACKJACK', net: (w * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR };
  }
  if (player.natural && dealer.natural) {
    return { rung: 2, outcome: 'PUSH', net: 0 };
  }
  if (dealer.natural) {
    return { rung: 4, outcome: 'DEALER_WIN', net: -w };
  }
  if (player.bust) {
    return { rung: 5, outcome: 'DEALER_WIN', net: -w };
  }
  if (dealer.bust) {
    return { rung: 6, outcome: 'PLAYER_WIN', net: w };
  }
  if (player.total > dealer.total) {
    return { rung: 7, outcome: 'PLAYER_WIN', net: w };
  }
  if (player.total < dealer.total) {
    return { rung: 8, outcome: 'DEALER_WIN', net: -w };
  }
  return { rung: 9, outcome: 'PUSH', net: 0 };
}

/**
 * Control 2: rungs 5 and 6 in the other order.
 *
 * The dealer's bust is tested before the player's, so a hand that busted and was
 * then followed by a dealer bust is paid instead of losing. This is the "dealer
 * bust after a player bust" case the item names.
 */
function dealerBustFirst(input: Case): Verdict {
  const { player, dealer } = sides(input);
  const w = input.wager;
  if (input.surrendered && !dealer.natural) {
    return { rung: 1, outcome: 'SURRENDER', net: -(w / SURRENDER_DIVISOR) };
  }
  if (player.natural && dealer.natural) {
    return { rung: 2, outcome: 'PUSH', net: 0 };
  }
  if (player.natural) {
    return { rung: 3, outcome: 'BLACKJACK', net: (w * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR };
  }
  if (dealer.natural) {
    return { rung: 4, outcome: 'DEALER_WIN', net: -w };
  }
  if (dealer.bust) {
    return { rung: 6, outcome: 'PLAYER_WIN', net: w };
  }
  if (player.bust) {
    return { rung: 5, outcome: 'DEALER_WIN', net: -w };
  }
  if (player.total > dealer.total) {
    return { rung: 7, outcome: 'PLAYER_WIN', net: w };
  }
  if (player.total < dealer.total) {
    return { rung: 8, outcome: 'DEALER_WIN', net: -w };
  }
  return { rung: 9, outcome: 'PUSH', net: 0 };
}

/**
 * Control 3: rung 1 without its dealer-natural qualifier.
 *
 * This is early surrender rather than SPEC 4.8's late surrender: the hand keeps
 * half its wager against a dealer natural instead of losing all of it. Every
 * rung below is untouched, so the disagreement is exactly the pair of inputs
 * that play cannot reach and the ladder still has to answer.
 */
function earlySurrender(input: Case): Verdict {
  const { player, dealer } = sides(input);
  const w = input.wager;
  if (input.surrendered) {
    return { rung: 1, outcome: 'SURRENDER', net: -(w / SURRENDER_DIVISOR) };
  }
  if (player.natural && dealer.natural) {
    return { rung: 2, outcome: 'PUSH', net: 0 };
  }
  if (player.natural) {
    return { rung: 3, outcome: 'BLACKJACK', net: (w * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR };
  }
  if (dealer.natural) {
    return { rung: 4, outcome: 'DEALER_WIN', net: -w };
  }
  if (player.bust) {
    return { rung: 5, outcome: 'DEALER_WIN', net: -w };
  }
  if (dealer.bust) {
    return { rung: 6, outcome: 'PLAYER_WIN', net: w };
  }
  if (player.total > dealer.total) {
    return { rung: 7, outcome: 'PLAYER_WIN', net: w };
  }
  if (player.total < dealer.total) {
    return { rung: 8, outcome: 'DEALER_WIN', net: -w };
  }
  return { rung: 9, outcome: 'PUSH', net: 0 };
}

// ---------------------------------------------------------------------------
// The sweep, and the counts derived from its shape
// ---------------------------------------------------------------------------

/**
 * Player hands, one per class the ladder can tell apart, plus three it cannot.
 *
 * The first two are the only two-card 21s in the list, which makes them the only
 * naturals, and only while the case says the hand did not come from a split. The
 * last two are hands a settled round never holds and the ladder still has to
 * answer, which is the same argument rung 1's qualifier rests on.
 */
const PLAYER_HANDS: readonly (readonly RankLabel[])[] = [
  ['A', 'K'], // 21 in two: a natural unsplit, a plain 21 from a split
  ['10', 'A'], // the same, the other way round
  ['7', '7', '7'], // 21 in three, never a natural
  ['A', '5', '5'], // 21 in three, soft
  ['10', '10'], // 20
  ['A', '9'], // 20, soft
  ['10', '9'], // 19
  ['9', '9'], // 18
  ['A', '7'], // 18, soft
  ['10', '7'], // 17
  ['A', '6'], // 17, soft
  ['10', '6'], // 16
  ['A', 'A'], // 12, soft
  ['2', '3'], // 5
  ['10', '10', '2'], // 22, bust
  ['K', 'Q', 'J'], // 30, bust
  ['10', '6', '10'], // 26, bust
  ['9', '9', '9'], // 27, bust
  ['10'], // one card
  [], // none
];

/** Dealer hands, the same way. Two naturals, three busts, no split origin. */
const DEALER_HANDS: readonly (readonly RankLabel[])[] = [
  ['A', 'Q'], // natural
  ['J', 'A'], // natural, the other way round
  ['7', '7', '7'], // 21 in three, not a natural
  ['A', '5', '5'], // 21 in three, soft
  ['10', '10'], // 20
  ['10', '9'], // 19
  ['9', '9'], // 18
  ['10', '7'], // 17
  ['A', '6'], // 17, soft: the total SPEC 4.9 stands on
  ['10', '6', '10'], // 26, bust
  ['K', 'Q', '2'], // 22, bust
  ['9', '8', '7'], // 24, bust
  ['10', '6'], // 16, which SPEC 4.9 never settles on
  ['10'], // one card
  [], // none
];

/**
 * Wagers, all on SPEC 4.11's 10-chip grid: the smallest chip, the three table
 * maxima of SPEC 6, and a doubled Gold maximum, which is the largest wager a
 * single hand can carry.
 */
const SWEEP_WAGERS = [10, 50, 100, 500, 2000, 4000] as const;

/** Hands in each list that are a two-card 21, and hands that are bust. */
const PLAYER_NATURAL_HANDS = 2;
const PLAYER_BUST_HANDS = 4;
const PLAYER_LIVE_HANDS = PLAYER_HANDS.length - PLAYER_BUST_HANDS;
const DEALER_NATURAL_HANDS = 2;
const DEALER_BUST_HANDS = 3;
const DEALER_PLAIN_HANDS = DEALER_HANDS.length - DEALER_NATURAL_HANDS;

/** 20 player hands x 15 dealer hands x 6 wagers x surrendered x split origin. */
const SWEEP_CASES =
  PLAYER_HANDS.length * DEALER_HANDS.length * SWEEP_WAGERS.length * 2 * 2;

/**
 * The three disagreement sets, derived from the shape of the sweep rather than
 * observed from a run. Each is the exact set its control is required to differ
 * on, and each product below is the reason the number is what it is.
 *
 * **Equal naturals.** Both two-card 21s on the player side, and only while the
 * hand is not from a split, against both dealer naturals, at every wager, and
 * with surrender making no difference because rung 1 cannot fire when the dealer
 * holds a natural: `2 x 1 x 2 x 6 x 2`.
 *
 * **Both bust, not surrendered.** Every player bust against every dealer bust,
 * at every wager, from a split and not: `4 x 3 x 6 x 2`. The surrendered half of
 * the sweep is excluded because rung 1 already decided it, a dealer holding a
 * bust hand holding no natural.
 *
 * **Surrendered against a dealer natural.** Every player hand there is, against
 * both dealer naturals, at every wager, from a split and not: `20 x 2 x 6 x 2`.
 */
const EQUAL_NATURAL_CASES = PLAYER_NATURAL_HANDS * 1 * DEALER_NATURAL_HANDS * 6 * 2;
const BOTH_BUST_CASES = PLAYER_BUST_HANDS * DEALER_BUST_HANDS * 6 * 2;
const SURRENDER_VS_NATURAL_CASES = PLAYER_HANDS.length * DEALER_NATURAL_HANDS * 6 * 2;

/**
 * How many cases each of the first six rungs decides, derived the same way.
 *
 * Rung 1 is every surrendered case whose dealer holds no natural,
 * `20 x 13 x 6 x 2`. Rung 2 is the equal naturals above. Rung 3 is a player
 * natural against a plain dealer hand, and only when the hand did not surrender,
 * since rung 1 takes those first: `2 x 1 x 13 x 6 x 1`. Rung 4 is every case
 * facing a dealer natural that rung 2 did not take, `20 x 2 x 6 x 2 x 2` less
 * the 48 equal naturals. Rung 5 is a player bust against a plain dealer, not
 * surrendered, `4 x 13 x 6 x 2`. Rung 6 is a dealer bust with the player neither
 * bust nor holding a natural, not surrendered: the 16 live player hands lose
 * their 2 naturals only on the unsplit half, so `3 x (14 + 16) x 6`.
 *
 * Rungs 7, 8 and 9 are the trichotomy on the values and are counted rather than
 * derived, but their total is not: it is everything the six above left.
 */
const RUNG_1_CASES = PLAYER_HANDS.length * DEALER_PLAIN_HANDS * 6 * 2;
const RUNG_2_CASES = EQUAL_NATURAL_CASES;
const RUNG_3_CASES = PLAYER_NATURAL_HANDS * 1 * DEALER_PLAIN_HANDS * 6 * 1;
const RUNG_4_CASES =
  PLAYER_HANDS.length * DEALER_NATURAL_HANDS * 6 * 2 * 2 - EQUAL_NATURAL_CASES;
const RUNG_5_CASES = PLAYER_BUST_HANDS * DEALER_PLAIN_HANDS * 6 * 2;
const RUNG_6_CASES =
  DEALER_BUST_HANDS * (PLAYER_LIVE_HANDS - PLAYER_NATURAL_HANDS + PLAYER_LIVE_HANDS) * 6;
const COMPARISON_CASES =
  SWEEP_CASES -
  RUNG_1_CASES -
  RUNG_2_CASES -
  RUNG_3_CASES -
  RUNG_4_CASES -
  RUNG_5_CASES -
  RUNG_6_CASES;

/** Every case in the sweep. */
function eachCase(visit: (input: Case) => void): void {
  for (const player of PLAYER_HANDS) {
    for (const dealer of DEALER_HANDS) {
      for (const wager of SWEEP_WAGERS) {
        for (const surrendered of [false, true]) {
          for (const fromSplit of [false, true]) {
            visit({ player, dealer, wager, surrendered, fromSplit });
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Building the arguments the game takes
// ---------------------------------------------------------------------------

function suitAt(index: number): (typeof SUIT_LABELS)[number] {
  const suit = SUIT_LABELS[index];
  if (suit === undefined) {
    throw new RangeError(`no suit at index ${String(index)}`);
  }
  return suit;
}

/** Cards for a list of labels, with the suit varying so no hand is one suit. */
function hand(labels: readonly RankLabel[]): Card[] {
  return labels.map((label, index) => card(label, suitAt(index % SUIT_LABELS.length)));
}

/** The shipped ladder's verdict for one case, as a plain `Verdict`. */
function shipped(input: Case): Verdict {
  const result = settle(
    {
      cards: hand(input.player),
      wager: input.wager,
      surrendered: input.surrendered,
      origin: { fromSplit: input.fromSplit },
    },
    { cards: hand(input.dealer) },
  );
  return { rung: result.rung, outcome: result.outcome, net: result.net };
}

/** A case as one line, for a failure report. */
function describeCase(input: Case): string {
  const player = input.player.length === 0 ? 'none' : input.player.join('-');
  const dealer = input.dealer.length === 0 ? 'none' : input.dealer.join('-');
  const played = input.surrendered ? 'surrendered' : 'played';
  const origin = input.fromSplit ? 'split' : 'unsplit';
  return `${player} vs ${dealer} at ${String(input.wager)} (${played}, ${origin})`;
}

function show(verdict: Verdict): string {
  return `rung ${String(verdict.rung)} ${verdict.outcome} ${String(verdict.net)}`;
}

// ---------------------------------------------------------------------------
// The ledger: the shipped ladder, and the three controls, over the same cases
// ---------------------------------------------------------------------------

const MAX_REPORTED = 12;

interface ControlLedger {
  /** Cases where the control's verdict differed from the shipped ladder's. */
  readonly disagreements: () => number;
  /** Cases where differing or agreeing was not what the characterisation said. */
  readonly mischaracterised: () => number;
}

interface Ledger {
  readonly check: (input: Case) => void;
  readonly visited: () => number;
  readonly rungCount: (rung: number) => number;
  readonly outcomesSeen: () => Set<string>;
  readonly nonIntegerDeltas: () => number;
  readonly control: (name: string) => ControlLedger;
  /** The empty string when everything agreed, otherwise a report. */
  readonly summary: () => string;
}

/**
 * A control, and the exact set of cases it is required to differ on.
 *
 * Both halves are asserted for every case: a control that agreed where it should
 * differ is as much a failure as one that differed where it should agree, and
 * only the pair pins the reordering to the inputs SPEC 4.10 says it moves.
 */
interface Control {
  readonly name: string;
  readonly ladder: (input: Case) => Verdict;
  readonly differsOn: (input: Case) => boolean;
}

function createLedger(controls: readonly Control[]): Ledger {
  let visited = 0;
  let nonIntegerDeltas = 0;
  let failures = 0;
  const reported: string[] = [];
  const rungs = new Map<number, number>();
  const outcomes = new Set<string>();
  const tally = new Map<string, { disagreements: number; mischaracterised: number }>();
  for (const control of controls) {
    tally.set(control.name, { disagreements: 0, mischaracterised: 0 });
  }

  function note(input: Case, complaint: string): void {
    failures += 1;
    if (reported.length < MAX_REPORTED) {
      reported.push(`${describeCase(input)}: ${complaint}`);
    }
  }

  function counted(name: string): { disagreements: number; mischaracterised: number } {
    const entry = tally.get(name);
    if (entry === undefined) {
      throw new RangeError(`no control named ${name}`);
    }
    return entry;
  }

  return {
    check(input) {
      visited += 1;
      const wanted = ladder(input);
      const got = shipped(input);
      if (got.rung !== wanted.rung || got.outcome !== wanted.outcome || got.net !== wanted.net) {
        note(input, `${show(got)}, SPEC 4.10 says ${show(wanted)}`);
      }

      // Tallied on the **shipped** rung, not this file's, so that the rung
      // counts below measure `settle` rather than the oracle beside it. While
      // everything passes the distinction is invisible, because the comparison
      // one line up already forces the two to agree case by case; it becomes
      // visible exactly when something fails, which is when a coverage figure
      // taken from the oracle would be reporting the wrong program's reach.
      // The controls are tallied against the shipped verdict for the same
      // reason: what is being characterised is how a reordering differs from
      // the ladder that ships.
      rungs.set(got.rung, (rungs.get(got.rung) ?? 0) + 1);
      outcomes.add(got.outcome);
      if (!Number.isInteger(got.net)) {
        nonIntegerDeltas += 1;
        note(input, `paid a fractional ${String(got.net)} on a wager on the 10-chip grid`);
      }

      for (const control of controls) {
        const broken = control.ladder(input);
        const differs =
          broken.rung !== got.rung || broken.outcome !== got.outcome || broken.net !== got.net;
        const shouldDiffer = control.differsOn(input);
        const entry = counted(control.name);
        if (differs) {
          entry.disagreements += 1;
        }
        if (differs !== shouldDiffer) {
          entry.mischaracterised += 1;
          note(
            input,
            shouldDiffer
              ? `the ${control.name} control agreed with the ladder where it must differ`
              : `the ${control.name} control differed from the ladder where it must agree`,
          );
        }
      }
    },
    visited: () => visited,
    rungCount: (rung) => rungs.get(rung) ?? 0,
    outcomesSeen: () => new Set(outcomes),
    nonIntegerDeltas: () => nonIntegerDeltas,
    control: (name) => ({
      disagreements: () => counted(name).disagreements,
      mischaracterised: () => counted(name).mischaracterised,
    }),
    summary: () => {
      if (failures === 0) {
        return '';
      }
      const head = `${String(failures)} failures over ${String(visited)} cases checked`;
      const more = failures - reported.length;
      const tail = more > 0 ? `\n  ... and ${String(more)} more` : '';
      return `${head}:\n  ${reported.join('\n  ')}${tail}`;
    },
  };
}

/**
 * The three reorderings SPEC 4.10 warns about, each with the set of inputs it is
 * required to move and no other.
 *
 * The characterisations are written from the table, not from a run. Equal
 * naturals are the only cases rungs 2 and 3 can both reach. Both hands bust is
 * the only case rungs 5 and 6 can both reach, and only when the hand did not
 * surrender, because rung 1 takes a surrendered hand first and a bust dealer
 * holds no natural. A surrendered hand facing a dealer natural is the only case
 * rung 1's qualifier decides, whether the hand below it is rung 2's or rung 4's.
 */
const CONTROLS: readonly Control[] = [
  {
    name: 'rungs 2 and 3 swapped',
    ladder: naturalBeatsNatural,
    differsOn: (input) => {
      const { player, dealer } = sides(input);
      return player.natural && dealer.natural;
    },
  },
  {
    name: 'rungs 5 and 6 swapped',
    ladder: dealerBustFirst,
    differsOn: (input) => {
      const { player, dealer } = sides(input);
      return player.bust && dealer.bust && !input.surrendered;
    },
  },
  {
    name: 'rung 1 without its dealer-natural qualifier',
    ladder: earlySurrender,
    differsOn: (input) => input.surrendered && sides(input).dealer.natural,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the alphabet and the table this file checks against', () => {
  it('is the same 13 ranks and 4 suits the game deals', () => {
    expect([...RANKS]).toEqual([...RANK_LABELS]);
    expect([...SUITS]).toEqual([...SUIT_LABELS]);
  });

  it('carries SPEC 4.11 payout terms rather than importing them', () => {
    expect(NATURAL_NUMERATOR / NATURAL_DENOMINATOR).toBe(1.5);
    expect(SURRENDER_DIVISOR).toBe(2);
  });
});

/**
 * The reference evaluator, pinned inside this file's use of it.
 *
 * Every expected verdict below rests on these readings, so the hands the sweep
 * is built from are worked out by hand and written down here rather than taken
 * from any implementation. The list is exactly the distinction the ladder turns
 * on: which hands are naturals, which 21s are not, which hands are bust, and
 * what a split origin does to a two-card 21.
 */
describe('the hands this file sweeps, pinned by hand', () => {
  const readings: readonly [readonly RankLabel[], boolean, number, boolean, boolean][] = [
    // hand, fromSplit, total, natural, bust
    [['A', 'K'], false, 21, true, false],
    [['A', 'K'], true, 21, false, false],
    [['10', 'A'], false, 21, true, false],
    [['A', 'Q'], false, 21, true, false],
    [['J', 'A'], false, 21, true, false],
    [['7', '7', '7'], false, 21, false, false],
    [['A', '5', '5'], false, 21, false, false],
    [['10', '10'], false, 20, false, false],
    [['A', '9'], false, 20, false, false],
    [['10', '9'], false, 19, false, false],
    [['9', '9'], false, 18, false, false],
    [['A', '7'], false, 18, false, false],
    [['10', '7'], false, 17, false, false],
    [['A', '6'], false, 17, false, false],
    [['10', '6'], false, 16, false, false],
    [['A', 'A'], false, 12, false, false],
    [['2', '3'], false, 5, false, false],
    [['10', '10', '2'], false, 22, false, true],
    [['K', 'Q', 'J'], false, 30, false, true],
    [['10', '6', '10'], false, 26, false, true],
    [['9', '9', '9'], false, 27, false, true],
    [['K', 'Q', '2'], false, 22, false, true],
    [['9', '8', '7'], false, 24, false, true],
    [['10'], false, 10, false, false],
    [[], false, 0, false, false],
  ];

  for (const [labels, fromSplit, total, natural, bust] of readings) {
    const name = labels.length === 0 ? 'no cards' : labels.join('-');
    it(`reads ${name}${fromSplit ? ' from a split' : ''} as ${String(total)}`, () => {
      const reading = evaluate(labels, { fromSplit });
      expect(reading.total).toBe(total);
      expect(reading.natural).toBe(natural);
      expect(reading.bust).toBe(bust);
    });
  }

  it('holds the number of naturals and busts the derived counts assume', () => {
    const naturals = (hands: readonly (readonly RankLabel[])[]): number =>
      hands.filter((labels) => evaluate(labels, { fromSplit: false }).natural).length;
    const busts = (hands: readonly (readonly RankLabel[])[]): number =>
      hands.filter((labels) => evaluate(labels, { fromSplit: false }).bust).length;

    expect(PLAYER_HANDS.length).toBe(20);
    expect(DEALER_HANDS.length).toBe(15);
    expect(naturals(PLAYER_HANDS)).toBe(PLAYER_NATURAL_HANDS);
    expect(busts(PLAYER_HANDS)).toBe(PLAYER_BUST_HANDS);
    expect(naturals(DEALER_HANDS)).toBe(DEALER_NATURAL_HANDS);
    expect(busts(DEALER_HANDS)).toBe(DEALER_BUST_HANDS);
    // No player hand is a natural once it came from a split. SPEC 4.6.
    expect(PLAYER_HANDS.filter((labels) => evaluate(labels, { fromSplit: true }).natural)).toEqual(
      [],
    );
  });
});

describe('B13: the nine rungs over the whole sweep. SPEC 4.10', () => {
  const ledger = createLedger(CONTROLS);
  eachCase((input) => {
    ledger.check(input);
  });

  it('resolves every case the way SPEC 4.10 resolves it', () => {
    expect(ledger.summary()).toBe('');
    expect(ledger.visited()).toBe(SWEEP_CASES);
    expect(SWEEP_CASES).toBe(7200);
  });

  it('reaches all nine rungs, in the counts the sweep implies', () => {
    expect(ledger.rungCount(1)).toBe(RUNG_1_CASES);
    expect(ledger.rungCount(2)).toBe(RUNG_2_CASES);
    expect(ledger.rungCount(3)).toBe(RUNG_3_CASES);
    expect(ledger.rungCount(4)).toBe(RUNG_4_CASES);
    expect(ledger.rungCount(5)).toBe(RUNG_5_CASES);
    expect(ledger.rungCount(6)).toBe(RUNG_6_CASES);
    const comparison = ledger.rungCount(7) + ledger.rungCount(8) + ledger.rungCount(9);
    expect(comparison).toBe(COMPARISON_CASES);
    for (const rung of [7, 8, 9]) {
      expect(ledger.rungCount(rung)).toBeGreaterThan(0);
    }
  });

  it('produces exactly the five outcome words of SPEC 4.10', () => {
    expect([...ledger.outcomesSeen()].sort()).toEqual([...OUTCOMES].sort());
  });

  it('pays a whole number of chips on every case, at every wager', () => {
    expect(ledger.nonIntegerDeltas()).toBe(0);
  });

  it('differs from the natural-beats-natural order on exactly the equal naturals', () => {
    const control = ledger.control('rungs 2 and 3 swapped');
    expect(control.mischaracterised()).toBe(0);
    expect(control.disagreements()).toBe(EQUAL_NATURAL_CASES);
    expect(EQUAL_NATURAL_CASES).toBe(48);
  });

  it('differs from the dealer-bust-first order on exactly the both-bust cases', () => {
    const control = ledger.control('rungs 5 and 6 swapped');
    expect(control.mischaracterised()).toBe(0);
    expect(control.disagreements()).toBe(BOTH_BUST_CASES);
    expect(BOTH_BUST_CASES).toBe(144);
  });

  it('differs from early surrender on exactly the surrenders facing a natural', () => {
    const control = ledger.control('rung 1 without its dealer-natural qualifier');
    expect(control.mischaracterised()).toBe(0);
    expect(control.disagreements()).toBe(SURRENDER_VS_NATURAL_CASES);
    expect(SURRENDER_VS_NATURAL_CASES).toBe(480);
  });
});

/**
 * The cases the item names, one at a time, with the arithmetic written out.
 *
 * A wager of 100 throughout, so a 3:2 natural is 150, a half wager is 50, and
 * every number below can be read against SPEC 4.10's table without arithmetic.
 */
describe('B13: the boundary cases, one at a time. SPEC 4.10', () => {
  const W = 100;

  function verdict(
    player: readonly RankLabel[],
    dealer: readonly RankLabel[],
    options: { surrendered?: boolean; fromSplit?: boolean } = {},
  ): Verdict {
    return shipped({
      player,
      dealer,
      wager: W,
      surrendered: options.surrendered ?? false,
      fromSplit: options.fromSplit ?? false,
    });
  }

  it('rung 2: two naturals push, and the wager comes back untouched', () => {
    expect(verdict(['A', 'K'], ['A', 'Q'])).toEqual({ rung: 2, outcome: 'PUSH', net: 0 });
    expect(verdict(['10', 'A'], ['J', 'A'])).toEqual({ rung: 2, outcome: 'PUSH', net: 0 });
  });

  it('rung 3: a natural against a three-card 21 pays 3:2, which is 150 on 100', () => {
    // Not rung 9. Both hands are 21, and the ladder never reaches the values:
    // SPEC 4.2 makes only the two-card hand a natural, and rung 3 is above the
    // comparison.
    expect(verdict(['A', 'K'], ['7', '7', '7'])).toEqual({
      rung: 3,
      outcome: 'BLACKJACK',
      net: 150,
    });
    expect(verdict(['A', 'K'], ['A', '5', '5'])).toEqual({
      rung: 3,
      outcome: 'BLACKJACK',
      net: 150,
    });
  });

  it('rung 4: a three-card 21 against a natural loses the whole wager', () => {
    expect(verdict(['7', '7', '7'], ['A', 'Q'])).toEqual({
      rung: 4,
      outcome: 'DEALER_WIN',
      net: -100,
    });
    expect(verdict(['A', '5', '5'], ['J', 'A'])).toEqual({
      rung: 4,
      outcome: 'DEALER_WIN',
      net: -100,
    });
  });

  it('rung 5: both hands bust and the player still loses, because rung 5 is first', () => {
    expect(verdict(['10', '10', '2'], ['10', '6', '10'])).toEqual({
      rung: 5,
      outcome: 'DEALER_WIN',
      net: -100,
    });
    expect(verdict(['K', 'Q', 'J'], ['9', '8', '7'])).toEqual({
      rung: 5,
      outcome: 'DEALER_WIN',
      net: -100,
    });
  });

  it('rung 1: a surrender against no natural forfeits half, which is 50 on 100', () => {
    expect(verdict(['10', '6'], ['10', '7'], { surrendered: true })).toEqual({
      rung: 1,
      outcome: 'SURRENDER',
      net: -50,
    });
    // The dealer's hand does not matter on this rung as long as it is not a
    // natural, so a bust dealer and a 21 in three cards both settle the same.
    expect(verdict(['10', '6'], ['10', '6', '10'], { surrendered: true })).toEqual({
      rung: 1,
      outcome: 'SURRENDER',
      net: -50,
    });
    expect(verdict(['10', '6'], ['7', '7', '7'], { surrendered: true })).toEqual({
      rung: 1,
      outcome: 'SURRENDER',
      net: -50,
    });
  });

  it('rung 4: a surrender against a dealer natural loses all of it. SPEC 4.8', () => {
    // Late surrender is after the peek, so a dealer natural takes the full
    // wager rather than half. This is rung 1's qualifier, and it is the pair of
    // inputs play cannot reach.
    expect(verdict(['10', '6'], ['A', 'Q'], { surrendered: true })).toEqual({
      rung: 4,
      outcome: 'DEALER_WIN',
      net: -100,
    });
  });

  it('rung 2: a surrendered natural against a natural still pushes', () => {
    // Rung 1 cannot fire against a natural, so this falls to rung 2 rather than
    // to rung 4: the naturals are equal and equal naturals push.
    expect(verdict(['A', 'K'], ['A', 'Q'], { surrendered: true })).toEqual({
      rung: 2,
      outcome: 'PUSH',
      net: 0,
    });
  });

  it('rung 7: a split hand 21 beats a 20 at 1:1, never 3:2. SPEC 4.6', () => {
    expect(verdict(['A', 'K'], ['10', '10'], { fromSplit: true })).toEqual({
      rung: 7,
      outcome: 'PLAYER_WIN',
      net: 100,
    });
    // The same two cards without the split origin are a natural, and pay 150.
    expect(verdict(['A', 'K'], ['10', '10'])).toEqual({
      rung: 3,
      outcome: 'BLACKJACK',
      net: 150,
    });
  });

  it('rung 4: a split hand 21 against a natural loses the whole wager', () => {
    expect(verdict(['A', 'K'], ['A', 'Q'], { fromSplit: true })).toEqual({
      rung: 4,
      outcome: 'DEALER_WIN',
      net: -100,
    });
  });

  it('rung 9: equal stood values push, at every value from 17 to 21', () => {
    const equal: readonly [readonly RankLabel[], readonly RankLabel[], number][] = [
      [['10', '7'], ['9', '8'], 17],
      [['A', '6'], ['10', '7'], 17],
      [['10', '8'], ['9', '9'], 18],
      [['10', '9'], ['9', '6', '4'], 19],
      [['10', '10'], ['9', '8', '3'], 20],
      [['7', '7', '7'], ['A', '5', '5'], 21],
    ];
    for (const [player, dealer, total] of equal) {
      expect(evaluate(player, { fromSplit: false }).total).toBe(total);
      expect(evaluate(dealer, { fromSplit: false }).total).toBe(total);
      expect(verdict(player, dealer)).toEqual({ rung: 9, outcome: 'PUSH', net: 0 });
    }
  });

  it('rung 6: a dealer bust pays every live player total, 4 through 21', () => {
    const live: readonly (readonly RankLabel[])[] = [
      ['2', '2'], // 4
      ['2', '3'], // 5
      ['2', '4'], // 6
      ['3', '4'], // 7
      ['4', '4'], // 8
      ['4', '5'], // 9
      ['5', '5'], // 10
      ['5', '6'], // 11
      ['A', 'A'], // 12
      ['10', '3'], // 13
      ['10', '4'], // 14
      ['10', '5'], // 15
      ['10', '6'], // 16
      ['10', '7'], // 17
      ['A', '7'], // 18
      ['10', '9'], // 19
      ['10', '10'], // 20
      ['7', '7', '7'], // 21, and not a natural
    ];
    const totals = live.map((labels) => evaluate(labels, { fromSplit: false }).total);
    expect(totals).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    for (const player of live) {
      for (const dealer of [['10', '6', '10'], ['K', 'Q', '2'], ['9', '8', '7']] as const) {
        expect(verdict(player, dealer)).toEqual({ rung: 6, outcome: 'PLAYER_WIN', net: 100 });
      }
    }
    // A player natural is not one of those totals: it is decided two rungs
    // earlier and pays 3:2 whatever the dealer went on to do.
    expect(verdict(['A', 'K'], ['10', '6', '10'])).toEqual({
      rung: 3,
      outcome: 'BLACKJACK',
      net: 150,
    });
  });

  it('rungs 7 and 8: the comparison is strict in both directions', () => {
    expect(verdict(['10', '10'], ['10', '9'])).toEqual({
      rung: 7,
      outcome: 'PLAYER_WIN',
      net: 100,
    });
    expect(verdict(['10', '9'], ['10', '10'])).toEqual({
      rung: 8,
      outcome: 'DEALER_WIN',
      net: -100,
    });
    // One chip apart in either direction, and equal is neither.
    expect(verdict(['10', '10'], ['10', '10'])).toEqual({ rung: 9, outcome: 'PUSH', net: 0 });
  });
});

describe('B13: the result a caller is handed', () => {
  it('is frozen, so a settled hand cannot be edited after the fact', () => {
    const result = settle(
      {
        cards: hand(['A', 'K']),
        wager: 100,
        surrendered: false,
        origin: { fromSplit: false },
      },
      { cards: hand(['10', '7']) },
    );
    expect(Object.isFrozen(result)).toBe(true);
    const mutable = result as { net: number };
    expect(() => {
      mutable.net = 1_000_000;
    }).toThrow(TypeError);
    expect(result.net).toBe(150);
  });

  it('carries three fields and nothing else', () => {
    const result = settle(
      { cards: hand(['10', '6']), wager: 10, surrendered: true, origin: { fromSplit: false } },
      { cards: hand(['10', '7']) },
    );
    expect(Object.getOwnPropertyNames(result).sort()).toEqual(['net', 'outcome', 'rung']);
    expect(Object.getOwnPropertySymbols(result)).toEqual([]);
  });

  it('reads its arguments and writes nothing to them', () => {
    const playerCards = Object.freeze(hand(['10', '10', '2']));
    const dealerCards = Object.freeze(hand(['10', '7']));
    const player = Object.freeze({
      cards: playerCards,
      wager: 500,
      surrendered: false,
      origin: Object.freeze({ fromSplit: false }),
    });
    const dealer = Object.freeze({ cards: dealerCards });
    const first = settle(player, dealer);
    const second = settle(player, dealer);
    expect(first).toEqual(second);
    expect(first).toEqual({ rung: 5, outcome: 'DEALER_WIN', net: -500 });
    expect(playerCards).toHaveLength(3);
    expect(dealerCards).toHaveLength(2);
  });

  it('gives the same verdict whatever the suits are', () => {
    const wanted = { rung: 3, outcome: 'BLACKJACK', net: 150 };
    for (const playerSuit of SUIT_LABELS) {
      for (const dealerSuit of SUIT_LABELS) {
        const result = settle(
          {
            cards: [card('A', playerSuit), card('K', playerSuit)],
            wager: 100,
            surrendered: false,
            origin: { fromSplit: false },
          },
          { cards: [card('10', dealerSuit), card('7', dealerSuit)] },
        );
        expect({ rung: result.rung, outcome: result.outcome, net: result.net }).toEqual(wanted);
      }
    }
  });
});
