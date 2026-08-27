/**
 * What the chrome offers on each of SPEC 10's screens, and how a spec presses
 * one by each of QUALITY-BAR section 3's three input methods.
 *
 * `SCREEN_CONTROLS` was written at `BJ-16` for item `F1`, inside
 * `tests/browser/breakpoints.spec.ts`, and moved here at `BJ-17` unchanged: item
 * `D2` needs the same list for a different question, and two copies of a control
 * census is how one of them quietly stops being complete. `F1` asks whether
 * every control on the current screen is **reachable**; `D2` asks whether every
 * one of them is reachable by **all three** input methods and whether every
 * action the game has is on one of them.
 *
 * Nothing in this file asserts anything. It is the shared list and the shared
 * press, and each spec decides what to require of them.
 */

import { expect, type Page } from '@playwright/test';

/**
 * Every control SPEC 10 puts on each screen this project grades.
 *
 * **Presence is what the list is for, not visibility.** `actions.ts` renders all
 * five of SPEC 4.5's actions on every hand and greys the ones the rules refuse,
 * so a missing Double is a defect and a greyed Double is the design; the two are
 * different assertions. The `BJ-16` review proved the gap by hiding `double` at
 * portrait, which every test in that file passed.
 *
 * `bust-out` is the one screen `F1` does not grade, deliberately: SPEC 4.12
 * reaches it only from a balance below the table minimum, which is a played-down
 * bankroll rather than a boot option. `D2` does drive it, because SPEC 10 puts
 * two intents there and nowhere else, so it is listed and
 * `tests/browser/breakpoints.spec.ts` skips the entry it does not use.
 *
 * **The mute control is on every screen, `BJ-19`.** It lives in the top bar
 * beside the panel openers rather than on any phase's own screen, because item
 * `K3` asks for it "in a single action from the play screen" unscoped by
 * breakpoint or phase, and the top bar is the one row no phase takes away and
 * the responsive disclosure never swallows. It is listed under every phase for
 * the same reason the three panel openers are.
 */
export const SCREEN_CONTROLS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  start: [
    'data-table=bronze',
    'data-table=silver',
    'data-table=gold',
    'data-control=start',
    'data-open-overlay=settings',
    'data-open-overlay=howToPlay',
    'data-open-overlay=statistics',
    'data-control=mute',
  ],
  betting: [
    'data-chip=10',
    'data-chip=50',
    'data-chip=100',
    'data-chip=500',
    'data-control=clear',
    'data-control=repeat',
    'data-control=max',
    'data-control=deal',
    'data-control=change-table',
    'data-open-overlay=settings',
    'data-open-overlay=howToPlay',
    'data-open-overlay=statistics',
    'data-control=mute',
  ],
  playerTurn: [
    'data-action=hit',
    'data-action=stand',
    'data-action=double',
    'data-action=split',
    'data-action=surrender',
    'data-open-overlay=settings',
    'data-open-overlay=howToPlay',
    'data-open-overlay=statistics',
    'data-control=mute',
  ],
  insurance: [
    'data-control=take-insurance',
    'data-control=decline-insurance',
    'data-open-overlay=settings',
    'data-open-overlay=howToPlay',
    'data-open-overlay=statistics',
    'data-control=mute',
  ],
  roundResult: [
    'data-control=next-hand',
    'data-open-overlay=settings',
    'data-open-overlay=howToPlay',
    'data-open-overlay=statistics',
    'data-control=mute',
  ],
  bustOut: [
    'data-control=reset-bankroll',
    'data-open-overlay=settings',
    'data-open-overlay=howToPlay',
    'data-open-overlay=statistics',
    'data-control=mute',
  ],
});

/**
 * The attributes that name a control, in the order they are looked for.
 *
 * The same list `layoutReport` in `support/game.ts` names a control with, so
 * "the control the report found" and "the control that has focus" are the same
 * string for the same button and a spec can compare the two.
 */
const CONTROL_ATTRIBUTES = [
  'data-control',
  'data-action',
  'data-chip',
  'data-open-overlay',
  'data-table',
  'data-drop-table',
  'data-coach-mode',
  'data-speed',
  'data-surface-size',
  'data-focus-anchor',
  'data-overlay-host',
] as const;

/** `data-control=deal` as `[data-control="deal"]`. */
export function selectorFor(key: string): string {
  const [attribute, value] = key.split('=');
  return `[${String(attribute)}="${String(value)}"]`;
}

// ---------------------------------------------------------------------------
// The three input methods, and one press by each
// ---------------------------------------------------------------------------

/** QUALITY-BAR section 3's three, by the names that section uses. */
export type InputMethod = 'pointer' | 'touch' | 'keyboard';

export const INPUT_METHODS: readonly InputMethod[] = Object.freeze([
  'pointer',
  'touch',
  'keyboard',
]);

/**
 * Press one control by one input method, for real.
 *
 * Every arm goes through the platform rather than through a dispatched event.
 * `page.mouse` and `page.touchscreen` drive the engine's own input pipeline, so
 * what the page receives is a genuine mouse press and a genuine touch, with the
 * `pointerType` and the compatibility events the browser generates for each;
 * the keyboard arm focuses and presses a real key. A spec that dispatched
 * `new MouseEvent('click')` would prove that the handler runs when called, which
 * is not what item `D2` is about.
 *
 * `key` chooses which keyboard activation is used. QUALITY-BAR section 3 asks
 * for both `Enter` and `Space`, and item `D4`'s spec drives each of them over
 * every kind of control; `D2` uses `Enter`, which is the one both a button and a
 * `<summary>` answer to.
 */
export async function pressBy(
  page: Page,
  method: InputMethod,
  selector: string,
  key: 'Enter' | ' ' = 'Enter',
): Promise<void> {
  const target = page.locator(selector);
  await target.scrollIntoViewIfNeeded();
  if (method === 'pointer') {
    await target.click();
    return;
  }
  if (method === 'keyboard') {
    await target.focus();
    await expect(target, 'the control took focus before the key press').toBeFocused();
    await page.keyboard.press(key);
    return;
  }
  const box = await target.boundingBox();
  expect(box, `${selector} has a rendered box to tap`).not.toBeNull();
  if (box === null) {
    throw new Error(`${selector} has no box`);
  }
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

// ---------------------------------------------------------------------------
// Focus, as the page reports it
// ---------------------------------------------------------------------------

/** One stop of the tab order, as the page describes itself. */
export interface FocusStop {
  /** The control's data attribute, or `BODY` when focus left the page. */
  readonly key: string;
  readonly tag: string;
  /** Whether the engine considers the indicator worth drawing right now. */
  readonly focusVisible: boolean;
  /** The rendered box, so a walk can be compared against reading order. */
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** What has focus right now, named the way `SCREEN_CONTROLS` names controls. */
export async function focusedStop(page: Page): Promise<FocusStop> {
  return page.evaluate((attributes: readonly string[]) => {
    const node = document.activeElement;
    if (node === null || node === document.body || !(node instanceof HTMLElement)) {
      return {
        key: 'BODY',
        tag: 'body',
        focusVisible: false,
        box: { x: 0, y: 0, width: 0, height: 0 },
      };
    }
    let key = node.tagName.toLowerCase();
    for (const attribute of attributes) {
      const value = node.getAttribute(attribute);
      if (value !== null) {
        key = `${attribute}=${value}`;
        break;
      }
    }
    const box = node.getBoundingClientRect();
    return {
      key,
      tag: node.tagName.toLowerCase(),
      // `:focus-visible` is the engine's own answer to "should the indicator be
      // drawn", which is the question the criterion asks. Matching it is wrapped
      // because an engine without the selector would throw rather than answer.
      focusVisible: node.matches(':focus-visible'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  }, CONTROL_ATTRIBUTES as readonly string[]);
}

/** Walk the tab order forward from wherever focus is, recording every stop. */
export async function tabOrder(page: Page, steps: number): Promise<readonly FocusStop[]> {
  const stops: FocusStop[] = [];
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press('Tab');
    stops.push(await focusedStop(page));
  }
  return stops;
}

/**
 * Land on one control **by a key press**, from the control beside it.
 *
 * Not a walk from the top of the page, and the difference is measured: an engine
 * resumes sequential navigation from whatever last held focus, and past the last
 * control `Tab` leaves the page for the browser's own toolbar. Firefox does not
 * come back from there, so a forward walk started in the middle of the bar can
 * never reach a control earlier in it. Stepping one place instead is
 * deterministic on all three engines.
 *
 * The neighbour is focused with `focus()` and the target is reached with a real
 * `Tab`, which is what makes the arrival a **keyboard** arrival: `:focus-visible`
 * is the engine's own answer to "was this focus worth drawing an indicator for",
 * and it answers differently for a script that moved focus by itself.
 *
 * **It answers `false` for a control the tab order does not contain**, which is
 * what makes it a reading of reachability rather than of focusability. A
 * `tabindex="-1"` control is absent from `controlsInDomOrder` and is stepped
 * over by the engine's own `Tab`, so both halves say no. Pass `order` where the
 * caller already has a snapshot, so a sweep measures one page rather than
 * re-reading it per control.
 */
export async function focusByTab(
  page: Page,
  key: string,
  order?: readonly string[],
): Promise<boolean> {
  const known = order ?? (await controlsInDomOrder(page));
  const index = known.indexOf(key);
  if (index < 0) {
    return false;
  }
  const before = known[index - 1];
  const after = known[index + 1];
  if (before !== undefined) {
    await page.locator(selectorFor(before)).focus();
    await page.keyboard.press('Tab');
  } else if (after !== undefined) {
    await page.locator(selectorFor(after)).focus();
    await page.keyboard.press('Shift+Tab');
  } else {
    return false;
  }
  return (await focusedStop(page)).key === key;
}

/** Every control the chrome currently renders, in DOM order, by its key. */
export async function controlsInDomOrder(page: Page): Promise<readonly string[]> {
  return page.evaluate((attributes: readonly string[]) => {
    const keys: string[] = [];
    for (const node of document.querySelectorAll('button, summary, [tabindex]')) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      // Hidden by a screen that is not the current one, or by the disclosure at
      // a narrow breakpoint. Neither is in the tab order, and neither should be.
      if (node.closest('[hidden]') !== null || node.offsetParent === null) {
        continue;
      }
      if (node.tabIndex < 0) {
        continue;
      }
      let key = node.tagName.toLowerCase();
      for (const attribute of attributes) {
        const value = node.getAttribute(attribute);
        if (value !== null) {
          key = `${attribute}=${value}`;
          break;
        }
      }
      keys.push(key);
    }
    return keys;
  }, CONTROL_ATTRIBUTES as readonly string[]);
}
