/**
 * The automated armour under items `L1`, `L3`, `L4` and `L5`. `BJ-21`.
 *
 * All four are **Inspection** items and close at the review, against
 * `docs/review-checklists/compliance.md` and `docs/review-checklists/privacy.md`.
 * Nothing here closes any of them. What this file is for is the reason
 * `tests/unit/input-surface.test.ts` gives for its own scans: every one of these
 * claims is an **absence**, an absence is the kind of claim most likely to be
 * true by accident, and a rule checked only at review time holds until the next
 * part. The checklists cite these scans and a reviewer runs the same greps by
 * hand; the two must agree.
 *
 *   - `L1` (Critical): "No real-money purchase, payment processing, gambling
 *     service, cash-out, pricing, currency symbol or store surface exists
 *     anywhere in the interface or the source."
 *   - `L3` (Critical): "No telemetry, analytics, fingerprinting or advertising
 *     identifier exists in the shipped bundle."
 *   - `L4` (Major): "The currency is called chips throughout, and the bankroll
 *     reset is free, unlimited and always available."
 *   - `L5` (Minor): "No side bet beyond Insurance exists, specifically no
 *     Perfect Pairs and no 21+3, and no other section 19 non-goal is present."
 *
 * **The scans read code and markup, never prose.** Comments are stripped before
 * matching, and so are HTML comments, because half of these words appear in this
 * project's own headers explaining why the thing is absent. `SPEC.md` section 19
 * names Perfect Pairs in order to forbid it, and a scanner that could not tell
 * a prohibition from an implementation would be unusable.
 *
 * **Every scanner is run over text containing what it hunts for, first.** The
 * storage suite established that pattern and it is the whole reason these scans
 * are evidence rather than decoration.
 *
 * **`L3`'s strongest evidence is structural rather than lexical.** A bundle with
 * no way to reach a network cannot carry telemetry whatever it is called, so the
 * scan below is for the platform's network verbs themselves, not for the names
 * of the companies that would use them. `L2`'s `connect-src 'none'` is the same
 * claim enforced from outside, and `tests/browser/no-third-party.spec.ts`
 * demonstrates it positively.
 *
 * @vitest-environment node
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { INTENT_KINDS } from '../../src/core/table';
import { STARTING_CHIPS, createWallet, tableLimits } from '../../src/core/wallet';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

/** Every shipped source file, plus the page itself. */
function shippedSources(): readonly SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|css)$/.test(entry.name)) {
        files.push({ path: full.replace(/\\/g, '/'), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(join(PROJECT_ROOT, 'src'));
  // The page is shipped too, and it is the one file a store surface could be
  // added to without touching a module.
  files.push({
    path: 'index.html',
    text: readFileSync(join(PROJECT_ROOT, 'index.html'), 'utf8'),
  });
  return files;
}

/** Source with its comments removed, so a scan reads code and not prose. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function hits(text: string, pattern: RegExp): readonly string[] {
  return [...code(text).matchAll(pattern)].map((match) => match[0]);
}

// ---------------------------------------------------------------------------
// The patterns, each named for the clause it answers
// ---------------------------------------------------------------------------

/**
 * A currency symbol. `L1` and `L4`.
 *
 * The dollar sign is the awkward one, because `${` opens a template
 * substitution on nearly every line of this project. It is matched only when
 * what follows is not a brace, which is the only form that could reach a
 * player as a currency.
 */
const CURRENCY_SYMBOL =
  /\$(?!\{)|[\u00a3\u20ac\u00a5\u00a2\u20bf\u20b9\u20a9\u20aa]/g;

/** A currency by name, and the words a store surface is built from. `L1`. */
const MONEY_WORDS =
  /\b(?:dollars?|euros?|pounds? sterling|yen|usd|eur|gbp|purchase|purchases|checkout|payment|payments|paypal|stripe|pricing|subscription|cash-?out|top-?up|micro-?transactions?|real money|in-app)\b/gi;

/** SPEC 19's non-goals, by the names they would arrive under. `L5`. */
const NON_GOAL_WORDS =
  /\b(?:perfect pairs|21\+3|lucky lucky|side bets?|tournaments?|leaderboards?|multiplayer|card[- ]counting|count cards|loot box(?:es)?|daily (?:login|reward))\b/gi;

/**
 * Every way this platform can reach a network, and the fingerprinting surfaces
 * QUALITY-BAR section 9 names. `L3`.
 *
 * `navigator.languages` is deliberately not here and is the one exemption:
 * QUALITY-BAR section 11 requires it, `src/ui/format.ts` is the only file that
 * reads it, and nothing in this bundle can send it anywhere, which is what the
 * rest of this list establishes.
 */
const NETWORK_AND_FINGERPRINT =
  /\bfetch\s*\(|\b(?:XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.geolocation|navigator\.plugins|hardwareConcurrency|deviceMemory|userAgent|document\.cookie|toDataURL|indexedDB|openDatabase)\b/g;

/** The names an analytics or advertising payload would arrive under. `L3`. */
const TELEMETRY_WORDS =
  /\b(?:analytics|telemetry|gtag|googletagmanager|google-analytics|doubleclick|mixpanel|segment\.io|amplitude|advertising id|adid|idfa|gaid|beacon)\b/gi;

// ---------------------------------------------------------------------------
// The scanners can see
// ---------------------------------------------------------------------------

describe('L1, L3, L5: the scanners find what they hunt for', () => {
  it('finds a currency symbol, and not a template substitution', () => {
    expect(hits('const price = "$5";', CURRENCY_SYMBOL)).toEqual(['$']);
    expect(hits('const s = `${value} chips`;', CURRENCY_SYMBOL)).toEqual([]);
    // The control for the half that is not the dollar sign. U+00A3 POUND
    // SIGN is built from its code point rather than typed, because this
    // repository is ASCII only and `tests/browser/support/game.ts` sets the
    // same precedent for U+2212.
    const pound = String.fromCharCode(0x00a3);
    expect(hits(`const s = "${pound}5";`, CURRENCY_SYMBOL)).toHaveLength(1);
  });

  it('finds a store surface by name, in code and not in prose', () => {
    expect(hits('const label = "Checkout";', MONEY_WORDS)).toEqual(['Checkout']);
    expect(hits('const label = "Buy 500 chips for 2 dollars";', MONEY_WORDS)).toEqual(['dollars']);
    expect(hits('// there is no checkout in this game', MONEY_WORDS)).toEqual([]);
    expect(hits('/* no payment processing anywhere */', MONEY_WORDS)).toEqual([]);
  });

  it('finds a SPEC 19 non-goal by name, in code and not in prose', () => {
    expect(hits("const bet = 'Perfect Pairs';", NON_GOAL_WORDS)).toEqual(['Perfect Pairs']);
    expect(hits("const bet = '21+3';", NON_GOAL_WORDS)).toEqual(['21+3']);
    expect(hits('// no Perfect Pairs and no 21+3, per SPEC 19', NON_GOAL_WORDS)).toEqual([]);
  });

  it('finds a network verb and a fingerprinting surface, in code only', () => {
    expect(hits('await fetch("https://example.test");', NETWORK_AND_FINGERPRINT)).toEqual([
      'fetch(',
    ]);
    expect(hits('navigator.sendBeacon(url, body);', NETWORK_AND_FINGERPRINT)).toEqual([
      'sendBeacon',
    ]);
    expect(hits('const id = navigator.userAgent;', NETWORK_AND_FINGERPRINT)).toEqual(['userAgent']);
    expect(hits('// this game never calls fetch(', NETWORK_AND_FINGERPRINT)).toEqual([]);
  });

  it('finds an analytics name, in code only', () => {
    expect(hits('window.gtag("event", "deal");', TELEMETRY_WORDS)).toEqual(['gtag']);
    expect(hits('// no analytics of any kind', TELEMETRY_WORDS)).toEqual([]);
  });

  it('walks the shipped sources, including the page', () => {
    const files = shippedSources();
    expect(files.length).toBeGreaterThan(20);
    expect(files.map((file) => file.path)).toContain('index.html');
  });
});

// ---------------------------------------------------------------------------
// L1 and L5: nothing about money, and nothing SPEC 19 rules out
// ---------------------------------------------------------------------------

describe('L1: no purchase, payment, pricing or store surface exists', () => {
  it('carries no currency symbol anywhere in the shipped source', () => {
    for (const file of shippedSources()) {
      expect(hits(file.text, CURRENCY_SYMBOL), file.path).toEqual([]);
    }
  });

  it('carries no currency name and no word a store is built from', () => {
    for (const file of shippedSources()) {
      expect(hits(file.text, MONEY_WORDS), file.path).toEqual([]);
    }
  });

  it('has no way to process a payment even if one were added', () => {
    // The structural half, and the stronger one: payment processing needs a
    // network, and this bundle names no verb that reaches one.
    for (const file of shippedSources()) {
      expect(hits(file.text, NETWORK_AND_FINGERPRINT), file.path).toEqual([]);
    }
  });
});

describe('L5: no side bet beyond Insurance, and no other SPEC 19 non-goal', () => {
  it('names none of them anywhere in the shipped source', () => {
    for (const file of shippedSources()) {
      expect(hits(file.text, NON_GOAL_WORDS), file.path).toEqual([]);
    }
  });

  it('offers exactly the two insurance intents and no third side wager', () => {
    // The positive half. SPEC 4.7's pair are the only intents in the machine
    // that stake anything beside the hand's own wager, and `INTENT_KINDS` is
    // the whole list a player can reach.
    const wagering = INTENT_KINDS.filter((kind) => /insurance/i.test(kind));
    expect([...wagering].sort()).toEqual(['declineInsurance', 'takeInsurance']);
  });
});

// ---------------------------------------------------------------------------
// L3: no telemetry, analytics, fingerprinting or advertising identifier
// ---------------------------------------------------------------------------

describe('L3: nothing in the bundle observes the player', () => {
  it('names no analytics, telemetry or advertising identifier', () => {
    for (const file of shippedSources()) {
      expect(hits(file.text, TELEMETRY_WORDS), file.path).toEqual([]);
    }
  });

  it('reads no fingerprinting surface, and reads languages in one place only', () => {
    // The one navigator read this game makes is QUALITY-BAR section 11's, and
    // it is in the file that formats numbers. Anything else reading the
    // platform would be a second reason to look at the player rather than at
    // the game.
    const readers = shippedSources().filter(
      (file) => hits(file.text, /\bnavigator\b/g).length > 0,
    );
    expect(readers.map((file) => file.path.slice(file.path.lastIndexOf('src/')))).toEqual([
      'src/ui/audio.ts',
      'src/ui/format.ts',
    ]);
    // `audio.ts` reaches `audioSession`, which QUALITY-BAR section 10 requires
    // by name for iOS routing, and nothing else; `format.ts` reads
    // `navigator.languages`, which QUALITY-BAR section 11 requires. Both are
    // properties this game acts on locally, and neither can leave the machine,
    // because the scan above says there is nothing here to send them with.
    const audio = readers.find((file) => file.path.endsWith('audio.ts'));
    expect(hits(audio?.text ?? '', /audioSession/g).length).toBeGreaterThan(0);
    const format = readers.find((file) => file.path.endsWith('format.ts'));
    expect(hits(format?.text ?? '', /navigator\.[A-Za-z]+/g)).toEqual(['navigator.languages']);
  });
});

// ---------------------------------------------------------------------------
// L4: the currency is chips, and the reset is free, unlimited and always there
// ---------------------------------------------------------------------------

describe('L4: the currency is called chips throughout', () => {
  it('labels the balance readout with the word', () => {
    // The positive half of "called chips throughout": the continuous readout a
    // player reads on every screen says so, and the scans above say that no
    // other word for money appears anywhere.
    const readouts = readFileSync(
      join(PROJECT_ROOT, 'src', 'ui', 'components', 'readouts.ts'),
      'utf8',
    );
    expect(code(readouts)).toContain("label: 'Chips'");
  });
});

describe('L4: the bankroll reset is free, unlimited and always available', () => {
  it('restores the starting bankroll and costs nothing', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    wallet.tap(100, bronze);
    wallet.commitInitial(bronze);
    wallet.settleHand(0, -100);
    wallet.endRound();
    expect(wallet.readout().chips).toBe(STARTING_CHIPS - 100);

    wallet.reset();
    // Free: the balance goes to the starting figure rather than to the
    // starting figure less anything.
    expect(wallet.readout().chips).toBe(STARTING_CHIPS);
    expect(wallet.readout().wager).toBe(0);
  });

  it('can be taken again and again, with nothing that runs out', () => {
    // Unlimited: there is no counter to exhaust, so the assertion is that a
    // tenth reset is the same as the first.
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      wallet.tap(100, bronze);
      wallet.commitInitial(bronze);
      wallet.settleHand(0, -100);
      wallet.endRound();
      wallet.reset();
      expect(wallet.readout().chips, `reset ${String(attempt + 1)}`).toBe(STARTING_CHIPS);
    }
  });

  it('leaves the unlocks and the high-water mark alone', () => {
    // Always available, and never a punishment: SPEC 6 keys the unlocks to the
    // best balance ever reached, and a reset that took them back would make
    // the free reset expensive in the only currency this game has.
    const wallet = createWallet({ bestBalance: 12_000 });
    wallet.reset();
    expect(wallet.readout().bestBalance).toBe(12_000);
    expect(wallet.readout().chips).toBe(STARTING_CHIPS);
  });
});
