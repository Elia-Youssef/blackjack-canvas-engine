/**
 * Fail the browser run if anything was skipped.
 *
 * **The suite ships 0 skipped, and until now that was a number read off a
 * report by a human.** Playwright exits 0 with skips present, so a criterion
 * that stopped being measured would look exactly like one that passed. Two
 * conditional skips exist, both in `tests/browser/forced-colors.spec.ts` and
 * `tests/browser/error-boundary.spec.ts`, and both are guarded by a real
 * measurement (`matchMedia('(forced-colors: active)').matches` on the page)
 * rather than by a browser name, which is the right design: an engine that
 * genuinely cannot emulate forced colors cannot be asked to measure `G9` or
 * `A5`'s forced-colors arm. What was missing is the other half. All three
 * engines emulate it today, so a skip means an engine lost a capability, and a
 * capability loss must be loud rather than quiet.
 *
 * This is the whole guard: it counts skipped results and turns a run that has
 * any into a failed one, naming each. It cannot fire on the suite as it stands.
 *
 * Not installed on the mutation harness's per-entry runs: those pass
 * `--reporter=line`, which replaces this file's registration in
 * `playwright.config.ts` entirely. That is correct. What a ledger entry has to
 * show is that one named spec goes red, and a skip count is a property of the
 * whole suite.
 */

import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

class NoSkipsReporter implements Reporter {
  private readonly skipped: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'skipped') {
      this.skipped.push(test.titlePath().filter((part) => part !== '').join(' > '));
    }
  }

  onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | undefined> {
    if (this.skipped.length === 0) {
      return Promise.resolve(undefined);
    }
    console.error(`\n${String(this.skipped.length)} test(s) were skipped, and the suite runs 0:`);
    for (const title of this.skipped) {
      console.error(`  - ${title}`);
    }
    console.error(
      'A skip here means a criterion went unmeasured. Either the engine lost a capability,\n' +
        'or a skip was added; both have to be argued for rather than absorbed.',
    );
    return Promise.resolve({ status: result.status === 'passed' ? 'failed' : result.status });
  }
}

export default NoSkipsReporter;
