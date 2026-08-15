// @ts-check
/**
 * APG Link Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/link/
 *
 * Derived from apg-usecases `patterns/link/*.uc.yaml`:
 *   link-accessibility-features, link-executing, link-context-menu
 *
 * The demo renders three native anchors: "Documentation" (→ /docs), "Home"
 * (→ /), and an image link whose entire accessible name comes from the
 * `alt` text of the `<img>` it wraps.
 *
 * Link has no internal state, so the behaviour under test is focus order and
 * activation: every link must be reachable by Tab, and Enter must navigate.
 *
 * Not covered, and why:
 *   - link-context-menu: APG lists Shift+F10 as optional ("if the
 *     implementation provides one"). This demo provides none, and the
 *     browser's own context menu is out of the page's reach, so a test could
 *     only assert that nothing happened — an assertion that cannot fail.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  pressShiftTab,
  pressTab,
} = require('./support/apg');

const LINKS = [
  { name: 'Documentation', href: '/docs' },
  { name: 'Home', href: '/' },
  { name: 'Company logo', href: '/' },
];

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'link');
});

test.describe('Link — roles and accessible names', () => {
  test('every link is exposed as role=link with a non-empty accessible name', async ({ page }) => {
    await expect(page.getByRole('link')).toHaveCount(LINKS.length);

    for (const { name } of LINKS) {
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toHaveAccessibleName(name);
      // A name without reachability is no use to a keyboard user, so prove
      // each one is actually in the tab sequence.
      const presses = await tabUntilFocused(page, link);
      expect(presses, `${name} must be reachable by Tab`).toBeGreaterThan(0);
    }
  });

  test('Tab visits the links in document order', async ({ page }) => {
    await tabUntilFocused(page, page.getByRole('link', { name: 'Documentation' }));

    await pressTab(page);
    expect(await isFocused(page.getByRole('link', { name: 'Home', exact: true }))).toBe(true);

    await pressTab(page);
    expect(await isFocused(page.getByRole('link', { name: 'Company logo' }))).toBe(true);

    await pressShiftTab(page);
    expect(await isFocused(page.getByRole('link', { name: 'Home', exact: true }))).toBe(true);
  });

  test('an image link takes its accessible name from the image alt text', async ({ page }) => {
    // The anchor has no text of its own. If the alt were dropped the link
    // would announce as its URL, which is the classic image-link failure.
    const link = page.getByRole('link', { name: 'Company logo' });
    const image = link.getByRole('img', { name: 'Company logo' });

    await expect(image).toBeVisible();
    await expect(link).toHaveAccessibleName('Company logo');
    await expect(link).toHaveText('');

    const presses = await tabUntilFocused(page, link);
    expect(presses, 'the image link must be reachable by Tab').toBeGreaterThan(0);
  });
});

test.describe('Link — activation', () => {
  test('Enter on a focused link navigates to its target', async ({ page }) => {
    const link = page.getByRole('link', { name: 'Documentation' });
    await expect(link).toHaveAttribute('href', '/docs');

    await tabUntilFocused(page, link);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/docs$/);
  });

  test('Enter on the image link navigates to its target too', async ({ page }) => {
    // Same contract, different content model — a link whose only child is an
    // image still has to behave like a link under the keyboard.
    const link = page.getByRole('link', { name: 'Company logo' });

    await tabUntilFocused(page, link);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test('clicking a link navigates to the same target as the keyboard does', async ({ page }) => {
    await page.getByRole('link', { name: 'Documentation' }).click();

    await expect(page).toHaveURL(/\/docs$/);
  });
});
