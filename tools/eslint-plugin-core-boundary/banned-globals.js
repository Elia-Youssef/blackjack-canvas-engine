/**
 * The DOM and canvas surface that a core/ module may not touch.
 *
 * Two mechanisms, because neither alone is enough:
 *
 *   NAMES    exact globals, listed so the error message can be specific.
 *   FAMILIES prefixes that cover the generated interface families. There are
 *            roughly 180 HTML*Element types and listing them by hand would rot.
 *
 * Only *global* references are reported. A core module that declares its own
 * `Event` or `Node` type, or imports one from `./types`, resolves that
 * identifier locally and is left alone. That precision is the whole reason the
 * rule works off scope analysis rather than a text scan: an earlier project
 * verified the equivalent property by grep, which cannot tell the two apart.
 */

export const NAMES = new Set([
  // Documents, windows and the browsing context.
  'document', 'window', 'self', 'parent', 'top', 'frames', 'opener',
  'navigator', 'location', 'history', 'screen', 'visualViewport',
  'customElements', 'crypto', 'caches', 'origin', 'name',

  // The interface types behind those, which a core module could otherwise
  // accept as a parameter and do arbitrary DOM work through. `Document` and
  // `Window` are the two that matter: neither is reached by the DOM family
  // pattern, because that pattern is anchored on an upper-case DOM prefix.
  'Document', 'Window', 'WindowProxy', 'WorkerGlobalScope', 'VisualViewport',
  'Crypto', 'SubtleCrypto', 'CustomElementRegistry', 'Clipboard',
  'Geolocation', 'DataTransfer', 'TextMetrics', 'MediaQueryListEvent',

  // Bare BOM readouts. These resolve to the same values as `window.innerWidth`
  // and friends without ever naming `window`, so banning the object alone
  // leaves the whole set reachable. `devicePixelRatio` is the sharp one: the
  // single coordinate transform is required to exclude it.
  'devicePixelRatio', 'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight',
  'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset', 'screenX', 'screenY',
  'screenLeft', 'screenTop', 'scrollTo', 'scrollBy', 'moveTo', 'moveBy',
  'resizeTo', 'resizeBy', 'frameElement', 'getSelection',

  // Storage.
  'localStorage', 'sessionStorage', 'indexedDB', 'Storage',

  // Scheduling that only exists in a document.
  'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback',

  // Style and layout queries.
  'getComputedStyle', 'matchMedia', 'MediaQueryList', 'getSelection',

  // Dialogs.
  'alert', 'confirm', 'prompt', 'print',

  // Network and workers.
  'fetch', 'Request', 'Response', 'Headers', 'FormData',
  'XMLHttpRequest', 'WebSocket', 'EventSource', 'BroadcastChannel',
  'Worker', 'SharedWorker', 'ServiceWorker', 'MessageChannel', 'MessagePort',
  'postMessage', 'structuredClone',

  // Observers.
  'ResizeObserver', 'IntersectionObserver', 'MutationObserver',
  'PerformanceObserver', 'ReportingObserver',

  // Media and audio.
  'Image', 'Audio', 'AudioContext', 'webkitAudioContext',
  'OfflineAudioContext', 'AudioBuffer', 'AudioNode',
  'createImageBitmap', 'ImageBitmap', 'ImageData', 'MediaRecorder',

  // The canvas surface itself.
  'OffscreenCanvas', 'Path2D', 'ImageBitmapRenderingContext',

  // Nodes, elements and the tree.
  'Node', 'Element', 'Attr', 'Text', 'Comment', 'DocumentFragment',
  'ShadowRoot', 'NodeList', 'NodeFilter', 'NodeIterator', 'TreeWalker',
  'Range', 'StaticRange', 'Selection', 'AbortController', 'AbortSignal',

  // Events.
  'Event', 'EventTarget', 'CustomEvent', 'UIEvent', 'MouseEvent',
  'PointerEvent', 'KeyboardEvent', 'TouchEvent', 'Touch', 'TouchList',
  'WheelEvent', 'FocusEvent', 'InputEvent', 'CompositionEvent',
  'DragEvent', 'ClipboardEvent', 'ErrorEvent', 'HashChangeEvent',
  'PopStateEvent', 'StorageEvent', 'ProgressEvent', 'AnimationEvent',
  'TransitionEvent', 'PromiseRejectionEvent', 'SubmitEvent',
  'addEventListener', 'removeEventListener', 'dispatchEvent',

  // Parsing and serialising markup.
  'DOMParser', 'XMLSerializer', 'XPathResult', 'XPathEvaluator',

  // Miscellaneous browser plumbing that leaks the platform in.
  'Blob', 'File', 'FileReader', 'URL', 'URLSearchParams',
  'Notification', 'Screen', 'History', 'Location', 'Navigator',
  'Animation', 'KeyframeEffect', 'FontFace',
]);

export const FAMILIES = [
  /^HTML[A-Z]/,      // HTMLCanvasElement, HTMLButtonElement, and 180 siblings
  /^SVG[A-Z]/,       // SVGElement and friends
  /^Canvas[A-Z]/,    // CanvasRenderingContext2D, CanvasGradient, CanvasPattern
  /^WebGL/,          // WebGLRenderingContext, WebGL2RenderingContext
  /^CSS/,            // CSS, CSSStyleDeclaration, CSSStyleSheet
  /^DOM[A-Z]?/,      // DOMRect, DOMMatrix, DOMTokenList, DOMPoint
  /^Offscreen/,      // OffscreenCanvasRenderingContext2D
  /^Gamepad/,        // Gamepad, GamepadEvent
];

/**
 * True when `name` is a DOM, BOM or canvas identifier.
 *
 * **This is a denylist, and a denylist over `lib.dom.d.ts` is not exhaustive by
 * construction.** It covers the whole platform surface a game core would
 * plausibly reach for, and every entry above was either found in the reference
 * material or added after a review demonstrated it escaping. It is not a proof
 * that no DOM identifier can get through.
 *
 * The two structural guards that do not depend on this list are the reason that
 * is acceptable: `globalThis` and `self` are refused outright inside `core/`, so
 * the computed-access route out is closed regardless of what is named here, and
 * `core/` cannot switch the rule off inline. Adding a name is a one-line change
 * and a fixture line; do that rather than widening an exception.
 */
export function isBannedGlobal(name) {
  if (NAMES.has(name)) {
    return true;
  }
  return FAMILIES.some((re) => re.test(name));
}
