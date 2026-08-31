/**
 * Item `M4`, severity Critical, 11 points. `BJ-21`.
 *
 *   "A thrown error from the loop, a window.onerror and an unhandledrejection
 *    each stop the loop cleanly and show a styled, accessible recovery panel
 *    with a working reload action. No bare catch block exists in the source."
 *
 * QUALITY-BAR section 12 and SPEC 18. Four clauses, and the first three are
 * three separate routes into one handler, so each is driven separately below
 * over the built `dist/` with nothing injected into the page.
 *
 * **The last clause is not here.** "No bare catch block exists in the source" is
 * a scan of every file under `src/`, and it already runs in the unit suite:
 * `tests/unit/storage-write-failure.test.ts` walks the whole directory with a
 * can-see control in front of the scanner. Repeating it in a browser would be a
 * second reading of one rule, and a slower one. `scripts/mutation-check.mjs`
 * drops a bare catch into the real `src/ui/` and requires the unit gate to go
 * red, which is what makes that scan evidence rather than decoration.
 *
 * **"Stops the loop" is measured, not inferred.** Two instruments, and each has
 * a control that proves it can see:
 *
 *   - **Frames.** An init script wraps `requestAnimationFrame` and counts every
 *     callback it delivers. The loop reschedules itself through that function on
 *     every frame, so a running game moves the counter and a stopped one does
 *     not. The two directions are read differently and deliberately: the control
 *     reading waits until frames arrive, because how fast this machine is under
 *     four workers and three engines is not the thing being measured, and the
 *     reading after the failure is a fixed quiet window that must contain
 *     exactly none, because a stopped loop delivers nothing at any speed.
 *     Neither runs beside a locator poll, because Playwright's own polling also
 *     uses animation frames, and both are taken on the same page.
 *   - **Throws.** The route that breaks the play surface counts the calls it
 *     refuses. A loop that carried on would refuse a second, a third and a
 *     sixtieth within the second the test then waits, so "exactly one" is the
 *     assertion rather than "at least one".
 *
 * **The break is a real platform failure, not a hook in the product.** Nothing
 * in `src/` knows this spec exists. The first route replaces
 * `CanvasRenderingContext2D.prototype.clearRect`, which `renderFrame` calls at
 * the top of every frame it actually draws, with one that throws: that is a
 * genuine exception out of the composition root's frame callback, on the
 * shipped bundle, through the shipped loop. The other two routes are an
 * uncaught error in a timer and a promise nobody handled, which is what the
 * criterion names them as.
 *
 * The accessibility scan over the panel lives in `tests/browser/axe.spec.ts`
 * beside the overlay scans, for the reason that file gives: one page, one axe
 * injection, one configuration.
 */

import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

import { forceColours } from './support/forced-colors';
import { control, openShippedPage, shell, waitForPhase } from './support/game';

declare global {
  interface Window {
    /** Animation-frame callbacks delivered, counted by the init script. */
    __bjFrames?: number;
    /** Calls the broken play surface has refused. */
    __bjThrows?: number;
  }
}

/** The panel, by the attribute `src/ui/recovery.ts` puts on it. */
const PANEL = '[data-recovery="panel"]';

/** How many frames the control reading waits for before it believes the loop. */
const FRAME_FLOOR = 4;

/** How long the control reading may wait for them. See `framesWhileRunning`. */
const FRAME_TIMEOUT_MS = 5000;

/** How long the page is left alone before a stopped loop is called stopped. */
const QUIET_MS = 500;

/**
 * Count every animation frame the page delivers, from before the bundle runs.
 *
 * `src/ui/loop.ts` reads `requestAnimationFrame` off the global scope at each
 * call, so a wrapper installed before the document loads is the function the
 * loop actually schedules through.
 */
async function countFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__bjFrames = 0;
    const scheduled = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      scheduled((time: number) => {
        window.__bjFrames = (window.__bjFrames ?? 0) + 1;
        callback(time);
      });
  });
}

/** How many frames the page delivered over a quiet interval. */
async function framesOver(page: Page, ms: number): Promise<number> {
  const before = await page.evaluate(() => window.__bjFrames ?? 0);
  await page.waitForTimeout(ms);
  const after = await page.evaluate(() => window.__bjFrames ?? 0);
  return after - before;
}

/**
 * The control reading: wait until the loop has delivered frames, and say how
 * many.
 *
 * **Bounded by a count rather than by a clock**, and the difference is a flake
 * this file had: a fixed 350 ms window asked for more than three frames, which
 * is 8.6 frames a second, and three engines at four workers each on a loaded
 * machine can deliver fewer than that. What this control has to establish is
 * that the instrument sees a running loop at all, not how fast the machine is,
 * so it polls until the frames arrive and fails with a reason if they never do.
 * The other direction, zero frames after the failure, keeps its fixed window:
 * a stopped loop delivers nothing however slow the machine is.
 */
async function framesWhileRunning(page: Page): Promise<number> {
  const before = await page.evaluate(() => window.__bjFrames ?? 0);
  const deadline = Date.now() + FRAME_TIMEOUT_MS;
  let delivered = 0;
  while (Date.now() < deadline) {
    delivered = (await page.evaluate(() => window.__bjFrames ?? 0)) - before;
    if (delivered >= FRAME_FLOOR) {
      return delivered;
    }
    await page.waitForTimeout(100);
  }
  return delivered;
}

/** Break the play surface, so the next frame that draws throws out of the loop. */
async function breakTheSurface(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__bjThrows = 0;
    CanvasRenderingContext2D.prototype.clearRect = (): void => {
      window.__bjThrows = (window.__bjThrows ?? 0) + 1;
      throw new Error('the play surface refused a frame');
    };
  });
  // A settled scene is not redrawn, which is `scene.ts`'s own dirty check, so
  // the break is followed by something that certainly dirties it: a chip press.
  // The pending wager is part of what the surface draws, so the frame that
  // answers the press is a frame that draws.
  //
  // The press is dispatched in the page rather than driven through Playwright,
  // and the guard is why: a scene that was still animating when the break
  // landed has already failed, the shell has already gone, and there is nothing
  // left to press. A driven click would wait for an element that is never
  // coming back; this asks whether it is there and moves on. Either way the
  // panel is up before the assertions read it, and the press itself is a real
  // `click` on the real control when it happens at all.
  await page.evaluate(() => {
    const chip = document.querySelector('[data-chip="10"]');
    if (chip instanceof HTMLElement) {
      chip.click();
    }
  });
}

/** Reach SPEC 10's betting screen on the shipped page, with nothing injected. */
async function atBettingOnTheShippedPage(page: Page): Promise<void> {
  await openShippedPage(page);
  await waitForPhase(page, 'start');
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
}

// ---------------------------------------------------------------------------
// Route 1: a throw out of the frame callback
// ---------------------------------------------------------------------------

test.describe('M4: a thrown error from the loop', () => {
  test('stops the loop after exactly one throw and shows the panel', async ({ page }) => {
    await countFrames(page);
    const logged: ConsoleMessage[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        logged.push(message);
      }
    });
    const uncaught: string[] = [];
    page.on('pageerror', (error) => {
      uncaught.push(error.message);
    });
    await atBettingOnTheShippedPage(page);

    // The control. Without it, "no frames after the failure" is satisfied by an
    // instrument that never saw a frame at all.
    const running = await framesWhileRunning(page);
    expect(
      running,
      'the frame counter saw no running loop before anything broke',
    ).toBeGreaterThanOrEqual(FRAME_FLOOR);

    await breakTheSurface(page);
    await expect(page.locator(PANEL)).toBeVisible();

    // Stopped: the shell is off the page and no further frame was delivered.
    await expect(shell(page)).toHaveCount(0);
    expect(await framesOver(page, QUIET_MS), 'the loop kept running').toBe(0);
    expect(
      await page.evaluate(() => window.__bjThrows ?? 0),
      'the loop threw more than once, so it did not stop',
    ).toBe(1);

    // Not swallowed. QUALITY-BAR section 12: nothing fails silently.
    //
    // The thrown value is read out of the console message's own argument rather
    // than out of its rendered text, because the three engines render a logged
    // `Error` differently: Firefox's text for `console.error(error)` is the
    // word "Error" and nothing else. The argument is the object the boundary
    // was handed, on every engine.
    const reported = await Promise.all(
      logged.map(async (message): Promise<string> => {
        const first = message.args()[0];
        if (first === undefined) {
          return message.text();
        }
        return first.evaluate((value: unknown) =>
          value instanceof Error ? value.message : String(value),
        );
      }),
    );
    expect(reported).toContain('the play surface refused a frame');

    // **Caught, rather than merely noticed.** This is what separates the first
    // route from the second, and it is the difference the criterion's own
    // wording rests on: QUALITY-BAR section 12 asks for a boundary that
    // "catches anything thrown from the loop", and a throw that escaped the
    // frame callback and was picked up afterwards by the page-level listener
    // is not caught, it is reported. The browser tells the harness about every
    // uncaught error; for this route it must have nothing to tell.
    expect(uncaught, 'the throw escaped the frame instead of being caught').toEqual([]);
  });

  test('leaves the same panel standing, whatever the stopped page throws next', async ({
    page,
  }) => {
    await atBettingOnTheShippedPage(page);
    await breakTheSurface(page);
    await expect(page.locator(PANEL)).toBeVisible();

    // The panel is stamped, and focus is put where a player about to press
    // reload would have put it. **Counting panels is not enough**: a boundary
    // that rebuilt the panel on every later failure would replace the node and
    // still leave exactly one of them, so what is asserted is that this
    // element survives, with the focus it was holding.
    await page.locator(`${PANEL} [data-control="recovery-reload"]`).focus();
    await page.evaluate((selector) => {
      document.querySelector(selector)?.setAttribute('data-stamp', 'first');
    }, PANEL);

    // A second and a third failure, by both of the other routes. A panel
    // rebuilt on each one is a panel the player cannot press, because the
    // element they were reaching for keeps being replaced underneath them.
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('a second failure');
      }, 0);
      void Promise.reject(new Error('a third failure'));
    });
    await page.waitForTimeout(QUIET_MS);

    await expect(page.locator(PANEL)).toHaveCount(1);
    await expect(page.locator(PANEL)).toHaveAttribute('data-stamp', 'first');
    await expect(page.locator(`${PANEL} [data-control="recovery-reload"]`)).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('data-control') ?? ''),
      'the later failures took focus off the reload action',
    ).toBe('recovery-reload');
  });
});

// ---------------------------------------------------------------------------
// Routes 2 and 3: an uncaught error, and a rejection nobody handled
// ---------------------------------------------------------------------------

test.describe('M4: a page-level failure', () => {
  test('stops the loop and shows the panel on an uncaught error', async ({ page }) => {
    await countFrames(page);
    const uncaught: string[] = [];
    page.on('pageerror', (error) => {
      uncaught.push(error.message);
    });
    await atBettingOnTheShippedPage(page);
    expect(await framesWhileRunning(page)).toBeGreaterThanOrEqual(FRAME_FLOOR);

    // A throw out of a timer is an uncaught error, which is the event this
    // route listens for. It is deliberately not thrown inside `page.evaluate`,
    // where the protocol would carry it back to the test instead.
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('something outside the loop broke');
      }, 0);
    });

    await expect(page.locator(PANEL)).toBeVisible();
    await expect(shell(page)).toHaveCount(0);
    expect(await framesOver(page, QUIET_MS), 'the loop kept running').toBe(0);
    // The route really was an uncaught error rather than a call into the
    // boundary: the browser reported one to the harness as well.
    expect(uncaught).toEqual(['something outside the loop broke']);
  });

  test('stops the loop and shows the panel on an unhandled rejection', async ({ page }) => {
    await countFrames(page);
    await atBettingOnTheShippedPage(page);
    expect(await framesWhileRunning(page)).toBeGreaterThanOrEqual(FRAME_FLOOR);

    await page.evaluate(() => {
      void Promise.reject(new Error('a promise nobody handled'));
    });

    await expect(page.locator(PANEL)).toBeVisible();
    await expect(shell(page)).toHaveCount(0);
    expect(await framesOver(page, QUIET_MS), 'the loop kept running').toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The panel itself: styled, accessible, and its one action
// ---------------------------------------------------------------------------

test.describe('M4: the recovery panel', () => {
  test('is named, is an alert, and holds focus when it arrives', async ({ page }) => {
    await atBettingOnTheShippedPage(page);
    await breakTheSurface(page);

    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'alert');

    const named = await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      const labelled = node?.getAttribute('aria-labelledby') ?? '';
      const title = labelled === '' ? null : document.getElementById(labelled);
      return {
        name: title?.textContent?.trim() ?? '',
        heading: document.querySelectorAll('h1').length,
        focused: document.activeElement === node,
        message: node?.querySelector('p')?.textContent?.trim() ?? '',
      };
    }, PANEL);

    expect(named.name, 'the panel has no accessible name').not.toBe('');
    // Item `G6`'s single `h1` survives the failure: the shell took its own with
    // it, and the panel's is the one heading the page now has.
    expect(named.heading).toBe(1);
    expect(named.focused, 'focus stayed where the removed shell left it').toBe(true);
    expect(named.message.length, 'the panel says nothing').toBeGreaterThan(0);

    // The action is a real button, reachable by keyboard from the panel.
    const action = page.locator(`${PANEL} [data-control="recovery-reload"]`);
    await expect(action).toBeVisible();
    expect(await action.evaluate((node) => node.tagName.toLowerCase())).toBe('button');
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('data-control') ?? ''),
    ).toBe('recovery-reload');
  });

  test('arrives even when the stop itself throws', async ({ page }) => {
    // The game's own teardown, made to fail: `dispose` takes the shell off the
    // page with `Element.remove`, and a platform where that throws is a
    // platform where the boundary's stop cannot finish. The panel is not
    // conditional on it, because a player whose game broke twice needs the way
    // out more rather than less. Nothing else in the page calls `remove`
    // during this sequence, and Playwright never calls it at all.
    await atBettingOnTheShippedPage(page);
    await page.evaluate(() => {
      Element.prototype.remove = (): void => {
        throw new Error('the teardown refused');
      };
    });
    await breakTheSurface(page);

    await expect(page.locator(PANEL)).toBeVisible();
    await expect(page.locator(`${PANEL} [data-control="recovery-reload"]`)).toBeVisible();
  });

  test('reloads the game when the action is pressed', async ({ page }) => {
    await atBettingOnTheShippedPage(page);
    await breakTheSurface(page);
    await expect(page.locator(PANEL)).toBeVisible();

    await page.locator(`${PANEL} [data-control="recovery-reload"]`).click();

    // A working reload: the page comes back, the panel is gone, and the game is
    // running again from SPEC 10's start screen.
    await expect(shell(page)).toBeVisible();
    await expect(page.locator(PANEL)).toHaveCount(0);
    await waitForPhase(page, 'start');
  });

  test('stays legible at 200 percent text', async ({ page }) => {
    await atBettingOnTheShippedPage(page);
    // QUALITY-BAR section 4's own mechanism, as `text-scale.spec.ts` applies it:
    // the root font size, not browser zoom.
    await page.evaluate(() => {
      const root = document.documentElement;
      const before = Number.parseFloat(getComputedStyle(root).fontSize);
      root.style.fontSize = `${String(before * 2)}px`;
    });
    await breakTheSurface(page);
    await expect(page.locator(PANEL)).toBeVisible();

    const measured = await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      if (node === null) {
        return null;
      }
      const box = node.getBoundingClientRect();
      const button = node.querySelector('button');
      const buttonBox = button?.getBoundingClientRect() ?? null;
      return {
        clipped: node.scrollWidth > node.clientWidth + 1,
        rootScroll: document.documentElement.scrollWidth,
        rootClient: document.documentElement.clientWidth,
        inside: box.width > 0 && box.height > 0,
        buttonClipped:
          button === null ? true : button.scrollWidth > button.clientWidth + 1,
        buttonReachable:
          buttonBox === null
            ? false
            : document
                .elementFromPoint(
                  buttonBox.x + buttonBox.width / 2,
                  buttonBox.y + buttonBox.height / 2,
                )
                ?.closest('button') === button,
      };
    }, PANEL);

    expect(measured).not.toBeNull();
    expect(measured?.clipped, 'the panel clips its own text at 200 percent').toBe(false);
    expect(measured?.buttonClipped, 'the reload label is clipped at 200 percent').toBe(false);
    expect(measured?.inside).toBe(true);
    expect(measured?.buttonReachable, 'the reload action cannot be pressed').toBe(true);
    // Item `F2`'s rule, which the panel inherits rather than restates: no
    // horizontal page scroll at any width.
    expect(measured?.rootScroll).toBeLessThanOrEqual((measured?.rootClient ?? 0) + 1);
  });

  test('takes the system palette under forced colors', async ({ page, browserName }) => {
    // **The engine is asked, not named.** This was a `browserName !== 'chromium'`
    // skip until the review measured it: Firefox emulates forced colors and ran
    // the whole of `forced-colors.spec.ts` green, so naming an engine skipped a
    // measurement that works. This is that file's own probe, copied rather than
    // shared because a spec cannot import another spec: ask for the emulation,
    // then ask the **page** whether the query took effect, so an engine that
    // silently ignores the request produces a skip with a reason instead of a
    // green run that measured nothing.
    await forceColours(page, browserName);
    await atBettingOnTheShippedPage(page);
    await breakTheSurface(page);
    await expect(page.locator(PANEL)).toBeVisible();

    const painted = await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      if (node === null) {
        return null;
      }
      const style = getComputedStyle(node);
      return {
        color: style.color,
        background: style.backgroundColor,
        border: style.borderTopColor,
        borderWidth: style.borderTopWidth,
      };
    }, PANEL);

    expect(painted).not.toBeNull();
    // The panel's own edge is what separates it from the ground once the
    // background and the ground are one system colour, so the border has to be
    // both present and a different colour from the text's ground.
    expect(painted?.color).not.toBe(painted?.background);
    expect(Number.parseFloat(painted?.borderWidth ?? '0')).toBeGreaterThan(0);
    expect(painted?.border).not.toBe(painted?.background);
  });
});
