// @ts-check
/**
 * APG Feed Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/feed/
 *
 * Derived from apg-usecases `patterns/feed/*.uc.yaml`:
 *   feed-aria-roles-and-properties, feed-keyboard-navigation,
 *   feed-loading-on-scroll, feed-accessibility-and-usability
 *
 * Not covered: `feed-nested`. This demo renders a single flat feed, so there is
 * no inner feed whose navigation could be exercised independently.
 *
 * ---------------------------------------------------------------------------
 * Entering the feed. The APG's keyboard contract for a feed only applies "when
 * focus is inside the feed", and in this implementation every article carries
 * `tabindex="-1"`, so Tab never reaches one. That is asserted head-on (and
 * currently fails) in "the feed's articles are in the page Tab sequence"; the
 * remaining keyboard tests get in by clicking an article, which is a real user
 * gesture and does focus a `tabindex="-1"` element. No test here sets focus
 * programmatically.
 * ---------------------------------------------------------------------------
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused, activeElementInfo } = require('./support/apg');

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'feed');
  // The first batch arrives asynchronously; nothing below is meaningful until
  // the feed has settled.
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.getByRole('feed', { name: 'News' })).toHaveAttribute('aria-busy', 'false');
});

/** An article, addressed by the heading text inside it. */
function article(page, title) {
  return page.getByRole('article').filter({ hasText: title });
}

test.describe('Feed — roles, states, and properties', () => {
  test('each article reports its position and the whole set reports the same size', async ({
    page,
  }) => {
    const articles = page.getByRole('article');

    const positions = await articles.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-posinset'))
    );
    expect(positions).toEqual(['1', '2', '3', '4', '5']);

    const sizes = await articles.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-setsize'))
    );
    expect(sizes, 'every article must agree on how big the feed is').toEqual([
      '5',
      '5',
      '5',
      '5',
      '5',
    ]);

    // Position claims are only worth anything if they describe the article a
    // user actually reaches, so land on one and read it back.
    await article(page, 'Article 3').click();
    expect(await isFocused(article(page, 'Article 3'))).toBe(true);
    await expect(article(page, 'Article 3')).toHaveAttribute('aria-posinset', '3');
  });

  test('loading more articles marks the feed busy and renumbers the whole set', async ({
    page,
  }) => {
    const feed = page.getByRole('feed', { name: 'News' });
    const articles = page.getByRole('article');

    // Record aria-busy transitions rather than sampling them, so the assertion
    // does not depend on catching a ~400ms window at the right moment.
    await page.evaluate(() => {
      window.__busyLog = [];
      const el = document.querySelector('[role="feed"]');
      new MutationObserver(() => window.__busyLog.push(el.getAttribute('aria-busy'))).observe(el, {
        attributes: true,
        attributeFilter: ['aria-busy'],
      });
    });

    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(articles).toHaveCount(6);
    await expect(article(page, 'Article 6')).toBeVisible();

    expect(
      await page.evaluate(() => window.__busyLog),
      'the feed must announce itself busy for the duration of the load'
    ).toEqual(['true', 'false']);
    await expect(feed).toHaveAttribute('aria-busy', 'false');

    const sizes = await articles.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-setsize'))
    );
    expect(sizes, 'aria-setsize must be updated on every article, not just the new one').toEqual(
      Array(6).fill('6')
    );

    const positions = await articles.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-posinset'))
    );
    expect(positions, 'the new article must be numbered on the end of the set').toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
  });

  test('each article is labelled by its own heading', async ({ page }) => {
    // APG: the article element carries "aria-labelledby referring to elements
    // inside the article that can serve as a distinguishing label". The demo
    // gives each heading an id for exactly this purpose but never references
    // it, so every article reaches assistive technology as an unnamed article
    // and the feed reads as five identical landmarks.
    // KNOWN GAP — apg-react#160.
    test.fail();

    await article(page, 'Article 2').click();
    expect(await isFocused(article(page, 'Article 2'))).toBe(true);

    await expect(article(page, 'Article 2')).toHaveAttribute('aria-labelledby', 'article-title-2');
  });
});

test.describe('Feed — keyboard navigation', () => {
  test("the feed's articles are in the page Tab sequence", async ({ page }) => {
    // The APG's feed example makes each article `tabindex="0"` so that "the
    // article element [is] focusable and included in the page Tab sequence".
    // Here every article is `tabindex="-1"`, so Tab skips the entire feed and
    // lands on the "Load more" button — a keyboard-only user can never put
    // focus inside the feed, and the whole Page Up / Page Down contract below
    // is unreachable for them.
    // KNOWN GAP — apg-react#159.
    test.fail();

    const presses = await tabUntilFocused(page, article(page, 'Article 1'));
    expect(presses, 'Tab must be able to reach the first article').toBeGreaterThan(0);
  });

  test('Page Down moves focus to the next article and Page Up to the previous one', async ({
    page,
  }) => {
    await article(page, 'Article 1').click();
    expect(await isFocused(article(page, 'Article 1'))).toBe(true);

    await page.keyboard.press('PageDown');
    expect(await isFocused(article(page, 'Article 2'))).toBe(true);

    await page.keyboard.press('PageDown');
    expect(await isFocused(article(page, 'Article 3'))).toBe(true);

    await page.keyboard.press('PageUp');
    expect(await isFocused(article(page, 'Article 2'))).toBe(true);
  });

  test('Page Down on the last article and Page Up on the first leave focus where it is', async ({
    page,
  }) => {
    await article(page, 'Article 5').click();
    await page.keyboard.press('PageDown');
    expect(await isFocused(article(page, 'Article 5')), 'there is no next article to move to').toBe(
      true
    );

    await article(page, 'Article 1').click();
    await page.keyboard.press('PageUp');
    expect(
      await isFocused(article(page, 'Article 1')),
      'there is no previous article to move to'
    ).toBe(true);
  });

  test('Ctrl+End moves focus to the first focusable element after the feed', async ({ page }) => {
    // APG: "Control + End: Move focus to the first focusable element after the
    // feed." On this page that is the "Load more" button. The component reads
    // `event.key` without checking `ctrlKey` for End, so Ctrl+End is handled as
    // a plain End and focus stays on the last article — the feed has no exit
    // key at all.
    // KNOWN GAP — apg-react#159 (Ctrl+End half of that issue).
    test.fail();

    await article(page, 'Article 2').click();
    expect(await isFocused(article(page, 'Article 2'))).toBe(true);

    await page.keyboard.press('Control+End');
    expect(await isFocused(page.getByRole('button', { name: 'Load more' }))).toBe(true);
  });

  test('keys the feed does not claim leave focus on the article', async ({ page }) => {
    // The feed must not swallow keys it has no contract for: a stray letter has
    // to leave focus exactly where the reader put it.
    await article(page, 'Article 4').click();
    await page.keyboard.press('a');

    const info = await activeElementInfo(page);
    expect(info.tag, 'an unhandled key must not move focus out of the article').toBe('article');
    expect(await isFocused(article(page, 'Article 4'))).toBe(true);
  });
});
