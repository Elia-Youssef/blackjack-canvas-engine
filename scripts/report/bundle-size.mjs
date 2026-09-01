/**
 * Item `H2`, Major, 8 points, method A, evidence `report/bundle-size`.
 *
 *   "The JavaScript bundle is at most 40 KB gzipped and total transfer is at
 *    most 60 KB gzipped."
 *
 * **What a module browser fetches, which is not the same as what `dist/` holds.**
 * Four files are emitted. A module browser fetches three of them: the page, the
 * one application chunk it names in a `type="module"` script, and the one
 * stylesheet it names in a `link`. The fourth, `unsupported.js`, is referenced by
 * a `nomodule` script, and a browser that understands modules is required by the
 * HTML specification not to fetch it at all. Counting it in "total transfer"
 * would charge every real visitor for bytes no real visitor receives; leaving it
 * unmentioned would hide a file that ships. So it is measured, excluded from the
 * total, and stated on its own row with the reason.
 *
 * The measurement is gzip at its default level over the emitted bytes, which is
 * what a static host serves and what the item's "gzipped" means. Brotli would
 * report a smaller number and is not what the threshold was written against.
 *
 * Writes artifacts/reports/bundle-size.md. Exits 1 on a breach.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  DIST,
  environmentRows,
  finish,
  requireDist,
  table,
  verdict,
} from './support.mjs';

/** The item's two numbers, in bytes. KB is 1024 bytes, as a bundler reports it. */
const KB = 1024;
const JS_CEILING = 40 * KB;
const TOTAL_CEILING = 60 * KB;

/**
 * The emitted files a module browser genuinely does not fetch, by name.
 *
 * **Explicit, because the exclusion used to be residual.** The counting loop
 * asked whether the page named a file and charged the total only for the ones
 * it did, which reads as "count what is fetched" and behaves as "count what the
 * HTML happens to mention". A dynamically imported chunk, a preloaded chunk or
 * an image referenced from the stylesheet is fetched by every module browser
 * and named by none of the tags this file reads: 218 KB gzipped of exactly that
 * shape was demonstrated invisible to both ceilings, reported on its own row as
 * "never fetched by a module browser", with the gate still printing PASS and
 * 6.65 KB of headroom. Both non-vacuity guards below were satisfied throughout,
 * because the entry chunk was still found.
 *
 * So the set is written down, everything else is counted whatever the HTML
 * says, and an emitted file that is neither named nor listed here is a breach
 * rather than a row: it is either a shipped byte nobody measured or a file that
 * should not have been emitted, and both are worth stopping for.
 */
const NOT_FETCHED_BY_A_MODULE_BROWSER = new Set(['unsupported.js']);

/** Every emitted file, relative to `dist/`. */
function emitted(dir = DIST, into = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      emitted(full, into);
    } else {
      into.push(full);
    }
  }
  return into;
}

/** What the page itself asks a module browser to fetch, read out of the HTML. */
function referenced(html) {
  const wanted = new Set();
  for (const match of html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)) {
    const tag = match[0];
    const src = match[1];
    if (!tag.includes('nomodule') && src !== undefined) {
      wanted.add(src.replace(/^\.?\//, ''));
    }
  }
  for (const match of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
    const href = match[1];
    if (href !== undefined) {
      wanted.add(href.replace(/^\.?\//, ''));
    }
  }
  // A preloaded chunk is fetched eagerly, in parallel with the entry chunk, so
  // it is transfer in the plainest sense. This build emits none today; the
  // parse is here because the split that emits one is a build-config change
  // away and the breach below should report a file nobody accounted for rather
  // than one the page has always named.
  for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]*>/g)) {
    const href = /href="([^"]+)"/.exec(match[0])?.[1];
    if (href !== undefined) {
      wanted.add(href.replace(/^\.?\//, ''));
    }
  }
  return wanted;
}

function main() {
  requireDist();
  const files = emitted().map((path) => {
    const bytes = readFileSync(path);
    return {
      path: relative(DIST, path).split('\\').join('/'),
      raw: statSync(path).size,
      gzip: gzipSync(bytes).length,
    };
  });

  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const fetched = referenced(html);
  fetched.add('index.html');

  const rows = [];
  const unaccounted = [];
  let jsBytes = 0;
  let totalBytes = 0;
  let nomodule = 0;
  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    const excluded = NOT_FETCHED_BY_A_MODULE_BROWSER.has(file.path);
    const named = fetched.has(file.path);
    // Everything that is not on the explicit list counts, whether the page
    // names it or not, so a chunk the HTML never mentions cannot be free.
    const inTransfer = !excluded;
    if (inTransfer) {
      totalBytes += file.gzip;
      if (file.path.endsWith('.js')) {
        jsBytes += file.gzip;
      }
    } else {
      nomodule += file.gzip;
    }
    if (!excluded && !named) {
      unaccounted.push(file.path);
    }
    rows.push([
      `\`${file.path}\``,
      String(file.raw),
      String(file.gzip),
      excluded
        ? 'nomodule, never fetched by a module browser'
        : named
          ? 'module browser fetches it'
          : 'emitted but not named by the page: counted, and a breach',
    ]);
  }

  const breaches = [];
  if (jsBytes > JS_CEILING) {
    breaches.push(
      `JavaScript is ${String(jsBytes)} bytes gzipped, over the ${String(JS_CEILING)} ceiling`,
    );
  }
  if (totalBytes > TOTAL_CEILING) {
    breaches.push(
      `total transfer is ${String(totalBytes)} bytes gzipped, over the ${String(TOTAL_CEILING)} ceiling`,
    );
  }
  if (files.length === 0) {
    breaches.push('the build emitted no files, so there is nothing to measure');
  }
  if (jsBytes === 0) {
    breaches.push('no JavaScript was counted, so the sampler is measuring nothing');
  }
  if (unaccounted.length > 0) {
    breaches.push(
      `emitted but neither named by the page nor listed as not fetched: ${unaccounted.join(', ')}`,
    );
  }

  const asKb = (bytes) => (bytes / KB).toFixed(2);
  const lines = [
    '# Bundle size report',
    '',
    `**${breaches.length === 0 ? 'PASS' : 'FAIL'}.** Item \`H2\`, Major, 8 points, method A.`,
    'Generated by `BlackJack/BlackJack/scripts/report/bundle-size.mjs`. Do not edit by hand.',
    '',
    '> "The JavaScript bundle is at most 40 KB gzipped and total transfer is at most 60 KB',
    '> gzipped."',
    '',
    '## Result',
    '',
    ...table(
      ['Measure', 'Value', 'Threshold', 'Verdict'],
      [
        [
          'JavaScript, gzipped',
          `${asKb(jsBytes)} KB`,
          `<= ${asKb(JS_CEILING)} KB`,
          verdict(jsBytes <= JS_CEILING),
        ],
        [
          'Total transfer, gzipped',
          `${asKb(totalBytes)} KB`,
          `<= ${asKb(TOTAL_CEILING)} KB`,
          verdict(totalBytes <= TOTAL_CEILING),
        ],
        [
          'Headroom on JavaScript',
          `${asKb(JS_CEILING - jsBytes)} KB`,
          '-',
          '-',
        ],
        [
          'Headroom on total',
          `${asKb(TOTAL_CEILING - totalBytes)} KB`,
          '-',
          '-',
        ],
      ],
    ),
    '',
    '## Every emitted file',
    '',
    ...table(['File', 'Bytes', 'Gzipped', 'Counted'], rows),
    '',
    `The \`nomodule\` fallback is ${String(nomodule)} bytes gzipped and is **not** part of the`,
    'total above. A browser that understands `type="module"` is required by the HTML',
    'specification not to fetch a `nomodule` script, so no visitor who can play this game',
    'receives those bytes. A browser that cannot understand modules fetches it instead of the',
    'application chunk, never as well as it, so the worst case for any single visitor is the',
    'total above.',
    '',
    'The exclusion is a written-down set of one file rather than "whatever the page does not',
    'name", so an emitted chunk the HTML never mentions is counted toward both ceilings and',
    'reported as a breach instead of being labelled unfetched. `rel="modulepreload"` links are',
    'read as references for the same reason.',
    '',
    '## Environment',
    '',
    ...table(['Condition', 'Value'], environmentRows([['Compression', 'gzip, default level']])),
    '',
    '## Reproduce',
    '',
    '```bash',
    'npm ci && npm run report:bundle-size',
    '```',
  ];

  finish('bundle-size.md', lines, breaches);
}

main();
