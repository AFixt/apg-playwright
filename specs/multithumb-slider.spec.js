// @ts-check
/**
 * APG Slider (Multi-Thumb) Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/
 *
 * Derived from apg-usecases `patterns/multithumb-slider/*.uc.yaml`:
 *   multithumb-slider-accessibility-features, multithumb-slider-keyboard-adjustment,
 *   multithumb-slider-maintaining-tab-order, multithumb-slider-user-friendly-value
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused, pressTab } = require('./support/apg');

// A price range: two thumbs on one track, each its own role="slider".
const MIN_THUMB = 'Minimum price';
const MAX_THUMB = 'Maximum price';

const MIN_START = 20;
const MAX_START = 80;
const TRACK_MIN = 0;
const TRACK_MAX = 100;
const PAGE_STEP = 10;

/**
 * Read a thumb's (aria-valuenow, aria-valuetext) pair as one value, so a
 * half-updated thumb fails instead of passing on whichever attribute was
 * checked first.
 */
function valueOf(slider) {
  return slider.evaluate((el) => ({
    now: el.getAttribute('aria-valuenow'),
    text: el.getAttribute('aria-valuetext'),
  }));
}

/** Read the range a thumb reports it may move within. */
function boundsOf(slider) {
  return slider.evaluate((el) => ({
    min: el.getAttribute('aria-valuemin'),
    max: el.getAttribute('aria-valuemax'),
  }));
}

const value = (n) => ({ now: String(n), text: String(n) });
const bounds = (min, max) => ({ min: String(min), max: String(max) });

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'multithumb-slider');
});

test.describe('Multi-thumb slider — roles, states, and properties', () => {
  test('each thumb is its own slider with a distinct accessible name', async ({ page }) => {
    const low = page.getByRole('slider', { name: MIN_THUMB });
    const high = page.getByRole('slider', { name: MAX_THUMB });

    await expect.poll(() => valueOf(low)).toEqual(value(MIN_START));
    await expect.poll(() => valueOf(high)).toEqual(value(MAX_START));

    // Each thumb must be independently operable, so prove they move separately.
    await tabUntilFocused(page, low);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => valueOf(low)).toEqual(value(MIN_START + 1));
    await expect.poll(() => valueOf(high)).toEqual(value(MAX_START));
  });

  test('the thumbs start bounded by each other, not by the whole track', async ({ page }) => {
    const low = page.getByRole('slider', { name: MIN_THUMB });
    const high = page.getByRole('slider', { name: MAX_THUMB });

    // The low thumb may not go above the high thumb's current value, and the
    // high thumb may not go below the low thumb's. That is what stops them
    // crossing, and it is the entire point of the multi-thumb pattern.
    await expect.poll(() => boundsOf(low)).toEqual(bounds(TRACK_MIN, MAX_START));
    await expect.poll(() => boundsOf(high)).toEqual(bounds(MIN_START, TRACK_MAX));

    await tabUntilFocused(page, low);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => boundsOf(high)).toEqual(bounds(MIN_START + 1, TRACK_MAX));
  });
});

test.describe('Multi-thumb slider — thumbs constrain each other', () => {
  // The APG: "When the range of another slider is dependent on the current
  // value of a slider, the values of aria-valuemin or aria-valuemax of the
  // dependent sliders are updated when the value changes."

  test('raising the minimum thumb raises the maximum thumb aria-valuemin', async ({ page }) => {
    const low = page.getByRole('slider', { name: MIN_THUMB });
    const high = page.getByRole('slider', { name: MAX_THUMB });

    await tabUntilFocused(page, low);
    await page.keyboard.press('PageUp');
    await expect.poll(() => valueOf(low)).toEqual(value(MIN_START + PAGE_STEP));

    // The dependent bound must follow in the same interaction, not on reload.
    await expect(high).toHaveAttribute('aria-valuemin', String(MIN_START + PAGE_STEP));
    await expect(high).toHaveAttribute('aria-valuemax', String(TRACK_MAX));
  });

  test('lowering the maximum thumb lowers the minimum thumb aria-valuemax', async ({ page }) => {
    const low = page.getByRole('slider', { name: MIN_THUMB });
    const high = page.getByRole('slider', { name: MAX_THUMB });

    await tabUntilFocused(page, high);
    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(high)).toEqual(value(MAX_START - PAGE_STEP));

    await expect(low).toHaveAttribute('aria-valuemax', String(MAX_START - PAGE_STEP));
    await expect(low).toHaveAttribute('aria-valuemin', String(TRACK_MIN));
  });

  test('the minimum thumb cannot be driven past the maximum thumb', async ({ page }) => {
    const low = page.getByRole('slider', { name: MIN_THUMB });
    const high = page.getByRole('slider', { name: MAX_THUMB });

    await tabUntilFocused(page, low);
    // End on the low thumb means "as far right as I am allowed", which is the
    // high thumb's value — not the end of the track.
    await page.keyboard.press('End');
    await expect.poll(() => valueOf(low)).toEqual(value(MAX_START));
    await expect.poll(() => valueOf(high)).toEqual(value(MAX_START));

    // Pushing further must not cross over.
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => valueOf(low)).toEqual(value(MAX_START));
    await page.keyboard.press('PageUp');
    await expect.poll(() => valueOf(low)).toEqual(value(MAX_START));
    await expect.poll(() => valueOf(high)).toEqual(value(MAX_START));
  });

  test('the maximum thumb cannot be driven past the minimum thumb', async ({ page }) => {
    const low = page.getByRole('slider', { name: MIN_THUMB });
    const high = page.getByRole('slider', { name: MAX_THUMB });

    await tabUntilFocused(page, high);
    await page.keyboard.press('Home');
    await expect.poll(() => valueOf(high)).toEqual(value(MIN_START));
    await expect.poll(() => valueOf(low)).toEqual(value(MIN_START));

    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => valueOf(high)).toEqual(value(MIN_START));
    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(high)).toEqual(value(MIN_START));
    await expect.poll(() => valueOf(low)).toEqual(value(MIN_START));
  });

  test('the minimum thumb never reports a value above its own aria-valuemax', async ({ page }) => {
    const low = page.getByRole('slider', { name: MIN_THUMB });

    await tabUntilFocused(page, low);
    await page.keyboard.press('End');
    await page.keyboard.press('PageUp');

    const [now, max] = await low.evaluate((el) => [
      Number(el.getAttribute('aria-valuenow')),
      Number(el.getAttribute('aria-valuemax')),
    ]);
    expect(now, 'aria-valuenow must stay within aria-valuemax').toBeLessThanOrEqual(max);
  });
});

test.describe('Multi-thumb slider — keyboard adjustment', () => {
  test('Right and Up Arrow increase, Left and Down Arrow decrease', async ({ page }) => {
    const low = page.getByRole('slider', { name: MIN_THUMB });
    await tabUntilFocused(page, low);

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => valueOf(low)).toEqual(value(MIN_START + 1));
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => valueOf(low)).toEqual(value(MIN_START + 2));

    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => valueOf(low)).toEqual(value(MIN_START + 1));
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => valueOf(low)).toEqual(value(MIN_START));
  });

  test('Home and End jump each thumb to its own permitted bounds', async ({ page }) => {
    const high = page.getByRole('slider', { name: MAX_THUMB });
    await tabUntilFocused(page, high);

    await page.keyboard.press('End');
    await expect.poll(() => valueOf(high)).toEqual(value(TRACK_MAX));

    await page.keyboard.press('Home');
    // Home on the high thumb stops at the low thumb, which is still at 20.
    await expect.poll(() => valueOf(high)).toEqual(value(MIN_START));
  });

  test('Page Up and Page Down move by a larger step than the arrow keys', async ({ page }) => {
    const high = page.getByRole('slider', { name: MAX_THUMB });
    await tabUntilFocused(page, high);

    await page.keyboard.press('PageUp');
    await expect.poll(() => valueOf(high)).toEqual(value(MAX_START + PAGE_STEP));

    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(high)).toEqual(value(MAX_START));
  });
});

test.describe('Multi-thumb slider — tab order', () => {
  test('both thumbs are in the page tab sequence in DOM order', async ({ page }) => {
    const low = page.getByRole('slider', { name: MIN_THUMB });
    const high = page.getByRole('slider', { name: MAX_THUMB });

    const presses = await tabUntilFocused(page, low);
    expect(presses, 'the minimum thumb must be reachable by Tab').toBeGreaterThan(0);

    await pressTab(page);
    expect(await isFocused(high), 'Tab should reach the maximum thumb next').toBe(true);
  });

  test('tab order stays fixed after the thumbs are moved on top of each other', async ({
    page,
  }) => {
    // The APG is explicit that tab order follows the DOM, not the visual
    // position: dragging the minimum thumb up to the maximum must not swap
    // which thumb Tab reaches first.
    const low = page.getByRole('slider', { name: MIN_THUMB });
    const high = page.getByRole('slider', { name: MAX_THUMB });

    await tabUntilFocused(page, low);
    await page.keyboard.press('End');
    await expect.poll(() => valueOf(low)).toEqual(value(MAX_START));

    const presses = await tabUntilFocused(page, low);
    expect(
      presses,
      'the minimum thumb must still be the first thumb in the tab ring'
    ).toBeGreaterThan(0);

    await pressTab(page);
    expect(await isFocused(high), 'Tab order must not follow the thumbs visual order').toBe(true);
  });
});
