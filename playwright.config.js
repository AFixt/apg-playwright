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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
