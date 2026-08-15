// @ts-check
/**
 * APG Radio Group Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/radio/
 *
 * Derived from apg-usecases `patterns/radiogroup/*.uc.yaml`:
 *   radiogroup-aria-roles-and-properties, radiogroup-standard-keyboard-interaction
 *
 * Not covered here, and why:
 *   - radiogroup-toolbar-keyboard-interaction: that scenario needs a radio group
 *     nested inside a role="toolbar"; this demo renders a standalone group, and
 *     the two variants have deliberately different arrow-key contracts.
 *   - Home / End: the APG's Radio Group keyboard contract is Tab, Space, and the
 *     four arrow keys — it defines no Home/End behaviour, so asserting them here
 *     would fail conformant implementations that omit them.
 *
 * This demo starts with nothing checked, which is the state the APG's own
 * keyboard contract calls out ("If none of the radio buttons are checked, focus
 * is set on the first radio button in the group"), and the state apg-react
 * currently gets wrong — see the test.fail below.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  expectTabExits,
  tabindexes,
} = require('./support/apg');

const RADIOS = ['Standard', 'Express', 'Overnight'];

const radiosOf = (page) =>
  page.getByRole('radiogroup', { name: 'Shipping Method' }).getByRole('radio');

/** Check a radio with the pointer, then re-enter the group with the keyboard. */
async function enterGroupWith(page, name) {
  await page.getByRole('radio', { name }).click();
  await expect(page.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
  const presses = await tabUntilFocused(page, page.getByRole('radio', { name }));
  expect(presses, 'a checked radio must be reachable by Tab').toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'radiogroup');
});

test.describe('Radio Group — roles, states, and properties', () => {
  test('the group is named and every radio reports an unchecked state on load', async ({
    page,
  }) => {
    const group = page.getByRole('radiogroup', { name: 'Shipping Method' });
    await expect(group).toHaveAccessibleName('Shipping Method');

    for (const name of RADIOS) {
      await expect(page.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'false');
    }

    // The unchecked state has to be a live state, not a hard-coded attribute.
    await page.getByRole('radio', { name: 'Express' }).click();
    await expect(page.getByRole('radio', { name: 'Express' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  test('checking one radio unchecks the rest', async ({ page }) => {
    await page.getByRole('radio', { name: 'Standard' }).click();
    await expect(page.getByRole('radio', { name: 'Standard' })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    await page.getByRole('radio', { name: 'Overnight' }).click();
    await expect(page.getByRole('radio', { name: 'Overnight' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(page.getByRole('radio', { name: 'Standard' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    await expect(page.getByRole('radio', { name: 'Express' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });
});

test.describe('Radio Group — reaching the group', () => {
  // KNOWN GAP — apg-react#138: RadioGroup derives each radio's tabindex purely
  // from its checked state (`tabIndex={selected ? 0 : -1}`), so when nothing is
  // checked EVERY radio is tabindex="-1" and the whole group drops out of the
  // tab sequence. The APG requires the opposite: "If none of the radio buttons
  // are checked, focus is set on the first radio button in the group."
  // A keyboard-only user cannot reach this control at all.
  test.fail('the radio group is reachable by Tab from a fresh page load', async ({ page }) => {
    const first = page.getByRole('radio', { name: 'Standard' });
    const presses = await tabUntilFocused(page, first);
    expect(presses, 'Tab must reach the first radio when none is checked').toBeGreaterThan(0);
  });

  test.fail(
    'with nothing checked, exactly one radio is still in the tab ring',
    async ({ page }) => {
      // The structural statement of the same defect: a roving tabindex always has
      // one 0, even before the user has chosen anything.
      expect(await tabindexes(radiosOf(page))).toEqual(['0', '-1', '-1']);
    }
  );

  test('once a radio is checked, Tab enters the group on that radio', async ({ page }) => {
    await enterGroupWith(page, 'Overnight');
    expect(await isFocused(page.getByRole('radio', { name: 'Overnight' }))).toBe(true);
    expect(
      await tabindexes(radiosOf(page)),
      'the checked radio is the group’s single tab stop'
    ).toEqual(['-1', '-1', '0']);
  });

  test('the group is a single tab stop', async ({ page }) => {
    await enterGroupWith(page, 'Standard');
    await expectTabExits(
      page,
      page.getByRole('radiogroup', { name: 'Shipping Method' }),
      'Tab must leave the group rather than walk its radios'
    );
  });
});

test.describe('Radio Group — keyboard navigation', () => {
  test('Down Arrow moves focus to the next radio and checks it', async ({ page }) => {
    await enterGroupWith(page, 'Standard');

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(page.getByRole('radio', { name: 'Express' }))).toBe(true);
    await expect(page.getByRole('radio', { name: 'Express' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(page.getByRole('radio', { name: 'Standard' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  test('Up Arrow moves focus to the previous radio and checks it', async ({ page }) => {
    await enterGroupWith(page, 'Overnight');

    await page.keyboard.press('ArrowUp');
    expect(await isFocused(page.getByRole('radio', { name: 'Express' }))).toBe(true);
    await expect(page.getByRole('radio', { name: 'Express' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(page.getByRole('radio', { name: 'Overnight' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  test('Right and Left Arrow behave the same as Down and Up', async ({ page }) => {
    await enterGroupWith(page, 'Standard');

    await page.keyboard.press('ArrowRight');
    expect(await isFocused(page.getByRole('radio', { name: 'Express' }))).toBe(true);
    await expect(page.getByRole('radio', { name: 'Express' })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    await page.keyboard.press('ArrowLeft');
    expect(await isFocused(page.getByRole('radio', { name: 'Standard' }))).toBe(true);
    await expect(page.getByRole('radio', { name: 'Standard' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  test('Down Arrow wraps from the last radio to the first', async ({ page }) => {
    await enterGroupWith(page, 'Overnight');

    await page.keyboard.press('ArrowDown');
    expect(
      await isFocused(page.getByRole('radio', { name: 'Standard' })),
      'Down Arrow on the last radio must wrap to the first'
    ).toBe(true);
    await expect(page.getByRole('radio', { name: 'Standard' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  test('Up Arrow wraps from the first radio to the last', async ({ page }) => {
    await enterGroupWith(page, 'Standard');

    await page.keyboard.press('ArrowUp');
    expect(
      await isFocused(page.getByRole('radio', { name: 'Overnight' })),
      'Up Arrow on the first radio must wrap to the last'
    ).toBe(true);
    await expect(page.getByRole('radio', { name: 'Overnight' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  test('the roving tabindex follows focus as arrow keys move it', async ({ page }) => {
    await enterGroupWith(page, 'Standard');
    expect(await tabindexes(radiosOf(page))).toEqual(['0', '-1', '-1']);

    await page.keyboard.press('ArrowDown');
    expect(await tabindexes(radiosOf(page))).toEqual(['-1', '0', '-1']);

    await page.keyboard.press('ArrowDown');
    expect(await tabindexes(radiosOf(page))).toEqual(['-1', '-1', '0']);

    await page.keyboard.press('ArrowUp');
    expect(await tabindexes(radiosOf(page))).toEqual(['-1', '0', '-1']);
  });

  test('Space on the focused radio keeps it checked and never toggles it off', async ({ page }) => {
    // "Space: checks the focused radio button if it is not already checked."
    // Because this group moves selection with focus, the focused radio is
    // always the checked one — so the behaviour worth guarding is that Space
    // does not turn it into a checkbox and uncheck the user's only choice.
    await enterGroupWith(page, 'Standard');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: 'Express' })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    await page.keyboard.press('Space');
    await expect(page.getByRole('radio', { name: 'Express' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(page.getByRole('radio', { name: 'Standard' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    await expect(page.getByRole('radio', { name: 'Overnight' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });
});
