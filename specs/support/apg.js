// @ts-check
/**
 * Helpers shared by the APG pattern specs.
 *
 * The rule these specs follow: drive the widget the way a keyboard user would
 * and assert what assistive technology would perceive. Nothing here sets focus
 * with `element.focus()` on the widget under test, because programmatic focus
 * hides exactly the class of bug these suites exist to catch — a control that
 * is unreachable by Tab still "focuses" fine from script.
 */

/** Path to a pattern's demo page on the apg-react demo server. */
function demoPath(pattern) {
  return `/demos/${pattern}.html`;
}

/**
 * Navigate to a pattern demo and wait for React to have mounted it.
 * The demo shell is an empty `#demo-root`, so waiting on the `<h1>` is what
 * separates "page arrived" from "widget exists".
 */
async function gotoPattern(page, pattern) {
  await page.goto(demoPath(pattern));
  await page.locator('#demo-root h1').waitFor({ state: 'visible' });
}

/**
 * Return a description of the currently focused element: its role-ish tag, id,
 * and accessible name. Used to assert focus *moved somewhere specific* rather
 * than merely that some locator is `:focus`.
 */
async function activeElementInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: null, id: null, text: null, role: null };
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      role: el.getAttribute('role'),
      text: (el.textContent || '').trim().slice(0, 80),
      label: el.getAttribute('aria-label'),
    };
  });
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
    await page.keyboard.press('Tab');
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
  tabUntilFocused,
  isFocused,
  tabindexes,
};
