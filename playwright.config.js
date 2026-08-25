// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * These specs drive the APG pattern demo pages published by `AFixt/apg-react`.
 *
 * Start that server yourself before running the suite:
 *
 *   git clone https://github.com/AFixt/apg-react.git
 *   cd apg-react && nvm use && npm ci && npm run serve
 *
 * It listens on http://localhost:8080 and serves one page per pattern at
 * `/demos/<pattern>.html`. Point the suite somewhere else with APG_BASE_URL —
 * any implementation that follows the APG should pass these specs unchanged,
 * which is the point of publishing them.
 */
const baseURL = process.env.APG_BASE_URL || 'http://localhost:8080';

// A conformance run that quietly drops assertions and still prints green is the
// failure mode markOptional() exists to prevent, so APG_REQUIRED_ONLY announces
// itself before any result appears.
//
// Guarded on TEST_WORKER_INDEX because Playwright evaluates this config in every
// worker as well as in the parent — moving the notice out of
// specs/support/apg.js was not enough on its own. Unguarded it printed nine
// times on a Chromium-only run and twenty-five across all three engines. Only
// the parent has TEST_WORKER_INDEX unset, so this fires exactly once.
if (process.env.APG_REQUIRED_ONLY && process.env.TEST_WORKER_INDEX === undefined) {
  // Deliberate CLI output. The no-console rule exists to catch debug logging
  // left behind; this is the notice that stops a required-only run being
  // mistaken for a full one.
  // eslint-disable-next-line no-console
  console.log(
    '\n  APG_REQUIRED_ONLY=1 — tests calling markOptional() are SKIPPED.\n' +
      '  This run checks only what the APG mandates, so it reports fewer tests\n' +
      '  than a full run by design. Unset it for full coverage.\n'
  );
}

module.exports = defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.js',
  // Nothing here is order-dependent; every spec navigates for itself.
  fullyParallel: true,
  // A `test.only` left in a spec silently shrinks the suite. Fail the CI run.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  // Keyboard-driven assertions should settle fast. A long timeout here just
  // turns a real focus-management bug into a slow pass.
  expect: { timeout: 5_000 },
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  /**
   * All three engines run the same specs, with the same assertions.
   *
   * These specs assert page *tab-sequence* behaviour — "this composite is a
   * single tab stop", "Tab leaves the widget", "Tab visits the links in order"
   * — and the three engines do not model the tab sequence identically. Two
   * differences used to fail 21 tests against a perfectly correct page:
   *
   *   - WebKit follows the macOS "full keyboard access" default, where Tab
   *     visits form controls only and Option+Tab visits everything, links
   *     included.
   *   - Firefox parks focus at whichever end of the tab ring it reaches rather
   *     than cycling out through the document, so on a page whose only tab
   *     stop is the widget, "Tab leaves this widget" read as "Tab stayed put".
   *
   * Both are handled in `specs/support/apg.js` — by sending the chord the host
   * engine actually advances focus with, and by bracketing every demo page
   * with a tab stop on either side of the widget — so no assertion had to be
   * weakened to make the suite portable. See the comments there, and issue #4.
   *
   * `npm test` still runs Chromium alone, because that is the fast inner loop.
   * `npm run test:engines` runs all three.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
