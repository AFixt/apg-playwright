// @ts-check
/**
 * APG Meter Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/meter/
 *
 * Derived from apg-usecases `patterns/meter/*.uc.yaml`:
 *   meter-accessible-label, meter-current-value, meter-min-max-values,
 *   meter-user-friendly-value
 *
 * The demo renders a "Disk usage" meter: `role="meter"` on a `<div>` with
 * aria-valuenow/min/max and aria-valuetext, labelled by a sibling `<div>`
 * through aria-labelledby, and filled visually by an inner element whose
 * inline width carries the same value in percent.
 *
 * Meter is a read-only pattern with no interaction at all — the APG gives it
 * no keyboard interaction section, because a meter a user can operate is a
 * slider. So the assertions here are about the accessibility tree and about
 * the one thing that can silently drift in a hand-rolled meter: the exposed
 * value disagreeing with the rendered bar. The keyboard test asserts the
 * inverse of the usual contract — that the meter is *not* a tab stop.
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused } = require('./support/apg');

const LABEL = 'Disk usage';

const meter = (page) => page.getByRole('meter', { name: LABEL });

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'meter');
});

test.describe('Meter — naming', () => {
  test('the meter is named by the visible label it points at', async ({ page }) => {
    const control = meter(page);

    await expect(control).toHaveAccessibleName(LABEL);

    // aria-labelledby has to resolve to a real, visible element. A dangling id
    // leaves the meter announcing a bare number with no idea what it measures.
    await expect(control, 'the meter must reference a label element').toHaveAttribute(
      'aria-labelledby',
      /\S/
    );
    const labelId = await control.getAttribute('aria-labelledby');
    const label = page.locator(`[id="${labelId}"]`);
    await expect(label).toBeVisible();
    await expect(label).toHaveText(LABEL);
  });
});

test.describe('Meter — value and range', () => {
  test('the meter declares its range via aria-valuemin and aria-valuemax', async ({ page }) => {
    const control = meter(page);

    await expect(control).toHaveAttribute('aria-valuemin', '0');
    await expect(control).toHaveAttribute('aria-valuemax', '100');
  });

  test('aria-valuenow sits inside the declared range', async ({ page }) => {
    const control = meter(page);

    await expect(control).toHaveAttribute('aria-valuenow', '75');

    // The literal above pins this fixture; the numeric comparison below is the
    // assertion that would survive the demo's value changing.
    const { now, min, max } = await control.evaluate((el) => ({
      now: Number(el.getAttribute('aria-valuenow')),
      min: Number(el.getAttribute('aria-valuemin')),
      max: Number(el.getAttribute('aria-valuemax')),
    }));
    expect(Number.isFinite(now), 'aria-valuenow must be numeric').toBe(true);
    expect(min).toBeLessThan(max);
    expect(now).toBeGreaterThanOrEqual(min);
    expect(now).toBeLessThanOrEqual(max);
  });

  test('aria-valuetext gives a human-readable reading of the value', async ({ page }) => {
    // aria-valuetext is optional, but when present it *replaces* the number in
    // announcements, so an empty or placeholder one is worse than none.
    const control = meter(page);

    await expect(control).toHaveAttribute('aria-valuetext', 'High');

    const valuetext = await control.getAttribute('aria-valuetext');
    expect((valuetext || '').trim().length, 'aria-valuetext must not be empty').toBeGreaterThan(0);
  });

  test('the rendered bar matches the value the meter exposes', async ({ page }) => {
    // The failure this catches is a meter that announces 75 while drawing 20 —
    // sighted and screen reader users being told different things. Nothing in
    // the ARIA attributes alone can detect it.
    const measurements = await meter(page).evaluate((el) => {
      const fill = el.querySelector('.meter-fill');
      return {
        fillWidth: fill ? fill.getBoundingClientRect().width : null,
        trackWidth: el.getBoundingClientRect().width,
        now: Number(el.getAttribute('aria-valuenow')),
        min: Number(el.getAttribute('aria-valuemin')),
        max: Number(el.getAttribute('aria-valuemax')),
      };
    });

    expect(measurements.fillWidth, 'the meter must render a fill element').not.toBeNull();
    expect(measurements.trackWidth).toBeGreaterThan(0);

    const drawnFraction = Number(measurements.fillWidth) / measurements.trackWidth;
    const exposedFraction =
      (measurements.now - measurements.min) / (measurements.max - measurements.min);
    expect(
      Math.abs(drawnFraction - exposedFraction),
      `bar drew ${drawnFraction} but the meter announces ${exposedFraction}`
    ).toBeLessThan(0.02);
  });
});

test.describe('Meter — keyboard behaviour', () => {
  test('the meter is not a tab stop', async ({ page }) => {
    // A meter is read-only: the APG gives the pattern no keyboard interaction
    // at all. Putting it in the tab sequence would strand a keyboard user on a
    // control with nothing to operate.
    const presses = await tabUntilFocused(page, meter(page), 10);
    expect(presses, 'a read-only meter must not take focus').toBe(-1);

    const focusableInsideMeter = await meter(page).evaluate(
      (el) => el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').length
    );
    expect(focusableInsideMeter, 'the meter must contain no focusable descendants').toBe(0);
  });
});
