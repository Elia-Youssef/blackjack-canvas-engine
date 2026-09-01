/**
 * Item `H3`, Major, 9 points, method A, evidence `report/lighthouse`.
 *
 *   "On the Lighthouse mobile preset (1.6 Mbps, 150 ms RTT, 4x CPU), Largest
 *    Contentful Paint is at most 1.5 s and Total Blocking Time is at most 150
 *    ms. Time to Interactive was removed from Lighthouse in version 10 and is
 *    not used."
 *
 * **The preset is the tool's own, and the three numbers are its defaults.** The
 * criterion states them so that a run under a different throttle cannot be passed
 * off as this measurement, and this script asserts them out of the result rather
 * than setting them: if a future Lighthouse changes its mobile preset, the run
 * fails on the throttle mismatch instead of quietly grading something else.
 *
 * **Time to Interactive appears nowhere**, per the criterion and QUALITY-BAR
 * section 6. It was removed in Lighthouse 10 and a report that quoted it would be
 * quoting a metric the tool no longer computes.
 *
 * **Lighthouse is installed for the measurement and is not in the dependency
 * record, and that is a finding rather than a preference.** Adding it as a
 * devDependency brings `puppeteer-core`, and with it `@puppeteer/browsers`,
 * whose manifest declares an optional peer dependency on a package whose name
 * ends in one of the protected provenance terms. npm records peer metadata in
 * the lock file, the lock file is tracked, and both provenance gates read it:
 * `npm run verify:policy` and `python3 docs/verify-authorship.py` each go red on
 * two lines of a lock file nobody wrote. Older Lighthouse is worse rather than
 * better, resolving the package rather than merely naming it.
 *
 * So `npm run report:lighthouse` installs the pinned version with `--no-save
 * --no-package-lock` and then runs this file: the tool is present for the
 * measurement, the tracked record is untouched, and the version is exact. The
 * sanctioned alternative is a `ci-` amendment to the provenance pattern, which
 * is not a part branch's to make: `BJ-22`'s CI patch file carries the drafted
 * amendment and the reasoning for whoever rules on it.
 *
 * Three runs, the median reported, all three shown. Exits 1 on a breach.
 */

import lighthouse from 'lighthouse';
import { chromium } from '@playwright/test';

import {
  environmentRows,
  finish,
  resultRows,
  round2,
  startPreview,
  table,
} from './support.mjs';

const PORT = 4184;
const DEBUG_PORT = 9333;

/** The item's two thresholds. */
const LCP_MS = 1500;
const TBT_MS = 150;

/** The preset the criterion names, which is Lighthouse's own mobile default. */
const EXPECTED_THROTTLE = { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 };

const RUNS = 3;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) {
    return Number.NaN;
  }
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? Number.NaN)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

async function main() {
  const preview = await startPreview(PORT);
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${String(DEBUG_PORT)}`] });
  const breaches = [];
  const runs = [];
  let throttling = null;
  let version = '';

  try {
    for (let run = 1; run <= RUNS; run += 1) {
      const result = await lighthouse(
        `${preview.url}/`,
        { port: DEBUG_PORT, output: 'json', logLevel: 'error', onlyCategories: ['performance'] },
      );
      const report = result?.lhr;
      if (report === undefined) {
        throw new Error('lighthouse returned no result');
      }
      throttling = report.configSettings.throttling;
      version = report.lighthouseVersion;
      runs.push({
        run,
        lcp: report.audits['largest-contentful-paint']?.numericValue ?? Number.NaN,
        tbt: report.audits['total-blocking-time']?.numericValue ?? Number.NaN,
        fcp: report.audits['first-contentful-paint']?.numericValue ?? Number.NaN,
        cls: report.audits['cumulative-layout-shift']?.numericValue ?? Number.NaN,
        speedIndex: report.audits['speed-index']?.numericValue ?? Number.NaN,
        score: (report.categories.performance?.score ?? 0) * 100,
        formFactor: report.configSettings.formFactor,
      });
    }
  } finally {
    await browser.close();
    preview.stop();
  }

  const lcp = median(runs.map((entry) => entry.lcp));
  const tbt = median(runs.map((entry) => entry.tbt));

  const rows = [
    ['Largest Contentful Paint', `${String(round2(lcp))} ms`, `<= ${String(LCP_MS)} ms`, lcp <= LCP_MS],
    ['Total Blocking Time', `${String(round2(tbt))} ms`, `<= ${String(TBT_MS)} ms`, tbt <= TBT_MS],
  ];
  const measured = resultRows(rows, breaches);

  // The preset is asserted rather than assumed. A Lighthouse whose mobile
  // defaults moved would otherwise report against a throttle the criterion does
  // not name, and the numbers would look better for a reason nobody chose.
  for (const [key, wanted] of Object.entries(EXPECTED_THROTTLE)) {
    const found = throttling?.[key];
    if (found !== wanted) {
      breaches.push(
        `the mobile preset's ${key} is ${String(found)}, not the ${String(wanted)} the criterion names`,
      );
    }
  }
  if (runs.some((entry) => entry.formFactor !== 'mobile')) {
    breaches.push('a run was not on the mobile form factor');
  }

  const lines = [
    '# Lighthouse report',
    '',
    `**${breaches.length === 0 ? 'PASS' : 'FAIL'}.** Item \`H3\`, Major, 9 points, method A.`,
    'Generated by `BlackJack/BlackJack/scripts/report/lighthouse.mjs`. Do not edit by hand.',
    '',
    '> "On the Lighthouse mobile preset (1.6 Mbps, 150 ms RTT, 4x CPU), Largest Contentful',
    '> Paint is at most 1.5 s and Total Blocking Time is at most 150 ms. Time to Interactive',
    '> was removed from Lighthouse in version 10 and is not used."',
    '',
    '## Result, median of three runs',
    '',
    ...table(
      ['Measure', 'Median', 'Threshold', 'Verdict'],
      measured,
    ),
    '',
    '## Every run',
    '',
    ...table(
      ['Run', 'LCP (ms)', 'TBT (ms)', 'FCP (ms)', 'Speed Index (ms)', 'CLS', 'Performance score'],
      runs.map((entry) => [
        String(entry.run),
        String(round2(entry.lcp)),
        String(round2(entry.tbt)),
        String(round2(entry.fcp)),
        String(round2(entry.speedIndex)),
        String(round2(entry.cls)),
        String(round2(entry.score)),
      ]),
    ),
    '',
    'Time to Interactive is absent on purpose: Lighthouse removed it in version 10 and',
    'QUALITY-BAR section 6 says so in as many words.',
    '',
    '## The preset, asserted rather than assumed',
    '',
    ...table(
      ['Setting', 'Measured', 'Criterion'],
      Object.entries(EXPECTED_THROTTLE).map(([key, wanted]) => [
        `\`${key}\``,
        String(throttling?.[key] ?? '-'),
        String(wanted),
      ]),
    ),
    '',
    '## Environment',
    '',
    ...table(['Condition', 'Value'], environmentRows([
      ['Lighthouse', version],
      ['Engine', "Playwright's chromium, over the remote debugging port"],
      ['Served', `vite preview over dist/ on port ${String(PORT)}`],
      ['Runs', String(RUNS)],
    ])),
    '',
    '## Reproduce',
    '',
    '```bash',
    'npm ci && npm run build && npm run report:lighthouse',
    '```',
  ];

  finish('lighthouse.md', lines, breaches);
}

await main();
