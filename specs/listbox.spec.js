// @ts-check
/**
 * APG Listbox Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
 *
 * Derived from apg-usecases `patterns/listbox/*.uc.yaml`:
 *   listbox-container-aria, listbox-option-aria, listbox-orientation,
 *   listbox-single-select-navigation, listbox-focus-management-activedescendant,
 *   listbox-type-ahead
 *
 * Not covered here, and why:
 *   - listbox-multi-select-aria, listbox-multi-select-navigation,
 *     listbox-multi-select-shift, listbox-select-all: the demo page renders a
 *     single-select listbox only, and apg-react ships no multi-select listbox
 *     demo (apg-react#142). There is no aria-multiselectable widget on the page
 *     to drive, so those scenarios cannot be exercised faithfully here.
 *   - listbox-dynamic-loading, listbox-rearranging-options,
 *     listbox-scrolling-behavior: this listbox has six statically ordered
 *     options.
 *
 * Focus model: the APG permits either aria-activedescendant on the container or
 * a roving tabindex over the options. apg-react's Listbox supports both through
 * a `focusModel` prop, and **this demo opts into "activedescendant"** — the
 * model the APG's own listbox examples use, chosen because under roving
 * tabindex a caller that focuses the listbox itself gets no option handler at
 * all (apg-react#213). DOM focus therefore stays on the container and the active
 * option is named by aria-activedescendant; no option is ever the activeElement,
 * and no option carries a tabindex.
 *
 * These specs previously asserted the roving-tabindex variant, which is what the
 * demo used when they were written. Asserting DOM focus on an option is the
 * thing to avoid here: it is not what this widget promises, and under
 * activedescendant it can never be true.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  expectTabExits,
  tabindexes,
  markOptional,
} = require('./support/apg');

const FRUITS = ['Apple', 'Banana', 'Cherry', 'Date', 'Durian', 'Elderberry'];
/** Deliberately aria-disabled in the demo, and deliberately not last. */
const DISABLED = 'Durian';

const listboxOf = (page) => page.getByRole('listbox', { name: 'Fruits' });
const optionsOf = (page) => listboxOf(page).getByRole('option');
const optionOf = (page, name) => page.getByRole('option', { name, exact: true });

/**
 * Assert the listbox names this option as its active descendant.
 *
 * The activedescendant counterpart of `isFocused()`. It reads the option's own
 * id rather than comparing against a literal, because apg-react scopes ids per
 * instance with React's `useId` — the same reason `byId()` exists.
 */
async function expectActive(page, name) {
  // The option has to carry an id at all before aria-activedescendant can name
  // it, so assert that first — otherwise a missing id would compare null to
  // null and pass.
  await expect(optionOf(page, name)).toHaveAttribute('id', /\S/);
  const id = await optionOf(page, name).getAttribute('id');
  await expect(listboxOf(page)).toHaveAttribute('aria-activedescendant', id);
}

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'listbox');
});

test.describe('Listbox — roles, states, and properties', () => {
  test('the listbox is named by its visible label and is not multi-selectable', async ({
    page,
  }) => {
    const listbox = page.getByRole('listbox', { name: 'Fruits' });
    await expect(listbox).toHaveAccessibleName('Fruits');

    // "Otherwise, aria-multiselectable is either set to false or the default
    // value of false is implied." A single-select listbox must not claim it.
    await expect(listbox).not.toHaveAttribute('aria-multiselectable', 'true');

    // …and the widget must behave the way it advertises: choosing a second
    // option replaces the first rather than adding to it.
    await page.getByRole('option', { name: 'Banana' }).click();
    await page.getByRole('option', { name: 'Date' }).click();
    await expect(page.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    await expect(page.getByRole('option', { name: 'Date' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('every option carries an aria-selected state that tracks selection', async ({ page }) => {
    for (const name of FRUITS) {
      await expect(page.getByRole('option', { name })).toHaveAttribute('aria-selected', 'false');
    }

    await page.getByRole('option', { name: 'Cherry' }).click();
    for (const name of FRUITS) {
      await expect(page.getByRole('option', { name })).toHaveAttribute(
        'aria-selected',
        name === 'Cherry' ? 'true' : 'false'
      );
    }
  });

  test('the container is vertical, so it may omit aria-orientation', async ({ page }) => {
    // "The default value of aria-orientation for listbox is vertical." What
    // matters is that the vertical arrow keys are the ones that work.
    const listbox = page.getByRole('listbox', { name: 'Fruits' });
    await expect(listbox).not.toHaveAttribute('aria-orientation', 'horizontal');

    await tabUntilFocused(page, listboxOf(page));
    await page.keyboard.press('ArrowDown');
    // A vertical listbox must respond to Down Arrow.
    await expectActive(page, 'Banana');
  });

  test('the disabled option stays in the list and announces itself as disabled', async ({
    page,
  }) => {
    // The APG keeps a disabled option present and reachable rather than removing
    // it, so a user can discover it exists instead of wondering why the list is
    // shorter than they expected.
    await expect(optionOf(page, DISABLED)).toHaveAttribute('aria-disabled', 'true');

    const disabledCount = await optionsOf(page).evaluateAll(
      (els) => els.filter((el) => el.getAttribute('aria-disabled') === 'true').length
    );
    expect(disabledCount, 'aria-disabled must not leak onto its neighbours').toBe(1);
  });
});

test.describe('Listbox — selection', () => {
  test('clicking an option selects it and deselects the previous one', async ({ page }) => {
    const banana = page.getByRole('option', { name: 'Banana' });
    const elderberry = page.getByRole('option', { name: 'Elderberry' });

    await banana.click();
    await expect(banana).toHaveAttribute('aria-selected', 'true');

    await elderberry.click();
    await expect(elderberry).toHaveAttribute('aria-selected', 'true');
    await expect(banana).toHaveAttribute('aria-selected', 'false');
  });

  test('arrowing moves selection with focus, one option at a time', async ({ page }) => {
    // The APG allows a single-select listbox to move selection with focus.
    // What it does not allow is more than one option being selected at once.
    await tabUntilFocused(page, listboxOf(page));

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Cherry' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'aria-selected',
      'false'
    );

    const selected = await optionsOf(page).evaluateAll(
      (els) => els.filter((el) => el.getAttribute('aria-selected') === 'true').length
    );
    expect(selected, 'a single-select listbox must never hold two selections').toBe(1);
  });

  test('the disabled option cannot be selected by pointer', async ({ page }) => {
    await optionOf(page, 'Banana').click();

    // Playwright treats aria-disabled="true" as not-enabled and refuses to click
    // it, which is the tooling honouring the same semantic a user agent does.
    // Asserting that first is worth more than working around it.
    await expect(optionOf(page, DISABLED)).toBeDisabled();

    // Then force the click past actionability, because the CSS is only
    // `cursor: not-allowed` — there is no pointer-events guard, so a real click
    // does reach the handler. This asserts the handler itself is defensive
    // rather than relying on a cursor style to protect it.
    // Bypassing actionability is the point: it is what lets us assert the
    // handler is defensive rather than trusting the aria-disabled check above.
    // eslint-disable-next-line playwright/no-force-option
    await optionOf(page, DISABLED).click({ force: true });

    await expect(optionOf(page, DISABLED)).toHaveAttribute('aria-selected', 'false');
    // The previous selection is left alone rather than silently cleared.
    await expect(optionOf(page, 'Banana')).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Listbox — keyboard navigation', () => {
  test('Tab lands on the listbox without changing the selection', async ({ page }) => {
    // "If none of the options are selected before the listbox receives focus,
    // the first option receives focus." Under the activedescendant model that
    // means the container takes DOM focus and names the first option as active.
    // Arriving must not silently select one.
    const presses = await tabUntilFocused(page, listboxOf(page));
    expect(presses, 'the listbox must be reachable by Tab').toBeGreaterThan(0);

    await expectActive(page, 'Apple');
    const selected = await optionsOf(page).evaluateAll(
      (els) => els.filter((el) => el.getAttribute('aria-selected') === 'true').length
    );
    expect(selected, 'arriving must not select anything').toBe(0);
  });

  test('the listbox is a single tab stop and the options are not in the tab ring', async ({
    page,
  }) => {
    await tabUntilFocused(page, listboxOf(page));

    // The container holds focus; the options are named, not focused.
    await expect(listboxOf(page)).toHaveAttribute('tabindex', '0');
    expect(await tabindexes(optionsOf(page))).toEqual([null, null, null, null, null, null]);

    await expectTabExits(
      page,
      listboxOf(page),
      'Tab must leave the listbox rather than walk its options'
    );
  });

  test('aria-activedescendant follows the arrow keys', async ({ page }) => {
    await tabUntilFocused(page, listboxOf(page));

    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'Banana');

    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'Cherry');

    await page.keyboard.press('ArrowUp');
    await expectActive(page, 'Banana');

    // Focus never leaves the container while the active option changes.
    expect(await isFocused(listboxOf(page))).toBe(true);
  });

  test('arrowing onto the disabled option still reaches it', async ({ page }) => {
    // The APG keeps disabled options navigable: skipping them would hide their
    // existence from exactly the users who navigate by keyboard.
    await tabUntilFocused(page, listboxOf(page));
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('ArrowDown');
    }
    await expectActive(page, 'Date');

    await page.keyboard.press('ArrowDown');
    await expectActive(page, DISABLED);
    await expect(optionOf(page, DISABLED)).toHaveAttribute('aria-selected', 'false');

    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'Elderberry');
  });

  test('Home moves to the first option and End to the last', async ({ page }) => {
    markOptional('Listbox § Keyboard Interaction — Home and End are marked "(Optional)"');

    await tabUntilFocused(page, listboxOf(page));
    await page.keyboard.press('End');
    await expectActive(page, 'Elderberry');
    await expect(optionOf(page, 'Elderberry')).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Home');
    await expectActive(page, 'Apple');
    await expect(optionOf(page, 'Apple')).toHaveAttribute('aria-selected', 'true');
  });

  test('arrow navigation stops at both ends rather than wrapping', async ({ page }) => {
    // Unlike tabs, radios and menubars, the APG's listbox arrow keys simply
    // "move focus to the next/previous option" — there is no wrap, and adding
    // one would silently jump the user across the whole list.
    await tabUntilFocused(page, listboxOf(page));
    await page.keyboard.press('ArrowUp');
    // Up Arrow on the first option must not wrap.
    await expectActive(page, 'Apple');

    await page.keyboard.press('End');
    await page.keyboard.press('ArrowDown');
    // Down Arrow on the last option must not wrap.
    await expectActive(page, 'Elderberry');
  });

  // The APG lists type-ahead as Recommended for all listboxes.
  //
  // This was a KNOWN GAP (apg-react#155): Listbox handled no printable
  // characters, so type-ahead did nothing. apg-react implemented it across
  // Listbox, TreeView and Menubar, and closed the issue — so the test.fail
  // marker that guarded it is gone.
  test('typing a character moves focus to the next matching option', async ({ page }) => {
    await tabUntilFocused(page, listboxOf(page));
    await page.keyboard.press('c');

    await expectActive(page, 'Cherry');
  });
});
