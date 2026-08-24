// @ts-check
/**
 * APG Accordion Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/accordion/
 *
 * Derived from apg-usecases `patterns/accordion/*.uc.yaml`:
 *   accordion-aria-roles-and-states, accordion-expand-collapse,
 *   accordion-keyboard-navigation, accordion-multi-panel-expansion
 */
const { test, expect } = require('@playwright/test');
const {
  byId,
  gotoPattern,
  isFocused,
  pressShiftTab,
  pressTab,
  tabUntilFocused,
  markOptional,
} = require('./support/apg');

const HEADERS = ['Section 1', 'Section 2', 'Section 3'];

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'accordion');
});

test.describe('Accordion — roles, states, and properties', () => {
  test('each header is a button wrapped in a heading and points at its panel', async ({ page }) => {
    for (const name of HEADERS) {
      // The APG requires the button to be wrapped in a heading so that screen
      // reader users can navigate the accordion by heading.
      const heading = page.getByRole('heading', { name });
      await expect(heading).toBeVisible();
      const button = heading.getByRole('button', { name });
      await expect(button).toBeVisible();

      await expect(button).toHaveAttribute('aria-expanded', 'false');
      // aria-controls must be present and non-empty...
      await expect(button).toHaveAttribute('aria-controls', /\S/);
      const controls = await button.getAttribute('aria-controls');

      // ...and must resolve to a real element, not a dangling id.
      const panel = byId(page, controls);
      await expect(panel).toHaveCount(1);
      // Collapsed means genuinely not perceivable, not just aria-expanded=false.
      await expect(panel).toBeHidden();
    }
  });

  test('each panel is a region labelled by its own header', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Section 1' });
    await button.click();

    const panel = page.getByRole('region', { name: 'Section 1' });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-labelledby', await button.evaluate((el) => el.id));
  });
});

test.describe('Accordion — expanding and collapsing', () => {
  test('Enter on a collapsed header expands its panel', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Section 1' });
    const panel = page.locator('#panel-0');

    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    await tabUntilFocused(page, button);
    await page.keyboard.press('Enter');

    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
  });

  test('Space on an expanded header collapses its panel again', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Section 2' });
    const panel = page.locator('#panel-1');

    await tabUntilFocused(page, button);
    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();

    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
  });

  test('expanding one panel collapses the previously expanded panel', async ({ page }) => {
    // This demo implements the APG's single-expansion variant.
    const first = page.getByRole('button', { name: 'Section 1' });
    const second = page.getByRole('button', { name: 'Section 2' });

    await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true');

    await second.click();
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#panel-0')).toBeHidden();
    await expect(page.locator('#panel-1')).toBeVisible();
  });
});

test.describe('Accordion — keyboard navigation', () => {
  test('the accordion is reachable with Tab and headers are in the tab ring', async ({ page }) => {
    const first = page.getByRole('button', { name: 'Section 1' });
    const presses = await tabUntilFocused(page, first);
    expect(presses, 'first accordion header must be reachable by Tab').toBeGreaterThan(0);
  });

  test('Down Arrow moves focus to the next header and Up Arrow moves back', async ({ page }) => {
    markOptional('Accordion § Optional Keyboard Interaction');

    const first = page.getByRole('button', { name: 'Section 1' });
    const second = page.getByRole('button', { name: 'Section 2' });

    await tabUntilFocused(page, first);
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(second)).toBe(true);

    await page.keyboard.press('ArrowUp');
    expect(await isFocused(first)).toBe(true);
  });

  test('Home moves focus to the first header and End to the last', async ({ page }) => {
    markOptional('Accordion § Optional Keyboard Interaction');

    const first = page.getByRole('button', { name: 'Section 1' });
    const last = page.getByRole('button', { name: 'Section 3' });

    await tabUntilFocused(page, first);
    await page.keyboard.press('End');
    expect(await isFocused(last)).toBe(true);

    await page.keyboard.press('Home');
    expect(await isFocused(first)).toBe(true);
  });

  test('Down Arrow from the last header wraps to the first', async ({ page }) => {
    markOptional('APG is silent — it says only "moves focus to the next accordion header"');

    const first = page.getByRole('button', { name: 'Section 1' });
    const last = page.getByRole('button', { name: 'Section 3' });

    await tabUntilFocused(page, first);
    await page.keyboard.press('End');
    expect(await isFocused(last)).toBe(true);

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(first), 'Down Arrow from the last header should wrap').toBe(true);
  });

  test('every header is in the page tab sequence', async ({ page }) => {
    // Unlike most composite widgets, the APG Accordion does NOT use a roving
    // tabindex: "all focusable elements in the accordion are included in the
    // page Tab sequence". Arrow keys are an addition to Tab, not a substitute.
    const first = page.getByRole('button', { name: 'Section 1' });
    const second = page.getByRole('button', { name: 'Section 2' });
    const third = page.getByRole('button', { name: 'Section 3' });

    await tabUntilFocused(page, first);
    await pressTab(page);
    expect(await isFocused(second), 'Tab should reach the second header').toBe(true);
    await pressTab(page);
    expect(await isFocused(third), 'Tab should reach the third header').toBe(true);

    await pressShiftTab(page);
    expect(await isFocused(second), 'Shift+Tab should walk back').toBe(true);
  });
});
