# Blackjack

The buildable project. Requirements live one directory up in [SPEC.md](../SPEC.md); this file is only how to
build, run and verify what is here.

**State: parts `BJ-0` through `BJ-18`, with `BJ-18` built last.** The build order puts the DOM shell
before the motion that plays inside it, because the composed page is what motion is graded on.
The toolchain, the CI gates, the design tokens, and the whole
headless game: cards, hand evaluation, the seeded stream, the shoe, the dealer, settlement, the wallet
with the three tables and the betting arithmetic, the phase machine and its type unions, the round itself
with every player action and both side offers behind an availability gate, the house-rule record, the
strategy coach generated from that record and checked cell by cell against committed reference charts,
the session and lifetime statistics with the eleven milestones, the fifty-round hand history with its
per-round journal, and the one versioned browser-storage document the saved figures live in. `BJ-12`
closed the core phase without adding a module: a 50,000-round soak holds the four-term conservation
identity between every two frames with the defensive rebuild never firing, a seeded session replays an
identical transcript across runs and across both shoe sizes with the shoe's split stream proven
load-bearing, and the same seeded rounds transcribe identically from 15 to 1000 frames per second, held
to a derived wall-clock schedule, with the sequence of states and outcomes unchanged on an unstable
clock with zero and negative deltas. A complete round plays out headlessly from the
wager to the payout; the saved document is built and proven but not yet wired to a launch, because the
composition root is a later part. `BJ-13` added the play surface under `src/render/`: the surface
wrapper that owns the device-pixel-ratio backing store and the two ordered passes, the felt baked once
into an offscreen canvas with its rail, grain and printed house rules, cards with rank and suit indices
in both opposing corners and the classic centre pip layouts, and chip stacks in the conventional
denominational colours with a visible offset. Items `E3`, `E4` and `E5` are method D and close at the
demonstration session; what is merged here is the behaviour, its scene hooks in
`tests/browser/support/render-demo.ts`, and the automated armour under all three, at unit level against
a recording context and at browser level against real pixels on all three engines. `BJ-15` made the
game playable in a browser. `src/main.ts` is now the composition root: it builds the machine, the play
surface and the frame loop, and binds them to the DOM chrome under `src/ui/`. Every button, readout,
panel, overlay and label is a real DOM element, the canvas draws the felt, the cards and the chips and
nothing else, and no pointer coordinate is hit-tested against a chrome rectangle anywhere in the
source. The betting controls bind the wallet's rules rather than restating them: a chip whose
denomination alone exceeds `min(table maximum, balance)` renders disabled, a tap that would carry the
wager past that ceiling is rejected with the reason on screen and changes nothing, and Deal below the
table minimum is blocked rather than raised to it. SPEC 11's fourteen readouts sit in a row of their
own that no overlay can reach, SPEC 10's three overlays open over the play surface without pausing the
game, and SPEC 12's round result prints each hand's outcome, the rung that decided it, both hand
values, the chip delta, the insurance result and the coach's verdict. `BJ-14` gave that page its
motion. `src/render/animate.ts` holds every pacing constant in one block, consumed from the machine's
own record rather than restated, and one reduced-motion switch that every tween is written over: cards
travel from the shoe on an eased arc, the hole card flips through zero width, chips slide to the wager
spot and stack, the balance counts rather than snapping, and a winning hand pulses at a rate derived
from the accessibility flash ceiling itself. Under `prefers-reduced-motion` all of it is removed
entirely, including the panel and overlay transitions, while the sequence of states and the outcome are
unchanged; the flag is never seen by anything under `src/core/`. The Speed setting is the first real
control in Settings: Fast multiplies every pacing constant by 0.6, in both motion modes, mid-round
included, and changes no card and no outcome. Its persistence is not built here, and neither is the
reduced-motion setting SPEC 14 lists beside the query: both wait for `BJ-20`. `BJ-16` made the page
responsive. The four breakpoints of QUALITY-BAR section 5 are resolved by width
first, once per frame, in `src/ui/breakpoints.ts`, and published on the shell as an attribute the
stylesheet selects on, so no number that section owns is written twice and a viewport at or above
1024 px in portrait resolves to `wide` rather than to nothing. Portrait is a re-arrangement rather
than a scale: the top bar keeps chips, wager and hand value with the other eleven readouts behind a
disclosure, both bars stick, and the play surface is drawn in a portrait framing of the same logical
space. The two bars stick only where they and the play surface's minimum height all fit the viewport:
below a 400 px viewport height, and at any size where a wrapped top bar would leave the play surface
no room, they scroll with the document instead, so every control stays reachable by scrolling the page
and 320 by 256 CSS pixels keeps every control while scrolling in one axis only. Safe-area insets are
spent on the shell's padding and on the sticky offsets, with `viewport-fit=cover` on the viewport meta
and no cap on pinch
zoom. The play-surface size setting joins Speed in Settings at 100, 125, 150 and 200 percent, raising
the logical-to-CSS scale by exactly that factor and taking effect immediately, mid-round included;
browser zoom shrinks the canvas box with the viewport and magnifies nothing, which is why the setting
exists. Its persistence is not built here, for the same reason Speed's is not: both wait for `BJ-20`.
`BJ-17` made the page operable by every input method. Every action in the game, all eighteen of SPEC 10's
intents and the five settings the chrome offers beside them, is reachable by pointer, by touch and by
keyboard through **one** binding: `click`, attached once in `src/ui/dom.ts`, which is the only event a
mouse press, a touch tap and `Enter` or `Space` on a focused control all produce. There is no mouse-only
and no touch-only handler anywhere, no pointer coordinate is read at all, and no gesture is captured, so
pinch zoom, panning, pull-to-refresh and the back-navigation edge swipe are all still the browser's; the
two containers that scroll contain their own overscroll so a pan inside the game cannot chain out into one
of them. A control that becomes unavailable is now greyed **in place** with `aria-disabled` and stays
focusable, which is what stops a phase change taking the player's caret with it, and the press it is given
is refused in one place rather than in each component. `src/ui/input.ts` is the one document-level
listener: `Escape` closes an open overlay, `Tab` is contained inside one while it is open and focus
returns to the control that opened it, and where a screen is replaced under the caret focus lands on the
controls row rather than on the body. The focus indicator is measured in rendered screenshot pixels rather
than read off the stylesheet, on every control on the screen and on all three engines.
`BJ-18` made the page usable without seeing it. Two mechanisms, and QUALITY-BAR section 4 requires them
to be two: a persistent visually hidden **mirror** of the play state, in the `main` landmark beside the
canvas it mirrors, holding an ordered list of hands, each named "Hand 2 of 3, active, soft 16, wager 100"
and containing a nested list of its cards as words; and **two live regions**, polite for incremental
change and assertive for round and match outcomes, written by one announcement queue that holds a 500 ms
floor between polite writes, replaces a pending announcement rather than queueing behind it, and never
drops an outcome. Without that queue the four-card deal at 0.22 s clobbers itself before anything is
spoken. The mirror is a representation and never announces; the regions are an event channel and hold no
state; the refusal reason behind a greyed control, which reached only a hovering pointer before this part,
is now on the control's own accessible name, in the mirror's list and in the polite region. The document
sets `lang`, exposes one `h1`, uses `header`, `main`, `footer` and `nav` rather than `role` attributes,
and the title reflects the current screen. Under `forced-colors: active` every chrome colour resolves to
a system one, the chip controls stop spending the colours the canvas supplies, and the play surface
selects its token set from the same media query the stylesheet reads; the high-contrast set itself is
**parked**, because SPEC 16 defines none and no colour may be invented here. Chrome text resizes to 200
percent at every breakpoint with nothing clipped, nothing overlapping and every control still reachable,
and no focused control is obscured at any breakpoint, including inside the one scroller that holds
controls. Persistence is still not wired: nothing imports `src/storage/`, because `I4` and `I5` grade it
there. See
[../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md) for what fills the rest and in what order.

## Prerequisites

The complete list. There is nothing else, and item `A1` is graded on that being true.

| Prerequisite | Required | Used for |
|---|---|---|
| Node.js | `>=20.19.0`, built and verified on 24.14.1 | Everything below |
| npm | bundled with Node, verified on 11.7.0 | Install from the lockfile |
| Python 3 | any 3.x | The documentation gate only. It has no other dependency and runs without `npm ci` |

No compiler toolchain, no global CLI, no Docker, no service, no account, no API key, no `.env` file, and no
configuration step between cloning and building.

## Build and run

```bash
npm ci
npm run build
```

`dist/` is the whole deliverable: a directory of static files that any static host can serve from any
subdirectory. To look at it without installing anything else:

```bash
python3 -m http.server -d dist 8080
```

For development, `npm run dev` starts Vite with hot reload, and `npm run preview` serves the built `dist/`
on port 4173, which is the same server the browser gate uses.

## Verify

The merge gate, in the order CI runs it. Each one blocks. The two repository-wide gates come first, and
neither needs `npm ci`:

```bash
cd ../.. && python3 docs/verify-docs.py && python3 docs/verify-authorship.py
```

Then this project's gates:

```bash
npm run typecheck && npm run lint && npm run test && npm run test:browser && npm run verify:build
```

`npm run verify` chains `npm run verify:policy`, the repository-record gate that travels inside the
project, ahead of that second block; the two python gates stay workspace-level commands. Once per
machine, the browser gate needs its engines:

```bash
npx playwright install chromium firefox webkit
```

| Command | What it gates |
|---|---|
| `python3 docs/verify-docs.py` | The document set against itself. No dependencies, and it runs before anything is installed |
| `python3 docs/verify-authorship.py` | The repository record. See [../../docs/GITHUB.md](../../docs/GITHUB.md) section 7 |
| `npm run verify:policy` | The same record from inside the project, so CI can enforce it without the workspace documents |
| `npm run typecheck` | `tsc --noEmit`, strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| `npm run lint` | ESLint, including the `core/` boundary and the `Math.random()` ban. Item `M3` |
| `npm run test` | Vitest. Includes the boundary fixture assertion, the token layer against its two specs, hand evaluation against an independently written evaluator, the shuffle against a measured uniformity band, the dealer's policy against a hit-soft-17 control that must disagree on exactly the soft 17 hands, the peek result against structural leak assertions on both branches, the settlement ladder against three reordered ladders that must disagree on exactly the equal-naturals, both-bust and surrendered-against-a-natural cases and nowhere else, the tables and betting rules against eleven controls: a threshold-blind and an affordability-blind entry predicate, a lowest-first launch fallback, an unlock read off the current balance and one read off the balance plus what is still committed, a clamping chip tap, an unfloored Max and a Max that forgot the balance, both misreadings of Repeat, and a fabricated step list the conservation checker has to flag, and the phase machine over all 187 intent-and-phase cells against three misread legality tables that must disagree on exactly 170, 4 and 40 of them and a branch that peeks before it offers, which must disagree on exactly the Ace, the full round through the machine with split, double, surrender, insurance and even money each driven and each rejected by layer, the coach table against hand-written reference charts over all 8 rule combinations, 3,040 cells compared, the counters, the eleven milestones and the fifty-round history against double-count and naive-reload traps, and the versioned storage document against 73 corrupt fixtures, a real migration walk, a throwing write and a store that refuses to exist, each booting the game anyway, and the three BJ-12 harnesses: a 50,000-round soak auditing the four-term identity between every two observations with the three-term form failing as its negative control and the rebuild forced and proven to return no in-play card, seeded round transcripts reproduced across runs and across both shoe sizes with a sibling consumer proven unable to shift the deal, and the same seeded rounds transcribed at 15, 30, 60, 144, 240 and 1000 fps against a derived wall-clock schedule that must reject a per-frame stepper, with the sequence and outcomes unchanged on an unstable clock with zero and negative deltas, and the BJ-13 render armour against a recording context: the pip layout table held to core's pip values with every layout symmetric under a half turn except the 7, both corner indices with the far one rotated, the face-down card proven to draw nothing it knows, the wager decomposition checked against an independent minimiser, the stack offset and per-denomination fills, the felt's four printed lines per table with the bake deterministic to the instruction and the per-frame path a single blit, the DPR backing store with fractional ratios, the two-pass frame order with explicit state at each pass top, and a directory scan keeping DPR arithmetic, clocks and randomness out of every render module but the surface wrapper |
| `npm run test:browser` | Playwright on Chromium, Firefox and WebKit against the built `dist/`. From BJ-13 it also rasterises the play surface for real: the test-time harness bundle draws the three demonstration scenes on a page canvas and the suite reads pixels back, holding the felt, rail and print to their tokens, the card margin to a measured 3:1 against all three felts, every denomination of the 680 wager visible in one stack, the backing store to integer and fractional device pixel ratios, and the felt bake byte-identical across two runs on each engine. From BJ-15 it also drives the shipped chrome: the Bronze betting screen through its own controls with nothing injected, and, through a test-time harness that never ships, a table SPEC 6 has not unlocked and a known deal, so the ceiling, the disabled chip, the floored Max, the blocked Deal and the four-term identity are all measured, every one of SPEC 11's fourteen readouts is required to have a rendered box that no open overlay intersects, and SPEC 12's round result is checked field by field against the round that actually happened . From BJ-14 it also grades the motion: one seeded round is driven under prefers-reduced-motion and again without it, every frame of both sampled, with no tween in flight and no lagging balance under the flag and both present without it, the overlay, panel and button durations read from the shipped stylesheet in each mode, and the screen sequence and round result required identical; the Speed setting is pressed through the Settings panel and the whole pacing table required to be its Normal table times 0.6 in both motion modes, with a real phase timed on the wall clock in the shipped page and a mid-round switch measured inside one round; and both arms of the peek are dealt through the demonstration hook and timed to the same constant. From BJ-16 it also grades the layout: all four breakpoints are measured at the betting screen and at the player's turn with no region clipped, no pair of controls overlapping and every control clickable at its own centre, the page is swept for horizontal scroll at twenty-five widths from 320 px upward at two heights and on three screens, portrait is compared against wide for the same type size and a regrouped bar, a device is turned mid-round with the machine's whole readout and a page sentinel required to survive it, the play-surface size setting is pressed through Settings and the canvas box required to be exactly its factor larger at every breakpoint with browser zoom required to magnify nothing, and a whole round is played at 320 by 256 with both bars unstuck. From BJ-17 it also grades the input: every one of the game's twenty-three actions is driven three times, once by a real mouse press, once by a real touch tap and once by a real key, with the machine as the witness for each, and every control on all six of SPEC 10's screens is required to take focus, to answer a press at its own centre and to be big enough for a finger; the tab order is compared against the DOM order and the DOM order against reading order at two breakpoints, Enter and Space are pressed on every kind of control, Escape is required to close an overlay and to change nothing when none is open, Tab is required to stay inside an open panel and focus to return to the control that opened it, and the focus indicator is measured in screenshot pixels against the background it is drawn over on every control on the screen. A real right press and a real middle press on four kinds of target are required to change nothing and to leave the context menu to the browser, and the gesture policy is read off the rendered page: no computed touch-action that removes a gesture, no cap on pinch zoom in the viewport meta, the two designated scrollers containing their own overscroll, and no touch or wheel suppressed |
| `npm run verify:build` | Two builds, hashed and compared. Item `A6`. Writes `artifacts/reports/build.md` |
| `npm run verify:mutations` | Not a gate. Breaks every gate above, one mutation per property it protects, and requires each break to be caught |

### If the browser gate will not start: port 4173

Both `npm run test:browser` and `npm run verify:mutations` start their own preview server on port 4173,
because `playwright.config.ts` refuses to reuse one unless `BJ_REUSE_SERVER` is set. That refusal is a
correctness rule, and it has a pleasant consequence: **an orphan cannot corrupt a run**, because a run that
found one would be reading a `dist/` it did not build, which is exactly what the refusal prevents. What an
orphan can do is stop a run from starting, which is a run that never began rather than one that lied.

A crashed or force-killed run can leave a `vite preview` behind, most easily on Windows, where the process
tree is not always torn down with its parent. Find it and end it:

```
# Windows, PowerShell
Get-NetTCPConnection -LocalPort 4173 -State Listen | Select-Object OwningProcess
Stop-Process -Id <the id> -Force

# macOS and Linux
lsof -ti:4173 | xargs kill
```

Then run the gate again. There is nothing else to clean up: the harness restores every file it mutates in a
`finally`, and if it did not, the next run's baseline check reports the unmutated tree as red and refuses to
report anything until that is fixed.

## The core/ boundary

Nothing under `src/core/` may import `render/`, `ui/` or `@js-games/engine/render`, touch a DOM, BOM or
canvas global in a value or a type position, or call `Math.random()`. This is item `M3`, severity Critical,
and it is what makes most of the acceptance sheet automatable rather than merely observable.

It is enforced by [tools/eslint-plugin-core-boundary](tools/eslint-plugin-core-boundary/README.md), wired up
in [eslint.config.js](eslint.config.js), and proved against a deliberately violating fixture in
`tests/lint/fixtures/core/` by `tests/unit/core-boundary.test.ts`. Inside `core/` the rule cannot be
switched off with an `eslint-disable` comment.

## Second implementations, in `tests/unit/reference/`

Some rules are cheap to state and easy to misread, and a test that encodes the same misreading as the code
agrees with it forever. Where that risk is real, the expected values come from a second implementation
written from [../SPEC.md](../SPEC.md) alone, living under `tests/unit/reference/` and importing nothing
from `src/`.

The first of them is `hand-evaluator.ts`, behind item `B1`. It searches every reading of the Aces in a hand,
where `src/core/hand.ts` uses the add-10-once shortcut SPEC 4.2 states; `tests/unit/hand-value.test.ts` runs
the two against each other over every ordered hand of up to five cards and well past that. See
[src/core/README.md](src/core/README.md) for the argument in full.

The second is `basic-strategy-charts.ts`, behind item `J3`: the committed reference charts, written by
hand against published basic strategy rather than derived from the generator, which
`tests/unit/strategy-coach.test.ts` compares cell by cell with the table the coach generates from the
house-rule record, across all 8 rule combinations.

## Design tokens

Every colour, size, spacing, radius and duration resolves through a token, and no component may carry a
literal value. This is item `E1`.

| File | What it is |
|---|---|
| [src/ui/tokens.css](src/ui/tokens.css) | The custom properties the chrome reads. Imported once, at the composition root |
| [src/render/tokens.ts](src/render/tokens.ts) | The same tokens as values, because a canvas context cannot take a `var()` |

**Neither file is a source of truth.** [../../docs/QUALITY-BAR.md](../../docs/QUALITY-BAR.md) section 15 is
the source for every number and [../SPEC.md](../SPEC.md) section 16 for every colour.
`tests/unit/tokens.test.ts` parses all four and fails if any two disagree, and it re-derives all 35
committed contrast ratios from the hexes themselves. Editing a colour to make something look better is a
test failure rather than a silent regression in `G2` and `E4`.

The record lives under `render/` so that the `core/` boundary rule already forbids the rules and the
simulation from reaching a presentation value. No second rule was needed.

## Layout

```
BlackJack/BlackJack/
  index.html                 the single page
  vite.config.ts             static output, relative base, no sourcemaps
  eslint.config.js           lint, and the home of the core/ gate
  tsconfig.json              strict, plus the checks strict does not turn on
  vitest.config.ts
  playwright.config.ts       Chromium, Firefox, WebKit, over the built dist/
  src/
    main.ts                  the composition root: machine, play surface, loop and chrome
    core/                    rules and simulation. Zero renderer, zero DOM. BJ-2 onward
      cards.ts               Rank, Suit, Card, the card factory, and rank values
      hand.ts                value, soft or hard, bust, natural, the pair test. Item B1
      rng.ts                 the seeded stream: nextFloat, nextInt, shuffle, split
      shoe.ts                composition, shuffle, cut card, defensive rebuild. Items B2, B3
      dealer.ts              the S17 policy, and the peek and its one-bit result. Items B7, B8
      settlement.ts          the nine-rung ladder, and the insurance net. Items B13, B14
      wallet.ts              chips, wagers, the three tables and betting. Items J1, J2
      types.ts               the Phase, Intent and hand unions of DESIGN 2. Item C2
      table.ts               the eleven phases, apply(intent), the queue, timers and journal. Item C2
      rules.ts               the house-rule record: decks, DAS, surrender, even money, split compare
      strategy.ts            the coach table generated from the rules record. Item J3
      statistics.ts          session and lifetime counters, and the eleven milestones. Item J6
      history.ts             the fifty-round hand history, read from the round journal. Item J5
    render/                  canvas play surface. BJ-13 onward
      tokens.ts              the renderer token record. Item E1
      animate.ts             the tween set, the pacing block, one reduced-motion switch. E6, E7, E9
      surface.ts             context, the one DPR backing store, the two ordered passes
      felt.ts                table ground, rail, grain, insurance divider, printed rules. Item E5
      card.ts                face, back, corner indices, centre pip layouts. Item E3
      chips.ts               denominations, wager decomposition, stacks. Item E4
      scene.ts               the arrangement, and the frame-to-frame state the tweens need
    ui/                      DOM chrome. BJ-15 onward
      tokens.css             the design tokens. Item E1
      chrome.css             the shell, the controls and the overlays, all through tokens
      dom.ts                 the element factory every component builds from. Item M1
      format.ts              Intl with an explicit locale list, per QUALITY-BAR 11
      text.ts                every sentence the chrome shows, the refusal reasons and the mirror's
      state.ts               what the sync step is given, and what a control may ask for
      layout.ts              the three-row shell, the landmarks and the page heading. C5, G6
      breakpoints.ts         the four breakpoints, the sticky threshold, the surface plan. F1, F6
      loop.ts                the frame loop: timestamps in, one delta per frame out
      motion.ts              the one place the platform is asked for prefers-reduced-motion. Item E7
      forced-colors.ts       the one place the platform is asked for forced colors. Item G9
      availability.ts        one reading of why each control is greyed, for the control and the mirror
      announce.ts            the announcement queue and the frame deltas, both pure. Item G4
      input.ts               the one document listener: Escape, the focus trap, focus custody. D4, G10
      chrome.ts              the DOM sync step of DESIGN 3, and where components are mounted
      components/            readouts, betting, actions, screens, round result, overlays, mirror,
                             announcer
    storage/                 the saved document and its store. Items I1, I2, I3. Wired at BJ-20
      document.ts            the one namespaced versioned document, exactly SPEC 13's set
      migrations.ts          the version walk: lossless where possible, clean discard where not
      persistence.ts         load, sanitise per field, write: boots the machine from any corruption
      store.ts               the storage probe: localStorage when usable, in-memory when it throws
  tests/
    unit/                    Vitest
      soak.test.ts           the 50,000-round soak against the four-term identity. Items H6, B5
      determinism.test.ts    seeded transcripts across runs and both shoe sizes. Item B16
      frame-independence.test.ts  the same rounds at 15 to 1000 fps on one schedule. Item M5
      render-card.test.ts    E3 armour: layouts, corners, inks, the concealed back
      render-chips.test.ts   E4 armour: decomposition, offset, fills, the value glyph
      render-felt.test.ts    E5 armour: the printed lines, rail, grain, the one-blit frame
      render-surface.test.ts the DPR store, the pass order, the render directory scans
      motion.test.ts         the tween shapes, the Speed multiplier on the machine, the flash ceiling
      input-surface.test.ts  D1's scans: one handler path, no capture, no gesture taken
      announce.test.ts       G4 armour: the queue's four rules, against a queue-free control
      mirror-text.test.ts    G4 and G6 armour: the naming template, the card words, the titles
      forced-colors.test.ts  G9: the forced-colors token block, and the palette selection
      reference/             second implementations, written from the spec, never importing src/
      support/               stacked shoes, storage fixtures, and the recording canvas context
    browser/                 Playwright
      render-surface.spec.ts E3, E4 and E5 as rendered pixels, on all three engines
      betting.spec.ts        B15: the ceiling, the disabled chip, Max, Repeat, Deal, the identity
      overlays.spec.ts       C5: overlays measured clear of every readout, and state unchanged
      round-result.spec.ts   C8: outcome, reason, both values, delta, insurance, coach, balance
      reduced-motion.spec.ts E7: every animation removed, sequence and outcome identical
      speed-setting.spec.ts  E9: every pacing constant times 0.6, in both motion modes
      motion-demo.spec.ts    E6 armour: both arms of the peek, timed and compared
      input-parity.spec.ts   D2: every action driven by pointer, by touch and by keyboard
      keyboard.spec.ts       D4: tab order, Enter and Space, Escape, the trap, the ring in pixels
      secondary-pointer.spec.ts  D5: the right and middle buttons are bound to nothing
      gestures.spec.ts       D6 armour: touch-action, overscroll, the viewport meta, no suppression
      axe.spec.ts            G1: WCAG 2.2 A and AA on every screen and overlay, four families excluded
      screen-reader.spec.ts  G4 armour: the mirror, the two regions, a full session with a split
      text-scale.spec.ts     G5: 200 percent text at four breakpoints, clipping, overlap, function
      forced-colors.spec.ts  G9: the chrome adopts the system palette, the surface selects its set
      focus-obscured.spec.ts G10: SC 2.4.11, measured by sampling a focused control's own box
      support/render-demo.ts the demonstration scenes, bundled at test time, never shipped
      support/motion-demo.ts the E6 capture hook: the real game at a chosen seed, never shipped
      support/controls.ts    the control census, the three presses, and the focus walk
      support/action-seeds.ts  seeds searched for the split round and the bust-out, headlessly
      support/png.ts         a PNG reader, so a spec can measure a rendered focus ring
    lint/fixtures/           the deliberately violating fixture, and its controls
  tools/
    eslint-plugin-core-boundary/
  scripts/
    build-fingerprint.mjs    hashing and comparison, pure, unit tested
    check-determinism.mjs    two builds, compared. Item A6
    check-repository-record.mjs  the repository record, run by CI from inside the project
    mutation-check.mjs       proves the gates above can fail
  packages/
    engine/                  extracted from this game at ENG-1. Deliberately empty
```

Eight evidence artifacts are written outside this directory, to the repository root, because
[../ACCEPTANCE.md](../ACCEPTANCE.md) section 5 is where the evidence index lives and it puts them there:
`artifacts/reports/build.md`, `docs/review-checklists/build.md`, `docs/review-checklists/tokens.md`,
`docs/review-checklists/architecture.md` (item `M1`, written at `BJ-15`),
`docs/review-checklists/input.md` (item `D1`, written at `BJ-17`), and the three `BJ-18` added:
`docs/review-checklists/colour-independence.md` (item `G3`),
`docs/review-checklists/semantics.md` (item `G6`) and `docs/review-checklists/flash.md` (item `G8`).
The count was stale by one before `BJ-17`: `architecture.md` had existed since `BJ-15` and the sentence
still said three.
