// @ts-check
/**
 * APG Tabs Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
 *
 * Derived from apg-usecases `patterns/tabs/*.uc.yaml`:
 *   tabs-aria-roles-and-properties, tabs-activating-tab,
 *   tabs-keyboard-navigation, tabs-focus-handling
 *
 * Not covered here, and why:
 *   - tabs-vertical-orientation: this demo renders the horizontal variant
 *     (`aria-orientation="horizontal"`), so Up/Down arrows are not part of its
 *     contract. A vertical tablist would need a second demo page.
 *   - tabs-additional-keyboard-interactions: the demo has no deletable tabs and
 *     no per-tab context menu, so Delete and Shift+F10 have nothing to act on.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  tabindexes,
  pressShiftTab,
  pressTab,
  byId,
  markOptional,
} = require('./support/apg');

const TABS = ['Tab 1', 'Tab 2', 'Tab 3'];

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'tabs');
});

test.describe('Tabs — roles, states, and properties', () => {
  test('exactly one tab is selected and only its panel is perceivable', async ({ page }) => {
    const [first, second, third] = TABS.map((name) => page.getByRole('tab', { name }));

    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(second).toHaveAttribute('aria-selected', 'false');
    await expect(third).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#tabs-panel-1')).toBeVisible();
    await expect(page.locator('#tabs-panel-2')).toBeHidden();
    await expect(page.locator('#tabs-panel-3')).toBeHidden();

    // The invariant has to survive a selection change, not just page load.
    await third.click();
    await expect(first).toHaveAttribute('aria-selected', 'false');
    await expect(third).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tabs-panel-1')).toBeHidden();
    await expect(page.locator('#tabs-panel-3')).toBeVisible();
  });

  test('each tab controls a panel that is labelled back by that same tab', async ({ page }) => {
    for (const name of TABS) {
      const tab = page.getByRole('tab', { name });
      await expect(tab, `${name} must reference a panel`).toHaveAttribute('aria-controls', /\S/);

      const { tabId, controls } = await tab.evaluate((el) => ({
        tabId: el.id,
        controls: el.getAttribute('aria-controls'),
      }));

      // aria-controls must resolve to a real node, and the relationship must
      // be reciprocal rather than a dangling id in one direction.
      const panel = byId(page, controls);
      await expect(panel).toHaveAttribute('aria-labelledby', tabId);
      await expect(panel).toHaveAttribute('role', 'tabpanel');

      // Reveal the panel so the assertion is about a perceivable region, not
      // just an attribute on a hidden node.
      await tab.click();
      await expect(panel).toBeVisible();
      await expect(page.getByRole('tabpanel', { name })).toBeVisible();
    }
  });

  test('the tablist declares its orientation', async ({ page }) => {
    // aria-orientation drives which arrow keys a screen reader tells the user
    // to press, so it has to match the keys the widget actually honours.
    const tablist = page.getByRole('tablist');
    await expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');

    const first = page.getByRole('tab', { name: 'Tab 1' });
    await tabUntilFocused(page, first);
    await page.keyboard.press('ArrowRight');
    expect(
      await isFocused(page.getByRole('tab', { name: 'Tab 2' })),
      'a horizontal tablist must respond to Right Arrow'
    ).toBe(true);
  });

  // KNOWN GAP — apg-react#139: the Tabs component renders no aria-label or
  // aria-labelledby on its tablist, so the tab list has no accessible name.
  // The APG requires one ("If the tab list has a visible label, the element
  // with role tablist has aria-labelledby ... otherwise it has aria-label").
  test.fail('the tablist has an accessible name', async ({ page }) => {
    await expect(page.getByRole('tablist')).toHaveAccessibleName(/\S/);
  });
});

test.describe('Tabs — activation', () => {
  test('clicking a tab shows its panel and hides the previously shown one', async ({ page }) => {
    await page.getByRole('tab', { name: 'Tab 2' }).click();
    await expect(page.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tabs-panel-2')).toBeVisible();
    await expect(page.locator('#tabs-panel-1')).toBeHidden();

    await page.getByRole('tab', { name: 'Tab 3' }).click();
    await expect(page.locator('#tabs-panel-3')).toBeVisible();
    await expect(page.locator('#tabs-panel-2')).toBeHidden();
  });

  test('arrow keys activate on focus — this tablist is the automatic variant', async ({ page }) => {
    // The APG allows either activation model. This demo implements automatic
    // activation, so moving focus alone must swap the visible panel; no
    // separate Space/Enter press is involved. A manual-activation tablist
    // would instead leave aria-selected untouched until Space or Enter.
    const first = page.getByRole('tab', { name: 'Tab 1' });
    const second = page.getByRole('tab', { name: 'Tab 2' });

    await tabUntilFocused(page, first);
    await page.keyboard.press('ArrowRight');

    expect(await isFocused(second)).toBe(true);
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await expect(first).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#tabs-panel-2')).toBeVisible();
    await expect(page.locator('#tabs-panel-1')).toBeHidden();
  });

  test('Space and Enter leave the focused tab activated', async ({ page }) => {
    // Under automatic activation the APG says Space/Enter "activates the tab if
    // it was not activated automatically on focus" — i.e. they must be safe
    // no-ops here, never a toggle that deselects the tab the user is standing on.
    const second = page.getByRole('tab', { name: 'Tab 2' });

    await tabUntilFocused(page, page.getByRole('tab', { name: 'Tab 1' }));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tabs-panel-2')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tabs-panel-2')).toBeVisible();
  });
});

test.describe('Tabs — keyboard navigation', () => {
  test('the tablist is one tab stop and only the selected tab is in the tab ring', async ({
    page,
  }) => {
    const first = page.getByRole('tab', { name: 'Tab 1' });
    const presses = await tabUntilFocused(page, first);
    expect(presses, 'the active tab must be reachable by Tab').toBeGreaterThan(0);

    expect(
      await tabindexes(page.getByRole('tab')),
      'a roving tabindex means exactly one tab is tabbable'
    ).toEqual(['0', '-1', '-1']);
  });

  test('the roving tabindex follows focus as arrow keys move it', async ({ page }) => {
    // The assertion most tab suites forget: moving focus must also move the
    // single tabindex="0". Otherwise Shift+Tab back into the widget dumps the
    // user on a tab they never visited.
    const tabs = page.getByRole('tab');

    await tabUntilFocused(page, page.getByRole('tab', { name: 'Tab 1' }));
    await page.keyboard.press('ArrowRight');
    expect(await tabindexes(tabs)).toEqual(['-1', '0', '-1']);

    await page.keyboard.press('ArrowRight');
    expect(await tabindexes(tabs)).toEqual(['-1', '-1', '0']);

    await page.keyboard.press('ArrowLeft');
    expect(await tabindexes(tabs)).toEqual(['-1', '0', '-1']);
  });

  test('Right Arrow wraps from the last tab to the first', async ({ page }) => {
    const first = page.getByRole('tab', { name: 'Tab 1' });
    const last = page.getByRole('tab', { name: 'Tab 3' });

    await tabUntilFocused(page, first);
    await page.keyboard.press('End');
    expect(await isFocused(last)).toBe(true);

    await page.keyboard.press('ArrowRight');
    expect(await isFocused(first), 'Right Arrow on the last tab must wrap').toBe(true);
    await expect(page.locator('#tabs-panel-1')).toBeVisible();
  });

  test('Left Arrow wraps from the first tab to the last', async ({ page }) => {
    const first = page.getByRole('tab', { name: 'Tab 1' });
    const last = page.getByRole('tab', { name: 'Tab 3' });

    await tabUntilFocused(page, first);
    await page.keyboard.press('ArrowLeft');

    expect(await isFocused(last), 'Left Arrow on the first tab must wrap').toBe(true);
    await expect(page.locator('#tabs-panel-3')).toBeVisible();
  });

  test('Home moves to the first tab and End to the last', async ({ page }) => {
    markOptional('Tabs § Keyboard Interaction — Home and End are marked "(Optional)"');

    const first = page.getByRole('tab', { name: 'Tab 1' });
    const last = page.getByRole('tab', { name: 'Tab 3' });

    await tabUntilFocused(page, first);
    await page.keyboard.press('End');
    expect(await isFocused(last)).toBe(true);
    await expect(page.locator('#tabs-panel-3')).toBeVisible();

    await page.keyboard.press('Home');
    expect(await isFocused(first)).toBe(true);
    await expect(page.locator('#tabs-panel-1')).toBeVisible();
  });

  test('Tab from the tablist moves into the active panel and Shift+Tab returns', async ({
    page,
  }) => {
    const second = page.getByRole('tab', { name: 'Tab 2' });
    const panel = page.locator('#tabs-panel-2');

    await tabUntilFocused(page, page.getByRole('tab', { name: 'Tab 1' }));
    await page.keyboard.press('ArrowRight');
    await expect(panel).toBeVisible();

    // The panel holds only static text, so the APG asks for tabindex="0" on the
    // panel itself; otherwise Tab would skip the content the tab just revealed.
    await expect(panel).toHaveAttribute('tabindex', '0');
    await pressTab(page);
    expect(await isFocused(panel), 'Tab must land inside the active tabpanel').toBe(true);

    await pressShiftTab(page);
    expect(await isFocused(second), 'Shift+Tab must return to the active tab').toBe(true);
  });

  test('hidden panels are outside the tab sequence', async ({ page }) => {
    // Panels 2 and 3 also carry tabindex="0"; the `hidden` attribute is the only
    // thing keeping them out of the tab ring. Losing it would strand a keyboard
    // user inside content that is visually gone.
    await tabUntilFocused(page, page.getByRole('tab', { name: 'Tab 1' }));
    await pressTab(page);
    expect(await isFocused(page.locator('#tabs-panel-1'))).toBe(true);

    await pressTab(page);
    expect(
      await isFocused(page.locator('#tabs-panel-2')),
      'a hidden tabpanel must not be focusable'
    ).toBe(false);
  });
});
