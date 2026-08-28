import { defineConfig, type Plugin } from 'vite';

/**
 * QUALITY-BAR section 9's Content Security Policy, in that section's own order.
 *
 * Item `L2` at `BJ-21`, Critical. The section fixes the directive set and this
 * is a transcription of it, joined the way a policy is written:
 *
 *   default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'
 *   data:; connect-src 'none'; font-src 'none'; base-uri 'none';
 *   form-action 'none'
 *
 * `frame-ancestors`, `report-uri` and `sandbox` are deliberately absent: a
 * meta-delivered policy cannot carry them, which the same section states. Where
 * a host supports static header configuration the identical policy is sent as a
 * header with `frame-ancestors 'none'` added, and that is a deployment
 * statement rather than something this build can emit.
 *
 * Nothing here needs `'unsafe-inline'` or a hash, and that is a property of the
 * build rather than a hope: `modulePreload.polyfill` is off, `assetsInlineLimit`
 * is 0 and the entry is a module, so the emitted page carries a `<script src>`,
 * a `<link rel="stylesheet">` and no inline script or style at all. Item `L2`'s
 * spec asserts that over the built page rather than trusting this comment.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "font-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** The file name of the classic script that answers for a browser with no modules. */
const NOMODULE_FILE = 'unsupported.js';

/**
 * The `nomodule` script, item `A5` at `BJ-21`.
 *
 * QUALITY-BAR section 2 puts a browser without ES2020 modules in the
 * unsupported tier, and that tier cannot be feature tested from inside a
 * module: a browser that cannot parse `type="module"` never runs a line of the
 * bundle, and what it would otherwise show is the blank page the criterion
 * forbids. So the page carries the notice as an inert `<template>` and this
 * script, which such a browser does run, clones it.
 *
 * It is a file rather than an inline script because the policy above allows no
 * inline script at all, and its content is fixed rather than built from the
 * module graph, so it adds nothing that could differ between two builds of one
 * tree. It is ES5 on purpose: the browsers it exists for are the ones that
 * cannot parse anything newer, so a `const` here would be a syntax error in
 * exactly the case it is written for.
 *
 * `src/ui/capability.ts` is the same clone from inside the module, for a
 * browser that runs the bundle and cannot draw. Both routes report what was
 * missing on the same attribute, so the notice always says which tier it is.
 */
const NOMODULE_SOURCE = `(function () {
  var template = document.querySelector('template[data-unsupported]');
  if (!template || !template.content) {
    return;
  }
  var copy = template.content.cloneNode(true);
  var notice = copy.firstElementChild;
  if (notice) {
    notice.setAttribute('data-unsupported-missing', 'es-modules');
  }
  document.body.appendChild(copy);
})();
`;

/**
 * The two things the built page carries that the source page must not.
 *
 * **Both are injected at build time, and the reason is the dev server.** A CSP
 * meta written into `index.html` would govern `vite dev` as well, whose module
 * graph is served as inline script and whose reload channel is a websocket;
 * `script-src 'self'` and `connect-src 'none'` would stop both, and the game
 * would stop being developable in order to satisfy a policy about what ships.
 * The `nomodule` script has the same shape of problem in reverse: the file it
 * names is emitted by this build and does not exist under the dev server, so a
 * tag written into the source page would be a 404 on every dev page load.
 *
 * `order: 'post'` so the tag list is appended after Vite's own transforms have
 * run, and `head-prepend` so the policy is the FIRST element in `<head>`, which
 * QUALITY-BAR section 9 requires: a policy only governs what is fetched after
 * it is parsed.
 */
function securityAndSupport(): Plugin {
  return {
    name: 'bj-security-and-support',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: NOMODULE_FILE, source: NOMODULE_SOURCE });
    },
    transformIndexHtml: {
      order: 'post',
      handler() {
        return [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: CONTENT_SECURITY_POLICY,
            },
            injectTo: 'head-prepend',
          },
          {
            tag: 'script',
            attrs: { nomodule: true, src: `./${NOMODULE_FILE}` },
            injectTo: 'body',
          },
        ];
      },
    },
  };
}

// Static bundle, no server and no runtime configuration (QUALITY-BAR section 14).
//
// Three settings here are load-bearing for acceptance items A2 and A6 and are
// covered by the browser and deterministic-build gates:
//
//   base: './'        emits relative asset URLs, so the bundle runs from any
//                     directory of any static host without being told where it
//                     lives. An absolute base is runtime configuration.
//   sourcemap: false  a source map embeds the absolute path of the checkout,
//                     which differs between two otherwise identical trees.
//   No define() of  process.env or import.meta.env values: nothing about the
//                     build environment may reach the emitted bytes.
//
// Nothing was added at BJ-15. The emitted entry chunk is a facade for
// index.html and carries no exports, which is Rollup's behaviour for an
// application entry and is left alone: the browser gate reaches the composition
// root through a harness bundled at test time, exactly as BJ-13's render demo
// does, so no seam for a test reaches the shipped bytes.
//
// BJ-21 added the plugin above, and it emits one constant file and two tags
// from constants in this file. Nothing it writes depends on the environment,
// the clock or the checkout, so `npm run verify:build` still compares two
// byte-identical trees.
export default defineConfig({
  base: './',
  plugins: [securityAndSupport()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
