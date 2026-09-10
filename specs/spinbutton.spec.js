// @ts-check
/**
 * APG Spinbutton Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/
 *
 * Derived from apg-usecases `patterns/spinbutton/*.uc.yaml`:
 *   spinbutton-accessibility-features, spinbutton-keyboard-adjustment,
 *   spinbutton-direct-editing, spinbutton-handling-invalid-input
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  pressTab,
  byId,
  markOptional,
} = require('./support/apg');

const NAME = 'Quantity';
const START = 10;
const MIN = 0;
const MAX = 100;
const PAGE_STEP = 10;

/**
 * aria-valuenow, aria-valuetext and the visible input value are three views of
 * one number. Reading all three at once and asserting them as a single object
 * is what makes a spinbutton that announces one value while showing another
 * fail, rather than passing on whichever view was checked first.
 */
function valueOf(spinbutton) {
  return spinbutton.evaluate((el) => ({
    now: el.getAttribute('aria-valuenow'),
    text: el.getAttribute('aria-valuetext'),
    shown: el.value,
  }));
}

const value = (n) => ({ now: String(n), text: String(n), shown: String(n) });

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'spinbutton');
});

test.describe('Spinbutton — roles, states, and properties', () => {
  test('exposes a named range that updates as the value changes', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });

    await expect(spinbutton).toHaveAttribute('aria-valuemin', String(MIN));
    await expect(spinbutton).toHaveAttribute('aria-valuemax', String(MAX));
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START));

    await tabUntilFocused(page, spinbutton);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START + 1));
  });

  test('only the spinbutton itself is in the tab sequence', async ({ page }) => {
    // The APG puts the increment/decrement buttons out of the tab ring: they
    // duplicate ArrowUp/ArrowDown, so tabbing through them would just make the
    // keyboard path longer for no added capability.
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    const increase = page.getByRole('button', { name: 'Increase' });
    const decrease = page.getByRole('button', { name: 'Decrease' });

    const presses = await tabUntilFocused(page, spinbutton);
    expect(presses, 'the spinbutton must be reachable by Tab').toBeGreaterThan(0);

    await expect(increase).toHaveAttribute('tabindex', '-1');
    await expect(decrease).toHaveAttribute('tabindex', '-1');

    await pressTab(page);
    expect(await isFocused(increase), 'Tab must not land on the Increase button').toBe(false);
    expect(await isFocused(decrease), 'Tab must not land on the Decrease button').toBe(false);
  });
});

test.describe('Spinbutton — keyboard adjustment', () => {
  test('Up Arrow increments and Down Arrow decrements by one step', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('ArrowUp');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START + 1));

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START));

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START - 1));
  });

  test('Page Up and Page Down move by a larger step', async ({ page }) => {
    markOptional(
      'Spinbutton § Keyboard Interaction — Page Up and Page Down are marked "(Optional)"'
    );

    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('PageUp');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START + PAGE_STEP));

    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START));

    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START - PAGE_STEP));
  });

  test('Home jumps to the minimum and End jumps to the maximum', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('Home');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(MIN));

    await page.keyboard.press('End');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(MAX));
  });

  test('the value clamps at the bounds instead of running past them', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(MAX));
    await page.keyboard.press('PageUp');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(MAX));

    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(MIN));
    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(MIN));
  });

  test('focus stays on the spinbutton while the value is being adjusted', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('PageUp');
    await page.keyboard.press('End');

    expect(await isFocused(spinbutton), 'adjusting the value must not move focus').toBe(true);
  });
});

test.describe('Spinbutton — pointer adjustment', () => {
  test('the Increase and Decrease buttons change the value', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });

    await page.getByRole('button', { name: 'Increase' }).click();
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START + 1));

    await page.getByRole('button', { name: 'Decrease' }).click();
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START));

    await page.getByRole('button', { name: 'Decrease' }).click();
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START - 1));
  });
});

test.describe('Spinbutton — direct editing', () => {
  test('typing a valid number replaces the value', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('42');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(42));
    await expect(spinbutton).toHaveAttribute('aria-invalid', 'false');
  });

  test('typing non-numeric characters is rejected and leaves the value alone', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('abc');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(START));
  });

  test('typing a value above the maximum is marked aria-invalid', async ({ page }) => {
    // The APG allows either rejecting out-of-range input or flagging it. This
    // implementation does both: the keystroke is refused *and* aria-invalid is
    // raised, so the exposed value never leaves the declared range.
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('150');

    await expect(spinbutton).toHaveAttribute('aria-invalid', 'true');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(15));
  });

  test('correcting an out-of-range entry clears aria-invalid', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('150');
    await expect(spinbutton).toHaveAttribute('aria-invalid', 'true');

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('7');
    await expect(spinbutton).toHaveAttribute('aria-invalid', 'false');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(7));
  });
});

test.describe('Spinbutton — invalid-input messaging', () => {
  // apg-react#148 flipped aria-invalid but never named the problem, which tells
  // a screen reader user "this is wrong" without telling them what is wrong or
  // what the allowed range is. Fixed in v2.2.0.
  test('an out-of-range entry is explained by an accessible description', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('150');
    await expect(spinbutton).toHaveAttribute('aria-invalid', 'true');

    // The error text has to be programmatically associated with the field,
    // and it has to be perceivable — not just present in the DOM.
    await expect(spinbutton, 'an invalid spinbutton must point at an explanation').toHaveAttribute(
      'aria-describedby',
      /.+/
    );

    const describedby = await spinbutton.getAttribute('aria-describedby');
    await expect(byId(page, describedby)).toBeVisible();
  });
});

test.describe('Spinbutton — clamping must not be reported as invalid', () => {
  // Reaching the end of a range is normal operation, not a data-entry error —
  // the APG says the key simply has no further effect. apg-react#158 left the
  // value correctly at the maximum but also set aria-invalid="true", so a
  // screen reader announced "invalid entry" for a value the widget itself had
  // just chosen and considered in range. Fixed in v2.2.0.
  test('stepping past the maximum leaves the spinbutton valid', async ({ page }) => {
    const spinbutton = page.getByRole('spinbutton', { name: NAME });
    await tabUntilFocused(page, spinbutton);

    await page.keyboard.press('End');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(MAX));
    await expect(spinbutton).toHaveAttribute('aria-invalid', 'false');

    await page.keyboard.press('ArrowUp');
    await expect.poll(() => valueOf(spinbutton)).toEqual(value(MAX));
    await expect(spinbutton, 'clamping at the maximum is not an invalid entry').toHaveAttribute(
      'aria-invalid',
      'false'
    );
  });
});
