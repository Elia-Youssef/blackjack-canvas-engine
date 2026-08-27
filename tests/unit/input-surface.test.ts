/**
 * The source half of `BJ-17`: what the input surface of this game is, and what
 * it is not. Items `D1` (Inspection), `D5` and `D6`.
 *
 * `docs/review-checklists/input.md` is what `D1` is graded against, and every
 * scan in it is a command a reviewer runs by hand. This file runs the same scans
 * in the suite, for the reason `tests/unit/storage-write-failure.test.ts` gives
 * for its own: a rule that is only ever checked at review time is a rule that
 * holds until the next part, and the two claims underneath this one are
 * **absences**, which are the claims most likely to be true by accident.
 *
 *   - `D1`: "Input is handled through Pointer Events only. No separate mouse and
 *     touch handler paths exist in the source."
 *   - `D5`: "contextmenu is suppressed only where such a binding is present",
 *     and there is no such binding.
 *   - `D6`: nothing on the play surface competes with a browser system gesture.
 *
 * **Every scanner is run over text that contains what it hunts for, first.** A
 * scanner that finds nothing is indistinguishable from a scanner that cannot
 * see; the storage suite established the pattern and it is the whole reason
 * these scans are evidence rather than decoration.
 *
 * **The scans read code, not prose.** Comments are stripped before matching, so
 * a header sentence explaining why this project has no `mousedown` handler does
 * not read as one. Several of the files scanned carry exactly that sentence.
 *
 * @vitest-environment node
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

function sourcesUnder(...segments: readonly string[]): readonly SourceFile[] {
  const root = join(PROJECT_ROOT, ...segments);
  const files: SourceFile[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.css')) {
        files.push({ path: full.replace(/\\/g, '/'), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return files;
}

/** Source with its comments removed, so a scan reads code and not prose. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every event name this file's scans care about, as they appear in a listener. */
function listenedEvents(text: string): readonly string[] {
  return [...code(text).matchAll(/addEventListener\(\s*'([^']+)'/g)].map((match) => match[1] ?? '');
}

/** Every occurrence of one of the named identifiers, in code. */
function names(text: string, pattern: RegExp): readonly string[] {
  return [...code(text).matchAll(pattern)].map((match) => match[0]);
}

// ---------------------------------------------------------------------------
// The scanners can see
// ---------------------------------------------------------------------------

describe('D1: the scanners find what they hunt for', () => {
  it('reads a listener out of code and not out of a comment', () => {
    expect(listenedEvents("node.addEventListener('mousedown', go);")).toEqual(['mousedown']);
    expect(listenedEvents("// never addEventListener('mousedown', go)")).toEqual([]);
    expect(listenedEvents("/* addEventListener('touchstart', go) */")).toEqual([]);
    expect(listenedEvents("a.addEventListener('click', x); b.addEventListener('keydown', y);")).toEqual(
      ['click', 'keydown'],
    );
  });

  it('reads a coordinate name out of code and not out of a comment', () => {
    expect(names('const x = event.offsetX;', /\boffsetX\b/g)).toEqual(['offsetX']);
    expect(names('// never read offsetX', /\boffsetX\b/g)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D1: one handler path
// ---------------------------------------------------------------------------

/**
 * The events a mouse-only or a touch-only path would be built from.
 *
 * QUALITY-BAR section 3 forbids "separate mouse and touch handler paths", and
 * this is that sentence as a list. `click` is deliberately not in it: it is the
 * one event a mouse press, a touch tap and a key on a focused control all
 * produce, which is why it is the activation this project binds.
 */
const SPLIT_PATH_EVENTS = new Set([
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseenter',
  'mouseleave',
  'mouseover',
  'mouseout',
  'dblclick',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
  'gesturestart',
  'gesturechange',
  'gestureend',
]);

describe('D1: input is one handler path', () => {
  it('binds no mouse-only and no touch-only event anywhere in the shipped source', () => {
    const files = sourcesUnder('src');
    expect(files.length, 'the walk found no source at all').toBeGreaterThan(10);
    for (const file of files) {
      for (const event of listenedEvents(file.text)) {
        expect(
          SPLIT_PATH_EVENTS.has(event),
          `${file.path} listens for ${event}, which is a mouse-only or touch-only path`,
        ).toBe(false);
      }
    }
  });

  it('binds exactly one activation event, and it is click', () => {
    const bound = new Map<string, readonly string[]>();
    for (const file of sourcesUnder('src')) {
      const events = listenedEvents(file.text);
      if (events.length > 0) {
        bound.set(file.path, events);
      }
    }

    // Ten listeners in the whole product, and each one is somewhere its
    // criterion can be read against: the activation, the keyboard, and the media
    // query that carries the reduced-motion preference are `D1`'s three. The
    // three `BJ-19` added are the audio engine's, and none is an activation
    // path: QUALITY-BAR section 10 requires the `AudioContext` to be created
    // inside the first `pointerdown` / `keydown`, which is the one thing a
    // `click` handler cannot be, because `click` arrives after the platform has
    // decided whether the press carried a user activation; and
    // `visibilitychange` is the quality bar's own resume hook, an observation of
    // the page rather than an input from a player. `BJ-20` added the loop's
    // pair, and they are the same kind of observation: QUALITY-BAR section 7
    // pauses the loop on a hidden tab and writes the document on `pagehide`,
    // neither of which is an input a player made. `BJ-20` also added the
    // volume slider's two, and neither is an activation either: `input` is a
    // continuous control reporting its own movement under the player's hand,
    // moving the gain live and uncommitted, and the slider's `change` is the
    // gesture's end, the one moment the document is written, so a drag is one
    // localStorage write rather than one per step. The activation stays
    // `click` and stays alone below, which is the half of this test `D1` is.
    const flattened = [...bound.values()].flat().sort();
    expect(flattened, `listeners found in ${[...bound.keys()].join(', ')}`).toEqual([
      'change',
      'change',
      'click',
      'input',
      'keydown',
      'keydown',
      'pagehide',
      'pointerdown',
      'visibilitychange',
      'visibilitychange',
    ]);

    const clicks = [...bound.entries()].filter(([, events]) => events.includes('click'));
    expect(clicks.map(([path]) => path.replace(/^.*\/src\//, 'src/')), 'more than one click site').toEqual([
      'src/ui/dom.ts',
    ]);
  });

  it('reads no pointer coordinate at all, and never the two that are forbidden', () => {
    // QUALITY-BAR section 3: `clientX` and `clientY` only, never `offsetX`,
    // whose target changes under capture, `pageX`, which breaks under scroll, or
    // `screenX`. There is no coordinate read in this game at all, which is the
    // stronger form of the same rule and is what DESIGN section 6 predicted: the
    // chrome is DOM, so nothing has to be hit-tested by hand.
    for (const file of sourcesUnder('src')) {
      expect(
        names(file.text, /\b(?:offsetX|offsetY|pageX|pageY|screenX|screenY)\b/g),
        `${file.path} reads a forbidden pointer coordinate`,
      ).toEqual([]);
      expect(
        names(file.text, /\b(?:clientX|clientY)\b/g),
        `${file.path} reads a pointer coordinate, so this scan needs revisiting`,
      ).toEqual([]);
    }
  });

  it('captures no pointer, because there is no drag to capture', () => {
    // The other half of the same paragraph. `setPointerCapture` is required
    // **of a drag**, and this game has none: `src/ui/input.ts`'s header carries
    // the reasoning and DESIGN section 6 predicted it. The day a drag arrives,
    // this assertion fails and sends its author to that header, where the
    // `touch-action` rule that goes with a capture is written down.
    for (const file of sourcesUnder('src')) {
      expect(
        names(file.text, /\b(?:setPointerCapture|releasePointerCapture|PointerEvent)\b/g),
        `${file.path} captures a pointer`,
      ).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// D5: no secondary binding, and no suppression
// ---------------------------------------------------------------------------

describe('D5: no secondary pointer binding exists', () => {
  it('listens for neither contextmenu nor auxclick', () => {
    for (const file of sourcesUnder('src')) {
      for (const event of listenedEvents(file.text)) {
        expect(
          event === 'contextmenu' || event === 'auxclick',
          `${file.path} binds ${event}`,
        ).toBe(false);
      }
    }
  });

  it('reads no mouse button number, so no handler can be secondary-only', () => {
    // A secondary binding has to distinguish the button somewhere. Nothing in
    // the product reads `event.button` or `event.buttons`, so the conditional in
    // the criterion has no antecedent, which is what
    // `tests/browser/secondary-pointer.spec.ts` measures from the outside.
    for (const file of sourcesUnder('src')) {
      expect(
        names(file.text, /\bevent\.buttons?\b/g),
        `${file.path} reads a mouse button number`,
      ).toEqual([]);
    }
  });

  it('calls preventDefault in exactly one place, and it is the focus trap', () => {
    // `Tab` inside an open overlay is the one default this game suppresses, and
    // item `D4` requires it. Every other suppression would be a gesture or a key
    // taken away from the browser, which is what `D5` and `D6` are about, so the
    // count is pinned rather than merely bounded.
    const sites: string[] = [];
    for (const file of sourcesUnder('src')) {
      const found = names(file.text, /\bpreventDefault\s*\(/g);
      for (let index = 0; index < found.length; index += 1) {
        sites.push(file.path.replace(/^.*\/src\//, 'src/'));
      }
    }
    expect(sites, 'preventDefault is called somewhere new').toEqual([
      'src/ui/input.ts',
      'src/ui/input.ts',
    ]);
  });
});

// ---------------------------------------------------------------------------
// D6: nothing takes a gesture from the browser
// ---------------------------------------------------------------------------

describe('D6: the stylesheets take no gesture away', () => {
  it('declares no touch-action that removes one', () => {
    // QUALITY-BAR section 3 permits `none` only for the duration of an active
    // pointer capture, and there is no capture in this game, so there is no
    // `touch-action` at all. `tests/browser/gestures.spec.ts` measures the
    // computed value on three engines; this is the source half, and it is what
    // fails first if a later part writes one.
    for (const file of sourcesUnder('src')) {
      expect(
        names(file.text, /touch-action\s*:/g),
        `${file.path} declares a touch-action policy`,
      ).toEqual([]);
    }
  });

  it('contains the overscroll of the two designated scrollers and nothing else', () => {
    // The one gesture policy this game does declare, and the reason is in
    // `src/ui/chrome.css`: a pan that runs past the end of an inner scroller
    // chains to the document by default, and at the edges of a document that is
    // pull-to-refresh and back-navigation. `contain` stops the chain without
    // stopping the document's own gestures, which `none` would.
    const declarations: string[] = [];
    for (const file of sourcesUnder('src')) {
      for (const found of names(file.text, /overscroll-behavior[a-z-]*\s*:\s*[a-z]+/g)) {
        declarations.push(found.replace(/\s+/g, ''));
      }
    }
    expect(declarations.sort()).toEqual([
      'overscroll-behavior-x:contain',
      'overscroll-behavior:contain',
    ]);
  });

  it('never removes the focus indicator', () => {
    // Item `D4`'s second clause, in the one place it can be written: an
    // `outline: none` in a stylesheet. `tests/browser/keyboard.spec.ts` measures
    // the rendered ring on every control; this catches the declaration itself,
    // including on a selector no spec happens to visit.
    for (const file of sourcesUnder('src')) {
      expect(
        names(file.text, /outline\s*:\s*(?:none|0)\b/g),
        `${file.path} removes a focus indicator`,
      ).toEqual([]);
    }
  });
});
