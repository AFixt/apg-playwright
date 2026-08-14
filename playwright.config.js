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
   * Chromium is the default engine, and the only one in the default run.
   *
   * These specs assert page *tab-sequence* behaviour — "this composite is a
   * single tab stop", "Tab leaves the widget", "Tab visits the links in order".
   * Those assertions are sensitive to the host engine's tab model, which
   * differs in ways that have nothing to do with the component under test:
   *
   *   - WebKit omits links from the tab sequence entirely. On the Link and
   *     Breadcrumb demos, Tab never moves focus off <body>, so every
   *     link-reachability assertion fails against a perfectly correct page.
   *   - Firefox wraps the tab ring straight back to the first control when a
   *     document has no other tab stop, where Chromium passes through <body>
   *     first. "Tab leaves this widget" therefore reads as "Tab stayed put".
   *
   * Both are real, documented engine behaviours. Neither is an accessibility
   * defect in apg-react, and papering over them by loosening the assertions
   * would throw away the strongest tests in the suite.
   *
   * Firefox and WebKit are kept configured and can be run explicitly:
   *
   *   npx playwright test --project=firefox
   *
   * Reformulating the tab-sequence assertions so they hold across all three
   * engines — most likely by asserting the roving-tabindex distribution, which
   * is engine-independent, and adding sentinel controls around each widget —
   * is tracked as issue #4 in this repo.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
