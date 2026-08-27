/**
 * SPEC 14's house-rule boundary, as the machine holds it. `BJ-20`.
 *
 *   "House-rule changes take effect at the start of the next round, never
 *    mid-round, and the coach's recommendations update with them."
 *
 * The first half is `table.setRules`'s whole contract, and this file drives it
 * against the real machine: a staged record changes nothing until a `deal`
 * accepts, applies at that deal and only there, and a deck-count change takes
 * a rebuilt shoe with it. The second half is the composition root's business,
 * graded in the browser where the panel is; what this file pins underneath it
 * is the property that makes that wiring honest, which is that the readout's
 * rule record is frozen per round and moves only at the boundary.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_RULES, type HouseRules } from '../../src/core/rules';
import { createRng } from '../../src/core/rng';
import { createTable } from '../../src/core/table';
import { DEFAULT_DECKS, createShoe } from '../../src/core/shoe';
import type { Card } from '../../src/core/cards';

/** A whole shoe's card count, which is the tell for a rebuilt one. */
function shoeSize(decks: number): number {
  return decks * 52;
}

/** Drive the machine to its player turn, standing nothing. */
function toPlayerTurn(seed: number): ReturnType<typeof createTable> {
  const table = createTable({ seed });
  table.apply({ kind: 'start' });
  table.apply({ kind: 'tapChip', chip: 50 });
  table.apply({ kind: 'deal' });
  for (let frame = 0; frame < 500; frame += 1) {
    const kind = table.readout().phase.kind;
    if (kind === 'playerTurn') {
      return table;
    }
    if (kind === 'roundResult') {
      throw new Error('the seed settled before the player acted');
    }
    if (kind === 'insurance') {
      table.apply({ kind: 'declineInsurance' });
      continue;
    }
    table.update(0.25);
  }
  throw new Error('the round never reached the player turn');
}

describe('SPEC 14: a staged rule record waits for the next round', () => {
  it('changes nothing until a deal accepts it', () => {
    const table = createTable({ seed: 7 });
    table.apply({ kind: 'start' });
    const before = table.readout().rules;

    const next: HouseRules = { ...DEFAULT_RULES, surrender: false };
    table.setRules(next);

    expect(table.stagedRules(), 'the stage is held, not applied').toBe(next);
    expect(table.readout().rules, 'the rules in force did not move').toBe(before);
    expect(table.readout().rules.surrender, 'surrender is still on in force').toBe(true);
  });

  it('applies at the deal, and a refused deal does not apply it', () => {
    const table = createTable({ seed: 7 });
    table.apply({ kind: 'start' });
    table.setRules({ ...DEFAULT_RULES, surrender: false });

    // A deal with no wager is refused below-minimum, and a refusal changes
    // nothing at all, which is the machine's oldest rule. The stage must
    // survive it: the player has not started a round yet.
    expect(table.apply({ kind: 'deal' }).ok).toBe(false);
    expect(table.readout().rules.surrender).toBe(true);
    expect(table.stagedRules(), 'the refused deal left the stage intact').not.toBeNull();

    table.apply({ kind: 'tapChip', chip: 50 });
    expect(table.apply({ kind: 'deal' }).ok).toBe(true);
    expect(table.readout().rules.surrender, 'the accepted deal applied the stage').toBe(false);
    expect(table.stagedRules(), 'the stage is spent once applied').toBeNull();
  });

  it('applies a stage made mid-round at the next round, not the current one', () => {
    const table = toPlayerTurn(11);
    table.setRules({ ...DEFAULT_RULES, surrender: false });

    // Mid-round: the stage is held through the whole rest of the round, which
    // is the clause "never mid-round" as a property of the machine rather than
    // of the panel that staged it.
    table.apply({ kind: 'stand' });
    for (let frame = 0; frame < 500; frame += 1) {
      const kind = table.readout().phase.kind;
      if (kind === 'roundResult') {
        break;
      }
      table.update(0.25);
    }
    expect(table.readout().phase.kind).toBe('roundResult');
    expect(table.readout().rules.surrender, 'the round finished under the old rules').toBe(true);
    expect(table.stagedRules(), 'and the stage is still held').not.toBeNull();

    table.apply({ kind: 'nextHand' });
    table.apply({ kind: 'tapChip', chip: 50 });
    table.apply({ kind: 'deal' });
    expect(table.readout().rules.surrender, 'the next round opened under the stage').toBe(false);
  });

  it('rebuilds the shoe when the deck count changes, at the deal and only then', () => {
    const otherDecks = DEFAULT_DECKS === 6 ? 8 : 6;
    const table = createTable({ seed: 7 });
    table.apply({ kind: 'start' });
    expect(table.readout().shoe.remaining).toBe(shoeSize(DEFAULT_DECKS));

    table.setRules({ ...DEFAULT_RULES, decks: otherDecks });
    expect(
      table.readout().shoe.remaining,
      'the 6-deck shoe is still the shoe before the boundary',
    ).toBe(shoeSize(DEFAULT_DECKS));

    table.apply({ kind: 'tapChip', chip: 50 });
    table.apply({ kind: 'deal' });
    expect(
      table.readout().shoe.remaining,
      'the rebuild happened at the deal itself, cards still queued',
    ).toBe(shoeSize(otherDecks));
    for (let frame = 0; frame < 500 && table.readout().phase.kind === 'dealing'; frame += 1) {
      table.update(0.25);
    }
    // SPEC 4.3 deals four cards: player, dealer up, player, dealer down.
    expect(table.readout().shoe.remaining).toBe(shoeSize(otherDecks) - 4);
  });

  it('rebuilds from the session stream: deterministic per seed, distinct across seeds', () => {
    // The BJ-20 review's pin, and the one line it protects is table.ts's
    // `shoe = createShoe(next.decks, seedStream)`: a rebuilt shoe must be a
    // continuation of the SESSION's randomness. Two halves, because each half
    // alone is satisfiable by a wrong build. Same seed, same staged program,
    // twice: identical card traces, which any fixed or clocked source would
    // also pass. Different seeds, same staged program: the post-rebuild round
    // must DIFFER, which a rebuild from any constant source fails, and that
    // is the arm the mutation ledger turns red.
    const otherDecks = DEFAULT_DECKS === 6 ? 8 : 6;
    const rebuiltRoundCards = (seed: number): string => {
      const table = createTable({ seed });
      table.apply({ kind: 'start' });
      table.setRules({ ...DEFAULT_RULES, decks: otherDecks });
      const trace: string[] = [];
      let round = 0;
      for (let frame = 0; frame < 2_000 && round < 2; frame += 1) {
        const readout = table.readout();
        const seen = [
          ...readout.hands.flatMap((hand) => hand.cards),
          ...readout.dealerVisible,
        ].map((card: Card) => `${card.rank}${card.suit}`);
        if (round === 1) {
          for (const name of seen.slice(trace.length)) {
            trace.push(name);
          }
        }
        const kind = readout.phase.kind;
        if (kind === 'betting') {
          table.apply({ kind: 'tapChip', chip: 10 });
          table.apply({ kind: 'deal' });
          if (round === 0) {
            // The first deal applied the stage; the round it opens is the
            // rebuilt shoe's first, and the one the trace records.
            round = 1;
          }
        } else if (kind === 'insurance') {
          table.apply({ kind: 'declineInsurance' });
        } else if (kind === 'playerTurn') {
          table.apply({ kind: 'stand' });
        } else if (kind === 'roundResult') {
          if (round === 1) {
            round = 2;
          }
        } else {
          table.update(0.25);
        }
      }
      expect(round, `seed ${seed} finished its rebuilt round`).toBe(2);
      expect(trace.length, `seed ${seed} recorded the rebuilt round`).toBeGreaterThanOrEqual(4);
      return trace.join(' ');
    };

    expect(rebuiltRoundCards(21), 'the same seed reproduces its rebuilt round').toBe(
      rebuiltRoundCards(21),
    );
    expect(
      rebuiltRoundCards(21),
      'two sessions do not share a rebuilt shoe: the stream is the session one',
    ).not.toBe(rebuiltRoundCards(22));
  });

  it('deals the default path exactly as the pre-staging construction did', () => {
    // The hoist that made the stream a table-lifetime binding must not have
    // moved a single draw: a default table's opening deal is draws one to
    // four of `createShoe(decks, createRng(seed))`, the construction the
    // machine inlined before `BJ-20`. `split()` bumps only the parent's split
    // index, so making the parent nameable changed nothing it handed out.
    const seed = 33;
    const reference = createShoe(DEFAULT_DECKS, createRng(seed));
    const expected = [
      reference.draw(),
      reference.draw(),
      reference.draw(),
      reference.draw(),
    ].map((card) => `${card.rank}${card.suit}`);

    const table = toPlayerTurn(seed);
    const readout = table.readout();
    const hand = readout.hands[0];
    expect(hand).toBeDefined();
    // SPEC 4.3's order: player, dealer up, player, dealer hole. The hole is
    // read after the reveal, where it joins the visible list beside the up
    // card.
    expect(`${hand?.cards[0]?.rank}${hand?.cards[0]?.suit}`).toBe(expected[0]);
    expect(
      `${readout.dealerVisible[0]?.rank}${readout.dealerVisible[0]?.suit}`,
    ).toBe(expected[1]);
    expect(`${hand?.cards[1]?.rank}${hand?.cards[1]?.suit}`).toBe(expected[2]);

    table.apply({ kind: 'stand' });
    for (let frame = 0; frame < 500 && table.readout().dealerVisible.length < 2; frame += 1) {
      table.update(0.25);
    }
    const revealed = table.readout().dealerVisible[1];
    expect(`${revealed?.rank}${revealed?.suit}`).toBe(expected[3]);
  });

  it('holds the four-term identity through the deal that applies a stage', () => {
    // SPEC 4.11's conserved quantity, at the exact boundary BJ-20 added: the
    // wallet commits the wager, then the stage applies and the shoe rebuilds,
    // and no term may move in between. The identity is read on both sides of
    // the accepted deal and on every frame of the round it opens.
    const otherDecks = DEFAULT_DECKS === 6 ? 8 : 6;
    const conserved = (table: ReturnType<typeof createTable>): number => {
      const wallet = table.readout().wallet;
      return wallet.chips + wallet.committed + wallet.insuranceStake - wallet.deferredStake;
    };

    const table = createTable({ seed: 5 });
    table.apply({ kind: 'start' });
    table.setRules({ ...DEFAULT_RULES, decks: otherDecks });
    table.apply({ kind: 'tapChip', chip: 100 });
    const before = conserved(table);
    expect(table.apply({ kind: 'deal' }).ok).toBe(true);
    expect(conserved(table), 'the applying deal moved no term').toBe(before);
    expect(table.readout().shoe.remaining, 'and it was the rebuilt shoe that dealt').toBeLessThanOrEqual(
      otherDecks * 52,
    );
    expect(table.readout().rules.decks).toBe(otherDecks);

    for (let frame = 0; frame < 500; frame += 1) {
      const kind = table.readout().phase.kind;
      if (kind === 'roundResult') {
        break;
      }
      if (kind === 'insurance') {
        table.apply({ kind: 'declineInsurance' });
      } else if (kind === 'playerTurn') {
        table.apply({ kind: 'stand' });
      } else {
        table.update(0.25);
      }
      // The identity moves only by a settled outcome, so it is read on every
      // frame up to the settlement and not on the frame that lands there.
      if (table.readout().phase.kind !== 'roundResult') {
        expect(conserved(table), `frame ${frame} held the identity`).toBe(before);
      }
    }
    expect(table.readout().phase.kind).toBe('roundResult');
  });

  it('leaves the shoe alone when the deck count did not change', () => {
    const table = createTable({ seed: 7 });
    table.apply({ kind: 'start' });
    const before = table.readout().shoe;

    table.setRules({ ...DEFAULT_RULES, doubleAfterSplit: false });
    table.apply({ kind: 'tapChip', chip: 50 });
    table.apply({ kind: 'deal' });
    for (let frame = 0; frame < 500 && table.readout().phase.kind === 'dealing'; frame += 1) {
      table.update(0.25);
    }

    // The same shoe carried on: four cards fewer, and deeper into its own run
    // than the reading before the deal. A rebuilt shoe would be full again.
    expect(table.readout().shoe.remaining).toBe(shoeSize(DEFAULT_DECKS) - 4);
    expect(table.readout().shoe.penetration).toBeGreaterThan(before.penetration);
  });
});
