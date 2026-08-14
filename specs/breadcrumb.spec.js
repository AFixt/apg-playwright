// @ts-check
/**
 * APG Breadcrumb Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/
 *
 * Derived from apg-usecases `patterns/breadcrumb/*.uc.yaml`:
 *   breadcrumb-contained-in-navigation-landmark, breadcrumb-links,
 *   breadcrumb-accessibility, breadcrumb-current-page-representation,
 *   breadcrumb-visual-structure
 *
 * The demo renders `nav[aria-label="Breadcrumb"] > ol > li`, with three
 * ancestor links (Home, Library, Data) and a final `<span aria-current="page">`
 * for the current page.
 *
 * Breadcrumb has no state of its own, so the behavioural assertions here are
 * about focus order and navigation: Tab must walk the trail, Enter must follow
 * a crumb, and the current-page crumb must not be a stop at all.
 *
 * Not covered, and why:
 *   - breadcrumb-visual-structure's "appears before the main content" clause:
 *     the demo shell wraps every pattern in a single `<main>`, so the
 *     breadcrumb is nested inside it and there is no second landmark to
 *     compare document order against.
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused } = require('./support/apg');

const TRAIL = ['Home', 'Library', 'Data'];
const CURRENT = 'Current Page';

const trail = (page) => page.getByRole('navigation', { name: 'Breadcrumb' });

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'breadcrumb');
});

test.describe('Breadcrumb — structure and naming', () => {
  test('the trail lives in a navigation landmark that Tab enters', async ({ page }) => {
    const nav = trail(page);
    await expect(nav).toHaveAccessibleName('Breadcrumb');

    // The landmark's value is that assistive technology can list it and jump
    // to it; the closest browser-level proxy is that tabbing into the trail
    // genuinely lands inside this landmark rather than beside it.
    const first = page.getByRole('link', { name: TRAIL[0] });
    const presses = await tabUntilFocused(page, first);
    expect(presses, 'the first crumb must be reachable by Tab').toBeGreaterThan(0);

    const insideLandmark = await nav.evaluate((el) => el.contains(document.activeElement));
    expect(insideLandmark, 'the focused crumb must be inside the navigation landmark').toBe(true);
  });

  test('the trail is an ordered list of crumbs in hierarchy order', async ({ page }) => {
    const nav = trail(page);

    // The list markup is what conveys "these four things are one sequence, and
    // this is its length" to a screen reader.
    await expect(nav.getByRole('list')).toHaveCount(1);
    await expect(nav.getByRole('listitem')).toHaveText([...TRAIL, CURRENT]);
    await expect(nav.getByRole('link')).toHaveText(TRAIL);

    // Walking the trail with Tab must follow the same order the list declares.
    await tabUntilFocused(page, page.getByRole('link', { name: TRAIL[0] }));
    for (const name of TRAIL.slice(1)) {
      await page.keyboard.press('Tab');
      const crumb = page.getByRole('link', { name });
      expect(await isFocused(crumb), `Tab should reach the ${name} crumb next`).toBe(true);
    }
  });

  test('every crumb link has a non-empty accessible name', async ({ page }) => {
    const nav = trail(page);
    const links = nav.getByRole('link');

    await expect(links).toHaveCount(TRAIL.length);
    for (const name of TRAIL) {
      const crumb = page.getByRole('link', { name, exact: true });
      await expect(crumb).toHaveAccessibleName(name);
      // Reachability is part of the contract: a crumb nobody can focus is not
      // a navigation aid, whatever its name says.
      const presses = await tabUntilFocused(page, crumb);
      expect(presses, `${name} must be reachable by Tab`).toBeGreaterThan(0);
    }
  });
});

test.describe('Breadcrumb — current page', () => {
  test('the current page is marked with aria-current="page"', async ({ page }) => {
    const current = trail(page).locator('[aria-current]');

    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(current).toHaveText(CURRENT);
  });

  test('the current page is not a link and is not a tab stop', async ({ page }) => {
    // This demo takes the APG's non-link branch: the current page is a plain
    // `<span>`. That makes aria-current the only thing announcing it, and it
    // must stay out of the tab sequence — a "link" to the page you are already
    // on is a dead stop for a keyboard user.
    await expect(page.getByRole('link', { name: CURRENT })).toHaveCount(0);

    const last = page.getByRole('link', { name: TRAIL[TRAIL.length - 1] });
    await tabUntilFocused(page, last);
    await page.keyboard.press('Tab');

    const stillInTrail = await trail(page).evaluate((el) => el.contains(document.activeElement));
    expect(stillInTrail, 'Tab past the last link must leave the breadcrumb').toBe(false);
  });
});

test.describe('Breadcrumb — navigation', () => {
  test('Enter on a crumb navigates to that ancestor page', async ({ page }) => {
    const crumb = page.getByRole('link', { name: 'Data' });
    await expect(crumb).toHaveAttribute('href', '/library/data');

    await tabUntilFocused(page, crumb);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/library\/data$/);
  });

  test('each crumb targets its own level of the hierarchy', async ({ page }) => {
    // Distinct hrefs are what make the trail a hierarchy rather than three
    // copies of the same link.
    const hrefs = await trail(page)
      .getByRole('link')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));

    expect(hrefs).toEqual(['/', '/library', '/library/data']);

    await tabUntilFocused(page, page.getByRole('link', { name: 'Library' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/library$/);
  });
});
