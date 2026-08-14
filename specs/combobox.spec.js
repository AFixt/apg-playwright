// @ts-check
/**
 * APG Combobox Pattern (editable, list + inline autocomplete, listbox popup)
 * https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
 *
 * Derived from apg-usecases `patterns/combobox/*.uc.yaml`:
 *   combobox-aria-roles-and-properties, combobox-opening-popup,
 *   combobox-closing-popup, combobox-autocomplete-both,
 *   combobox-autocomplete-list, combobox-listbox-popup-keyboard-navigation,
 *   combobox-focus-management-activedescendant, combobox-selecting-a-value,
 *   combobox-indicating-selected-value, combobox-keyboard-navigation-input,
 *   combobox-tab-behavior-with-open-popup, combobox-popup-aria-roles
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused } = require('./support/apg');

const LABEL = 'Country';
const TOGGLE = 'Open suggestions';

// The popup does not exist in the DOM until the combobox is opened, so every
// option assertion below has to follow an interaction.
const FIRST_OPTION = 'Afghanistan';
const SECOND_OPTION = 'Albania';
const LAST_OPTION = 'United States';
const OPTION_COUNT = 9;

/** The id of the option the combobox currently points at with aria-activedescendant. */
function activeDescendant(combobox) {
  return combobox.getAttribute('aria-activedescendant');
}

/**
 * Assert that aria-activedescendant names the option with the given text.
 *
 * This is the load-bearing check for the pattern: DOM focus never leaves the
 * input, so aria-activedescendant is the *only* thing telling a screen reader
 * which option is current. An id that does not resolve, or resolves to the
 * wrong option, silently strands the user.
 */
async function expectActiveOption(page, combobox, text) {
  const id = await activeDescendant(combobox);
  expect(id, 'the combobox must point at an active option').toBeTruthy();

  const resolved = await page.evaluate((optionId) => {
    const el = document.getElementById(optionId);
    return el && { text: el.textContent, role: el.getAttribute('role') };
  }, id);

  expect(resolved, `aria-activedescendant "${id}" must resolve to a real element`).toBeTruthy();
  expect(resolved.role).toBe('option');
  expect(resolved.text).toBe(text);
}

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'combobox');
});

test.describe('Combobox — roles, states, and properties', () => {
  test('the input is a labelled combobox that starts collapsed', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });

    await expect(combobox).toHaveAttribute('aria-expanded', 'false');
    await expect(combobox).toHaveAttribute('aria-autocomplete', 'both');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    // aria-expanded is a claim about a popup, so prove the claim flips.
    await tabUntilFocused(page, combobox);
    await page.keyboard.press('ArrowDown');
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
  });

  test('aria-controls resolves to the listbox that actually appears', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await expect(combobox, 'the combobox must reference its popup').toHaveAttribute(
      'aria-controls',
      /.+/
    );
    const controls = await combobox.getAttribute('aria-controls');

    await tabUntilFocused(page, combobox);
    await page.keyboard.press('ArrowDown');

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(listbox).toHaveAttribute('id', controls);
  });

  test('the toggle button is out of the tab sequence but still opens the popup', async ({
    page,
  }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    const toggle = page.getByRole('button', { name: TOGGLE });

    await expect(toggle).toHaveAttribute('tabindex', '-1');

    const presses = await tabUntilFocused(page, combobox);
    expect(presses, 'the combobox must be reachable by Tab').toBeGreaterThan(0);
    await page.keyboard.press('Tab');
    expect(await isFocused(toggle), 'Tab must not land on the toggle button').toBe(false);

    await toggle.click();
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
  });
});

test.describe('Combobox — popup roles and properties', () => {
  test('the popup is a listbox of options', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);
    await page.keyboard.press('ArrowDown');

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(OPTION_COUNT);
    await expect(page.getByRole('option', { name: FIRST_OPTION })).toBeVisible();
    await expect(page.getByRole('option', { name: LAST_OPTION })).toBeVisible();
  });

  test('exactly one option is marked aria-selected as the user arrows through', async ({
    page,
  }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);
    await page.keyboard.press('ArrowDown');

    await expect(page.getByRole('option', { name: FIRST_OPTION })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: SECOND_OPTION })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('option', { name: FIRST_OPTION })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
  });
});

test.describe('Combobox — opening and closing the popup', () => {
  test('Down Arrow opens the popup with the first option active', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.press('ArrowDown');
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectActiveOption(page, combobox, FIRST_OPTION);
  });

  test('Up Arrow opens the popup with the last option active', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.press('ArrowUp');
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectActiveOption(page, combobox, LAST_OPTION);
  });

  test('Alt+Down Arrow opens the popup', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.press('Alt+ArrowDown');
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
  });

  test('Escape closes the popup and leaves focus on the combobox', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    expect(await isFocused(combobox), 'Escape must not move focus off the combobox').toBe(true);
  });

  test('a second Escape clears the typed value', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.type('al');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Escape');
    await expect(combobox).toHaveValue('');
    expect(await isFocused(combobox)).toBe(true);
  });

  test('Tab closes the popup and moves focus out of the combobox', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    expect(await isFocused(combobox), 'Tab must move focus out of the combobox').toBe(false);
  });
});

test.describe('Combobox — navigating the popup with aria-activedescendant', () => {
  test('Down Arrow advances the active option without moving DOM focus', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.press('ArrowDown');
    await expectActiveOption(page, combobox, FIRST_OPTION);

    await page.keyboard.press('ArrowDown');
    await expectActiveOption(page, combobox, SECOND_OPTION);

    // DOM focus must never leave the input, or typing would stop working.
    expect(await isFocused(combobox), 'DOM focus must stay on the combobox input').toBe(true);
  });

  test('Up Arrow walks the active option back', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expectActiveOption(page, combobox, SECOND_OPTION);

    await page.keyboard.press('ArrowUp');
    await expectActiveOption(page, combobox, FIRST_OPTION);
    expect(await isFocused(combobox)).toBe(true);
  });

  test('Home and End jump the active option to the ends of the list', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);
    await page.keyboard.press('ArrowDown');

    await page.keyboard.press('End');
    await expectActiveOption(page, combobox, LAST_OPTION);

    await page.keyboard.press('Home');
    await expectActiveOption(page, combobox, FIRST_OPTION);
    expect(await isFocused(combobox)).toBe(true);
  });
});

test.describe('Combobox — autocomplete and selection', () => {
  test('typing filters the popup down to the matching options', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.type('al');
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('option')).toHaveCount(3);
    await expect(page.getByRole('option', { name: 'Albania' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Algeria' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Australia' })).toBeVisible();
    await expect(page.getByRole('option', { name: FIRST_OPTION })).toHaveCount(0);
  });

  test('aria-autocomplete="both" also completes the value inline', async ({ page }) => {
    // "both" means list *and* inline: the input value is extended with the
    // remainder of the best match, selected so the next keystroke replaces it.
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.type('al');
    await expect(combobox).toHaveValue('Albania');

    const selection = await combobox.evaluate((el) => [el.selectionStart, el.selectionEnd]);
    expect(selection, 'the inline completion must be selected, not committed').toEqual([
      2,
      'Albania'.length,
    ]);
  });

  test('Enter accepts the active option and closes the popup', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expectActiveOption(page, combobox, SECOND_OPTION);

    await page.keyboard.press('Enter');
    await expect(combobox).toHaveValue(SECOND_OPTION);
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    expect(await isFocused(combobox), 'focus returns to the combobox after selecting').toBe(true);
  });

  test('clicking an option selects it and closes the popup', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);
    await page.keyboard.press('ArrowDown');

    await page.getByRole('option', { name: SECOND_OPTION }).click();
    await expect(combobox).toHaveValue(SECOND_OPTION);
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });
});

test.describe('Combobox — text editing in the input', () => {
  // KNOWN GAP — apg-react#153. Backspace cannot reliably shorten the value.
  // The inline completion is re-applied on every keystroke, including
  // deletions, so the field refills itself: typing "aus" then pressing
  // Backspace walks "Aus" -> "Australia" -> "Au" -> "A" -> "A" ->
  // "Afghanistan", i.e. deletion sometimes grows the value. The APG requires
  // the combobox input to support "standard single line text editing keys",
  // and apg-usecases combobox-keyboard-navigation-input asserts exactly this
  // (type "hello", Backspace, expect "hell"). With no way to delete, the only
  // route out of a wrong entry is Escape twice, which discards everything.
  //
  // These assert the *settled* end state after more Backspaces than there are
  // characters. Asserting a single Backspace would be racy: the value really
  // does shorten for a moment before the completion refills it, and a
  // retrying assertion can catch that transient and report success.
  test('Backspace can clear a typed entry', async ({ page }) => {
    test.fail();
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.type('aus');
    await expect(combobox).toHaveValue('Australia');

    await page.keyboard.press('Backspace', { delay: 50 });
    await page.keyboard.press('Backspace', { delay: 50 });
    await page.keyboard.press('Backspace', { delay: 50 });
    await page.keyboard.press('Backspace', { delay: 50 });
    await page.keyboard.press('Backspace', { delay: 50 });

    await expect(combobox, 'Backspace must be able to empty the field').toHaveValue('');
  });

  test('Backspace can clear a value chosen from the popup', async ({ page }) => {
    test.fail();
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(combobox).toHaveValue(FIRST_OPTION);

    for (let i = 0; i < FIRST_OPTION.length + 3; i += 1) {
      await page.keyboard.press('Backspace', { delay: 20 });
    }

    await expect(combobox, 'Backspace must be able to empty the field').toHaveValue('');
  });
});

test.describe('Combobox — aria-haspopup', () => {
  // KNOWN GAP: apg-react#142. Note that the APG only *requires* aria-haspopup
  // "if the popup has a role other than listbox", so a listbox popup is within
  // the letter of the pattern without it. Stating it explicitly is still the
  // more robust choice — several screen readers key their "has a popup"
  // announcement off the attribute rather than off the implicit default — so
  // the assertion is written faithfully and marked failing until #142 lands.
  test('the combobox declares the kind of popup it owns', async ({ page }) => {
    test.fail();
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();

    await expect(combobox).toHaveAttribute('aria-haspopup', 'listbox');
  });
});

test.describe('Combobox — no-match state', () => {
  // KNOWN GAP — apg-react#152. When the typed text matches
  // nothing, the listbox is removed from the DOM but aria-expanded stays
  // "true" and aria-activedescendant keeps pointing at an option id that no
  // longer resolves. A screen reader is told a popup is open, told which
  // option is current, and can find neither — the user is stranded with no
  // signal that the search failed.
  test('a search with no matches collapses the combobox', async ({ page }) => {
    test.fail();
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.type('zzzz');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await expect(combobox, 'aria-expanded must not claim a popup that is gone').toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  test('a search with no matches drops the dangling aria-activedescendant', async ({ page }) => {
    test.fail();
    const combobox = page.getByRole('combobox', { name: LABEL });
    await tabUntilFocused(page, combobox);

    await page.keyboard.type('zzzz');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    const id = await activeDescendant(combobox);
    const resolves = await page.evaluate(
      (optionId) => !optionId || !!document.getElementById(optionId),
      id
    );
    expect(resolves, 'aria-activedescendant must not point at a removed option').toBe(true);
  });
});
