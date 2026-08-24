# core/

The rules and the simulation. Headless: no DOM, no canvas, no renderer, no wall clock.

**Built so far.** `BJ-2` landed the first two modules, `BJ-3` the next two, `BJ-4` the dealer, `BJ-5`
settlement, `BJ-6` the wallet, `BJ-7` the phase machine with the type unions it is written in, `BJ-8`
the round those phases play out, with the house-rule record it reads, `BJ-9` the strategy coach that
reads that round without touching it, and `BJ-10` the statistics, milestones and hand history that read it
the same way. Thirteen modules. The remaining ones follow the active Blackjack build plan.

| Module | What it owns | Part | Item |
|---|---|---|---|
| `cards.ts` | `Rank`, `Suit`, `Card`, the card factory, and what a rank is worth | `BJ-2` | `B1` |
| `hand.ts` | Value, soft or hard, bust, natural | `BJ-2` | `B1` |
| `hand.ts` | `canSplit`, the pair test of SPEC 4.6. Built here, **graded by `B10`** at `BJ-8` | `BJ-2` | `B10` |
| `rng.ts` | The seeded stream: `nextUint32`, `nextFloat`, `nextInt` and the uniform `shuffle` | `BJ-3` | `B2` |
| `rng.ts` | `split()` and determinism. Built here, **graded by `B16`** at `BJ-12` | `BJ-3` | `B16` |
| `shoe.ts` | Composition, shuffle, draw, the cut card, penetration, the defensive rebuild | `BJ-3` | `B2` `B3` |
| `dealer.ts` | `shouldHit`: the S17 policy of SPEC 4.9, as one comparison | `BJ-4` | `B8` |
| `dealer.ts` | The peek: which up cards it fires on, which one carries an insurance offer, and its result | `BJ-4` | `B7` |
| `settlement.ts` | The nine rungs of SPEC 4.10, top to bottom, as an outcome and a net per hand | `BJ-5` | `B13` |
| `settlement.ts` | The insurance net of SPEC 4.7, and payouts exact on every reachable wager | `BJ-5` | `B14` |
| `wallet.ts` | SPEC 6's three tables, the unlock high-water mark and SPEC 13's launch fallback | `BJ-6` | `J1` `J2` |
| `wallet.ts` | Chips, per-hand wagers, commit and settle, and SPEC 4.12's bust-out and reset | `BJ-6` | `J1` `J2` |
| `wallet.ts` | The betting controls of SPEC 4.11. Built here, **graded by `B15`** at `BJ-15` | `BJ-6` | `B15` |
| `wallet.ts` | SPEC 4.7's insurance stake, its deferred remainder and the release at the boundary | `BJ-8` | `B11` |
| `types.ts` | DESIGN 2's unions: `Phase`, `Intent`, `HandState` and the hand a round is played on | `BJ-7` | `C2` |
| `table.ts` | SPEC 10's eleven phases, the legality table and the one `apply(intent)` entry point | `BJ-7` | `C2` |
| `table.ts` | The intent queue, DESIGN 3's per-frame drain, and SPEC 5's timings as accumulators | `BJ-7` | `C2` |
| `table.ts` | SPEC 4.3's opening deal, drawn from the seeded shoe, and the face-down hole card | `BJ-8` | `B6` |
| `table.ts` | Hit, Stand, Double, Split and Surrender, and the availability rules under the phase gate | `BJ-8` | `B9` `B10` `B12` |
| `table.ts` | SPEC 4.7's offer, even money and the round settled through SPEC 4.10's ladder | `BJ-8` | `B11` |
| `rules.ts` | SPEC 14's house-rule record: shoe size, DAS, surrender, even money, the split comparison | `BJ-8` | none |
| `strategy.ts` | SPEC 7's three surfaces, generated per house-rule record, as preference lists | `BJ-9` | `J3` |
| `strategy.ts` | The three coach modes and the two accuracy counters. **Graded by `J4`** at `BJ-20` | `BJ-9` | `J4` |
| `statistics.ts` | SPEC 11's counters in SPEC 13's two scopes, and SPEC 9's eleven milestones | `BJ-10` | `J6` |
| `history.ts` | SPEC 8's last 50 completed rounds, with every field that section names | `BJ-10` | `J5` |
| `table.ts` | SPEC 8's per-round journal of accepted player actions. No item; `J5` consumes it | `BJ-10` | none |

**This directory is a lint boundary, not a convention.** Nothing under `core/` may import `render/`, `ui/`,
`@js-games/engine/render`, or any DOM or canvas type, and nothing here may call `Math.random()`. All
randomness comes from the seeded `rng` module, and every independent consumer takes its own stream through
`split()`.

The rule lives in [tools/eslint-plugin-core-boundary](../../tools/eslint-plugin-core-boundary/README.md),
it is wired up in [eslint.config.js](../../eslint.config.js), and it is proved against a deliberately
violating fixture in `tests/lint/fixtures/core/`. It is graded as item `M3`, severity Critical.

## Hand evaluation is checked against a second implementation

`hand.ts` applies the Ace adjustment **once**: total the hand with every Ace as 1, then add 10 if the hand
holds an Ace and the result still fits in 21. SPEC 4.2 states the rule as a search over the readings of the
Aces, and states that shortcut as its implementation. The two are only the same thing if a second Ace read
as 11 can never be the best total, which is true but is an argument rather than a check.

So `tests/unit/reference/hand-evaluator.ts` really does search, imports nothing from `src/`, and derives
rank values from the label rather than from a table. `tests/unit/hand-value.test.ts` runs the two against
each other over every ordered hand of up to five cards, every composition of six to eight, every mix of
Aces with one other rank up to 21 cards, and a fixed-seed sample at every length in between. This is item
`B1`, severity Critical, and the point of it is that a misreading shared by the code and its test would
otherwise be invisible.

## The shoe measures its shuffle rather than asserting it

"The shuffle is a uniform permutation" is item `B2`'s third clause, and it is the one clause in this
directory that no single run can settle: a fair shuffle and a lumpy one produce the same kind of output.
So `tests/unit/shoe.test.ts` shuffles a five-element array 120,000 times from a fixed seed and requires
every one of the 120 permutations to land inside five standard deviations of its expected count.

**The band is only worth having because two broken shuffles run under it and have to miss it.** One draws
its partner from the whole array instead of the unvisited prefix, which is the classic wrong Fisher-Yates
and lands 59 standard deviations out. The other reduces by `%` over a range the bound does not divide.
That second control narrows its source deliberately, and the file says why: reducing a full 32-bit word by
`% 5` is genuinely biased by 2 parts in 10^10, which no feasible sample separates from noise, so the
full-width case is checked in `tests/unit/rng.test.ts` at a bound near 2^32 where the same fault is a
factor of two instead.

`split()` gets the same treatment. A split that copies its parent's state passes every type check and
destroys the guarantee SPEC 4.1 hangs the shoe on, so the check that clears the real one is run against a
modelled clone and required to catch it.

SPEC 4.1's cut-card table is re-derived rather than quoted. `tests/unit/cut-card.test.ts` computes 146 from
four hands at 30 and a dealer at 26, buys the most cards that value can buy out of each composition to get
72 and 80, takes 25 percent of 312 and of 416 to get 78 and 104, and asserts the margins of 6 and 24 that
the "a round never exhausts the cards behind the cut card" claim rests on.

## The dealer's policy is checked against the variant it is not

`B8` says the dealer hits below 17 and stands on 17 or higher including soft 17, **with no special case in
the policy**. The second half is a claim about a branch that is not there, and no assertion about a correct
answer can see an absence. So `tests/unit/dealer-policy.test.ts` writes the forbidden branch out, runs the
hit-soft-17 variant beside the shipped policy over the same sweep, and requires the two to disagree on
exactly the nine soft 17 hands of five cards or fewer and nowhere else. That is the same device as the
shoe's two broken shuffles: the control is what makes the claim falsifiable.

The sweep's expected totals are the test file's own arithmetic, searching every reading of the Aces rather
than calling the evaluator under test, and the walk that follows starts from every two-card hand and
extends by every rank while the policy says hit. It derives the two numbers that bound the dealer's turn,
26 and twelve cards, instead of quoting them.

## The peek hands back one bit, and the same object every time

SPEC 4.4 requires the peek to leak nothing when the dealer has no natural. Nothing in a headless module can
promise that on its own, but it can promise the part that reaches the renderer: `peek` returns **one of two
frozen constants**, with one key between them, so two peeks that found no natural hand back literally the
same object. There is nothing to render, log, time or serialise that differs between one hole card and
another, because there is nothing per-call at all.

A result carrying the hole card, or a field only the natural branch filled, or merely a fresh object whose
shape differed by branch, would each be a tell that survives every later part: the card would be in memory
at the moment a renderer is looking for something to draw. `tests/unit/peek.test.ts` asserts the shape
structurally rather than trusting it, down to own property names, symbol keys, JSON text and object
identity, and `scripts/mutation-check.mjs` breaks it three ways.

**`offersInsurance` is a separate predicate from `peek` for a reason that is not tidiness.** SPEC 4.4 makes
the insurance and even-money offers close *before the peek result is applied*, since insurance can only win
on the branch the peek decides and would otherwise resolve after the one outcome it can win on. Keeping the
two questions apart is what lets the phase machine fit the whole offer between them. The ordering becomes
enforceable where phases exist, which is `BJ-7`, and `dealer.ts` documents the contract rather than
pretending to hold it.

An up card SPEC 4.4 never peeks behind is **refused rather than answered**. "No natural" would be true for a
7 and would still be wrong to return: SPEC 4.3 keeps the hole card concealed, so such a call is a phase
ordering error that has already handed a concealed card to something with no business looking at it, and an
answer would make asking a habit.

**The item is wider than this directory.** `B7` also says the round resolves at once on a natural and that a
player natural pushes, which are the phase machine's at `BJ-7` and rung 2 of the settlement ladder at
`BJ-5`. Its timing and animation half is item **`E6` at `BJ-14`**, whose criterion states it directly, "The
dealer's peek is identical in motion and pacing whether or not it finds a natural: no tell, no timing
difference, no animation variation", and whose scripted capture takes both peek branches.
`tests/unit/peek.test.ts` names that split in its header rather than reporting a pass over the whole
sentence.

## The settlement ladder is graded on its order, so the order is what gets broken

SPEC 4.10 is a table of nine rungs and one instruction, "evaluated top to bottom". The instruction is the
requirement: a ladder with two rungs swapped answers correctly for every hand that reaches only one of them,
so it passes a suite written hand by hand and pays wrong on the hands that reach both. SPEC 4.10 names the
two orderings that matter, equal naturals before either single natural and player bust before dealer bust,
and `B13`'s criterion names the same two plus a three-card 21 against a natural.

So `tests/unit/settlement.test.ts` writes out three reordered ladders and runs them beside the shipped one
over the same 7,200 cases, requiring each to disagree on **exactly** its own set and nowhere else: 48 equal
naturals for the rungs 2 and 3 swap, 144 both-bust cases for the rungs 5 and 6 swap, and 480 surrenders
facing a dealer natural for a rung 1 that lost its qualifier. All three counts are derived from the shape of
the sweep and written out, not read off a run. It is the same device as the shoe's two broken shuffles and
the dealer's hit-soft-17 variant: the control is what makes the claim falsifiable.

**Rung 1's qualifier is why the sweep drives states play cannot reach.** SPEC 4.4's peek resolves a dealer
natural before surrender, split or double is offered, so a surrendered hand can never face one in play.
Evaluated as a pure function it can, and SPEC 4.8 says what it means: late surrender is after the peek, so a
dealer natural takes the full wager rather than half. The qualifier is that sentence made arithmetic, and a
ladder is only total if it is right on the inputs a round never builds.

**No payout here rounds, and none needs to.** SPEC 4.11 keeps every reachable wager a multiple of 10, which
is exactly what makes `wager x 3 / 2`, `wager / 2` and `2 x stake` whole numbers of chips.
`tests/unit/payout-integrality.test.ts` derives that wager set rather than assuming it, by closing over the
four chip denominations up to the largest table maximum and doubling the result, and it runs the same
checker over a 25 wager, which must flag the 37.5 a green chip would owe on a natural. It also scans the
module's source, because a rounding call added to a payout that is already whole changes no number a test at
those wagers could see, and would sit there until a denomination moved.

**This module produces deltas and applies none of them.** SPEC 4.11 credits back `wager + net`, and the
crediting, the four-term identity `chips + committed + insuranceStake - deferredStake` and its conservation
are the wallet's at `BJ-6`, graded by `B15` at `BJ-15` and by the soak `H6` at `BJ-12`. Even money and the
deferred stake of SPEC 4.7 are item `B11` at `BJ-8`. That insurance settles before the ladder at all is a
property of a running round rather than of a pure function, and item `C1` grades the phase order end to end
at `BJ-20`. Both test files name those splits in their headers rather than reporting a pass over them.

## The wallet is where a wager is born, and the only place it can be

`settle()` above is a **total** function: it answers any wager it is handed, including one off the 10-chip
grid, and no assertion inside it could tell a legal wager from an illegal one. So the grid is held here
instead. The only ways to build a wager are the four controls of SPEC 4.11, `tapChip`, `Clear`, `Max` and
`Repeat`, there is no setter, and `dealRefusal` checks the grid again at the commit because the defect that
matters arrives from a caller rather than from a tap. A 25 wager reaching settlement would owe 37.5 on a
3:2 natural and lose a chip a round in silence.

**Three of SPEC 4.11's rules are claims about what the code must not do**, and no assertion about a correct
answer can see an absence, so each one is run beside the thing it is not. A tap over `min(tableMax, chips)`
is **rejected with a reason and changes nothing**, so a clamping tap runs beside it and has to disagree on
every one of the 35 refusals in the counted grid, 15 of which would have clamped to a wager off the grid.
`Max` is `floor(min(tableMax, chips) / 10) * 10`, so an unfloored `Max` and a `Max` that forgot the balance
run beside it and have to disagree on exactly 26 and 39 of the 60 cases. `Repeat` is the previous round's
wager if affordable, read here as the whole ceiling and not the balance alone, so a balance-only `Repeat`
has to disagree on exactly 19 cases and a `Repeat` that raised a small wager to the table minimum on
exactly 23. Deal is **blocked** below the minimum, never raised to it, and the commit has no path that
adjusts a wager at all.

**SPEC 6's unlocks are a high-water mark, which is item `J2`.** They are keyed to the best chip balance ever
reached, so they survive a bust and SPEC 4.12's free reset without anything being copied anywhere: the
reset restores 1,000 chips and does not touch the mark. `tests/unit/tables.test.ts` drives a wallet up
through a threshold, down to nothing and through the reset, and runs an unlock keyed to the *current*
balance beside it, which agrees on every winning session and differs the moment the criterion is about.
The entry predicate gets the same treatment from both sides: a threshold-blind predicate has to disagree on
exactly the 80 locked-but-affordable cases of the 462, and an affordability-blind one on exactly the 96
short ones.

**SPEC 13's launch fallback is unreachable, and that is asserted rather than assumed.** Every minimum in
SPEC 6 is at or below the 1,000 starting bankroll, so a persisted table is always affordable. Item `J1`
requires a test that fails loudly if a minimum passes 1,000, and there are two: the minima are compared
with 1,000 directly, and every one of the 20 launches SPEC 13 can persist is required to open at its
persisted table with the fallback not firing. The fallback is still built, still driven over the 13 pairs
SPEC 13 cannot persist, and still checked against a lowest-first scan that has to disagree on exactly the
48 cases where more than one table is enterable.

**The conserved quantity is written with four terms from the start.** `chips + committed + insuranceStake -
deferredStake` moves only by a settled outcome and by SPEC 4.12's reset. `BJ-6` pinned the last two at zero
and put them in the readout anyway, because the three-term form passes every round until the first insured
one, which is exactly the negative control the soak `H6` at `BJ-12` carries. `BJ-8` moved them, through
`takeInsurance` and `settleInsurance`, and the expression did not change shape when it did.

**The balance is non-negative after every single application, not merely at rest**, which is `B11`'s last
clause. Three things make that true rather than lucky. `takeInsurance` captures `min(chips, stake)`
**before** the debit, so it cannot take out more than is there; reading `chips` again afterwards computes
the shortfall against a balance that has already paid, and on a fully deferred stake that reads zero and
credits the player the whole stake for nothing. `settleInsurance` credits `stake + net`, which is `3 x
stake` or 0 and never negative. And the unfunded remainder is released at `endRound`, which refuses to run
while any hand is still committed, so every credit the round is owed has landed before the shortfall is
taken back. SPEC 4.7 states the margin that makes the ordering safe: the insurance credit is `3 x stake` on
a dealer natural and the natural pays `wager x 3 / 2` otherwise, and both exceed any possible shortfall.

## The phase machine is the gate the wallet deliberately is not

`wallet.ts` says in as many words that nothing in it is a phase gate: `tap`, `clear`, `max` and `repeat` are
all accepted mid-round there, because a wallet has no phases to check them against. SPEC 4.11 nevertheless
blocks "changing the wager after the deal" and "acting after the round ends", so `table.ts` is where both
sentences are enforced, and it enforces them for all seventeen intents rather than for Deal alone.

`apply(intent)` asks the phase first, then whether the action is available on the hand at all, then the
wallet. A rejection carries the layer that refused it, because "you cannot bet now", "not on this hand" and
"that is more than the table takes" are three different sentences and `B15` at `BJ-15` renders the last of
them. The order is checked directly rather than assumed: the same chip tap is offered on a screen that does
not want it, through a wallet that counts the questions it was asked, and the count has to be zero. `BJ-8`
added the middle layer for the per-hand rules of SPEC 4.5, 4.6, 4.7 and 4.8, items `B9`, `B10`, `B11` and
`B12`, in the place the wallet occupied alone.

**"Can the balance cover it" is asked in exactly one place, and it is not that layer.** SPEC 4.6 requires
Split to be "unavailable on that hand with the reason surfaced" when the chips are short, and `wallet.ts`
already answers that question inside `commitSplit`. So the availability layer does not ask it again: the
commit is attempted and its refusal is surfaced with the `wallet` layer on it. The one exception is SPEC
4.7's offer, where the rule is not about chips at all but about which offer is on the table, since even
money is "offered regardless of balance" and an ordinary stake is not.

## The legality sweep is exhaustive by arithmetic, and it drives the real machine

Eleven phases crossed with eighteen intents is 198 cells, of which SPEC 10 makes 18 legal and 180 illegal.
`tests/unit/phase-legality.test.ts` derives all three numbers, attempts every cell **on a machine of its
own**, and for each of the 180 refusals asserts both halves of `C2`: the reason surfaced, and the whole
readout unchanged by deep equality rather than by a spot check. The readout is a snapshot rather than a
view, which is what stops those 180 comparisons being idle, and a control drives the machine forward and
requires an earlier snapshot to still describe the moment it was taken.

The eighteenth intent is SPEC 10's Change Table, added at `BJ-8`: `BETTING -- Change Table, only with no
wager placed ---> START`. It is legal on one screen like every other control, and the "only with no wager
placed" half is not a legality cell at all: SPEC 10 puts the control there and then blocks it with a reason,
which is 4.11's rejection principle applied to the one control that leaves the screen. That refusal is
driven separately, along with the balance surviving it intact and the pick-and-Start flow rerunning.

The legality table is **not exported**, and the sweep transcribes SPEC 10's diagram for itself. A sweep that
imported the table it is grading would agree with any edit to it forever. Three misreadings run beside the
real one, each required to disagree on exactly its derived set: a phase-blind table on all **180** illegal
cells, insurance folded into the peek on exactly **4**, and betting controls that never close on exactly
**40**, which is the four controls across the ten phases that are not `betting`. Same device as the shoe's
two broken shuffles and the settlement ladder's three reorderings.

`createTable` opens at `start` and hands back five methods, none of which is a phase setter. Every one of
the eleven phases is reached by a transition the machine performed; what the sweep supplies is cards, from
`tests/unit/support/stacked-shoe.ts`, wherever a phase depends on which ones arrived. `BJ-7` had to supply
an up card and a settled net as well, because neither existed; `BJ-8` deals from a shoe and settles through
the ladder, so both seams are gone.

**The nine expressions `BJ-7` listed as inert are all live**, and each one carries a mutation entry: the
dealer's `shouldHit` operand and the whole of the peek's natural test now read dealt cards, the round
boundary clears real hands, the readout copies a real dealer hand, the offer's `evenMoney` answers SPEC
4.2's question of a hand that can be a natural, and the move-right arm of the active hand is what SPEC 4.6
walks a split down. The disclosure block in `table.ts` that named them is gone, because it described a state
the module is no longer in.

**The hazard `BJ-7` wrote into `settleRound` is resolved, and `B10` chose the first of the two options it
named.** `HandInPlay` carries `walletHand`, populated from the commit result. The wallet **appends** a split
hand, which is commit order, while SPEC 4.6 plays hands left to right, so `takeSplit` **inserts** beside the
parent: three splits of the leftmost hand leave the play order holding the wallet's hands as 0, 3, 2, 1.
Forcing the two orders together would have meant the wallet inserting too, and every index a caller was
holding shifting underneath it. `tests/unit/split.test.ts` drives that round with one hand doubled, so a
settlement keyed on the position credits a different set of hands; the **round total is identical either
way**, because a permutation cannot change a sum, which is exactly why the per-hand credits are the check
and the total is not.

## The round is the five criteria of `BJ-8`, and each is driven against a control

`tests/unit/deal.test.ts` takes SPEC 4.3 one card at a time and reads off who received each: a deal that
gave the player both cards first differs at exactly the two middle positions, and a hole card dealt face up
differs at exactly the phases SPEC 4.3 keeps it down. The no-leak half is separate from the count: a whole
round is walked with every snapshot kept, and the card that turns out to be the hole card must appear in
none of them before the reveal, compared by object identity because a six-deck shoe holds six of each card.

`tests/unit/double.test.ts` and `tests/unit/surrender.test.ts` each sweep the availability rule over every
shape of hand it can be asked about, 64 and 24 of them, and run a misreading beside it: Double without its
card count differs on exactly 12, and Surrender without its split clause on exactly 3, of which exactly one
is the two-card split hand the clause exists for. Both rules are also asked directly about hands play cannot
assemble, a live split-Ace hand among them, for the reason `settlement.ts` gives for rung 1's qualifier.

`tests/unit/split.test.ts` drives all ten sentences of SPEC 4.6 and settles a four-hand round. The equal-rank
comparison is run beside equal value over all 169 ordered rank pairs and has to disagree on exactly the 12
mixed ten-value ones. The 1:1 clause is driven as a pair: the same Ace and ten pay 125 unsplit and 100 on a
split hand, a difference of exactly the 25 chips `fromSplit` exists to decide.

`tests/unit/insurance.test.ts` walks every insurance scenario frame by frame and asserts where SPEC 4.11's
four-term identity moved as well as by how much: taking the offer moves it by nothing, the peek moves it by
the side wager's net, the settlement by the hand's, and the release of the deferred remainder by nothing at
all. **The release is at the round boundary and not at the peek**, and the control is the design that was
rejected: releasing it with the side wager is written out and required to take the balance negative on
exactly the branch where the stake is lost, which is the branch whose credit is zero.

## The coach is generated, checked against a chart it did not write, and cannot reach the game

`strategy.ts` holds no chart. It holds basic strategy as rules, written per row as the up cards a play
applies against, and `strategyTable(rules)` resolves them into 380 cells: 18 hard totals and 10 soft totals
and 10 pair rows, each against SPEC 7's ten dealer up cards. SPEC 7 requires exactly that: "the table is
generated from the active house-rule record, never stored as one chart".

**What makes that claim checkable is a second chart nobody generated.**
`tests/unit/reference/basic-strategy-charts.ts` carries all eight rule combinations, written out by hand
from published basic strategy for a shoe of 4 to 8 decks with the dealer standing on soft 17, which is the
game SPEC 4 describes. It imports nothing from `src/` and never ships, which SPEC 7 and DESIGN section 7
both require. `tests/unit/strategy-coach.test.ts` compares 3,040 cells against it, `380 x 8`, and the count
is derived from the row and column lists on both sides so a row quietly dropped fails the arithmetic rather
than shrinking the sweep. This is `hand-evaluator.ts`'s discipline applied to SPEC 7: a chart pasted from
the generator's own output would agree with the generator's misreading forever.

**Of the three axes, two move cells and one does not.** Double after split moves exactly 7 pair cells, and
late surrender exactly 7 that are all one of two hard totals: 15 against a 10, 16 against a 9, a 10 and an
Ace, and the three 8,8 cells whose fall-through is that same hard 16. Both sets are written out and two
deliberately wrong generators are required to disagree on **exactly** their own set, one with the toggle
inverted and one that emits the right rule set and then drops surrender from every list. The shoe size moves
nothing: the 6-deck and 8-deck charts were written out separately and came out identical cell for cell,
which is the right answer for total-dependent S17 play, and the test asserts that identity rather than
hiding it behind a sweep that would pass either way. Both sizes are still swept, so a wrong deck branch
would still be caught.

**Two documents say the shoe size moves recommendations, and both are left exactly as written.** They are
[../../../SPEC.md](../../../SPEC.md) section 7, "Changing shoe size or turning DAS off changes some
recommendations", and [../../../DESIGN.md](../../../DESIGN.md) section 7, "because the correct action
genuinely changes with shoe size, DAS availability and surrender availability". Each is satisfied through
the DAS axis, which really does move seven cells. The shoe-size half of each is unsatisfiable and is the
user's to resolve, in one approved edit that touches both: they are a matched pair, and editing one of a
pair is how the two come apart. Both are named here, in `strategy.ts`, in the reference chart and in the
sweep, so that edit finds every home of the claim.

**A cell is a preference list, and legality is never decided here.** DESIGN section 7's `['double', 'hit']`
is walked down to the first action currently legal, which is what makes one cell correct on a two-card hand,
on a three-card hand and on a balance that cannot fund the increment. Every clause of SPEC 4.5, 4.6 and 4.8
is asked of `table.ts`'s four exported refusal predicates, so the game has one reading of them; the chip
half is the one comparison the coach makes for itself, because `wallet.ts` decides it inside `commitDouble`
and `commitSplit`, which **spend** the chips they check. A coach that asked by committing would be a coach
that changed the game, so the two answers are pinned together by test instead, against a real wallet on both
sides of the boundary. A pair cell always carries a tail for the same reason: `['split']` alone would leave
the coach silent on a pair the three-split cap or the balance will not let the player split.

**That the coach cannot change an outcome is asserted, not asserted about.** Two 120-round seeded sessions
are played from the same seed with the same intent policy, one with the coach observing every decision and
one without, and the whole readout is serialised at every step: the phase and its payload, every card, the
timers, the shoe's counters and the wallet's four-term identity. The transcripts have to be equal step for
step, and the run with the coach on has to have produced hundreds of recommendations and counted hundreds of
decisions, because otherwise the comparison would pass just as well against a coach that did nothing.

## The counters, the milestones and the history observe the round and own none of it

`statistics.ts` and `history.ts` are both folds over one `TableReadout` taken at SPEC 10's `roundResult`,
which is the phase where the money has settled and the cards are still on the felt. Neither holds a copy of
anything that already has an owner: the best chip balance stays `wallet.ts`'s high-water mark, so SPEC 9's
two table milestones ask `isUnlocked` rather than restating SPEC 6's thresholds and SPEC 11's readout reads
it straight off the wallet; SPEC 7's two accuracy counters stay `strategy.ts`'s `CoachRecord` and are passed
in where they are needed. That is what settles milestone 10's reading without a branch: `strategy.observe`
returns the record untouched while the coach is off, and nothing here counts a decision of its own, so a
session played with the coach off cannot accrue toward it.

**One extension to the machine, and it is the one field that cannot be recomputed.** SPEC 8 asks a history
entry for "every action taken". Every other field it names can be read back off a finished round, but a
**declined** insurance offer leaves no trace in the cards, the wallet or the settlement, so a round that
refused insurance and one that was never offered it are otherwise identical afterwards. `BJ-10` therefore
added a per-round journal of **accepted** actions to `table.ts`, appended at the single point every intent
passes through and cleared with the felt at `Next Hand`, and published it on `RoundResult`. It claims no
acceptance item; `J5` is the item whose field list it exists to complete. The journal is SPEC 4.5's six-row
action table with SPEC 4.7's insurance row read as the two intents SPEC 10 offers, which is a different list
from `strategy.actionOf`'s five basic-strategy decisions, deliberately: folding them together would put an
insurance decision into the coach's accuracy.

**SPEC 9 leaves five things open, and each one is a documented reading with a test that pins it.** A push
leaves a win streak exactly where it was, since a hand the player did not lose is no reason to take a run
away from them. "Doubling the bankroll" is measured on the wallet's high-water mark rather than the balance
at rest, because a bankroll doubled and then lost was still doubled. Row 11's "below 10 percent" is
`chips < 100` at rest and its recovery is `chips >= 1,000` at rest, and **the latch is cleared by SPEC 4.12's
free reset and by a fresh launch**: both hand the player 1,000 chips, and a latch that survived either would
award the row to everyone who ever busted out and pressed the button. A win is a settled hand whose net is
positive, read from the net rather than the outcome name so that SPEC 4.8's surrender lands in losses without
a fourth bucket SPEC 11 does not have. And the streak rows are decided on the longest run the round reached
rather than the run it ended on, so a five-hand streak the last hand of a split round broke still counts.

**Two guards, because a caller cannot be asked to be careful.** `observeRound` refuses a readout that is not
at `roundResult` and refuses a round it has already counted, which is what a chrome polling the readout every
frame would hand it. `record` refuses the same two things and also refuses a result whose hole card is still
down, so SPEC 8's "the dealer hand and its value" cannot quietly become the up card alone.

**Neither document persists anything, and both are shaped so `BJ-11` can.** They are plain frozen values of
numbers, booleans and strings, and both suites prove the round trip: `JSON.parse(JSON.stringify(x))` is
deep-equal and re-serialises byte for byte, awarded milestones stay awarded, and a `null` coach verdict stays
`null` rather than losing its key. The `localStorage` document itself is item `I1` and the fresh launch is
item `I4`, both at `BJ-11`.

## The timers are accumulators, and the module has no clock in it

DESIGN section 3 is implemented literally: `update(dt)` clamps the delta per QUALITY-BAR section 7, adds it
to a float accumulator and drains due work in a `while` loop, so a frame long enough to cover two steps
takes two. SPEC 5's seven reference timings live in one record here, with the Speed setting's 0.6 named
beside them for item `E9` at `BJ-14`, and the peek borrows the hole card's own flip rather than acquiring a
constant of its own: one number and no branch is the half of SPEC 4.4's no-tell clause a headless module can
hold, and `E6` at `BJ-14` grades the motion half on both branches.

Six of the eleven phases have no timer at all, which generalises SPEC 4.7's "the decision point has no
timer", and `update` is a no-op on every one of them. That is also why `apply` carries no accumulator reset:
an intent is only ever legal on a screen with no timer, where the accumulator is already zero, so a reset
there would be a line no test could cover. The invariant is asserted at every phase of every round the suite
drives instead. That no clock reaches the module is a claim about an absence, so the source is scanned for
`setTimeout`, `Date`, `performance` and a frame counter, after the comments are stripped, and every pattern
in the scan carries a sample it must match so that a typo cannot report clean forever.

QUALITY-BAR section 7's resume is implemented in the words that section uses: a gap longer than 5 s empties
**the accumulator**, not merely the delta, which are different rules whenever time was already owed. The
test drives it at a non-zero accumulator for that reason, since at zero the weaker reading passes.
`clampDelta` stays a pure function of one delta because `M5` at `BJ-12` drives it directly, so the part that
is about state lives in `update`. `E9`'s Speed setting must multiply where the duration is consumed, in
`timedStep`, and never by copying the timings record: `PEEK_PAUSE` is bound to the hole-card flip once, and
an alias cannot follow a copy, which would leave the peek at Normal speed while everything around it
shortened. That is the timing difference SPEC 4.4 forbids.
