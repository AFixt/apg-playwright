// @ts-check
/**
 * APG Button Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/button/
 *
 * Derived from apg-usecases `patterns/button/*.uc.yaml`:
 *   button-activating, button-accessibility, button-focus-after-activation,
 *   button-toggle
 *
 * The demo renders three buttons: "Print" (a plain action button that reveals
 * a "Print dialog opened" status and a Close button), "Mute" (the toggle
 * variant, mirrored in a visible "Muted"/"Unmuted" status line), and "Submit"
 * (permanently unavailable).
 *
 * Not covered, and why:
 *   - button-shortcut-key: the Button component supports a `shortcutKey` prop
 *     but this demo passes none, so there is no shortcut to press. A test
 *     here could only assert that nothing happens, which cannot fail.
 *   - button-menu-button: belongs to the Menu Button pattern; this page has no
 *     button that opens a menu.
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused, pressTab } = require('./support/apg');

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'button');
});

test.describe('Button — activation', () => {
  test('Enter activates the button and its effect is perceivable', async ({ page }) => {
    const print = page.getByRole('button', { name: 'Print' });
    const status = page.getByText('Print dialog opened');

    await expect(status).toHaveCount(0);

    await tabUntilFocused(page, print);
    await page.keyboard.press('Enter');

    await expect(status).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('Space activates the button', async ({ page }) => {
    const print = page.getByRole('button', { name: 'Print' });

    await tabUntilFocused(page, print);
    await page.keyboard.press('Space');

    await expect(page.getByText('Print dialog opened')).toBeVisible();
  });

  test('Space on the Close button reverses the action', async ({ page }) => {
    // Space and Enter must both work on every button, not only on the first
    // one a test happens to try — Close is a second, independently rendered
    // button, so exercising it catches per-instance handler wiring bugs.
    const print = page.getByRole('button', { name: 'Print' });
    await tabUntilFocused(page, print);
    await page.keyboard.press('Enter');

    const close = page.getByRole('button', { name: 'Close' });
    await expect(close).toBeVisible();

    await tabUntilFocused(page, close);
    await page.keyboard.press('Space');

    await expect(page.getByText('Print dialog opened')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0);
  });

  test('focus stays on the button when the action does not change context', async ({ page }) => {
    // APG: "Non-dismissive actions keep focus on the button." Print reveals a
    // status message in place; it opens no new context, so moving focus would
    // be a bug.
    const print = page.getByRole('button', { name: 'Print' });

    await tabUntilFocused(page, print);
    await page.keyboard.press('Enter');

    await expect(page.getByText('Print dialog opened')).toBeVisible();
    expect(await isFocused(print), 'focus must remain on Print').toBe(true);
  });
});

test.describe('Button — accessible names', () => {
  test('every button rendered on the page carries a non-empty accessible name', async ({
    page,
  }) => {
    // Reveal the Close button first so the sweep covers a dynamically
    // rendered control as well as the three present at load.
    await page.getByRole('button', { name: 'Print' }).click();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();

    const names = await page
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => (el.textContent || '').trim()));

    expect(names, 'the demo should expose four buttons once Print is activated').toHaveLength(4);
    for (const name of names) {
      const detail = `a button rendered with no accessible name: ${JSON.stringify(names)}`;
      expect(name.length, detail).toBeGreaterThan(0);
    }
  });
});

test.describe('Button — toggle button', () => {
  // Located by substring rather than exact name on purpose: the component
  // prefixes a CSS-generated "✓" once pressed, and these tests still have to
  // be able to find the control in that state to assert against it. The name
  // change itself is the subject of the failing test at the end of this block.
  const muteButton = (page) => page.getByRole('button', { name: 'Mute' });

  test('the toggle button starts unpressed with a matching visible status', async ({ page }) => {
    const mute = muteButton(page);

    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Unmuted')).toBeVisible();

    // Prove the status line really tracks the control rather than being static.
    await tabUntilFocused(page, mute);
    await page.keyboard.press('Enter');

    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Muted')).toBeVisible();
    await expect(page.getByText('Unmuted')).toHaveCount(0);
  });

  test('Enter and Space each flip aria-pressed and the visible state', async ({ page }) => {
    const mute = muteButton(page);

    await tabUntilFocused(page, mute);
    await page.keyboard.press('Enter');
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Muted')).toBeVisible();

    await page.keyboard.press('Space');
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Unmuted')).toBeVisible();

    // A single keypress must produce a single toggle. A handler that both
    // calls preventDefault-less and lets the native click through would flip
    // twice and land back where it started, which this third press catches.
    await page.keyboard.press('Enter');
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Muted')).toBeVisible();
  });

  test('pointer activation toggles the same state as the keyboard', async ({ page }) => {
    const mute = muteButton(page);

    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Muted')).toBeVisible();

    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Unmuted')).toBeVisible();
  });

  // KNOWN GAP — apg-react#151. Button.css sets
  //   .button-toggle.is-pressed::before, .button[aria-pressed='true']::before
  //     { content: '\2713\00a0'; }
  // CSS generated content participates in accessible name computation, so the
  // button's name changes from "Mute" to "✓ Mute" the moment it is pressed.
  // The APG is unambiguous: "it is critical the label on a toggle does not
  // change when its state changes" — the pressed state is already carried by
  // aria-pressed, and a shifting name makes the control unfindable by name for
  // voice-control users and re-announces as a different control to screen
  // reader users. apg-react fixed this by moving the tick out of the accessible
  // name rather than by weakening the assertion, which is why it is asserted
  // positively here now.
  test('the accessible name does not change when the toggle becomes pressed', async ({ page }) => {
    const mute = muteButton(page);

    await expect(mute).toHaveAccessibleName('Mute');

    await tabUntilFocused(page, mute);
    await page.keyboard.press('Enter');

    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect(mute).toHaveAccessibleName('Mute');
  });
});

test.describe('Button — unavailable action', () => {
  test('activating an unavailable button runs no action', async ({ page }) => {
    const submit = page.getByRole('button', { name: 'Submit' });

    await expect(submit).toBeDisabled();

    // Force past Playwright's actionability wait so the click is genuinely
    // dispatched at the element rather than the harness refusing to try. The
    // point of the test is what the *component* does with the event, so
    // no-force-option is the wrong guard here.
    // eslint-disable-next-line playwright/no-force-option
    await submit.click({ force: true });

    await expect(page.getByText('Form submitted')).toHaveCount(0);
    // The rest of the page still reacts, so the null result above is the
    // button's doing and not a dead page.
    await page.getByRole('button', { name: 'Print' }).click();
    await expect(page.getByText('Print dialog opened')).toBeVisible();
  });

  test('Tab moves past the unavailable button', async ({ page }) => {
    // Documents what the component does today: `disabled` removes Submit from
    // the tab ring entirely. The APG would rather it stayed reachable — see
    // the failing test below.
    const mute = page.getByRole('button', { name: 'Mute' });
    await tabUntilFocused(page, mute);

    await pressTab(page);

    const submit = page.getByRole('button', { name: 'Submit' });
    expect(await isFocused(submit), 'a natively disabled button is skipped by Tab').toBe(false);
  });

  // KNOWN GAP — apg-react#139 (Button aria-disabled).
  // APG: "When the action associated with a button is unavailable, the button
  // has aria-disabled set to true." The component uses the native `disabled`
  // attribute instead, which drops the control out of the tab sequence
  // altogether — a keyboard or screen reader user never discovers that a
  // Submit button exists, let alone why it is unavailable.
  test.fail(
    'an unavailable button stays discoverable and reports aria-disabled',
    async ({ page }) => {
      const submit = page.getByRole('button', { name: 'Submit' });

      const presses = await tabUntilFocused(page, submit);
      expect(presses, 'an aria-disabled button must remain in the tab sequence').toBeGreaterThan(0);
      await expect(submit).toHaveAttribute('aria-disabled', 'true');
    }
  );
});
