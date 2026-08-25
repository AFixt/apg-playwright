// @ts-check
/**
 * APG Switch Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/switch/
 *
 * Derived from apg-usecases `patterns/switch/*.uc.yaml`:
 *   switch-accessibility-features, switch-keyboard-toggle
 *
 * The demo renders a single "Notifications" switch, off by default. It is not
 * a native control: `role="switch"` sits on a `<span tabindex="0">` labelled
 * by a sibling `<span>` via aria-labelledby, with the visible on/off rendering
 * driven by a `switch-on` / `switch-off` class on an inner element. Because
 * nothing here is native, every keyboard behaviour a checkbox would get for
 * free has to be re-implemented — which is exactly why these tests drive the
 * real keyboard rather than calling the handler.
 *
 * Not covered, and why:
 *   - switch-grouping: the demo renders one switch, so there is no group to
 *     wrap in role="group" or a fieldset. Nothing to assert that could fail.
 *   - switch-descriptive-information: the demo passes no `ariaDescribedby`, so
 *     there is no description element to resolve.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  expectTabExits,
  markOptional,
} = require('./support/apg');

const LABEL = 'Notifications';

/** The visible knob, whose class is the only perceivable trace of the state. */
const knob = (page) => page.locator('.switch-control .switch');

/** Background colour of the knob — what a sighted user actually perceives. */
function knobColour(page) {
  return knob(page).evaluate((el) => getComputedStyle(el).backgroundColor);
}

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'switch');
});

test.describe('Switch — roles, states, and properties', () => {
  test('the switch is reachable by Tab and names itself from its visible label', async ({
    page,
  }) => {
    const control = page.getByRole('switch', { name: LABEL });

    // A span with role=switch has no implicit tab stop; tabindex="0" is doing
    // all the work, so reaching it by Tab is a real assertion, not a formality.
    const presses = await tabUntilFocused(page, control);
    expect(presses, 'the switch must be reachable by Tab').toBeGreaterThan(0);

    await expect(control).toHaveAccessibleName(LABEL);

    // aria-labelledby must resolve to the visible text, not to a dangling id —
    // the component generates the id with useId, so it is worth following.
    const labelText = await control.evaluate((el) => {
      const target = document.getElementById(el.getAttribute('aria-labelledby') || '');
      return target ? target.textContent : null;
    });
    expect(labelText, 'aria-labelledby must resolve to the visible label').toBe(LABEL);
  });

  test('aria-checked and the visible rendering start off and move together', async ({ page }) => {
    const control = page.getByRole('switch', { name: LABEL });

    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(knob(page)).toHaveClass(/switch-off/);
    const offColour = await knobColour(page);

    await tabUntilFocused(page, control);
    await page.keyboard.press('Space');

    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(knob(page)).toHaveClass(/switch-on/);
    // aria-checked flipping while the pixels stay put would leave sighted
    // users and screen reader users disagreeing about the state. Polled rather
    // than read once: the knob animates its colour, so a single read taken the
    // instant the class changes still returns the old value.
    await expect
      .poll(() => knobColour(page), { message: 'the switch must look different when on' })
      .not.toBe(offColour);
  });
});

test.describe('Switch — keyboard operation', () => {
  test('Space toggles the switch on and back off', async ({ page }) => {
    const control = page.getByRole('switch', { name: LABEL });

    await tabUntilFocused(page, control);

    await page.keyboard.press('Space');
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(knob(page)).toHaveClass(/switch-on/);

    await page.keyboard.press('Space');
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(knob(page)).toHaveClass(/switch-off/);
  });

  test('Enter also toggles the switch', async ({ page }) => {
    markOptional('Switch § Keyboard Interaction — Enter is marked "(Optional)"');

    // APG lists Enter as "(Optional)" for Switch. This implementation handles
    // it, so the behaviour is asserted rather than left to drift silently.
    const control = page.getByRole('switch', { name: LABEL });

    await tabUntilFocused(page, control);

    await page.keyboard.press('Enter');
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(knob(page)).toHaveClass(/switch-on/);

    await page.keyboard.press('Enter');
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(knob(page)).toHaveClass(/switch-off/);
  });

  test('toggling the switch keeps focus on the switch', async ({ page }) => {
    const control = page.getByRole('switch', { name: LABEL });

    await tabUntilFocused(page, control);
    await page.keyboard.press('Space');

    await expect(control).toHaveAttribute('aria-checked', 'true');
    expect(await isFocused(control), 'focus must stay on the switch after toggling').toBe(true);

    // And a second press must still land on the same control.
    await page.keyboard.press('Space');
    await expect(control).toHaveAttribute('aria-checked', 'false');
  });

  test('the switch is the only tab stop it introduces', async ({ page }) => {
    // The inner knob and the label span must not be separately focusable —
    // extra tab stops on decorative parts are a common failure in
    // span-based widgets.
    const control = page.getByRole('switch', { name: LABEL });
    await tabUntilFocused(page, control);

    await expectTabExits(
      page,
      page.locator('.switch-container'),
      'nothing inside the switch widget may be a second tab stop'
    );
  });
});

test.describe('Switch — pointer operation', () => {
  test('clicking the switch toggles it', async ({ page }) => {
    const control = page.getByRole('switch', { name: LABEL });

    await control.click();
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(knob(page)).toHaveClass(/switch-on/);

    await control.click();
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(knob(page)).toHaveClass(/switch-off/);
  });

  test('clicking the visible label toggles the switch it labels', async ({ page }) => {
    // A `<span>` label gets no click-forwarding from the platform the way a
    // `<label for>` would, so this is behaviour the component must supply.
    const control = page.getByRole('switch', { name: LABEL });
    const label = page.locator('.switch-label-text');

    await expect(label).toHaveText(LABEL);
    await label.click();

    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(knob(page)).toHaveClass(/switch-on/);
  });
});
