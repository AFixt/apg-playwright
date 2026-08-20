// @ts-check
/**
 * APG Tooltip Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
 *
 * Derived from apg-usecases `patterns/tooltip/*.uc.yaml`:
 *   tooltip-accessibility-features, tooltip-display-on-focus,
 *   tooltip-hide-on-focus-loss, tooltip-close-with-escape
 *
 * NOTE: The APG Tooltip page is explicitly work-in-progress and has not reached
 * task force consensus, so this pattern is expected to churn.
 *
 * tooltip-javascript-css-implementation and tooltip-visibility-and-positioning
 * were removed upstream (AFixt/apg-usecases#68) because neither had any basis
 * in the APG tooltip page — it prescribes no implementation technology and says
 * nothing about positioning. No test here derived from them, so nothing was
 * lost. See AFixt/apg-gherkin#77.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  pressShiftTab,
  pressTab,
  byId,
} = require('./support/apg');

// Four triggers, one per placement. The tooltip element for each is created on
// demand — none of them exist in the DOM until the trigger is hovered or focused.
const TOP = 'Hover over me (top)!';
const RIGHT = 'Hover over me (right)!';
const BOTTOM = 'Hover over me (bottom)!';

const TOP_TEXT = 'Tooltip on the top';
const RIGHT_TEXT = 'Tooltip on the right';
const BOTTOM_TEXT = 'Tooltip on the bottom';

/**
 * Assert the trigger is described by a visible tooltip carrying `text`.
 *
 * Both halves matter. A visible tooltip that is not referenced by
 * aria-describedby is invisible to a screen reader, and an aria-describedby
 * pointing at a hidden element announces text the user cannot see.
 */
async function expectDescribedBy(page, trigger, text) {
  await expect(trigger, 'a showing tooltip must be wired to its trigger').toHaveAttribute(
    'aria-describedby',
    /.+/
  );

  const id = await trigger.getAttribute('aria-describedby');
  const tooltip = byId(page, id);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute('role', 'tooltip');
  await expect(tooltip).toHaveText(text);
}

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'tooltip');
});

test.describe('Tooltip — hidden until requested', () => {
  test('no tooltip is present before hover or focus', async ({ page }) => {
    const trigger = page.getByRole('button', { name: TOP });

    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
    await expect(trigger).not.toHaveAttribute('aria-describedby', /.+/);

    // Prove the absence is a starting state and not a broken widget.
    await trigger.hover();
    await expect(page.locator('[role="tooltip"]')).toHaveCount(1);
  });
});

test.describe('Tooltip — display on hover', () => {
  test('hovering a trigger shows its tooltip and describes the trigger', async ({ page }) => {
    const trigger = page.getByRole('button', { name: TOP });

    await trigger.hover();
    await expect(page.getByText(TOP_TEXT)).toBeVisible();
    await expectDescribedBy(page, trigger, TOP_TEXT);
  });

  test('moving the pointer away hides the tooltip again', async ({ page }) => {
    const trigger = page.getByRole('button', { name: BOTTOM });

    await trigger.hover();
    await expect(page.getByText(BOTTOM_TEXT)).toBeVisible();

    await page.mouse.move(0, 0);
    await expect(page.getByText(BOTTOM_TEXT)).toHaveCount(0);
    await expect(trigger).not.toHaveAttribute('aria-describedby', /.+/);
  });

  test('each trigger shows its own tooltip text', async ({ page }) => {
    const top = page.getByRole('button', { name: TOP });
    const bottom = page.getByRole('button', { name: BOTTOM });

    await top.hover();
    await expectDescribedBy(page, top, TOP_TEXT);

    await page.mouse.move(0, 0);
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);

    await bottom.hover();
    await expectDescribedBy(page, bottom, BOTTOM_TEXT);
  });
});

test.describe('Tooltip — display on focus', () => {
  // The APG requires the tooltip on focus as well as hover: a keyboard user who
  // never touches a mouse must get the same description. These tests reach the
  // trigger with real Tab presses rather than element.focus(), because a
  // trigger that cannot be tabbed to is exactly the bug worth catching.

  test('tabbing to a trigger shows its tooltip', async ({ page }) => {
    const trigger = page.getByRole('button', { name: TOP });

    const presses = await tabUntilFocused(page, trigger);
    expect(presses, 'the tooltip trigger must be reachable by Tab').toBeGreaterThan(0);

    await expect(page.getByText(TOP_TEXT)).toBeVisible();
    await expectDescribedBy(page, trigger, TOP_TEXT);
  });

  test('tabbing onward hides the old tooltip and shows the next one', async ({ page }) => {
    const top = page.getByRole('button', { name: TOP });
    const right = page.getByRole('button', { name: RIGHT });

    await tabUntilFocused(page, top);
    await expect(page.getByText(TOP_TEXT)).toBeVisible();

    await pressTab(page);
    expect(await isFocused(right), 'Tab should reach the next trigger').toBe(true);

    await expect(page.getByText(TOP_TEXT)).toHaveCount(0);
    await expect(page.getByText(RIGHT_TEXT)).toBeVisible();
    await expectDescribedBy(page, right, RIGHT_TEXT);
  });

  test('tabbing away from the last-described trigger clears the description', async ({ page }) => {
    const top = page.getByRole('button', { name: TOP });

    await tabUntilFocused(page, top);
    await expectDescribedBy(page, top, TOP_TEXT);

    await pressShiftTab(page);
    expect(await isFocused(top)).toBe(false);

    await expect(page.getByText(TOP_TEXT)).toHaveCount(0);
    await expect(top).not.toHaveAttribute('aria-describedby', /.+/);
  });

  test('the tooltip itself is not in the tab sequence', async ({ page }) => {
    // The APG is explicit that a tooltip never receives focus. If Tab landed
    // inside it, dismissing it would trap the user.
    const top = page.getByRole('button', { name: TOP });
    const right = page.getByRole('button', { name: RIGHT });

    await tabUntilFocused(page, top);
    await expect(page.locator('[role="tooltip"]')).toHaveCount(1);

    await pressTab(page);
    expect(await isFocused(right), 'Tab must skip the tooltip and reach the next trigger').toBe(
      true
    );
  });
});

test.describe('Tooltip — dismissal with Escape', () => {
  test('Escape hides a focus-triggered tooltip without moving focus', async ({ page }) => {
    // APG / WCAG 1.4.13: content shown on focus or hover must be dismissable
    // without moving the pointer or the focus, so that it cannot permanently
    // obscure whatever it covers.
    const trigger = page.getByRole('button', { name: TOP });

    await tabUntilFocused(page, trigger);
    await expect(page.getByText(TOP_TEXT)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByText(TOP_TEXT)).toHaveCount(0);
    await expect(trigger).not.toHaveAttribute('aria-describedby', /.+/);
    expect(await isFocused(trigger), 'Escape must leave focus on the trigger').toBe(true);
  });

  test('a dismissed tooltip comes back on the next focus', async ({ page }) => {
    const top = page.getByRole('button', { name: TOP });
    const right = page.getByRole('button', { name: RIGHT });

    await tabUntilFocused(page, top);
    await page.keyboard.press('Escape');
    await expect(page.getByText(TOP_TEXT)).toHaveCount(0);

    await pressTab(page);
    expect(await isFocused(right)).toBe(true);

    await tabUntilFocused(page, top);
    await expect(page.getByText(TOP_TEXT)).toBeVisible();
  });

  // KNOWN BUG — apg-react#157. Escape only dismisses the
  // focus-triggered tooltip. A tooltip opened by hover ignores Escape and stays
  // up until the pointer moves away. WCAG 1.4.13 (Content on Hover or Focus)
  // requires a mechanism to dismiss the content "without moving pointer hover
  // or keyboard focus" — a pointer user whose tooltip covers the text beneath
  // it has no way to get rid of it, which is the exact situation the criterion
  // was written for. The APG likewise lists Escape as dismissing the tooltip
  // without qualifying it by trigger.
  test('Escape hides a hover-triggered tooltip', async ({ page }) => {
    test.fail();
    const trigger = page.getByRole('button', { name: BOTTOM });

    await trigger.hover();
    await expect(page.getByText(BOTTOM_TEXT)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(
      page.getByText(BOTTOM_TEXT),
      'Escape must dismiss a hover-triggered tooltip'
    ).toHaveCount(0);
  });
});

test.describe('Tooltip — identity of concurrently shown tooltips', () => {
  // KNOWN BUG — apg-react#156. Every tooltip is rendered with
  // the same hard-coded id="tooltip-text". One at a time that is harmless, but
  // focus and hover are independent triggers, so focusing one button while
  // hovering another renders two elements sharing one id. Both triggers then
  // carry aria-describedby="tooltip-text", and getElementById returns the
  // first match for both — so the hovered button is announced with the
  // *focused* button's tooltip text. The user is read a description that
  // belongs to a different control.
  test('a hovered trigger is described by its own tooltip while another is focused', async ({
    page,
  }) => {
    test.fail();
    const top = page.getByRole('button', { name: TOP });
    const right = page.getByRole('button', { name: RIGHT });

    await tabUntilFocused(page, top);
    await expect(page.getByText(TOP_TEXT)).toBeVisible();

    await right.hover();
    await expect(page.getByText(RIGHT_TEXT)).toBeVisible();

    // Resolve aria-describedby the way a browser does, and demand it lands on
    // the right tooltip rather than the first one that happens to match.
    const resolved = await right.evaluate((el) => {
      const id = el.getAttribute('aria-describedby');
      const target = id && document.getElementById(id);
      return target && target.textContent;
    });
    expect(resolved, 'the hovered trigger must resolve to its own tooltip').toBe(RIGHT_TEXT);
  });

  test('tooltip ids stay unique when two tooltips are shown at once', async ({ page }) => {
    test.fail();
    const top = page.getByRole('button', { name: TOP });
    const right = page.getByRole('button', { name: RIGHT });

    await tabUntilFocused(page, top);
    await right.hover();
    await expect(page.locator('[role="tooltip"]')).toHaveCount(2);

    const ids = await page.locator('[role="tooltip"]').evaluateAll((els) => els.map((el) => el.id));
    expect(new Set(ids).size, `duplicate tooltip ids: ${ids.join(', ')}`).toBe(ids.length);
  });
});
