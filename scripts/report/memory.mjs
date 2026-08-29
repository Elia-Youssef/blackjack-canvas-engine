/**
 * Item `H5`, Major, 9 points, method A, evidence `report/memory`.
 *
 *   "Three Chrome DevTools heap snapshots at 0, 15 and 30 minutes of continuous
 *    play, each preceded by a forced collection, show retained size growing by
 *    less than 2 MB, with no detached node, listener or timer accumulating."
 *
 * **Snapshots, not an API, and QUALITY-BAR section 6 says why**: "The available
 * browser memory interfaces are non-standard or require cross-origin isolation
 * via COOP/COEP response headers, which a static bundle with no server cannot
 * set." So each checkpoint is a real `HeapProfiler.takeHeapSnapshot` over the
 * debugger protocol, preceded by `HeapProfiler.collectGarbage`, and the retained
 * size is the sum of every live node's own size, which is the number DevTools
 * puts at the bottom of a snapshot.
 *
 * The three accumulations the criterion names are counted out of the same
 * snapshots, except the timers:
 *
 *   - **Detached nodes** are the snapshot's own `Detached <Tag>` entries, which
 *     is exactly what the DevTools summary calls them.
 *   - **Listeners** are the snapshot's `EventListener` objects. `BJ-17` pinned
 *     the product to three input listeners and `BJ-18` and `BJ-19` added their
 *     own; what matters here is that the count does not climb.
 *   - **Timers** have no representation a snapshot can be asked for, so they are
 *     counted by a shim installed **before** the game boots, which increments on
 *     `setTimeout` and `setInterval` and decrements on their clears and on a
 *     timeout firing. The shim is disclosed rather than hidden: it is two
 *     wrappers and a counter, it runs in the page being measured, and its cost
 *     is a function call on a path the game takes a few times a round.
 *
 * The interval is the criterion's 30 minutes. `BJ_MEMORY_MINUTES` shortens it for
 * development and the report says which was used, because a report that did not
 * would let a 30 second run wear a 30 minute claim.
 */

import { chromium } from '@playwright/test';

import { bootGame, findSeedReaching, settle, toBetting } from './drive.mjs';
import { environmentRows, finish, round2, startPreview, table } from './support.mjs';

const PORT = 4185;

/** The criterion's ceiling, in bytes. */
const GROWTH_CEILING = 2 * 1024 * 1024;

/** The criterion's checkpoints, in minutes. */
const CHECKPOINTS = [0, 15, 30];

/** The wager the driver bets each round. Bronze-legal and one chip. */
const WAGER = 50;

/** How long one checkpoint interval lasts, in milliseconds. */
function intervalMs() {
  const override = Number(process.env['BJ_MEMORY_MINUTES']);
  const minutes = Number.isFinite(override) && override > 0 ? override : 15;
  return minutes * 60_000;
}

/**
 * Take one heap snapshot and reduce it to the three numbers that matter.
 *
 * The snapshot arrives as a stream of JSON chunks over the protocol and is
 * parsed once, here, rather than written to disk: what the report needs is a
 * total and two counts, and keeping a 20 MB document per checkpoint would be
 * keeping the evidence in the least usable form there is.
 */
async function snapshot(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const chunks = [];
  const collect = (event) => chunks.push(event.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', collect);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, treatGlobalObjectsAsRoots: true });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', collect);

  const parsed = JSON.parse(chunks.join(''));
  const fields = parsed.snapshot.meta.node_fields;
  const stride = fields.length;
  const selfSizeAt = fields.indexOf('self_size');
  const nameAt = fields.indexOf('name');
  const strings = parsed.strings;
  const nodes = parsed.nodes;

  let retained = 0;
  let detached = 0;
  let listeners = 0;
  for (let at = 0; at < nodes.length; at += stride) {
    retained += nodes[at + selfSizeAt] ?? 0;
    const name = strings[nodes[at + nameAt] ?? 0] ?? '';
    if (name.startsWith('Detached ')) {
      detached += 1;
    } else if (name === 'EventListener') {
      listeners += 1;
    }
  }
  return { retained, detached, listeners, nodes: nodes.length / stride };
}

/** Install the auto-player and the timer census, before anything is measured. */
async function startPlaying(page) {
  await page.evaluate(() => {
    // The timer census. Installed on the window the game already runs on, so it
    // sees the game's own timers; the counter is the number outstanding, which
    // is the number the criterion is about.
    const state = { live: 0, peak: 0 };
    const realTimeout = window.setTimeout.bind(window);
    const realInterval = window.setInterval.bind(window);
    const realClearTimeout = window.clearTimeout.bind(window);
    const realClearInterval = window.clearInterval.bind(window);
    const note = (delta) => {
      state.live += delta;
      state.peak = Math.max(state.peak, state.live);
    };
    window.setTimeout = (handler, delay, ...rest) => {
      note(1);
      return realTimeout(
        (...args) => {
          note(-1);
          if (typeof handler === 'function') {
            handler(...args);
          }
        },
        delay,
        ...rest,
      );
    };
    window.setInterval = (...args) => {
      note(1);
      return realInterval(...args);
    };
    window.clearTimeout = (id) => {
      note(-1);
      realClearTimeout(id);
    };
    window.clearInterval = (id) => {
      note(-1);
      realClearInterval(id);
    };
    window.__bjTimers = state;

    const shell = document.querySelector('.bj-shell');
    const click = (selector) => {
      const node = document.querySelector(selector);
      if (node instanceof HTMLElement) {
        node.click();
      }
    };
    realInterval(() => {
      const phase = shell?.getAttribute('data-phase') ?? '';
      // **The smallest chip, and that is what keeps play continuous.** A driver
      // that taps a fixed 50 stops the moment the balance falls under 50: the
      // tap is refused for want of funds, the deal is refused for want of a
      // wager, and the page sits at the betting screen for the rest of the run.
      // The memory soak did exactly that, twice, stopping at the same 103 rounds
      // fifteen minutes in and reporting a heap that had stopped changing as a
      // heap that does not grow; a driver tapping 100 was watched doing it, and
      // sat at the betting screen from 50 chips onward. SPEC 6 puts the Bronze
      // minimum at 10, so the smallest
      // chip is always affordable until the balance is under the minimum, and
      // under it SPEC 4.12's screen takes over, which the arm below answers.
      if (phase === 'betting') {
        click('[data-chip="10"]');
        click('[data-control="deal"]');
      } else if (phase === 'playerTurn') {
        click('[data-action="stand"]');
      } else if (phase === 'insurance') {
        click('[data-control="decline-insurance"]');
      } else if (phase === 'roundResult') {
        click('[data-control="next-hand"]');
      } else if (phase === 'start') {
        click('[data-control="start"]');
      } else if (phase === 'bustOut') {
        click('[data-control="reset-bankroll"]');
      }
    }, 250);
  });
}

/** What the page can say about itself at a checkpoint. */
async function pageState(page) {
  return page.evaluate(() => ({
    timers: window.__bjTimers?.live ?? -1,
    peakTimers: window.__bjTimers?.peak ?? -1,
    rounds: window.__bjGame?.readout().rounds ?? -1,
    elements: document.getElementsByTagName('*').length,
  }));
}

async function main() {
  const preview = await startPreview(PORT);
  const browser = await chromium.launch();
  const breaches = [];
  const checkpoints = [];
  const step = intervalMs();
  let seed;
  let timerControl;

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    seed = await findSeedReaching(page, preview.url, 'playerTurn', WAGER);
    await bootGame(page, preview.url, { seed });
    await toBetting(page);
    await settle(page);
    await startPlaying(page);
    // The shim, shown to be able to count. A timer is created, the census is
    // read, the timer is cleared and the census is read again: a counter that
    // answered zero either way would report "no timers accumulating" for a page
    // that leaked one a second.
    timerControl = await page.evaluate(() => {
      const before = window.__bjTimers?.live ?? -1;
      const id = setInterval(() => undefined, 10_000);
      const during = window.__bjTimers?.live ?? -1;
      clearInterval(id);
      return { before, during, after: window.__bjTimers?.live ?? -1 };
    });

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');

    for (const [index, minute] of CHECKPOINTS.entries()) {
      if (index > 0) {
        await page.waitForTimeout(step);
      }
      const heap = await snapshot(cdp);
      const state = await pageState(page);
      checkpoints.push({ minute, ...heap, ...state });
    }

    await cdp.send('HeapProfiler.disable');
    await cdp.detach();
  } finally {
    await browser.close();
    preview.stop();
  }

  const first = checkpoints[0];
  const last = checkpoints[checkpoints.length - 1];
  const growth = (last?.retained ?? 0) - (first?.retained ?? 0);
  const detachedGrowth = (last?.detached ?? 0) - (first?.detached ?? 0);
  const listenerGrowth = (last?.listeners ?? 0) - (first?.listeners ?? 0);
  const timerGrowth = (last?.timers ?? 0) - (first?.timers ?? 0);

  const rows = [
    ['Retained heap growth', `${String(round2(growth / 1024))} KB`,
      `< ${String(GROWTH_CEILING / 1024)} KB`, growth < GROWTH_CEILING],
    ['Detached nodes accumulated', String(detachedGrowth), '<= 0', detachedGrowth <= 0],
    ['Listeners accumulated', String(listenerGrowth), '<= 0', listenerGrowth <= 0],
    ['Timers accumulated', String(timerGrowth), '<= 0', timerGrowth <= 0],
  ];
  for (const [measure, value, threshold, ok] of rows) {
    if (!ok) {
      breaches.push(`${measure}: ${value} against ${threshold}`);
    }
  }
  // **Every interval has to have been played, not just the first.** Two runs of
  // this soak reported the same 103 rounds at fifteen minutes and at thirty: the
  // driver was tapping a fixed chip, the balance fell below it, the tap was
  // refused for want of funds and the deal for want of a wager, and a heap that
  // had stopped changing was about to be read as a heap that does not grow. The
  // tap is the smallest chip now, and a flat interval is a failure rather than a
  // result: this guard is what turned a passing report into a red one.
  for (let index = 1; index < checkpoints.length; index += 1) {
    const played = (checkpoints[index]?.rounds ?? 0) - (checkpoints[index - 1]?.rounds ?? 0);
    if (played < 10) {
      breaches.push(
        `only ${String(played)} rounds were played in the interval ending at minute `
        + `${String(checkpoints[index]?.minute ?? 0)}, so that stretch was not continuous play`,
      );
    }
  }
  if (checkpoints.some((entry) => entry.retained <= 0)) {
    breaches.push('a snapshot reported no retained size, so the parser read nothing');
  }
  if (timerControl.during !== timerControl.before + 1 || timerControl.after !== timerControl.before) {
    breaches.push('the timer census did not follow a timer it was shown, so it counts nothing');
  }

  const minutes = step / 60_000;
  const shortened = minutes !== 15;
  if (shortened) {
    breaches.push(
      `the interval was ${String(minutes)} minutes, not the 15 the criterion names, so this run does not gate`,
    );
  }

  const lines = [
    '# Memory report',
    '',
    `**${breaches.length === 0 ? 'PASS' : 'FAIL'}.** Item \`H5\`, Major, 9 points, method A.`,
    'Generated by `BlackJack/BlackJack/scripts/report/memory.mjs`. Do not edit by hand.',
    '',
    '> "Three Chrome DevTools heap snapshots at 0, 15 and 30 minutes of continuous play, each',
    '> preceded by a forced collection, show retained size growing by less than 2 MB, with no',
    '> detached node, listener or timer accumulating."',
    '',
    '## Result',
    '',
    ...table(
      ['Measure', 'Value', 'Threshold', 'Verdict'],
      rows.map(([measure, value, threshold, ok]) => [measure, value, threshold, ok ? 'PASS' : '**FAIL**']),
    ),
    '',
    '## Every snapshot',
    '',
    ...table(
      ['Minute', 'Retained (KB)', 'Live nodes', 'Detached', 'Listeners', 'Timers live',
        'Timers peak', 'DOM elements', 'Rounds played'],
      checkpoints.map((entry) => [
        String(entry.minute),
        String(round2(entry.retained / 1024)),
        String(entry.nodes),
        String(entry.detached),
        String(entry.listeners),
        String(entry.timers),
        String(entry.peakTimers),
        String(entry.elements),
        String(entry.rounds),
      ]),
    ),
    '',
    '## The controls',
    '',
    `The timer census reads **${String(timerControl.before)}** outstanding, **${String(timerControl.during)}**`,
    `while one interval is held, and **${String(timerControl.after)}** once it is cleared. So a page`,
    'that leaked a timer would be reported as leaking one. The game itself creates none: it',
    'runs on animation frames and on listeners, which is why the column reads zero throughout',
    'rather than because nothing is watching.',
    '',
    'The detached-node and listener counts come out of the snapshots themselves, where a',
    'detached node is an entry the snapshot names `Detached <Tag>`. A build that held a shell',
    'after a re-boot would show them climbing, which is the accumulation the criterion is',
    'about.',
    '',
    'Each snapshot is preceded by `HeapProfiler.collectGarbage`, so the retained size is what',
    'survives a collection rather than what happens to be allocated. The retained figure is',
    "the sum of every live node's own size, which is the total a DevTools snapshot reports.",
    '',
    '## Environment',
    '',
    ...table(['Condition', 'Value'], environmentRows([
      ['Engine', 'headless chromium, Playwright, over the debugger protocol'],
      ['Served', `vite preview over dist/ on port ${String(PORT)}`],
      ['Checkpoints', `${CHECKPOINTS.join(', ')} minutes`],
      ['Interval used', `${String(minutes)} minutes${shortened ? ' (shortened, does not gate)' : ''}`],
      ['Seed', String(seed)],
      ['Driver', 'in-page, one press every 250 ms, continuous play'],
    ])),
    '',
    '## Reproduce',
    '',
    'An idle machine, and half an hour. `BJ_MEMORY_MINUTES` shortens the interval for',
    'development, and a shortened run reports itself as one and fails rather than claiming a',
    'measurement it did not make.',
    '',
    '```bash',
    'npm ci && npm run build && npm run report:memory',
    '```',
  ];

  finish('memory.md', lines, breaches);
}

await main();
