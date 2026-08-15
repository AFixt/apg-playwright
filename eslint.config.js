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
      // A stray console.log in a spec ends up in every CI log for the life of
      // the suite. Warn rather than error so debugging one locally is painless.
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      // Dynamic evaluation. Nothing in a spec suite needs it, and the
      // `page.evaluate()` callbacks are serialised functions, not strings.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // `getAttribute()` returns `string | null`, so loose equality quietly
      // conflates a missing attribute with an empty one.
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
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
      // Several specs factor repeated ARIA checks into named helpers
      // (expectMixed, expectActiveOption, …). Those are still assertions, so
      // teach the rule to recognise them rather than have every caller look
      // like a test with no expectations.
      'playwright/expect-expect': ['warn', { assertFunctionNames: ['expect*'] }],
    },
  },
];
