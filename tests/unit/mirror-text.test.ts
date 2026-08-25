/**
 * The sentences the mirror is built from. Armour under items `G4` and `G6`,
 * built at `BJ-18`.
 *
 * The mirror itself is DOM and is graded in the browser by
 * `tests/browser/screen-reader.spec.ts`, over the built `dist/`. What is here is
 * the part of it that is a pure function of the machine's state, which is the
 * part QUALITY-BAR section 4 writes down as a template:
 *
 *   "a list of hands, each with an accessible name like 'Hand 2 of 3, active,
 *    soft 16, wager 100'"
 *
 * That example is asserted **character for character** rather than by shape. A
 * test that checked for the four fields in some order would pass for a name no
 * screen reader user could parse, and the section gave a literal example
 * precisely so that it could be reproduced literally.
 *
 * The two exhaustive sweeps below are the other half. Every rank and suit is
 * required to read as a word, because QUALITY-BAR section 4 permits a card's
 * rank and suit to live on canvas only on the condition that they "appear in the
 * mirror as words"; and every one of SPEC 10's eleven phases is required to
 * produce a sentence and a title, because a mirror that went quiet during the
 * five timed phases would be a mirror of some of the state.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { RANKS, SUITS, card } from '../../src/core/cards';
import { handValue } from '../../src/core/hand';
import { DEFAULT_RULES } from '../../src/core/rules';
import { createTable, type Table } from '../../src/core/table';
import type { HandInPlay, Phase } from '../../src/core/types';
import { createWallet } from '../../src/core/wallet';
import { screenAvailability, unavailableNow } from '../../src/ui/availability';
import {
  cardText,
  dealerMirrorText,
  documentTitle,
  handMirrorName,
  handStateText,
  handValueText,
  houseRulesText,
  milestoneRowText,
  offerText,
  phaseText,
  rankText,
  screenTitle,
  suitText,
  unavailableText,
} from '../../src/ui/text';

import { scriptedShoe } from './support/stacked-shoe';

/** SPEC 10's eleven phases, as values, so the sweeps below are exhaustive. */
const EVERY_PHASE: readonly Phase[] = Object.freeze([
  { kind: 'start' },
  { kind: 'betting' },
  { kind: 'dealing', queue: [] },
  { kind: 'peek' },
  { kind: 'insurance', offer: { stake: 50, evenMoney: false } },
  { kind: 'playerTurn', activeHand: 0 },
  { kind: 'reveal' },
  { kind: 'dealerTurn' },
  { kind: 'settling' },
  {
    kind: 'roundResult',
    result: { hands: [], insurance: null, chips: 1000, actions: [] },
  },
  { kind: 'bustOut' },
]);

/** One hand, written out, so the template below is asserted against a value. */
function hand(overrides: Partial<HandInPlay> = {}): HandInPlay {
  return {
    cards: [card('A', 'spades'), card('5', 'hearts')],
    wager: 100,
    state: 'live',
    fromSplit: false,
    fromSplitAces: false,
    walletHand: 0,
    ...overrides,
  };
}

describe('G4: QUALITY-BAR section 4 naming template, exactly as the section writes it', () => {
  it('reproduces the section own example, character for character', () => {
    const name = handMirrorName(
      hand({ wager: 100 }),
      { index: 1, of: 3, active: true },
      { total: 16, soft: true },
    );
    expect(name).toBe('Hand 2 of 3, active, soft 16, wager 100');
  });

  it('names a hard hand with the word the soft example implies', () => {
    expect(handMirrorName(hand(), { index: 0, of: 1, active: true }, { total: 16, soft: false })).toBe(
      'Hand 1 of 1, active, hard 16, wager 100',
    );
  });

  it('names the state when the hand is not the one being asked about', () => {
    expect(
      handMirrorName(hand({ state: 'bust' }), { index: 0, of: 2, active: false }, { total: 23, soft: false }),
    ).toBe('Hand 1 of 2, bust, hard 23, wager 100');
  });

  it('keeps the four fields when a hand holds no cards yet', () => {
    expect(handMirrorName(hand({ cards: [] }), { index: 0, of: 1, active: false }, null)).toBe(
      'Hand 1 of 1, waiting, no cards, wager 100',
    );
  });

  it('gives every hand state a word of its own', () => {
    const words = (['live', 'stood', 'bust', 'doubled', 'surrendered', 'blackjack'] as const).map(
      (state) => handStateText(state),
    );
    expect(new Set(words).size, `two states share a word: ${words.join(', ')}`).toBe(words.length);
    // And none of them is "active", which is a fact about the round rather than
    // about a hand and is supplied by the template's caller.
    expect(words).not.toContain('active');
  });

  it('reads a value the way SPEC 4.2 names one', () => {
    expect(handValueText(handValue([card('A', 'spades'), card('5', 'hearts')]))).toBe('soft 16');
    expect(handValueText(handValue([card('10', 'spades'), card('6', 'hearts')]))).toBe('hard 16');
  });
});

describe('G4: every card is a word, and no rank reaches the mirror as a glyph', () => {
  it('names all 52 combinations without printing a rank symbol', () => {
    const names: string[] = [];
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        const text = cardText(card(rank, suit));
        names.push(text);
        expect(text, `${rank}${suit} kept a glyph`).not.toMatch(/\b(?:A|J|Q|K|10)\b/);
        expect(text).toBe(`${rankText(rank)} of ${suitText(suit)}`);
      }
    }
    expect(new Set(names).size, 'two cards share a name').toBe(RANKS.length * SUITS.length);
  });

  it('spells the four ranks a glyph would hide', () => {
    expect(rankText('A')).toBe('Ace');
    expect(rankText('10')).toBe('Ten');
    expect(rankText('J')).toBe('Jack');
    expect(rankText('K')).toBe('King');
  });

  it('states the dealer hand the way SPEC 11 reads it, hole card included', () => {
    const up = [card('10', 'clubs')];
    expect(dealerMirrorText(up, 1, handValue(up))).toBe('Dealer showing hard 10, 1 face down.');
    const both = [card('10', 'clubs'), card('7', 'hearts')];
    expect(dealerMirrorText(both, 0, handValue(both))).toBe('Dealer showing hard 17.');
    expect(dealerMirrorText([], 0, null)).toBe('Dealer has no cards.');
  });
});

describe('G6: every screen has a sentence and a title', () => {
  it('covers all eleven of SPEC 10 phases with a distinct sentence', () => {
    const sentences = EVERY_PHASE.map((phase) => phaseText(phase, 1));
    expect(sentences).toHaveLength(11);
    for (const sentence of sentences) {
      expect(sentence.length, 'a phase produced no sentence').toBeGreaterThan(0);
      expect(sentence.endsWith('.'), `${sentence} is not a sentence`).toBe(true);
    }
    expect(new Set(sentences).size, 'two phases share a sentence').toBe(11);
  });

  it('names the active hand once a split has made the question ambiguous', () => {
    expect(phaseText({ kind: 'playerTurn', activeHand: 1 }, 3)).toBe('Your turn on hand 2 of 3.');
    expect(phaseText({ kind: 'playerTurn', activeHand: 0 }, 1)).toBe('Your turn.');
  });

  it('tells even money from insurance, on both surfaces', () => {
    expect(screenTitle({ kind: 'insurance', offer: { stake: 50, evenMoney: true } })).toBe('Even money');
    expect(screenTitle({ kind: 'insurance', offer: { stake: 50, evenMoney: false } })).toBe('Insurance');
    expect(offerText({ stake: 50, evenMoney: true })).toContain('Even money');
    expect(offerText({ stake: 50, evenMoney: false })).toContain('2 to 1');
  });

  it('gives every phase a distinct document title that names the game last', () => {
    const titles = EVERY_PHASE.map((phase) => documentTitle(phase));
    expect(new Set(titles).size, 'two phases share a title').toBe(11);
    for (const title of titles) {
      expect(title.endsWith(' - Blackjack'), `${title} does not name the game`).toBe(true);
      // The state comes first, because that is the half a tab strip keeps.
      expect(title.startsWith('Blackjack'), `${title} leads with the game`).toBe(false);
    }
  });

  it('states the house rules as text, which QUALITY-BAR section 4 requires', () => {
    const text = houseRulesText(DEFAULT_RULES);
    for (const clause of ['decks', 'stands on all 17s', '3 to 2', '2 to 1', 'Surrender']) {
      expect(text, `${clause} missing from the house rules sentence`).toContain(clause);
    }
  });
});

describe('G3: a state carried by colour is carried by words as well', () => {
  it('says whether a milestone has been awarded', () => {
    expect(milestoneRowText('firstNatural', true)).toBe('First natural: awarded');
    expect(milestoneRowText('firstNatural', false)).toBe('First natural: not yet');
  });
});

describe('G4: the reason a control is greyed is one reading, rendered twice', () => {
  /** A machine at SPEC 10's player turn, on a hand that cannot do much. */
  function atPlayerTurn(): Table {
    const table = createTable({
      wallet: createWallet(),
      table: 'bronze',
      rules: {},
      seed: 1,
      // A three-card hand: not a pair, not two cards, so Double, Split and
      // Surrender are all refused for three different reasons.
      shoe: scriptedShoe(['5', '10', '4', '10', '3']),
    });
    for (let turn = 0; turn < 200; turn += 1) {
      const { phase, wallet } = table.readout();
      if (phase.kind === 'playerTurn' && (table.readout().hands[0]?.cards.length ?? 0) >= 3) {
        return table;
      }
      if (phase.kind === 'start') {
        table.apply({ kind: 'start' });
      } else if (phase.kind === 'betting') {
        table.apply(wallet.wager === 0 ? { kind: 'tapChip', chip: 50 } : { kind: 'deal' });
      } else if (phase.kind === 'playerTurn') {
        table.apply({ kind: 'hit' });
      } else {
        table.update(0.25);
      }
    }
    throw new Error('the drive never reached a three-card player turn');
  }

  it('lists SPEC 4.5 five actions on the player turn, and only the greyed ones as reasons', () => {
    const readout = atPlayerTurn().readout();
    const controls = screenAvailability(readout);
    expect(controls.map((control) => control.key)).toEqual([
      'hit',
      'stand',
      'double',
      'split',
      'surrender',
    ]);
    // The exact pairing, not the count: the mirror is only useful if it says
    // which rule refused which control, and each of these is a different
    // sentence of SPEC 4.5, 4.6 and 4.8 answering about the same three cards.
    // `splitRefusal` asks about the pair before the card count, so a three-card
    // hand is refused a split for not being a pair rather than for its length,
    // which is the reason a player can act on.
    expect(unavailableNow(readout).map((entry) => `${entry.label}: ${entry.refusal}`)).toEqual([
      'Double: not-two-cards',
      'Split: not-a-pair',
      'Surrender: not-two-cards',
    ]);
  });

  it('states each one as a label and a sentence', () => {
    expect(unavailableText('Double', 'not-two-cards')).toBe(
      'Double: Only on a hand of exactly two cards.',
    );
  });

  it('offers no control at all on the five timed phases', () => {
    const table = createTable({
      wallet: createWallet(),
      table: 'bronze',
      rules: {},
      seed: 1,
      shoe: scriptedShoe(['5', '10', '4', '10', '3']),
    });
    table.apply({ kind: 'start' });
    table.apply({ kind: 'tapChip', chip: 50 });
    table.apply({ kind: 'deal' });
    expect(table.readout().phase.kind).toBe('dealing');
    expect(screenAvailability(table.readout())).toEqual([]);
  });
});
