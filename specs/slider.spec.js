// @ts-check
/**
 * APG Slider Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/slider/
 *
 * Derived from apg-usecases `patterns/slider/*.uc.yaml`:
 *   slider-accessibility-features, slider-keyboard-adjustment,
 *   slider-user-friendly-value
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused } = require('./support/apg');

// The demo publishes two independent sliders. They are deliberately different
// shapes: "Volume" is a plain numeric range, "Temperature" is a four-position
// range whose value only makes sense as a *word*. The APG calls the second case
// out explicitly — aria-valuetext exists precisely so that a screen reader says
// "Warm" instead of "2".
const VOLUME = 'Volume';
const TEMPERATURE = 'Temperature';

// Volume: 0-100, starting at 50. Arrow keys step by 1, Page keys by 10.
const VOLUME_START = 50;
const VOLUME_MIN = 0;
const VOLUME_MAX = 100;
const VOLUME_PAGE_STEP = 10;

// Temperature: 0-3, starting at 2 ("Warm"). aria-valuetext walks this word list.
const TEMPERATURE_WORDS = ['Cold', 'Cool', 'Warm', 'Hot'];
const TEMPERATURE_START = 2;

/**
 * Read a slider's (aria-valuenow, aria-valuetext) pair as one value.
 *
 * The two have to move together: a valuenow that advances while valuetext is
 * stale means assistive technology announces the old value, which is worse than
 * exposing no valuetext at all. Reading them as a single object and asserting
 * it in one go is what makes a half-updated slider fail rather than slip
 * through on whichever attribute happened to be checked first.
 */
function valueOf(slider) {
  return slider.evaluate((el) => ({
    now: el.getAttribute('aria-valuenow'),
    text: el.getAttribute('aria-valuetext'),
  }));
}

/** The expected pair for a slider whose valuetext is just the number. */
const numeric = (n) => ({ now: String(n), text: String(n) });

/** The expected pair for a slider whose valuetext is a word. */
const worded = (n, word) => ({ now: String(n), text: word });

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'slider');
});

test.describe('Slider — roles, states, and properties', () => {
  test('Volume exposes a numeric range that updates as the value changes', async ({ page }) => {
    const slider = page.getByRole('slider', { name: VOLUME });

    await expect(slider).toHaveAttribute('aria-valuemin', String(VOLUME_MIN));
    await expect(slider).toHaveAttribute('aria-valuemax', String(VOLUME_MAX));
    await expect(slider).toHaveAttribute('aria-orientation', 'horizontal');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_START));

    // The bounds are a contract about a live value, so prove the value is live.
    await tabUntilFocused(page, slider);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_START + 1));
  });

  test('Temperature exposes a word-valued range that updates as the value changes', async ({
    page,
  }) => {
    const slider = page.getByRole('slider', { name: TEMPERATURE });

    await expect(slider).toHaveAttribute('aria-valuemin', '0');
    await expect(slider).toHaveAttribute('aria-valuemax', String(TEMPERATURE_WORDS.length - 1));
    await expect
      .poll(() => valueOf(slider))
      .toEqual(worded(TEMPERATURE_START, TEMPERATURE_WORDS[TEMPERATURE_START]));

    await tabUntilFocused(page, slider);
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => valueOf(slider))
      .toEqual(worded(TEMPERATURE_START + 1, TEMPERATURE_WORDS[TEMPERATURE_START + 1]));
  });

  test('both sliders are reachable by Tab in DOM order', async ({ page }) => {
    const volume = page.getByRole('slider', { name: VOLUME });
    const temperature = page.getByRole('slider', { name: TEMPERATURE });

    const presses = await tabUntilFocused(page, volume);
    expect(presses, 'Volume must be reachable by Tab').toBeGreaterThan(0);

    await page.keyboard.press('Tab');
    expect(await isFocused(temperature), 'Tab should reach Temperature next').toBe(true);
  });
});

test.describe('Slider — keyboard adjustment', () => {
  test('Right and Up Arrow increase the value by one step', async ({ page }) => {
    const slider = page.getByRole('slider', { name: VOLUME });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_START + 1));

    // The slider is horizontal, but the APG requires Up Arrow to increase too.
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_START + 2));
  });

  test('Left and Down Arrow decrease the value by one step', async ({ page }) => {
    const slider = page.getByRole('slider', { name: VOLUME });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_START - 1));

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_START - 2));
  });

  test('Home jumps to the minimum and End jumps to the maximum', async ({ page }) => {
    const slider = page.getByRole('slider', { name: VOLUME });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('Home');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_MIN));

    await page.keyboard.press('End');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_MAX));
  });

  test('Page Up and Page Down move by a larger step than the arrow keys', async ({ page }) => {
    const slider = page.getByRole('slider', { name: VOLUME });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('PageUp');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_START + VOLUME_PAGE_STEP));

    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_START));

    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_START - VOLUME_PAGE_STEP));
  });

  test('the value clamps at the maximum instead of running past it', async ({ page }) => {
    const slider = page.getByRole('slider', { name: VOLUME });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('End');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_MAX));

    // A slider that reports aria-valuenow above aria-valuemax is lying to
    // assistive technology about its own range.
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_MAX));

    await page.keyboard.press('PageUp');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_MAX));
  });

  test('the value clamps at the minimum instead of running past it', async ({ page }) => {
    const slider = page.getByRole('slider', { name: VOLUME });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('Home');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_MIN));

    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_MIN));

    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(slider)).toEqual(numeric(VOLUME_MIN));
  });
});

test.describe('Slider — user-friendly value (aria-valuetext)', () => {
  // This is the interesting half of the pattern. Temperature's raw value is
  // 0-3, which tells a screen reader user nothing. The APG requires
  // aria-valuetext whenever aria-valuenow is not user-friendly — and requires
  // it to *keep tracking* the value, not just be right at page load.

  test('aria-valuetext walks the word list as Arrow keys step the value', async ({ page }) => {
    const slider = page.getByRole('slider', { name: TEMPERATURE });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('Home');
    await expect.poll(() => valueOf(slider)).toEqual(worded(0, TEMPERATURE_WORDS[0]));

    // Step up through every position and demand the word change each time.
    for (let value = 1; value < TEMPERATURE_WORDS.length; value += 1) {
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => valueOf(slider)).toEqual(worded(value, TEMPERATURE_WORDS[value]));
    }

    // ...and back down again.
    for (let value = TEMPERATURE_WORDS.length - 2; value >= 0; value -= 1) {
      await page.keyboard.press('ArrowLeft');
      await expect.poll(() => valueOf(slider)).toEqual(worded(value, TEMPERATURE_WORDS[value]));
    }
  });

  test('aria-valuetext is never the bare number for the word-valued slider', async ({ page }) => {
    // A numeric-only readout here is the accessibility failure this test exists
    // to catch: "2" is not a temperature, "Warm" is.
    const slider = page.getByRole('slider', { name: TEMPERATURE });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('End');
    const valuetext = await slider.getAttribute('aria-valuetext');
    expect(valuetext, 'Temperature must not announce a bare number').not.toMatch(/^\d+$/);
    expect(TEMPERATURE_WORDS).toContain(valuetext);
  });

  test('Home and End carry aria-valuetext to the bound words', async ({ page }) => {
    const slider = page.getByRole('slider', { name: TEMPERATURE });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('End');
    await expect
      .poll(() => valueOf(slider))
      .toEqual(worded(TEMPERATURE_WORDS.length - 1, TEMPERATURE_WORDS.at(-1)));

    await page.keyboard.press('Home');
    await expect.poll(() => valueOf(slider)).toEqual(worded(0, TEMPERATURE_WORDS[0]));
  });

  test('Page Up and Page Down clamp to the bounds on a short range', async ({ page }) => {
    // The page step (10) is larger than the whole 0-3 range, so both keys must
    // land exactly on a bound rather than overshooting it.
    const slider = page.getByRole('slider', { name: TEMPERATURE });
    await tabUntilFocused(page, slider);

    await page.keyboard.press('PageUp');
    await expect
      .poll(() => valueOf(slider))
      .toEqual(worded(TEMPERATURE_WORDS.length - 1, TEMPERATURE_WORDS.at(-1)));

    await page.keyboard.press('PageDown');
    await expect.poll(() => valueOf(slider)).toEqual(worded(0, TEMPERATURE_WORDS[0]));
  });

  test('adjusting one slider leaves the other untouched', async ({ page }) => {
    const volume = page.getByRole('slider', { name: VOLUME });
    const temperature = page.getByRole('slider', { name: TEMPERATURE });

    await tabUntilFocused(page, temperature);
    await page.keyboard.press('Home');

    await expect.poll(() => valueOf(temperature)).toEqual(worded(0, TEMPERATURE_WORDS[0]));
    await expect.poll(() => valueOf(volume)).toEqual(numeric(VOLUME_START));
  });
});
