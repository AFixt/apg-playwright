// @ts-check
/**
 * APG Modal Dialog Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
 *
 * Derived from apg-usecases `patterns/modal-dialog/*.uc.yaml`:
 *   modal-dialog-aria-roles-and-properties, modal-dialog-opening,
 *   modal-dialog-navigating-inside, modal-dialog-closing-with-escape,
 *   modal-dialog-return-focus, modal-dialog-close-button-in-tab-sequence,
 *   modal-dialog-complex-content
 *
 * The page renders only the trigger button until the dialog is opened, so every
 * test opens it first. The interesting half of this pattern is focus: where it
 * lands on open, that it cannot escape while the dialog is up, and that it goes
 * back to the trigger on close — a modal that gets the ARIA right and the focus
 * wrong is still unusable.
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused, activeElementInfo } = require('./support/apg');

/** The dialog's focusable contents, in DOM order. */
const TAB_RING = ['Name', 'Email', 'Save', 'Cancel', 'Close dialog'];

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'modal-dialog');
});

/** The trigger, which is also where focus has to come back to. */
function trigger(page) {
  return page.getByRole('button', { name: 'Open Dialog' });
}

/** Open the dialog the way a keyboard user would and wait for it to be up. */
async function openWithKeyboard(page) {
  const presses = await tabUntilFocused(page, trigger(page));
  expect(presses, 'the trigger must be reachable by Tab').toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Modal dialog — roles, states, and properties', () => {
  test('activating the trigger renders a modal dialog with an accessible name', async ({
    page,
  }) => {
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openWithKeyboard(page);

    const dialog = page.getByRole('dialog', { name: 'Edit Profile' });
    await expect(dialog, 'the dialog must be named for the task it performs').toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute(
      'aria-labelledby',
      await page.getByRole('heading', { name: 'Edit Profile' }).evaluate((el) => el.id)
    );
  });

  test('the dialog includes a visible close control in its tab sequence', async ({ page }) => {
    await openWithKeyboard(page);

    const close = page.getByRole('button', { name: 'Close dialog' });
    await expect(
      close,
      'the close control must be perceivable, not screen-reader only'
    ).toBeVisible();

    // Reaching it by Tab is what makes it a control rather than decoration.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await isFocused(close)).toBe(true);
  });
});

test.describe('Modal dialog — focus management', () => {
  test('opening the dialog moves focus inside it', async ({ page }) => {
    await openWithKeyboard(page);

    // The APG asks for focus on "the first element that allows the user to
    // perform the dialog's primary task" — here, the first field of the form.
    const name = page.getByRole('textbox', { name: 'Name' });
    expect(await isFocused(name), 'focus must land inside the dialog on open').toBe(true);
    expect(await isFocused(trigger(page))).toBe(false);
  });

  test('Tab from the last focusable element wraps back to the first', async ({ page }) => {
    await openWithKeyboard(page);

    for (let i = 1; i < TAB_RING.length; i += 1) {
      await page.keyboard.press('Tab');
    }
    expect(await isFocused(page.getByRole('button', { name: 'Close dialog' }))).toBe(true);

    await page.keyboard.press('Tab');
    expect(
      await isFocused(page.getByRole('textbox', { name: 'Name' })),
      'Tab must wrap inside the dialog rather than fall out of it'
    ).toBe(true);
  });

  test('Shift+Tab from the first focusable element wraps to the last', async ({ page }) => {
    await openWithKeyboard(page);
    expect(await isFocused(page.getByRole('textbox', { name: 'Name' }))).toBe(true);

    await page.keyboard.press('Shift+Tab');
    expect(
      await isFocused(page.getByRole('button', { name: 'Close dialog' })),
      'Shift+Tab must wrap to the end of the dialog, not out to the page'
    ).toBe(true);
  });

  test('content outside the dialog is unreachable while it is open', async ({ page }) => {
    await openWithKeyboard(page);

    // Walk one full cycle and one extra step. Everything focus lands on has to
    // be dialog content; the trigger behind the backdrop must never come up.
    const visited = [];
    for (let i = 0; i <= TAB_RING.length; i += 1) {
      await page.keyboard.press('Tab');
      const info = await activeElementInfo(page);
      visited.push(info.label || info.text);
    }

    expect(visited, 'the trigger must be inert while the dialog is modal').not.toContain(
      'Open Dialog'
    );
    expect(
      new Set(visited).size,
      'Tab must cycle within the dialog, visiting no more than its own controls'
    ).toBeLessThanOrEqual(TAB_RING.length);
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Modal dialog — closing', () => {
  test('Escape closes the dialog and returns focus to the trigger', async ({ page }) => {
    await openWithKeyboard(page);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await isFocused(trigger(page)),
      'focus must return to the control that opened the dialog'
    ).toBe(true);
  });

  test('Escape from a field inside the dialog still closes it', async ({ page }) => {
    await openWithKeyboard(page);

    // Escape has to work wherever focus happens to be, not only on the dialog.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await isFocused(page.getByRole('button', { name: 'Save' }))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await isFocused(trigger(page))).toBe(true);
  });

  test('the close button closes the dialog and returns focus to the trigger', async ({ page }) => {
    await openWithKeyboard(page);

    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await isFocused(trigger(page))).toBe(true);
  });

  test('the cancel button closes the dialog and returns focus to the trigger', async ({ page }) => {
    await openWithKeyboard(page);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await isFocused(trigger(page))).toBe(true);
  });

  test('the dialog can be reopened after being dismissed', async ({ page }) => {
    await openWithKeyboard(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Focus is already back on the trigger, so a keyboard user reopens without
    // hunting for it again.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Edit Profile' })).toBeVisible();
    expect(await isFocused(page.getByRole('textbox', { name: 'Name' }))).toBe(true);
  });
});
