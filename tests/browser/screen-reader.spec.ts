/**
 * Armour under item `G4`, Critical, 28 points, method **D**, evidence
 * `demo/screen-reader`. Built at `BJ-18`.
 *
 *   "A persistent visually hidden mirror represents the full play state with
 *    real semantics, a polite live region carries incremental change and an
 *    assertive region carries outcomes, such that a screen reader user completes
 *    a full session unaided: place a wager, take an insurance decision, split a
 *    pair, play every hand, reach a round result, and bust out."
 *
 * **`G4` is a Demonstration item and this file does not close it.** What closes
 * it is a scripted screen reader walkthrough at the ACCEPTANCE section 4
 * session, captured to `artifacts/demos/screen-reader`, and that capture is
 * `BJ-23`'s. No test can stand in for it: whether a name is *comprehensible* to
 * a person driving a screen reader is not a property a browser can report. This
 * file is the armour under the behaviour, and it takes the treatment `E3`, `E4`,
 * `E5`, `E6` and `F4` already have: the mechanism is built and exercised now, on
 * the shipped bundle, so that the session is a demonstration rather than a first
 * attempt.
 *
 * **The one thing this file does grade outright is that the two mechanisms are
 * two.** QUALITY-BAR section 4 is explicit that a live region "cannot be
 * navigated, re-read or queried, so it does not satisfy 1.1.1, 1.3.1 or 4.1.2 on
 * its own", and the failure the item exists for is a part that builds one and
 * claims both. So the mirror is required to carry no `aria-live` anywhere, the
 * regions are required to carry no play state, and the mirror is required to
 * still hold the whole state on a frame where nothing is being announced.
 *
 * **Route.** The full session takes the seeded harness, because the criterion
 * names a split and a bust-out and both are deals rather than screens; the
 * structural assertions run on the **shipped page** with nothing injected, which
 * is where the mirror a player receives actually is.
 */

import { expect, test, type Page } from '@playwright/test';

import { BUST_OUT_WAGER, SPLIT_WAGER, bustOutSeed, splitSeed } from './support/action-seeds';
import {
  accessibilityProbe,
  atShippedBetting,
  bootGame,
  control,
  openShippedPage,
  pressOn,
  readout,
  settle,
  shell,
  waitForPhase,
  PHASE_TIMEOUT,
} from './support/game';
import { peekSeed } from './support/peek-seeds';
import { reasonText } from '../../src/ui/text';

/** QUALITY-BAR section 4's floor between polite writes, in milliseconds. */
const POLITE_INTERVAL_MS = 500;

/** The mirror, as one round trip reads it. */
interface MirrorReport {
  readonly present: boolean;
  readonly label: string;
  /** Whether the subtree carries any `aria-live` at all. It must not. */
  readonly announces: boolean;
  readonly hidden: boolean;
  readonly clipped: boolean;
  readonly box: { readonly width: number; readonly height: number };
  readonly phase: string;
  readonly dealerSummary: string;
  readonly dealerCards: readonly string[];
  readonly hands: readonly { readonly name: string; readonly cards: readonly string[] }[];
  readonly wallet: string;
  readonly table: string;
  readonly rules: string;
  readonly offer: string;
  readonly unavailable: readonly string[];
  /** Every element in the subtree, by tag, so the semantics can be asserted. */
  readonly tags: readonly string[];
}

async function mirror(page: Page): Promise<MirrorReport> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-mirror="root"]');
    if (root === null) {
      throw new Error('there is no mirror on this page');
    }
    const text = (selector: string): string =>
      root.querySelector(selector)?.textContent?.trim() ?? '';
    const items = (node: Element | null): string[] =>
      node === null ? [] : [...node.querySelectorAll(':scope > li')].map((li) => li.textContent?.trim() ?? '');
    const style = getComputedStyle(root);
    const box = root.getBoundingClientRect();
    return {
      present: true,
      label: root.getAttribute('aria-label') ?? '',
      announces: root.querySelector('[aria-live]') !== null || root.hasAttribute('aria-live'),
      hidden:
        root.getAttribute('aria-hidden') === 'true' ||
        style.display === 'none' ||
        style.visibility === 'hidden',
      clipped: style.clipPath !== 'none',
      box: { width: box.width, height: box.height },
      phase: text('[data-mirror="phase"]'),
      dealerSummary: text('[data-mirror="dealer-summary"]'),
      dealerCards: items(root.querySelector('[data-mirror="dealer-cards"]')),
      hands: [...root.querySelectorAll('[data-mirror-hand]')].map((group) => ({
        name: group.getAttribute('aria-label') ?? '',
        cards: items(group.querySelector('ul')),
      })),
      wallet: text('[data-mirror="wallet"]'),
      table: text('[data-mirror="table"]'),
      rules: text('[data-mirror="rules"]'),
      offer: text('[data-mirror="offer"]'),
      unavailable: items(root.querySelector('[data-mirror="unavailable"]')),
      tags: [...root.querySelectorAll('*')].map((node) => node.tagName.toLowerCase()),
    };
  });
}

/** The two live regions, as the page has them right now. */
interface RegionReport {
  readonly polite: { readonly live: string; readonly atomic: string; readonly text: string };
  readonly assertive: { readonly live: string; readonly atomic: string; readonly text: string };
  readonly count: number;
}

async function regions(page: Page): Promise<RegionReport> {
  return page.evaluate(() => {
    const read = (name: string): { live: string; atomic: string; text: string } => {
      const node = document.querySelector(`[data-live="${name}"]`);
      if (node === null) {
        throw new Error(`there is no ${name} region on this page`);
      }
      return {
        live: node.getAttribute('aria-live') ?? '',
        atomic: node.getAttribute('aria-atomic') ?? '',
        text: node.textContent?.trim() ?? '',
      };
    };
    return {
      polite: read('polite'),
      assertive: read('assertive'),
      // Every live region in the whole page, however it is declared. There must
      // be exactly the two: QUALITY-BAR section 4 specifies one queue, and a
      // third region would be a second writer with no interval between them.
      count: document.querySelectorAll('[aria-live], [role="status"], [role="alert"]').length,
    };
  });
}

/** Watch one region and record the wall-clock time of every write to it. */
async function watchRegion(page: Page, name: string): Promise<void> {
  await page.evaluate((region: string) => {
    const node = document.querySelector(`[data-live="${region}"]`);
    if (node === null) {
      throw new Error(`there is no ${region} region on this page`);
    }
    const log: { at: number; text: string }[] = [];
    new MutationObserver(() => {
      log.push({ at: performance.now(), text: node.textContent ?? '' });
    }).observe(node, { childList: true, characterData: true, subtree: true });
    (window as unknown as { __bjLive?: { at: number; text: string }[] }).__bjLive = log;
  }, name);
}

async function regionWrites(page: Page): Promise<readonly { at: number; text: string }[]> {
  return page.evaluate(
    () => (window as unknown as { __bjLive?: { at: number; text: string }[] }).__bjLive ?? [],
  );
}

// ---------------------------------------------------------------------------
// The two mechanisms are two
// ---------------------------------------------------------------------------

test.describe('G4: the mirror is a representation, not an announcement', () => {
  test('is in the accessibility tree, out of the picture, and never announces', async ({ page }) => {
    await openShippedPage(page);
    const report = await mirror(page);

    expect(report.present, 'the shipped page carries no mirror').toBe(true);
    expect(report.label).toBe('Play state');
    // In the tree: not `display: none`, not `visibility: hidden`, not
    // `aria-hidden`. Any of the three would make this a mirror of nothing.
    expect(report.hidden, 'the mirror is hidden from assistive technology').toBe(false);
    // Out of the picture: a clipped one-pixel box.
    expect(report.clipped, 'the mirror is not clipped and would be visible').toBe(true);
    expect(report.box.width).toBeLessThanOrEqual(1);
    expect(report.box.height).toBeLessThanOrEqual(1);
    // And it is not a live region, anywhere inside it. This is the assertion the
    // trap in the brief is about: a mirror that announced would be the two
    // mechanisms collapsed into one, and would satisfy neither properly.
    expect(report.announces, 'the mirror carries aria-live and is pretending to be a region').toBe(
      false,
    );
  });

  test('carries real semantics: an ordered list of hands, each with a nested card list', async ({
    page,
  }) => {
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator(`[data-chip="${String(SPLIT_WAGER)}"]`).click();
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'playerTurn');

    const report = await mirror(page);
    // The hands are a real ordered list with real list items, not a paragraph
    // of sentences: QUALITY-BAR section 4 asks for "a list of hands ...
    // containing a nested list of cards", and a screen reader's list navigation
    // is the whole point of asking for one.
    expect(report.tags).toContain('ol');
    expect(report.tags).toContain('ul');
    expect(report.tags).toContain('li');
    expect(report.hands).toHaveLength(1);
    expect(report.hands[0]?.cards).toHaveLength(2);
    for (const card of report.hands[0]?.cards ?? []) {
      // Words, never glyphs. The canvas may draw `A` and a pip; the mirror says
      // "Ace of spades", which is the condition section 4 attaches to letting
      // rank and suit live on the canvas at all.
      expect(card, `${card} is not a card named in words`).toMatch(
        /^(?:Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Jack|Queen|King) of (?:clubs|diamonds|hearts|spades)$/,
      );
    }
  });

  test('names each hand with QUALITY-BAR section 4 template', async ({ page }) => {
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator(`[data-chip="${String(SPLIT_WAGER)}"]`).click();
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'playerTurn');

    const name = (await mirror(page)).hands[0]?.name ?? '';
    // "Hand 2 of 3, active, soft 16, wager 100": four fields, in that order,
    // comma separated, and **nothing after them**. The exact sentence is
    // asserted against the machine below and character for character in
    // `tests/unit/mirror-text.test.ts`; this is the shape, on the page a player
    // receives.
    //
    // Every alternation is grouped and both ends are anchored, which is not
    // pedantry: an earlier form of this pattern left the value alternation
    // ungrouped, so the top-level `|` split the whole expression and
    // "Hand 1 of 1, active, hard 12, TOTAL RUBBISH" matched the left branch with
    // nothing holding its end. A shape check that accepts anything after the
    // fields is not a shape check.
    expect(name).toMatch(
      /^Hand \d+ of \d+, (?:active|waiting|standing|bust|doubled|surrendered|blackjack), (?:(?:soft|hard) \d+|no cards), wager [\d,]+$/,
    );
    const snapshot = await readout(page);
    expect(name).toContain(`wager ${String(snapshot.hands[0]?.wager ?? 0)}`);
    expect(name).toContain('active');
  });

  test('holds the whole play state, none of which is in the regions', async ({ page }) => {
    // The distinction the criterion rests on, in both directions. The mirror
    // holds the state, and the regions do not hold any of it: a player who
    // arrived late, or who moved away and came back, loses nothing by reading
    // the mirror, and a player who hears an announcement is not being read the
    // page.
    await atShippedBetting(page);
    const report = await mirror(page);
    expect(report.phase).toContain('Betting');
    expect(report.wallet).toContain('Chips');
    expect(report.table).toContain('Bronze');
    expect(report.rules).toContain('decks');

    // The regions carry at most the sentence about the screen having changed,
    // and none of the state above. An implementation that wrote the mirror's
    // content into a live region, which is the failure item `G4` exists for,
    // would put the wallet and the table in here and fail this.
    const both = await regions(page);
    const spoken = `${both.polite.text} ${both.assertive.text}`;
    for (const held of [report.wallet, report.table, report.rules]) {
      expect(held.length, 'the mirror holds nothing to compare against').toBeGreaterThan(0);
      expect(spoken, `a region is repeating the mirror: ${held}`).not.toContain(held);
    }
  });
});

test.describe('G4: the regions are an event channel, and there are exactly two', () => {
  test('exist from the first frame, empty, with the polarity the section specifies', async ({
    page,
  }) => {
    await openShippedPage(page);
    const both = await regions(page);
    expect(both.polite.live).toBe('polite');
    expect(both.assertive.live).toBe('assertive');
    expect(both.polite.atomic).toBe('true');
    expect(both.assertive.atomic).toBe('true');
    // Empty on arrival. QUALITY-BAR section 4's "both region elements exist in
    // the initial HTML and only their text changes": a region that arrives with
    // its text already in it is announced by nothing, so the first frame of a
    // session deliberately says nothing at all and the mirror carries the
    // opening state instead.
    expect(both.polite.text).toBe('');
    expect(both.assertive.text).toBe('');
  });

  test('is the only pair of live regions in the whole page', async ({ page }) => {
    await atShippedBetting(page);
    // One queue means one pair of regions. The refusal notice carried
    // `role="status"` before `BJ-18` and was a third region with no interval
    // behind it; it is a plain paragraph now and the queue announces refusals.
    expect((await regions(page)).count).toBe(2);
    await expect(page.locator('[data-notice="reason"]')).not.toHaveAttribute('role', 'status');
  });

  test('never writes the same region twice inside QUALITY-BAR section 4 interval', async ({
    page,
  }) => {
    // The four-card deal, measured on the real page rather than in the unit
    // harness: SPEC 5 deals at 0.22 s and the floor is 500 ms, so an unqueued
    // writer would produce writes 220 ms apart here.
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await watchRegion(page, 'polite');
    await control(page, 'max').click();
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'insurance');
    await control(page, 'decline-insurance').click();
    await waitForPhase(page, 'playerTurn');
    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await waitForPhase(page, 'roundResult');

    const writes = await regionWrites(page);
    expect(writes.length, 'the polite region was never written during a whole round').toBeGreaterThan(
      1,
    );
    for (let index = 1; index < writes.length; index += 1) {
      const gap = (writes[index]?.at ?? 0) - (writes[index - 1]?.at ?? 0);
      expect(
        gap,
        `two polite writes ${String(Math.round(gap))} ms apart: ${String(writes[index - 1]?.text)} then ${String(writes[index]?.text)}`,
        // One frame of tolerance at 60 fps, for the same reason the unit test
        // allows one: the queue writes on the first frame at or after the floor.
      ).toBeGreaterThan(POLITE_INTERVAL_MS - 20);
    }
  });

  test('carries the round outcome in the assertive region, and nothing else there', async ({
    page,
  }) => {
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await watchRegion(page, 'assertive');
    await control(page, 'max').click();
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'insurance');
    await control(page, 'decline-insurance').click();
    await waitForPhase(page, 'playerTurn');
    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await waitForPhase(page, 'roundResult');

    await expect
      .poll(async () => (await regions(page)).assertive.text, { timeout: PHASE_TIMEOUT })
      .toContain('Round result.');
    const spoken = (await regions(page)).assertive.text;
    expect(spoken).toContain('Balance');
    // The whole round produced exactly one assertive write. The region is
    // "reserved for round and match outcomes", and a region that also carried
    // incremental change would interrupt a player mid-sentence on every card.
    const writes = await regionWrites(page);
    expect(writes.map((write) => write.text).filter((text) => text.length > 0)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The session the criterion names, start to finish
// ---------------------------------------------------------------------------

test.describe('G4: a full session, read off the mirror at every step', () => {
  test('places a wager, takes an insurance decision, and reads both from the mirror', async ({
    page,
  }) => {
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    expect((await mirror(page)).phase).toContain('Choose a table');

    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    expect((await mirror(page)).phase).toContain('Betting');

    // Place a wager. The mirror states it, and states the table's limits, which
    // QUALITY-BAR section 4 requires as real DOM text somewhere reachable.
    await page.locator('[data-chip="100"]').click();
    await expect
      .poll(async () => (await mirror(page)).wallet)
      .toContain('Wager 100');
    expect((await mirror(page)).table).toMatch(/Minimum [\d,]+, maximum [\d,]+\./);

    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'insurance');

    // The decision being asked for is in the mirror, with its stake.
    const offered = await mirror(page);
    expect(offered.phase).toContain('Take it or decline it');
    expect(offered.offer).toMatch(/stake of [\d,]+/);
    // And the dealer's up card is named while the hole card is not.
    expect(offered.dealerCards.filter((card) => card === 'One card face down')).toHaveLength(1);

    await control(page, 'decline-insurance').click();
    await waitForPhase(page, 'playerTurn');
    expect((await mirror(page)).offer).toBe('');
  });

  test('splits a pair, plays every hand, and reaches the round result', async ({ page }) => {
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator(`[data-chip="${String(SPLIT_WAGER)}"]`).click();
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'playerTurn');

    const before = await mirror(page);
    expect(before.hands).toHaveLength(1);
    // Split is available, so it is not in the list of controls the mirror says
    // are unavailable. The list is the `BJ-15` review's `MIN-4`, answered.
    expect(before.unavailable.some((entry) => entry.startsWith('Split:'))).toBe(false);

    await pressOn(page, '[data-action="split"]', 'playerTurn');
    await expect.poll(async () => (await mirror(page)).hands.length, { timeout: PHASE_TIMEOUT }).toBe(2);

    const split = await mirror(page);
    expect(split.hands[0]?.name).toContain('Hand 1 of 2');
    expect(split.hands[1]?.name).toContain('Hand 2 of 2');
    // Exactly one hand is the one being asked about, which is the whole reason
    // the template carries a state field.
    expect(split.hands.filter((entry) => entry.name.includes('active'))).toHaveLength(1);
    expect(split.phase).toContain('hand 1 of 2');

    // Play both hands out. The mirror follows the machine from hand to hand.
    //
    // The reading is polled rather than read, and it is one string rather than
    // two, for the reason `input-parity.spec.ts` gives about `waitForHands`: a
    // press is queued and drained on the next frame, and a split hand is dealt a
    // card in between, so a spec that read the phase and the mirror in two round
    // trips could straddle the move and compare two different rounds.
    const whoseTurn = async (): Promise<string> => {
      const phase = (await shell(page).getAttribute('data-phase')) ?? '';
      if (phase !== 'playerTurn') {
        return `phase:${phase}`;
      }
      const report = await mirror(page);
      return `active:${String(report.hands.findIndex((entry) => entry.name.includes('active')))}`;
    };
    expect(await whoseTurn()).toBe('active:0');
    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await expect.poll(whoseTurn, { timeout: PHASE_TIMEOUT }).not.toBe('active:0');

    if ((await whoseTurn()) === 'active:1') {
      const second = await mirror(page);
      expect(second.hands[1]?.name).toContain('active');
      expect(second.hands[0]?.name).not.toContain('active');
      // The hand that has been played is named by its state rather than by the
      // word the active hand carries, which is the field a screen reader user
      // reads to know which of the two the machine is asking about.
      expect(second.hands[0]?.name).toMatch(/, (?:standing|bust|doubled|blackjack),/);
      await pressOn(page, '[data-action="stand"]', 'playerTurn');
    }

    await waitForPhase(page, 'roundResult');
    const settled = await mirror(page);
    // The cards are still on the felt at the round result, so the mirror is
    // still a mirror of it, with every hand's own value named. A split's hand
    // values exist nowhere else as text: SPEC 11's readout goes blank for a
    // settled split on purpose, because it cannot pick one.
    expect(settled.hands).toHaveLength(2);
    for (const entry of settled.hands) {
      expect(entry.name, `${entry.name} carries no value`).toMatch(/(?:soft|hard) \d+/);
      expect(entry.cards.length).toBeGreaterThanOrEqual(2);
    }
    expect(settled.phase).toContain('Round result');
  });

  test('busts out, and says so in the mirror and in the assertive region', async ({ page }) => {
    await bootGame(page, { seed: bustOutSeed(), bestBalance: 10_000, table: 'gold' });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    for (const chip of [500, 100, 100, 100, 100, 50]) {
      await page.locator(`[data-chip="${String(chip)}"]`).click();
    }
    await expect.poll(async () => (await mirror(page)).wallet).toContain(String(BUST_OUT_WAGER));
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'playerTurn');
    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await waitForPhase(page, 'roundResult');
    await pressOn(page, '[data-control="next-hand"]', 'roundResult');
    await waitForPhase(page, 'bustOut');

    expect((await mirror(page)).phase).toContain('Out at this table');
    await expect
      .poll(async () => (await regions(page)).assertive.text, { timeout: PHASE_TIMEOUT })
      .toContain('Out at this table.');
  });
});

// ---------------------------------------------------------------------------
// Armour under item `G6`, which is an Inspection item graded by
// docs/review-checklists/semantics.md
// ---------------------------------------------------------------------------

test.describe('G6 armour: the document says what it is', () => {
  test('sets lang, exposes one h1 and uses native landmarks', async ({ page }) => {
    await openShippedPage(page);
    const document_ = await page.evaluate(() => ({
      lang: window.document.documentElement.lang,
      headings: window.document.querySelectorAll('h1').length,
      heading: window.document.querySelector('h1')?.textContent ?? '',
      landmarks: [...window.document.querySelectorAll('header, main, footer, nav')].map(
        (node) => node.tagName.toLowerCase(),
      ),
      roles: [...window.document.querySelectorAll('[role]')].map(
        (node) => node.getAttribute('role') ?? '',
      ),
      canvasHidden: window.document.querySelector('canvas')?.getAttribute('aria-hidden'),
    }));

    expect(document_.lang.length, 'the document declares no language').toBeGreaterThan(1);
    expect(document_.headings, 'the page has more or fewer than one h1').toBe(1);
    expect(document_.heading).toBe('Blackjack');
    // Native elements, one of each, rather than a `role` sprayed on a `div`.
    expect(document_.landmarks.sort()).toEqual(['footer', 'header', 'main', 'nav']);
    // The only roles in the chrome are the two that have no native element.
    expect([...new Set(document_.roles)].sort()).toEqual(['dialog', 'group']);
    // The canvas stays out of the accessibility tree, which is only defensible
    // because the mirror is in the same landmark carrying the same state.
    expect(document_.canvasHidden).toBe('true');
  });

  test('reflects the current state in the page title', async ({ page }) => {
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    const onStart = await page.title();
    expect(onStart, 'the title does not name the game').toContain('Blackjack');
    expect(onStart, 'the title does not name the screen').not.toBe('Blackjack');

    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await expect
      .poll(async () => page.title(), { timeout: PHASE_TIMEOUT })
      .not.toBe(onStart);
    const onBetting = await page.title();
    expect(onBetting).toContain('Blackjack');

    // An overlay is not a state of the game. SPEC 10 calls the three "reachable
    // at any time and never blocking state", and item `C5` grades that opening
    // one changes nothing in the machine; the title follows the machine.
    await page.locator('[data-open-overlay="statistics"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await settle(page);
    expect(await page.title()).toBe(onBetting);
  });
});

// ---------------------------------------------------------------------------
// The refusal reason, and the sync step's cost
// ---------------------------------------------------------------------------

test.describe('G4: every refusal reason is reachable without a pointer', () => {
  test('lists each greyed control and its reason in the mirror', async ({ page }) => {
    await atShippedBetting(page);
    await control(page, 'max').click();
    await settle(page);
    // At Bronze with a maximum wager on the board, the chips whose denomination
    // alone exceeds the ceiling are greyed. The mirror says which and why.
    const listed = (await mirror(page)).unavailable;
    expect(listed.length, 'no chip is greyed at the table maximum').toBeGreaterThan(0);
    for (const entry of listed) {
      expect(entry, `${entry} is not a label and a sentence`).toMatch(/^.+: .+\.$/);
    }
  });

  test('says which of SPEC 6 two entry conditions greyed a table', async ({ page }) => {
    // `BJ-21`'s rider on the chooser. The machine answers a refused
    // `chooseTable` with one `table-locked` whichever condition failed; the
    // start screen derives which, and the mirror is where a player who cannot
    // hover reads it. A fresh account holds 1,000 chips and has never been
    // above it, so Silver and Gold are both greyed for the unlock and neither
    // is greyed for the money: the sentence has to be the unlock one.
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    await settle(page);

    const listed = (await mirror(page)).unavailable;
    expect(listed.length, 'no table is greyed on a fresh account').toBe(2);
    for (const entry of listed) {
      expect(entry, `${entry} is not a label and a sentence`).toMatch(/^.+: .+\.$/);
      expect(entry.endsWith(reasonText('table-not-unlocked')), entry).toBe(true);
      // And the sentence is about the threshold rather than about the money,
      // which is the whole point of splitting it.
      expect(entry, entry).toMatch(/unlocks at a higher best balance/i);
      expect(entry, entry).not.toMatch(/not open to you yet/i);
    }

    // The same sentence reaches the control's own accessible name, which is
    // the other of the three surfaces `BJ-18` put a refusal on.
    const gold = page.locator('[data-table="gold"]');
    await expect(gold).toHaveAttribute('aria-disabled', 'true');
    expect(await gold.getAttribute('aria-label')).toContain(reasonText('table-not-unlocked'));
  });

  test('puts the reason on the greyed control accessible name as well', async ({ page }) => {
    await atShippedBetting(page);
    await settle(page);
    const greyed = page.locator('.bj-chip[aria-disabled="true"]').first();
    await expect(greyed).toHaveCount(1);
    const label = await greyed.getAttribute('aria-label');
    const text = (await greyed.textContent())?.trim() ?? '';
    expect(label, 'a greyed control carries no accessible name').not.toBeNull();
    // SC 2.5.3 Label in Name: the visible label is a prefix of the accessible
    // name rather than a fragment buried in it.
    expect(label?.startsWith(text)).toBe(true);
    expect(label?.length ?? 0).toBeGreaterThan(text.length);
    // And the name goes back to the plain label when the control is available.
    const live = page.locator('.bj-chip:not([aria-disabled="true"])').first();
    expect(await live.getAttribute('aria-label')).toBeNull();
  });
});

test.describe('G4: the mirror is written only when it changed', () => {
  test('mutates nothing across idle frames', async ({ page }) => {
    // Measured at the player's turn rather than at the betting screen, and the
    // difference decides whether this test can fail at all: at betting there are
    // no hands, so the loop that rebuilds a card list never runs and a mirror
    // that rebuilt itself every frame would still mutate nothing. The player's
    // turn is the state with cards on the felt, hands in the list and a machine
    // that is waiting, which is the only idle frame this game has with something
    // in it.
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await control(page, 'max').click();
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'insurance');
    await control(page, 'decline-insurance').click();
    await waitForPhase(page, 'playerTurn');
    await settle(page);
    expect((await mirror(page)).hands[0]?.cards.length, 'no cards to rebuild').toBeGreaterThan(1);
    const mutations = await page.evaluate(async () => {
      const root = document.querySelector('[data-mirror="root"]');
      if (root === null) {
        throw new Error('there is no mirror on this page');
      }
      let count = 0;
      const observer = new MutationObserver((records) => {
        count += records.length;
      });
      observer.observe(root, {
        childList: true,
        characterData: true,
        attributes: true,
        subtree: true,
      });
      await new Promise<void>((resolve) => {
        let frames = 0;
        const tick = (): void => {
          frames += 1;
          if (frames >= 30) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      observer.disconnect();
      return count;
    });
    // Thirty frames of a running game with nothing happening. A mirror rebuilt
    // per frame would be a subtree replaced under a screen reader's cursor
    // sixty times a second, which is worse than no mirror at all.
    expect(mutations, 'the mirror rewrote itself on an idle frame').toBe(0);
  });

  test('reports its queue and what it last said, for the demonstration session', async ({ page }) => {
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await control(page, 'max').click();
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'insurance');
    const probe = await accessibilityProbe(page);
    expect(probe.announced.polite, 'nothing has been announced during a deal').not.toBeNull();
    expect(probe.queue.pendingOutcomes).toBe(0);
  });
});
