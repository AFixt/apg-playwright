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
   *   - Firefox parks focus on the last tabbable element rather than cycling
   *     out through the document, so on a page whose only tab stop is the
   *     widget, "Tab leaves this widget" read as "Tab stayed put".
   *
   * Both are handled in `specs/support/apg.js` — by sending the chord the host
   * engine actually advances focus with, and by giving every demo page a tab
   * stop after the widget — so no assertion had to be weakened to make the
   * suite portable. See the comments there, and issue #4.
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
