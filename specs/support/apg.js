// @ts-check
/**
 * Helpers shared by the APG pattern specs.
 *
 * The rule these specs follow: drive the widget the way a keyboard user would
 * and assert what assistive technology would perceive. Nothing here sets focus
 * with `element.focus()` on the widget under test, because programmatic focus
 * hides exactly the class of bug these suites exist to catch — a control that
 * is unreachable by Tab still "focuses" fine from script.
 *
 * Two host tab-model differences would otherwise make the same correct page
 * fail on Firefox and WebKit. Both are handled here, in the harness, so the
 * assertions in the specs stay as strong as they are on Chromium:
 *
 *   - **A document needs a tab stop on either side of the widget.** Firefox
 *     parks focus at whichever end of the tab ring it reaches instead of
 *     cycling out through the document, so on a page whose only tab stop is
 *     the widget, "Tab leaves the widget" reads as "Tab stayed put" — and so
 *     does "Shift+Tab leaves it". `installTabSentinels` brackets `<body>` with
 *     two focusable elements, outside `#demo-root`, giving every engine a
 *     concrete place for focus to go in both directions. No widget markup is
 *     touched.
 *   - **Not every engine puts links in the plain-Tab ring.** WebKit follows the
 *     macOS "full keyboard access" default, where Tab visits form controls only
 *     and <kbd>Option</kbd>+<kbd>Tab</kbd> is what visits everything — which is
 *     what a Safari user on default settings actually presses. `pressTab`
 *     probes for that at runtime and sends whichever chord the host engine
 *     advances sequential focus with. Nothing is skipped or relaxed; the
 *     keyboard is just driven the way the host requires.
 *
 * See issue #4 for the failure this replaced.
 */
const { expect, test } = require('@playwright/test');

/** Marks the harness's own tab stop. Not part of any pattern under test. */
const SENTINEL_ATTRIBUTE = 'data-apg-tab-sentinel';

/**
 * Which key advances sequential focus, per engine. Resolved once per worker by
 * `resolveTabKeys`, keyed on the browser name so a mixed-project run cannot
 * cross-contaminate.
 */
const tabKeysByEngine = new Map();

/** Path to a pattern's demo page on the apg-react demo server. */
function demoPath(pattern) {
  return `/demos/${pattern}.html`;
}

/**
 * Bracket `<body>` with the harness's tab sentinels — one before the demo,
 * one after it.
 *
 * Both ends are needed, because Firefox parks focus at whichever end of the
 * tab ring it reaches. Without the trailing one, "Tab leaves the widget" reads
 * as "Tab stayed put"; without the leading one, so does "Shift+Tab leaves the
 * first trigger".
 *
 * A plain `<div tabindex="0">`, deliberately: every engine tested puts one in
 * the tab ring (including WebKit under the macOS keyboard-access default), and
 * it has no ARIA role, so `getByRole(...)` sweeps over the demo — "every button
 * on the page has an accessible name", say — cannot pick it up.
 *
 * The visible text is deliberate too. These show up in failure screenshots,
 * and a labelled element beats an anonymous empty one when you are trying to
 * work out why focus landed where it did.
 */
async function installTabSentinels(page) {
  await page.evaluate((attribute) => {
    if (document.querySelector(`[${attribute}]`)) {
      return;
    }
    const sentinel = (position, text) => {
      const el = document.createElement('div');
      el.setAttribute(attribute, position);
      el.setAttribute('tabindex', '0');
      el.textContent = text;
      return el;
    };
    document.body.prepend(sentinel('before', 'start of demo (test harness)'));
    document.body.append(sentinel('after', 'end of demo (test harness)'));
  }, SENTINEL_ATTRIBUTE);
}

/** The harness's tab stops, as locators. */
function tabSentinel(page, position = 'after') {
  return page.locator(`[${SENTINEL_ATTRIBUTE}="${position}"]`);
}

/**
 * Work out which chord moves sequential focus onto a link in this engine.
 *
 * The probe is a `<div tabindex="0">` followed by an `<a href>` appended to the
 * page: focus the div, press the candidate chord, and see whether the link took
 * focus. It answers the question by capability rather than by browser name, so
 * a WebKit build that does include links in the plain-Tab ring — a Linux CI
 * runner, a future default — is detected rather than assumed.
 *
 * This is the one place a spec-side `element.focus()` is legitimate: the
 * element focused is the harness's own scaffolding, never the widget.
 */
async function resolveTabKeys(page) {
  const engine = page.context().browser()?.browserType().name() ?? 'unknown';
  const cached = tabKeysByEngine.get(engine);
  if (cached) {
    return cached;
  }

  const candidates = [
    { tab: 'Tab', shiftTab: 'Shift+Tab' },
    { tab: 'Alt+Tab', shiftTab: 'Alt+Shift+Tab' },
  ];

  await page.evaluate(() => {
    const start = document.createElement('div');
    start.id = 'apg-tab-probe-start';
    start.setAttribute('tabindex', '0');
    const link = document.createElement('a');
    link.id = 'apg-tab-probe-link';
    link.href = '#apg-tab-probe';
    link.textContent = 'probe';
    document.body.append(start, link);
  });

  let resolved = null;
  for (const candidate of candidates) {
    await page.evaluate(() => document.getElementById('apg-tab-probe-start')?.focus());
    await page.keyboard.press(candidate.tab);
    const reachedLink = await page.evaluate(
      () => document.activeElement?.id === 'apg-tab-probe-link'
    );
    if (reachedLink) {
      resolved = candidate;
      break;
    }
  }

  await page.evaluate(() => {
    document.getElementById('apg-tab-probe-start')?.remove();
    document.getElementById('apg-tab-probe-link')?.remove();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  if (!resolved) {
    throw new Error(
      `No key sequence reaches a link in ${engine}: tried ${candidates
        .map((c) => c.tab)
        .join(', ')}. These specs cannot assert link reachability on this host.`
    );
  }

  tabKeysByEngine.set(engine, resolved);
  return resolved;
}

/**
 * Navigate to a pattern demo and wait for React to have mounted it.
 * The demo shell is an empty `#demo-root`, so waiting on the `<h1>` is what
 * separates "page arrived" from "widget exists".
 */
async function gotoPattern(page, pattern) {
  await page.goto(demoPath(pattern));
  await page.locator('#demo-root h1').waitFor({ state: 'visible' });
  await installTabSentinels(page);
  await resolveTabKeys(page);
}

/**
 * Return a description of the currently focused element: its role-ish tag, id,
 * and accessible name. Used to assert focus *moved somewhere specific* rather
 * than merely that some locator is `:focus`.
 */
async function activeElementInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) {
      return { tag: null, id: null, text: null, role: null };
    }
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      role: el.getAttribute('role'),
      text: (el.textContent || '').trim().slice(0, 80),
      label: el.getAttribute('aria-label'),
    };
  });
}

/** Advance sequential focus one stop, using this engine's chord for it. */
async function pressTab(page) {
  const { tab } = await resolveTabKeys(page);
  await page.keyboard.press(tab);
}

/** Move sequential focus back one stop, using this engine's chord for it. */
async function pressShiftTab(page) {
  const { shiftTab } = await resolveTabKeys(page);
  await page.keyboard.press(shiftTab);
}

/**
 * Press Tab from the document start until `locator` holds focus, giving up
 * after `max` presses.
 *
 * This is the honest way to assert "a keyboard user can reach this widget".
 * It returns the number of presses so a caller can also assert the control did
 * not swallow the whole tab ring.
 *
 * Counting starts from the leading sentinel, which is the first thing in
 * `<body>` and is not part of the demo. So a returned 1 still means what it
 * meant before the sentinels existed: this widget is the document's first
 * real tab stop.
 */
async function tabUntilFocused(page, locator, max = 25) {
  // Re-install rather than assume: a spec that navigates mid-test lands on a
  // fresh document with no sentinels, and waiting for one that will never
  // arrive turns a clear failure into a 30-second timeout. Idempotent.
  await installTabSentinels(page);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Home');
  await tabSentinel(page, 'before').evaluate((el) => el.focus());
  for (let i = 1; i <= max; i += 1) {
    await pressTab(page);
    if (await locator.evaluate((el) => el === document.activeElement).catch(() => false)) {
      return i;
    }
  }
  return -1;
}

/**
 * Locate an element by its id, without assuming the id is a usable bare CSS
 * selector.
 *
 * `#${id}` breaks the moment an implementation uses an id that is legal in HTML
 * but not legal unescaped in CSS — and that is not a corner case here. React's
 * own `useId()` produces ids like `:r0:`, so a perfectly conforming React
 * implementation would fail these specs with a selector parse error rather than
 * a meaningful assertion. The suite is published for exactly those
 * implementations to run against, so it has to survive their ids.
 *
 * An attribute selector with a quoted value sidesteps escaping entirely.
 * `JSON.stringify` supplies the quoting, and the two characters that would
 * break out of a CSS string — `"` and `\` — are the two it escapes.
 */
function byId(page, id) {
  return page.locator(`[id=${JSON.stringify(id)}]`);
}

/** True when `locator` is the document's active element. */
async function isFocused(locator) {
  return locator.evaluate((el) => el === document.activeElement);
}

/**
 * Assert that one Tab press moves focus out of `container` and onto a real
 * element elsewhere in the document.
 *
 * "Out, and onto something" is the whole assertion: a composite that is a
 * single tab stop must hand the next Tab straight to whatever follows it, not
 * walk its own members. The sentinel installed by `gotoPattern` guarantees
 * there is something to hand it to on every engine, so this reads the same way
 * on all three rather than depending on how the host cycles out of a document.
 *
 * A container that Tab dismisses outright — an open menu, say — counts as
 * exited: there is nothing left to be inside of.
 */
async function expectTabExits(page, container, message) {
  await pressTab(page);

  // Two or more matches is a bug in the caller's locator, not a widget defect.
  // Left to `evaluate`, it surfaces as an opaque strict-mode violation naming
  // neither the widget nor the assertion, so name it here instead.
  const matches = await container.count();
  expect(
    matches,
    `${message} — the container locator matched ${matches} elements; expected the one widget, or none if Tab dismissed it`
  ).toBeLessThanOrEqual(1);

  const inside =
    matches === 1 ? await container.evaluate((el) => el.contains(document.activeElement)) : false;
  const onBody = await page.evaluate(
    () => !document.activeElement || document.activeElement === document.body
  );

  expect(inside, message).toBe(false);
  expect(onBody, `${message} — and land on the next tab stop, not <body>`).toBe(false);
}

/**
 * Assert a roving-tabindex composite: exactly one member is tabbable (0) and
 * every other member is removed from the tab ring (-1).
 */
async function tabindexes(locator) {
  return locator.evaluateAll((els) => els.map((el) => el.getAttribute('tabindex')));
}

// The sentinel plumbing — installTabSentinels and tabSentinel — stays
// module-private. `gotoPattern` and `tabUntilFocused` are the only
// callers, and a spec that reaches for the sentinels directly is a spec
// asserting something about the harness rather than about the widget.
/**
 * Mark the current test as covering behaviour the APG treats as Optional, or
 * leaves entirely to the implementation. Call it as the first line of the body.
 *
 * Counterpart to `test.fail()`, which this suite uses for a known apg-react
 * defect. The two are not interchangeable:
 *
 *                      | implemented       | not implemented
 *   -------------------|-------------------|---------------------------------
 *   APG requires it    | ordinary test()   | test.fail() — a real defect
 *   APG marks optional | markOptional()    | document as not covered; no test
 *
 * The bottom-right cell has no marker on purpose. If the APG does not require
 * the behaviour and the component does not implement it, there is no gap to
 * track — marking it `test.fail` produces a test that turns RED against a
 * *conforming* implementation that does offer the optional key, which is the
 * same false-failure class this helper exists to prevent. See the type-ahead
 * note in `specs/menubar.spec.js` for a case that was exactly that.
 *
 * The test runs by default: the suite's primary target is the APG's own demos,
 * which do implement the optional behaviour, and keeping the default path
 * executing is what stops these bodies rotting. APG_REQUIRED_ONLY=1 skips it —
 * the mode for pointing this suite at a third-party widget.
 *
 *   test('Home moves to the first tab and End to the last', async ({ page }) => {
 *     markOptional('Tabs \u00a7 Keyboard Interaction — Home and End are marked "(Optional)"');
 *     …
 *   });
 *
 * NOTE ON SHAPE: the sibling suites wrap the whole test — `itOptional(title,
 * basis, fn)`. Playwright is deliberately different. A wrapper hides every
 * assertion from `playwright/no-standalone-expect`, which has no option to
 * teach it new test-block functions, and it bypasses `test.skip(condition,
 * reason)` — Playwright's own conditional-skip API, which puts the reason in
 * the report. Calling it in the body keeps the assertions inside a real
 * `test()` and uses the framework as intended.
 *
 * `basis` is required and must cite where the APG says this is optional. The
 * dangerous mistake here is not a vacuous test but a *mislabelled* one: marking
 * a genuine requirement optional silently weakens the suite and makes it report
 * "conforms" for a widget that does not. No runtime check can catch a misreading
 * of the spec, so the guard is forcing the citation to the call site.
 *
 * @param {string} basis  where the APG marks this optional
 */
function markOptional(basis) {
  if (typeof basis !== 'string' || !basis.trim()) {
    throw new Error(
      `markOptional() needs a basis citing where the APG marks this optional, ` +
        `e.g. 'Tabs \u00a7 Keyboard Interaction'. Without one there is nothing to ` +
        `check the claim against, and a requirement mislabelled as optional ` +
        `would be skipped in conformance runs.`
    );
  }

  test.skip(Boolean(process.env.APG_REQUIRED_ONLY), `APG-optional — ${basis}`);
}

module.exports = {
  markOptional,
  gotoPattern,
  activeElementInfo,
  pressTab,
  pressShiftTab,
  tabUntilFocused,
  isFocused,
  byId,
  expectTabExits,
  tabindexes,
};
