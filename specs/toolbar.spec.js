// @ts-check
/**
 * APG Toolbar Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/
 *
 * Derived from apg-usecases `patterns/toolbar/*.uc.yaml`:
 *   toolbar-aria-roles-and-properties, toolbar-keyboard-entry-exit,
 *   toolbar-horizontal-navigation
 *
 * Not covered here, and why:
 *   - toolbar-vertical-navigation: this demo renders the horizontal variant
 *     (`aria-orientation="horizontal"`), so Up/Down arrows are not its contract.
 *   - toolbar-disabled-controls: all four controls in this demo are enabled, so
 *     there is no disabled control whose focusability could be exercised.
 *   - toolbar-quick-access-shortcut: the demo advertises no shortcut key, and
 *     the APG only requires one when the application documents it.
 */
const { test, expect } = require('@playwright/test');
const {
  expectTabExits,
  gotoPattern,
  isFocused,
  tabUntilFocused,
  tabindexes,
  markOptional,
} = require('./support/apg');

const CONTROLS = ['Bold', 'Italic', 'Underline', 'Strikethrough'];

const controlsOf = (page) => page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button');

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'toolbar');
});

test.describe('Toolbar — roles, states, and properties', () => {
  test('the toolbar is named and declares its orientation', async ({ page }) => {
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    await expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
    await expect(toolbar).toHaveAccessibleName('Formatting');

    // A horizontal toolbar must actually answer to the horizontal arrow keys
    // its aria-orientation promises.
    await tabUntilFocused(page, page.getByRole('button', { name: 'Bold' }));
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(page.getByRole('button', { name: 'Italic' }))).toBe(true);
  });

  test('every control is a toggle button that reports its pressed state', async ({ page }) => {
    for (const name of CONTROLS) {
      const button = page.getByRole('button', { name });
      await expect(button).toHaveAttribute('aria-pressed', 'false');

      await button.click();
      await expect(button, `${name} must report being pressed`).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      await button.click();
      await expect(button, `${name} must report being released`).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    }
  });
});

test.describe('Toolbar — activating controls', () => {
  test('Space toggles aria-pressed on the focused control', async ({ page }) => {
    const bold = page.getByRole('button', { name: 'Bold' });

    await tabUntilFocused(page, bold);
    await page.keyboard.press('Space');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Space');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
  });

  test('Enter toggles aria-pressed on the focused control', async ({ page }) => {
    const bold = page.getByRole('button', { name: 'Bold' });

    await tabUntilFocused(page, bold);
    await page.keyboard.press('Enter');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Enter');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
  });

  test('pressing one control leaves its siblings unpressed', async ({ page }) => {
    // These are independent toggles, not a radio group: turning Bold on must
    // not turn anything else on or off.
    const bold = page.getByRole('button', { name: 'Bold' });

    await tabUntilFocused(page, bold);
    await page.keyboard.press('Space');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    for (const name of ['Italic', 'Underline', 'Strikethrough']) {
      await expect(page.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('toggling a control does not disturb the roving tabindex', async ({ page }) => {
    await tabUntilFocused(page, page.getByRole('button', { name: 'Bold' }));
    await page.keyboard.press('ArrowRight');
    expect(await tabindexes(controlsOf(page))).toEqual(['-1', '0', '-1', '-1']);

    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Italic' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      await tabindexes(controlsOf(page)),
      'activating a control must not move the toolbar tab stop'
    ).toEqual(['-1', '0', '-1', '-1']);
  });
});

test.describe('Toolbar — keyboard navigation', () => {
  test('Tab enters the toolbar on the first control and only that control is tabbable', async ({
    page,
  }) => {
    const bold = page.getByRole('button', { name: 'Bold' });
    const presses = await tabUntilFocused(page, bold);
    expect(presses, 'Tab must reach the first non-disabled toolbar control').toBeGreaterThan(0);

    expect(
      await tabindexes(controlsOf(page)),
      'a toolbar is a single tab stop: one 0, the rest -1'
    ).toEqual(['0', '-1', '-1', '-1']);
  });

  test('the roving tabindex follows focus as arrow keys move it', async ({ page }) => {
    // Without this, Shift+Tab back into the toolbar returns the user to the
    // first control rather than the one they were last using.
    await tabUntilFocused(page, page.getByRole('button', { name: 'Bold' }));

    await page.keyboard.press('ArrowRight');
    expect(await isFocused(page.getByRole('button', { name: 'Italic' }))).toBe(true);
    expect(await tabindexes(controlsOf(page))).toEqual(['-1', '0', '-1', '-1']);

    await page.keyboard.press('ArrowRight');
    expect(await tabindexes(controlsOf(page))).toEqual(['-1', '-1', '0', '-1']);

    await page.keyboard.press('ArrowLeft');
    expect(await tabindexes(controlsOf(page))).toEqual(['-1', '0', '-1', '-1']);
  });

  test('Right and Left Arrow step through the controls', async ({ page }) => {
    const [bold, italic, underline] = ['Bold', 'Italic', 'Underline'].map((name) =>
      page.getByRole('button', { name })
    );

    await tabUntilFocused(page, bold);
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(italic)).toBe(true);
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(underline)).toBe(true);
    await page.keyboard.press('ArrowLeft');
    expect(await isFocused(italic)).toBe(true);
  });

  test('arrow navigation wraps at both ends', async ({ page }) => {
    markOptional('Toolbar § Keyboard Interaction — "Optionally, focus movement may wrap"');

    // The APG marks wrapping optional for toolbars; this one implements it, so
    // the spec pins the behaviour it actually advertises to users.
    const bold = page.getByRole('button', { name: 'Bold' });
    const strike = page.getByRole('button', { name: 'Strikethrough' });

    await tabUntilFocused(page, bold);
    await page.keyboard.press('ArrowLeft');
    expect(await isFocused(strike), 'Left Arrow on the first control wraps to the last').toBe(true);

    await page.keyboard.press('ArrowRight');
    expect(await isFocused(bold), 'Right Arrow on the last control wraps to the first').toBe(true);
  });

  test('Home moves to the first control and End to the last', async ({ page }) => {
    markOptional('Toolbar § Keyboard Interaction — Home and End are marked "(Optional)"');

    const bold = page.getByRole('button', { name: 'Bold' });
    const strike = page.getByRole('button', { name: 'Strikethrough' });

    await tabUntilFocused(page, bold);
    await page.keyboard.press('End');
    expect(await isFocused(strike)).toBe(true);
    expect(await tabindexes(controlsOf(page))).toEqual(['-1', '-1', '-1', '0']);

    await page.keyboard.press('Home');
    expect(await isFocused(bold)).toBe(true);
    expect(await tabindexes(controlsOf(page))).toEqual(['0', '-1', '-1', '-1']);
  });

  test('Tab from inside the toolbar leaves the toolbar entirely', async ({ page }) => {
    // The whole point of the roving tabindex: Tab must not walk control by
    // control through the toolbar.
    await tabUntilFocused(page, page.getByRole('button', { name: 'Bold' }));
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(page.getByRole('button', { name: 'Italic' }))).toBe(true);

    await expectTabExits(
      page,
      page.getByRole('toolbar', { name: 'Formatting' }),
      'Tab must leave the toolbar rather than walk its controls'
    );
  });
});
