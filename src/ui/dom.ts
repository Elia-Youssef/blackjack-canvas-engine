/**
 * The element factory every component in this directory builds from. Item `M1`.
 *
 * `M1` is the claim that every button, readout, panel, menu, modal and label is
 * a real DOM element and that no pointer coordinate is hit-tested against a
 * chrome rectangle anywhere in the source. This file is where that claim is made
 * structurally rather than by discipline: components are handed `el` and
 * `button` and never a canvas context, so the only thing a component in
 * `src/ui/` can produce is DOM.
 *
 * Three rules the factory enforces on every caller:
 *
 * 1. **Text is set through `textContent`, never through `innerHTML`.** A string
 *    that reaches the page as markup is a defect waiting for the first hand
 *    value that contains a `<`, and there is nothing in this game that needs
 *    markup built from a value.
 * 2. **A button is a `<button>`.** QUALITY-BAR 1: focus order, accessible names,
 *    keyboard operation and hit testing are the platform's, and the one way to
 *    inherit them is to use the element that has them. Nothing here builds a
 *    clickable `<div>`.
 * 3. **`click` is the only activation event in the project.** Items `D1` and
 *    `D2` at `BJ-17`. QUALITY-BAR section 3 requires every action to be reachable
 *    by pointer, by touch and by keyboard, and forbids separate mouse and touch
 *    handler paths. `click` is the one event the platform raises for all three:
 *    a mouse press, a touch tap and `Enter` or `Space` on a focused button each
 *    produce exactly one of it. A control bound to `pointerdown` would be
 *    unreachable by keyboard and a control bound to `keydown` would be
 *    unreachable by touch, which is the defect the criterion's second sentence
 *    names. The listener in `button` below is the only activation binding in the
 *    whole of `src/`, and `docs/review-checklists/input.md` scans for a second
 *    one.
 */

/** What `el` may be given. Everything is optional; nothing is positional. */
export interface ElementOptions {
  /** One or more class names, space separated, as `class` takes them. */
  readonly className?: string;
  /** Text content. Set through `textContent`, so it is never parsed. */
  readonly text?: string;
  /** Attributes, including `data-` and ARIA. Values are strings, as HTML has. */
  readonly attributes?: Readonly<Record<string, string>>;
  /** Children, appended in order. */
  readonly children?: readonly Node[];
}

/** One element, built and populated. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.attributes !== undefined) {
    for (const [name, value] of Object.entries(options.attributes)) {
      node.setAttribute(name, value);
    }
  }
  if (options.children !== undefined) {
    node.append(...options.children);
  }
  return node;
}

/**
 * One `<button type="button">`, with its click handler attached.
 *
 * `type` is explicit because a button inside a form defaults to `submit`, and a
 * chip that navigated the page would be a defect nothing in this project would
 * catch until the demonstration session.
 */
export function button(
  label: string,
  onPress: () => void,
  options: ElementOptions = {},
): HTMLButtonElement {
  const node = el('button', options);
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', () => {
    // The half of `disabled` that `aria-disabled` does not bring with it. See
    // `setDisabled`: the control stays focusable and stays in the DOM, which is
    // QUALITY-BAR section 3's rule, and the platform therefore still delivers
    // the press. Refusing it here is what keeps "unavailable" meaning the same
    // thing it meant when the attribute was the native one, and it is refused in
    // exactly one place rather than in each of the three components that grey a
    // control out.
    if (unavailable(node)) {
      return;
    }
    onPress();
  });
  return node;
}

/** Whether a control is currently greyed out. See `setDisabled`. */
export function unavailable(node: Element): boolean {
  return node.getAttribute('aria-disabled') === 'true';
}

/** Empty an element, so a list can be rebuilt from a changed value. */
export function empty(node: Element): void {
  node.replaceChildren();
}

/**
 * Grey a control out **in place**, and with it the reason it is unavailable.
 *
 * The two move together on purpose. SPEC 4.11 asks for a reason on every
 * refusal, and a control that is greyed with no explanation is the half of that
 * sentence a player cannot act on. The reason rides on `title` and
 * `aria-describedby` is deliberately not used here: the accessible description
 * is `BJ-18`'s to design, and a half-built one now would be harder to correct
 * than an absent one.
 *
 * **`aria-disabled`, and never the native `disabled` property.** `BJ-17`, and
 * QUALITY-BAR section 3 states the rule and the defect behind it in as many
 * words: "A control that becomes unavailable is disabled in place with
 * `aria-disabled="true"`, kept focusable and kept in the DOM ... Without this
 * rule, focus on **Hit** when a hand busts lands on `<body>` and the screen
 * reader loses its place." A natively disabled button leaves the tab order the
 * moment it is greyed, so the five action controls this game renders on every
 * hand would take the player's focus with them each time a rule turned one off,
 * and the tab order under a keyboard would change shape between two frames of
 * one round. The measured version of that was in this project before this part:
 * a tab walk of the start screen stopped at Bronze and Start, and Silver and
 * Gold, greyed because SPEC 6 has not unlocked them, could not be reached at all
 * to find out why.
 *
 * What the native attribute also did, and this does not, is refuse the press.
 * `button` above refuses it instead, in one place, so the two halves cannot come
 * apart.
 */
export function setDisabled(node: HTMLButtonElement, disabled: boolean, reason: string | null): void {
  // Written only when it moved, like every other writer in this file. The sync
  // step runs on every frame, and an attribute set to the value it already has
  // still invalidates the style of an element a selector matches on.
  setAttribute(node, 'aria-disabled', disabled ? 'true' : null);
  const wanted = disabled ? reason : null;
  if (wanted === null) {
    if (node.hasAttribute('title')) {
      node.removeAttribute('title');
    }
  } else if (node.title !== wanted) {
    node.title = wanted;
  }
}

/**
 * Show or hide an element, written only when it moved.
 *
 * SPEC 10 gives each control one screen, so most of the chrome is hidden on most
 * frames and every component decides its own visibility in the sync step. That
 * makes this the most frequently called writer in the file, and `hidden` is
 * reflected to a content attribute: setting it to the value it already holds
 * still writes, which is what this guard is for.
 */
export function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) {
    node.hidden = hidden;
  }
}

/** Set `textContent` only when it moved, so the sync step is cheap per frame. */
export function setText(node: Element, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

/** Set or remove one attribute from a nullable value. */
export function setAttribute(node: Element, name: string, value: string | null): void {
  if (value === null) {
    node.removeAttribute(name);
  } else if (node.getAttribute(name) !== value) {
    node.setAttribute(name, value);
  }
}
