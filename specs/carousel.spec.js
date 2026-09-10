// @ts-check
/**
 * APG Carousel Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/carousel/
 *
 * Derived from apg-usecases `patterns/carousel/*.uc.yaml`:
 *   carousel-aria-roles-and-properties, carousel-automatic-rotation-control,
 *   carousel-keyboard-interaction, carousel-next-previous-navigation,
 *   carousel-rotation-control, carousel-selecting-specific-slide
 *
 * Not covered: `carousel-additional-types`. That use case describes the tabbed
 * carousel variant (slide pickers built as a tablist); this demo implements the
 * grouped/basic variant, where the pickers are plain buttons.
 *
 * ---------------------------------------------------------------------------
 * Timing note. This carousel auto-rotates, which would make naive assertions
 * flaky, so every test that inspects slides freezes rotation first via
 * `stopRotation()` below.
 *
 * That helper deliberately freezes rotation by moving *keyboard focus* into the
 * carousel rather than by clicking the rotation control. The APG requires focus
 * entry to stop rotation ("automatic slide rotation stops when any element in
 * the carousel receives keyboard focus"), so it is both a real requirement
 * worth asserting and the only deterministic way in. Clicking the control is
 * not: a pointer click first fires the carousel's hover/focus pause, which
 * relabels the control to "Resume auto-rotation", so the click that lands is
 * interpreted as a *resume* and the carousel is still rotating afterwards.
 * The rotation control's own toggle contract is covered separately, driven from
 * the keyboard once rotation is already stopped.
 * ---------------------------------------------------------------------------
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused, pressTab } = require('./support/apg');

const SLIDES = [
  'Grand Canyon National Park',
  'Yellowstone National Park',
  'Yosemite National Park',
  'Zion National Park',
  'Glacier National Park',
];

/** The rotation control renames itself, so match it on the stable half. */
const ROTATION = /auto-rotation/;

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'carousel');
});

/** A slide. Hidden slides drop out of the accessibility tree, which is the point. */
function slide(page, name) {
  return page.getByRole('group', { name });
}

/**
 * Move keyboard focus into the carousel and confirm that doing so stopped
 * automatic rotation, leaving the rest of the test on a still picture.
 */
async function stopRotation(page) {
  const region = page.getByRole('region', { name: 'Featured Products' });
  const presses = await tabUntilFocused(page, region);
  expect(presses, 'the carousel must be reachable by Tab').toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: ROTATION }),
    'focus entering the carousel must stop auto-rotation'
  ).toHaveAttribute('aria-label', 'Resume auto-rotation');
}

/** Assert exactly one slide is perceivable and it is the expected one. */
async function expectShowing(page, name) {
  await expect(slide(page, name)).toBeVisible();
  for (const other of SLIDES.filter((s) => s !== name)) {
    await expect(slide(page, other)).toBeHidden();
  }
}

test.describe('Carousel — roles and properties', () => {
  test('the carousel is a region with a carousel roledescription holding slide groups', async ({
    page,
  }) => {
    await stopRotation(page);

    const region = page.getByRole('region', { name: 'Featured Products' });
    await expect(region).toHaveAttribute('aria-roledescription', 'carousel');

    // Only the active slide may be perceivable; the rest must be really hidden,
    // not merely visually stacked behind it.
    await expectShowing(page, SLIDES[0]);

    await page.getByRole('button', { name: 'Next slide' }).click();
    await expectShowing(page, SLIDES[1]);
    await expect(
      slide(page, SLIDES[1]),
      'the newly revealed slide must still identify itself as a slide'
    ).toHaveAttribute('aria-roledescription', 'slide');
  });

  test('every carousel control is reachable by Tab', async ({ page }) => {
    await stopRotation(page);

    // Focus is on the carousel region; walking forward must reach each control
    // in turn rather than skipping any of them.
    const expected = [
      page.getByRole('button', { name: ROTATION }),
      page.getByRole('button', { name: 'Previous slide' }),
      page.getByRole('button', { name: 'Next slide' }),
      ...[1, 2, 3, 4, 5].map((n) => page.getByRole('button', { name: `Select slide ${n}` })),
    ];

    for (const control of expected) {
      await pressTab(page);
      expect(await isFocused(control), 'every carousel control must be in the Tab ring').toBe(true);
    }
  });
});

test.describe('Carousel — automatic rotation', () => {
  test('the rotation control toggles rotation and renames itself to match its next action', async ({
    page,
  }) => {
    await stopRotation(page);

    const control = page.getByRole('button', { name: ROTATION });
    await pressTab(page);
    expect(await isFocused(control), 'the rotation control must be the first Tab stop').toBe(true);

    // Rotation is stopped, so the control offers to resume. Activating it must
    // start rotation and flip the name to the action it now offers.
    await page.keyboard.press('Enter');
    await expect(control).toHaveAttribute('aria-label', 'Pause auto-rotation');

    await page.keyboard.press('Enter');
    await expect(control).toHaveAttribute('aria-label', 'Resume auto-rotation');
    await expectShowing(page, SLIDES[0]);
  });

  test('automatic rotation keeps advancing until the user stops it', async ({ page }) => {
    // The APG: rotation "does not restart unless the user explicitly requests
    // it to do so" — and by the same token must not stop by itself.
    // apg-react#150 had the interval callback call the component's own
    // stopRotation(), so the timer cancelled itself on its first tick: the
    // carousel advanced exactly once, then froze and relabelled its control to
    // "Resume auto-rotation" without the user asking. Fixed in v2.2.0, along
    // with the hover pause that had no resume counterpart (apg-react#161).
    //
    // Nothing here touches the mouse or the keyboard, so neither the hover
    // pause nor the focus-entry pause can affect what it observes.

    const control = page.getByRole('button', { name: ROTATION });
    await expect(control).toHaveAttribute('aria-label', 'Pause auto-rotation');
    await expectShowing(page, SLIDES[0]);

    // Asserting that the passage of time does *not* change state needs real
    // elapsed time; there is no event to wait for when the bug is that no
    // further event ever arrives.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(4_500);
    await expectShowing(page, SLIDES[1]);
    await expect(
      control,
      'rotation must still be running, so the control must still offer to pause'
    ).toHaveAttribute('aria-label', 'Pause auto-rotation');
  });
});

test.describe('Carousel — slide navigation', () => {
  test('Next slide advances and Previous slide goes back', async ({ page }) => {
    await stopRotation(page);
    await expectShowing(page, SLIDES[0]);

    await page.getByRole('button', { name: 'Next slide' }).click();
    await expectShowing(page, SLIDES[1]);

    await page.getByRole('button', { name: 'Next slide' }).click();
    await expectShowing(page, SLIDES[2]);

    await page.getByRole('button', { name: 'Previous slide' }).click();
    await expectShowing(page, SLIDES[1]);
    await expect(
      page.getByRole('button', { name: 'Select slide 2' }),
      'the picker must track slides moved to with next/previous'
    ).toHaveAttribute('aria-current', 'true');
  });

  test('Next from the last slide wraps forward and Previous from the first wraps back', async ({
    page,
  }) => {
    await stopRotation(page);

    await page.getByRole('button', { name: 'Select slide 5' }).click();
    await expectShowing(page, SLIDES[4]);
    await expect(page.getByRole('button', { name: 'Select slide 5' })).toHaveAttribute(
      'aria-current',
      'true'
    );

    await page.getByRole('button', { name: 'Next slide' }).click();
    await expectShowing(page, SLIDES[0]);

    await page.getByRole('button', { name: 'Previous slide' }).click();
    await expectShowing(page, SLIDES[4]);
  });

  test('the previous and next controls are operable from the keyboard', async ({ page }) => {
    await stopRotation(page);

    const next = page.getByRole('button', { name: 'Next slide' });
    await tabUntilFocused(page, next);
    expect(await isFocused(next), 'the next control must be reachable by Tab').toBe(true);
    await page.keyboard.press('Enter');
    await expectShowing(page, SLIDES[1]);

    const previous = page.getByRole('button', { name: 'Previous slide' });
    await tabUntilFocused(page, previous);
    expect(await isFocused(previous), 'the previous control must be reachable by Tab').toBe(true);
    await page.keyboard.press('Space');
    await expectShowing(page, SLIDES[0]);
  });

  test('a slide picker jumps straight to its slide and is marked as the current one', async ({
    page,
  }) => {
    await stopRotation(page);
    await expect(page.getByRole('button', { name: 'Select slide 1' })).toHaveAttribute(
      'aria-current',
      'true'
    );

    await page.getByRole('button', { name: 'Select slide 4' }).click();
    await expectShowing(page, SLIDES[3]);

    await expect(page.getByRole('button', { name: 'Select slide 4' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    await expect(
      page.getByRole('button', { name: 'Select slide 1' }),
      'aria-current must move to the displayed slide, not accumulate'
    ).not.toHaveAttribute('aria-current', 'true');
  });

  test('the picker for the slide already on screen is disabled', async ({ page }) => {
    // APG, grouped carousel: "Each picker button representing the currently
    // displayed slide has the property aria-disabled set to true."
    // apg-react#162 marked the current picker with aria-current only, so the
    // button still advertised itself as an available action that did nothing.
    // Fixed in v2.2.0.

    await stopRotation(page);
    await page.getByRole('button', { name: 'Select slide 3' }).click();
    await expectShowing(page, SLIDES[2]);

    await expect(page.getByRole('button', { name: 'Select slide 3' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
