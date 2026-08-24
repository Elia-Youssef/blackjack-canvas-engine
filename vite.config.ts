import { defineConfig } from 'vite';

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
export default defineConfig({
  base: './',
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
