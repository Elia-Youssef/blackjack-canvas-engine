/**
 * The chrome's one non-activation input seam, and the one place focus moves.
 * `BJ-17`, items `D1`, `D2` and `D4`.
 *
 * Everything a player does to this game is a press on a `<button>`, bound once
 * in `src/ui/dom.ts` to the one event all three input methods produce. That
 * covers QUALITY-BAR section 3's first two rows outright and leaves exactly
 * three things a document-level listener has to do, all of them keyboard, all of
 * them named in the third row and in the paragraph under it:
 *
 *   1. **`Escape` closes any dismissible overlay.** A dialog a keyboard user can
 *      open and cannot close is the failure the clause is about.
 *   2. **An open overlay contains `Tab`.** Focus cycles inside the panel while it
 *      is open, and `Shift+Tab` from its first control wraps to its last.
 *   3. **Focus survives a state change.** SPEC 10 replaces the whole controls row
 *      at every phase, so a control really can be taken out from under the
 *      caret. QUALITY-BAR section 3: where a control genuinely must go, focus
 *      moves to a stable named anchor rather than falling to `<body>`.
 *
 * **What this deliberately does not do is make the page inert.** SPEC 10 calls
 * the three overlays "reachable at any time and never blocking state" and item
 * `C5` grades that the loop keeps running behind one and that opening and
 * closing changes nothing in the machine. Item `D4` asks a modal to "trap focus
 * and restore it on close". The two hold together because they are about
 * different things: `C5` is about game state, `D4` is about where the caret can
 * go while a dialog is open. So `Tab` is contained and focus is restored, and
 * the frame loop, the pointer and `aria-modal` are all left alone. Setting
 * `aria-modal="true"` would take SPEC 11's fourteen continuous readouts away
 * from a screen reader for as long as a panel was open, which is the same
 * sentence of `C5` read one layer down.
 *
 * **There is no pointer listener in this file or anywhere else in `src/`.**
 * QUALITY-BAR section 3 requires drags to take `setPointerCapture` and requires
 * `touch-action: none` to exist only for the duration of one, and DESIGN section
 * 6 already records why neither appears here: the chrome is DOM, so the game has
 * no drag and no hit test of its own, and the coordinate transform that would
 * need one is unbuilt for want of a caller. Both are asserted as absences by
 * `tests/unit/input-surface.test.ts`, in both directions, so the day a drag
 * arrives the scan fails and this header is what it sends the author to.
 */

/** What the focus policy is told about the frame that just rendered. */
export interface FocusFrame {
  /** Whether an overlay is open right now. `null` when none is. */
  readonly overlay: string | null;
}

/** The focus policy, as the chrome holds it. */
export interface FocusPolicy {
  /** One frame's sync, called after the DOM has been written. */
  sync(frame: FocusFrame): void;
  /** Take every document listener off again. Called from `boot`'s dispose. */
  dispose(): void;
}

/** What the policy needs to know about the page it is looking after. */
export interface FocusOptions {
  /** The shell root. Nothing outside it is ever moved or read. */
  readonly root: HTMLElement;
  /** The stable landing place, which carries `tabindex="-1"`. */
  readonly anchor: HTMLElement;
  /** The overlay host, which is the dialog `Tab` is contained inside. */
  readonly dialog: HTMLElement;
  /** The control that opened the overlay now open, so close can restore it. */
  opener(overlay: string): HTMLElement | null;
  /** Close whichever overlay is open. `Escape`'s one effect. */
  close(): void;
}

/**
 * What `Tab` may land on, as a selector.
 *
 * Deliberately short, and deliberately not a general implementation of the
 * platform's sequential focus rules: this page's focusable elements are buttons
 * and one `<summary>`, plus the two elements that carry `tabindex="-1"` and are
 * therefore not in this list. A general version would be a second, weaker
 * reading of a rule the browser already applies correctly everywhere else.
 * `tests/browser/keyboard.spec.ts` walks the real tab order with real `Tab`
 * presses and compares it against the DOM, so a focusable element this query
 * missed would be caught by the walk rather than hidden by it.
 */
const FOCUSABLE = 'button, summary, [href], input, select, textarea';

/**
 * Whether an element can take focus right now: in the page, and rendered.
 *
 * **The rendered fact, not the authored attribute.** `hidden` is what every
 * screen in this chrome is toggled with, so asking for the closest `[hidden]`
 * ancestor would answer correctly for all five of them, and would answer wrongly
 * for the one control this page hides with a stylesheet instead: `BJ-16`'s
 * readout disclosure is a real `<summary>` at `compact` and `portrait` and is
 * `display: none` above 768 px. A player who focuses it on a phone and then
 * turns the phone loses that control mid-frame, which is the same sentence
 * QUALITY-BAR section 3 is about and would not have been noticed by an attribute
 * scan. `getClientRects()` is empty for an element that generates no box at all,
 * which covers both.
 *
 * `offsetParent` would answer the same for this page and would additionally
 * answer `null` for anything positioned `fixed`, which is a trap waiting for the
 * first fixed element. What this does not cover is `visibility: hidden`, which
 * generates boxes and takes focusability away; nothing in the chrome uses it,
 * and `BJ-18`'s visually hidden mirror is specified as a clip rather than a
 * visibility, so the day one appears this is the function that has to grow.
 */
function focusable(node: Element | null): node is HTMLElement {
  if (!(node instanceof HTMLElement) || !node.isConnected) {
    return false;
  }
  return node.getClientRects().length > 0;
}

/** Everything inside the dialog that `Tab` may reach, in DOM order. */
function focusableWithin(host: HTMLElement): readonly HTMLElement[] {
  return [...host.querySelectorAll(FOCUSABLE)].filter((node) => focusable(node));
}

export function createFocusPolicy(options: FocusOptions): FocusPolicy {
  const { root, anchor, dialog } = options;

  /** Which overlay the previous frame had open, so a change is a change. */
  let open: string | null = null;
  /** Where focus was when the overlay opened, and where it goes on close. */
  let restoreTo: HTMLElement | null = null;
  /** The last element inside the shell that held focus. See `custody` below. */
  let held: HTMLElement | null = null;

  /** The focused element, when it is one of ours and can still take focus. */
  function activeInShell(): HTMLElement | null {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || !root.contains(node) || node === document.body) {
      return null;
    }
    return node;
  }

  /**
   * `Tab`, contained. The whole of item `D4`'s trap clause.
   *
   * The wrap is computed from the dialog's own focusable list rather than from a
   * sentinel element at each end, because a sentinel is a tab stop a screen
   * reader announces and this game's dialog is small enough to enumerate. Focus
   * that is outside the dialog altogether, which is where a press on a
   * background control leaves it, is pulled to whichever end the direction asks
   * for, so the containment does not depend on focus having started inside.
   */
  function contain(event: KeyboardEvent): void {
    const stops = focusableWithin(dialog);
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    const at = document.activeElement;
    const inside = at instanceof HTMLElement && dialog.contains(at);
    if (event.shiftKey) {
      if (!inside || at === first) {
        last.focus();
        event.preventDefault();
      }
      return;
    }
    if (!inside || at === last) {
      first.focus();
      event.preventDefault();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (open === null) {
      return;
    }
    if (event.key === 'Escape') {
      // No `preventDefault`. `Escape` has no default action this page needs to
      // suppress, and the one place a suppression would matter is a browser
      // still loading, which is not a state this game reaches.
      options.close();
      return;
    }
    if (event.key === 'Tab') {
      contain(event);
    }
  }

  document.addEventListener('keydown', onKeyDown);

  /**
   * The half of the rule that is not about overlays at all.
   *
   * A phase change hides the screen the pressed control was on, and the browser
   * answers a focused element becoming hidden by moving focus to `<body>`. That
   * is the exact sentence QUALITY-BAR section 3 forbids, so the frame after it
   * puts focus on the controls row instead: it is in the page at every phase, it
   * is the region the replacement controls are in, and one `Tab` from it reaches
   * the first of them.
   *
   * **It only ever fires on a control that was really taken away.** A player who
   * clicks the page background also leaves `document.activeElement` at `<body>`,
   * and moving focus for them would be the page grabbing a caret they had put
   * down. So the element that last held focus is remembered while it is still
   * focusable, and the move happens only once it is not.
   */
  function custody(): void {
    const active = activeInShell();
    if (active !== null) {
      held = active;
      return;
    }
    if (held === null) {
      return;
    }
    if (focusable(held)) {
      // Focus is elsewhere by choice: on `<body>`, or outside the page
      // altogether. The control it left is still there to go back to.
      return;
    }
    held = null;
    anchor.focus();
  }

  return {
    sync(frame: FocusFrame): void {
      const wanted = frame.overlay;
      if (wanted !== null && open === null) {
        // Opened. Remember where focus was, then give it to the dialog itself
        // rather than to the first control inside it, so what a screen reader
        // reads on arrival is the panel's name and not "Close, button".
        restoreTo = activeInShell() ?? options.opener(wanted);
        dialog.focus();
      } else if (wanted === null && open !== null) {
        // Closed. Back to the control that opened it where that control is still
        // there, and to the anchor where it is not, which is the same fallback
        // the custodian uses and for the same reason.
        const back = restoreTo !== null && focusable(restoreTo) ? restoreTo : anchor;
        restoreTo = null;
        back.focus();
      }
      open = wanted;
      custody();
    },
    dispose(): void {
      document.removeEventListener('keydown', onKeyDown);
    },
  };
}
