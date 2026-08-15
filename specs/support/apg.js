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
 *   - **A document needs a tab stop after the widget.** Firefox parks focus on
 *     the last tabbable element instead of cycling out through the document,
 *     so on a page whose only tab stop is the widget, "Tab leaves the widget"
 *     reads as "Tab stayed put". `installTabSentinel` appends one focusable
 *     element to `<body>`, outside `#demo-root`, giving every engine a
 *     concrete place for focus to go. No widget markup is touched.
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
const { expect } = require('@playwright/test');

/** Marks the harness's own tab stop. Not part of any pattern under test. */
const SENTINEL_ATTRIBUTE = 'data-apg-tab-sentinel';
const SENTINEL_SELECTOR = `[${SENTINEL_ATTRIBUTE}]`;

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
 * Append the harness's tab sentinel to the end of `<body>`.
 *
 * A plain `<div tabindex="0">`, deliberately: every engine tested puts one in
 * the tab ring (including WebKit under the macOS keyboard-access default), and
 * it has no ARIA role, so `getByRole(...)` sweeps over the demo — "every button
 * on the page has an accessible name", say — cannot pick it up.
 */
async function installTabSentinel(page) {
  await page.evaluate((attribute) => {
    if (document.querySelector(`[${attribute}]`)) {
      return;
    }
    const sentinel = document.createElement('div');
    sentinel.setAttribute(attribute, 'after');
    sentinel.setAttribute('tabindex', '0');
    sentinel.textContent = 'end of demo (test harness)';
    document.body.append(sentinel);
  }, SENTINEL_ATTRIBUTE);
}

/** The harness's tab stop, as a locator. */
function tabSentinel(page) {
  return page.locator(SENTINEL_SELECTOR);
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
  await installTabSentinel(page);
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
 */
async function tabUntilFocused(page, locator, max = 25) {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Home');
  for (let i = 1; i <= max; i += 1) {
    await pressTab(page);
    if (await locator.evaluate((el) => el === document.activeElement).catch(() => false)) {
      return i;
    }
  }
  return -1;
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

  const stillRendered = (await container.count()) > 0;
  const inside = stillRendered
    ? await container.evaluate((el) => el.contains(document.activeElement))
    : false;
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

module.exports = {
  demoPath,
  gotoPattern,
  activeElementInfo,
  installTabSentinel,
  tabSentinel,
  pressTab,
  pressShiftTab,
  tabUntilFocused,
  isFocused,
  expectTabExits,
  tabindexes,
  SENTINEL_SELECTOR,
};
