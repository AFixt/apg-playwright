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
 * The feed extends itself. This is an infinite-scroll feed: an
 * IntersectionObserver on the end-of-content sentinel loads another batch
 * whenever the sentinel is fully in view, and on a viewport the initial batch
 * does not fill, that happens on its own — no scroll gesture, no "Load more"
 * click. The article count is therefore never a fixture; it is 5 at first and
 * grows until the content overflows the viewport, and scrolling the end back
 * into view (which clicking the last article does) grows it again.
 *
 * So nothing here asserts a particular number of articles. The tests assert
 * the pattern's contract instead: the set is internally consistent at every
 * snapshot (posinset 1..n, every setsize === n), loading marks the feed busy,
 * the set grows when its end is reached, and "first"/"last" are derived from
 * the feed at the moment they are used rather than named. See issue #10.
 *
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
  // the feed has delivered it. Both checks are needed: `aria-busy` is also
  // "false" before the first load has even started.
  await expect(page.getByRole('article')).not.toHaveCount(0);
  await expect(page.getByRole('feed', { name: 'News' })).toHaveAttribute('aria-busy', 'false');
});

/**
 * An article, addressed by its heading. Matched exactly: once the feed has
 * grown past nine articles, a substring match on "Article 1" would also pick
 * up "Article 10" and the locator would stop being unique.
 */
function article(page, title) {
  return page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

/**
 * One consistent snapshot of every article's `aria-posinset` / `aria-setsize`.
 * Read in a single `evaluateAll` so the numbers all come from the same render,
 * not from before and after a batch landed.
 */
function readSetNumbering(articles) {
  return articles.evaluateAll((els) => ({
    count: els.length,
    positions: els.map((el) => el.getAttribute('aria-posinset')),
    sizes: els.map((el) => el.getAttribute('aria-setsize')),
  }));
}

/**
 * The APG's contract for a feed of `n` articles: positions run 1..n and every
 * article agrees that the set is `n` long. Holds at every size, so it can be
 * checked whenever the feed happens to be, without knowing how big it is.
 */
function expectConsistentNumbering({ count, positions, sizes }) {
  expect(count, 'the feed must hold at least one article').toBeGreaterThan(0);
  expect(positions, 'aria-posinset must number the articles 1..n in order').toEqual(
    Array.from({ length: count }, (_, i) => String(i + 1))
  );
  expect(sizes, 'every article must agree on how big the feed is').toEqual(
    Array(count).fill(String(count))
  );
}

test.describe('Feed — roles, states, and properties', () => {
  test('each article reports its position and the whole set reports the same size', async ({
    page,
  }) => {
    const articles = page.getByRole('article');

    expectConsistentNumbering(await readSetNumbering(articles));

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

    const before = await articles.count();
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect
      .poll(() => articles.count(), { message: 'reaching the end of the feed must load more' })
      .toBeGreaterThan(before);
    await expect(feed).toHaveAttribute('aria-busy', 'false');

    // The observer may have caught more than one batch if the feed was still
    // auto-extending, so check the shape of the log rather than its length:
    // it must start by going busy, alternate cleanly, and end not busy.
    const busyLog = await page.evaluate(() => window.__busyLog);
    expect(busyLog[0], 'the feed must announce itself busy when a load starts').toBe('true');
    expect(busyLog.at(-1), 'the feed must clear aria-busy once the load completes').toBe('false');
    expect(
      busyLog.filter((state, i) => state === busyLog[i - 1]),
      'aria-busy must alternate true/false, one pair per batch'
    ).toEqual([]);

    // Every article, not just the new ones, must have been renumbered.
    const after = await readSetNumbering(articles);
    expect(after.count).toBeGreaterThan(before);
    expectConsistentNumbering(after);
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

  test('Page Down on the last article and Page Up on the first leave focus in place', async ({
    page,
  }) => {
    const articles = page.getByRole('article');

    // Clicking the last article scrolls it into view, which brings the
    // end-of-content sentinel into view too and very likely loads another
    // batch. So "the last article" cannot be named up front; assert the
    // contract instead — after Page Down, focus is on whichever article is
    // last *now* — and read that from the article's own numbering.
    await articles.last().click();
    await page.keyboard.press('PageDown');

    const info = await activeElementInfo(page);
    expect(info.tag, 'Page Down must not move focus out of the feed').toBe('article');
    const focused = page.locator(':focus');
    const [posinset, setsize] = await focused.evaluate((el) => [
      el.getAttribute('aria-posinset'),
      el.getAttribute('aria-setsize'),
    ]);
    expect(posinset, 'there is no next article to move to').toBe(setsize);

    await articles.first().click();
    await page.keyboard.press('PageUp');
    expect(await isFocused(articles.first()), 'there is no previous article to move to').toBe(true);
  });

  test('Ctrl+End is treated as a plain End, so the feed has no exit key', async ({ page }) => {
    // APG: "Control + End: Move focus to the first focusable element after the
    // feed." On this page that is the "Load more" button. `Feed.tsx`'s
    // handleKeyDown switches on `event.key` with no `ctrlKey` check, so
    // Ctrl+End is handled as a plain End: focus lands on the last article and
    // never leaves the feed.
    // KNOWN GAP — apg-react#159 (Ctrl+End half of that issue).
    //
    // Asserted positively rather than with `test.fail()`. A `test.fail()` here
    // can flake in the *passing* direction under host load, and Playwright then
    // reports "Expected to fail, but passed" — turning a green suite red with a
    // message that reads like the upstream bug was fixed, whose natural
    // response is to delete the marker and silently drop the coverage (#22).
    //
    // The pair below is what keeps the signal: the first records what the
    // component does today, and the second fails the day apg-react#159 ships
    // and says what to do about it.
    const articles = page.getByRole('article');
    await article(page, 'Article 2').click();
    expect(await isFocused(article(page, 'Article 2'))).toBe(true);

    await page.keyboard.press('Control+End');

    // Checked first, so this is the message a reader sees the day it changes,
    // rather than the descriptive one below.
    expect(
      await isFocused(page.getByRole('button', { name: 'Load more' })),
      'apg-react#159 has shipped — Ctrl+End now exits the feed. Rewrite this test to assert the APG behaviour and drop the KNOWN GAP note.'
    ).toBe(false);
    expect(
      await isFocused(articles.last()),
      'Ctrl+End is handled as a plain End, so focus lands on the last article'
    ).toBe(true);
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
