const js = require('@eslint/js');
const globals = require('globals');
const playwright = require('eslint-plugin-playwright');

module.exports = [
  {
    ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      // Browser globals are here because the callbacks passed to
      // `page.evaluate()` / `locator.evaluate()` are serialised and run inside
      // the page, where `document` and `window` are exactly what you want.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ...playwright.configs['flat/recommended'],
    files: ['specs/**/*.spec.js'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // Every assertion in this suite is a Playwright web-first assertion on a
      // locator, so a bare `expect` on a plain value is almost always a mistake.
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-skipped-test': 'warn',
    },
  },
];
