/**
 * Item `L2`, severity Critical, 9 points. `BJ-21`.
 *
 *   "No third-party network request occurs at runtime. The CSP meta element is
 *    present as the first element in head with the specified directives, and
 *    enforcement is demonstrated positively: a test page injects a third-party
 *    fetch and an off-origin script tag and asserts both are blocked with a
 *    securitypolicyviolation event."
 *
 * QUALITY-BAR section 9, over the built `dist/` served by `vite preview`.
 *
 * **The positive demonstration is the point, and the criterion says why.**
 * Observing that a page made no third-party request proves that the page did
 * not try; it says nothing about what would happen if something did. So the
 * middle group below makes the page try, twice, in the two ways the criterion
 * names, and asserts that the platform refused each of them and said so through
 * a `securitypolicyviolation` event. The weaker observation is here too,
 * because the criterion's first sentence asks for it, and it is a different
 * claim rather than the same one twice.
 *
 * **Nothing in this suite runs with `bypassCSP`.** The policy is live on every
 * page the browser gate loads, which is what makes the request census below a
 * census of the game as it ships. The one thing that had to change for that is
 * how the test-time harness reaches a page: `tests/browser/support/game.ts`
 * serves it from a same-origin URL through a route, because `script-src 'self'`
 * allows that and allows no inline script. The alternative would have been to
 * widen the policy for the tests' convenience, which is the shape of defect
 * this whole item exists to prevent.
 *
 * **The directive set is asserted character for character**, and separately
 * from the enforcement, because they fail differently: a policy with a typo in
 * one directive still blocks what the others cover, and a policy that is
 * present but second in `<head>` governs nothing that was fetched before it.
 */

import { expect, test, type Page } from '@playwright/test';

import { atShippedBetting, control, pressOn, settle, shell, waitForPhase } from './support/game';

/**
 * QUALITY-BAR section 9's policy, written out here rather than imported.
 *
 * `vite.config.ts` builds the same string from the same section, and this is a
 * second transcription on purpose: importing the constant would assert that the
 * page carries whatever the build put there, which is true of any policy at all.
 * The two copies are compared by this test, and the section is the source of
 * both.
 */
const POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
  "connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * How long the round drive will keep answering screens before it gives up.
 *
 * A bound in time rather than in steps, and the first version of this drive got
 * that wrong: it counted eight iterations, spent all eight inside the five timed
 * phases of one deal, and then waited for a result the player's turn was still
 * standing in front of. SPEC 5's slowest round is a few seconds, so twenty is
 * that with room, and the bound is what turns a stuck page into a failure with a
 * phase name in it.
 */
const ROUND_TIMEOUT_MS = 20_000;

/** How often the drive looks at the screen while a timed phase runs. */
const ROUND_POLL_MS = 100;

/** A host that cannot resolve, so nothing here can reach a real third party. */
const OFF_ORIGIN = 'https://third-party.invalid';

// ---------------------------------------------------------------------------
// The element, its position, and its directives
// ---------------------------------------------------------------------------

test.describe('L2: the policy ships as the first element in head', () => {
  test('is a CSP meta, first, with the specified directives', async ({ page }) => {
    await page.goto('/');
    const head = await page.evaluate(() => {
      const first = document.head.firstElementChild;
      const metas = [...document.head.querySelectorAll('meta[http-equiv]')].map((node) => ({
        equiv: node.getAttribute('http-equiv'),
        content: node.getAttribute('content'),
      }));
      return {
        tag: first?.tagName.toLowerCase() ?? '',
        equiv: first?.getAttribute('http-equiv') ?? '',
        content: first?.getAttribute('content') ?? '',
        metas,
      };
    });

    expect(head.tag, 'the first element in head is not a meta').toBe('meta');
    expect(head.equiv).toBe('Content-Security-Policy');
    // Character for character. A policy only governs what is fetched after it
    // is parsed, and a directive that is nearly right is a directive that is
    // not there.
    expect(head.content).toBe(POLICY);
    // And exactly one policy: a second, laxer one would not widen the first,
    // but it would be a second thing to keep in step with the section.
    expect(head.metas.filter((meta) => meta.equiv === 'Content-Security-Policy')).toHaveLength(1);
  });

  test('names every directive QUALITY-BAR section 9 lists, and no other', async ({ page }) => {
    await page.goto('/');
    const content = await page.evaluate(
      () => document.head.firstElementChild?.getAttribute('content') ?? '',
    );
    const directives = new Map(
      content
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part !== '')
        .map((part) => {
          const [name, ...values] = part.split(/\s+/);
          return [name ?? '', values.join(' ')] as const;
        }),
    );
    expect([...directives.keys()].sort()).toEqual([
      'base-uri',
      'connect-src',
      'default-src',
      'font-src',
      'form-action',
      'img-src',
      'script-src',
      'style-src',
    ]);
    expect(directives.get('default-src')).toBe("'none'");
    expect(directives.get('script-src')).toBe("'self'");
    expect(directives.get('style-src')).toBe("'self'");
    expect(directives.get('img-src')).toBe("'self' data:");
    expect(directives.get('connect-src')).toBe("'none'");
    expect(directives.get('font-src')).toBe("'none'");
    expect(directives.get('base-uri')).toBe("'none'");
    expect(directives.get('form-action')).toBe("'none'");
    // The three a meta-delivered policy cannot carry. Naming them here is what
    // keeps somebody from adding one and believing it works.
    expect(content).not.toContain('frame-ancestors');
    expect(content).not.toContain('report-uri');
    expect(content).not.toContain('sandbox');
    // And no escape hatch anywhere in it.
    expect(content).not.toContain('unsafe-inline');
    expect(content).not.toContain('unsafe-eval');
  });

  test('emits no inline script and no inline style for the policy to have to allow', async ({
    page,
  }) => {
    // The build property the policy rests on, read off the served bytes rather
    // than off the running document: the play surface sets its own CSS size
    // through the CSSOM at runtime, which is not what an inline style means
    // here and is not what a policy governs.
    const served = await (await page.request.get('/')).text();
    const scripts = [...served.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) {
      expect(tag, 'an inline script would need a hash or unsafe-inline').toContain('src=');
    }
    expect(served).not.toMatch(/<style\b/);
    expect(served).not.toMatch(/\sstyle="/);

    // The cost of putting the policy first, paid and checked. HTML requires the
    // character encoding to be declared inside the first 1024 bytes of the
    // document, and this build pushes a meta element ahead of the charset one;
    // the policy is long, so the margin is worth measuring rather than assuming.
    const charset = served.indexOf('<meta charset=');
    expect(charset, 'the page declares no charset at all').toBeGreaterThan(-1);
    const bytes = Buffer.byteLength(served.slice(0, charset), 'utf8');
    expect(
      bytes,
      'the policy pushed the charset declaration past the first 1024 bytes',
    ).toBeLessThan(1024);
  });
});

// ---------------------------------------------------------------------------
// Enforcement, demonstrated positively
// ---------------------------------------------------------------------------

/** What one attempt to reach a third party produced. */
interface Attempt {
  readonly violations: readonly { readonly directive: string; readonly blocked: string }[];
  readonly fetchRejected: boolean;
  readonly fetchError: string;
  readonly scriptErrored: boolean;
  readonly scriptExecuted: boolean;
}

async function attemptThirdParty(page: Page): Promise<Attempt> {
  return page.evaluate(async (origin: string) => {
    const violations: { directive: string; blocked: string }[] = [];
    const onViolation = (event: Event): void => {
      const detail = event as SecurityPolicyViolationEvent;
      violations.push({
        directive: detail.effectiveDirective,
        blocked: detail.blockedURI,
      });
    };
    document.addEventListener('securitypolicyviolation', onViolation);

    // The fetch the criterion names. `connect-src 'none'` refuses it before
    // anything leaves the machine, which is why the host below never has to
    // resolve.
    let fetchRejected = false;
    let fetchError = '';
    try {
      await fetch(`${origin}/data.json`);
    } catch (error) {
      fetchRejected = true;
      fetchError = error instanceof Error ? error.name : 'not an Error';
    }

    // The off-origin script tag the criterion names. A blocked element fires
    // its own `error` event, and the policy fires the violation beside it.
    const script = document.createElement('script');
    script.src = `${origin}/tracker.js`;
    const scriptErrored = await new Promise<boolean>((resolve) => {
      script.addEventListener('error', () => {
        resolve(true);
      });
      script.addEventListener('load', () => {
        resolve(false);
      });
      document.head.append(script);
      setTimeout(() => {
        resolve(false);
      }, 3000);
    });

    // Violation events are queued as tasks, so one turn is given back to the
    // platform before the list is read.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    document.removeEventListener('securitypolicyviolation', onViolation);

    return {
      violations,
      fetchRejected,
      fetchError,
      scriptErrored,
      // The script would have set this. Its absence is what "blocked" means
      // in the only sense that matters to a player.
      scriptExecuted: 'bjThirdParty' in window,
    };
  }, OFF_ORIGIN);
}

test.describe('L2: enforcement, demonstrated positively', () => {
  test('blocks a third-party fetch and an off-origin script, each with a violation', async ({
    page,
  }) => {
    await page.goto('/');
    const attempt = await attemptThirdParty(page);

    expect(attempt.fetchRejected, 'a third-party fetch was allowed to start').toBe(true);
    expect(attempt.fetchError).toBe('TypeError');
    expect(attempt.scriptErrored, 'the off-origin script did not fail to load').toBe(true);
    expect(attempt.scriptExecuted, 'the off-origin script ran').toBe(false);

    // Two violations, one per attempt. The directive names differ between
    // engines, because a script element is reported against `script-src-elem`
    // where that directive exists and against `script-src` where it does not,
    // and both are the same policy line doing the same thing.
    const directives = attempt.violations.map((violation) => violation.directive);
    expect(
      directives.some((directive) => directive.startsWith('connect-src')),
      `no connect-src violation in ${JSON.stringify(attempt.violations)}`,
    ).toBe(true);
    expect(
      directives.some((directive) => directive.startsWith('script-src')),
      `no script-src violation in ${JSON.stringify(attempt.violations)}`,
    ).toBe(true);
    for (const violation of attempt.violations) {
      expect(violation.blocked).toContain('third-party.invalid');
    }
  });

  test('lets the same page load its own script and stylesheet', async ({ page }) => {
    // The control. A policy that blocked everything would pass the test above
    // and ship a blank page, so the same page is required to have loaded the
    // two same-origin resources it does ship.
    await page.goto('/');
    await expect(page.locator('.bj-shell')).toBeVisible();
    const loaded = await page.evaluate(() => ({
      scripts: [...document.querySelectorAll('script[src]')].length,
      styles: [...document.querySelectorAll('link[rel="stylesheet"]')].length,
      styled: getComputedStyle(document.body).backgroundColor,
    }));
    expect(loaded.scripts).toBeGreaterThan(0);
    expect(loaded.styles).toBeGreaterThan(0);
    // A stylesheet that was blocked would leave the body transparent rather
    // than on the token layer's ground colour.
    expect(loaded.styled).not.toBe('rgba(0, 0, 0, 0)');
  });
});

// ---------------------------------------------------------------------------
// The census: nothing the game does reaches another host
// ---------------------------------------------------------------------------

test.describe('L2: no third-party request occurs at runtime', () => {
  test('asks only its own origin, through a whole round', async ({ page, baseURL }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      requested.push(request.url());
    });

    await atShippedBetting(page);
    await control(page, 'max').click();
    await control(page, 'deal').click();

    // **The round is driven, not hoped through.** This is the shipped page, so
    // the deal is seeded from the clock and every round is a different one: an
    // Ace up card stops at SPEC 4.7's insurance screen, a live hand stops at
    // the player's turn, and a natural on either side stops at neither. The
    // first version of this drive answered only the player's turn and timed out
    // on the first insured round it met, which is a defect in the test rather
    // than in the game. Each screen is answered as it arrives, the timed phases
    // are waited through, and the loop is bounded so a stall fails with a
    // reason instead of hanging.
    const deadline = Date.now() + ROUND_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const phase = await shell(page).getAttribute('data-phase');
      if (phase === 'roundResult') {
        break;
      }
      if (phase === 'insurance') {
        await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
      } else if (phase === 'playerTurn') {
        await pressOn(page, '[data-action="stand"]', 'playerTurn');
      } else {
        await page.waitForTimeout(ROUND_POLL_MS);
      }
    }
    await waitForPhase(page, 'roundResult');
    await settle(page);

    expect(requested.length, 'the page requested nothing at all').toBeGreaterThan(0);
    const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
    const foreign = requested.filter((url) => !url.startsWith(origin) && !url.startsWith('data:'));
    expect(foreign, 'the game reached a host it was not served from').toEqual([]);
  });
});
