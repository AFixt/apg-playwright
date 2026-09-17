# apg-playwright

Sample [Playwright](https://playwright.dev/) specs for the [patterns](https://www.w3.org/WAI/ARIA/apg/patterns/) in the [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/).

Use them as a starting point for testing the accessibility of common widgets in your own application. Each spec drives the widget the way a keyboard user would and asserts what assistive technology would perceive.

## What these specs actually test

The specs are generated from [`AFixt/apg-usecases`](https://github.com/AFixt/apg-usecases), which holds one machine-readable scenario per APG behaviour, and are cross-checked against the published APG. Three rules keep them meaningful:

1. **Keyboard interaction is driven for real.** Specs reach a widget by pressing <kbd>Tab</kbd> from the top of the document, not by calling `element.focus()`. Programmatic focus hides an entire class of defect — a control that no keyboard user can reach still "focuses" fine from script. That distinction is not academic: it is how [apg-react#138](https://github.com/AFixt/apg-react/issues/138) was found, after a programmatic-focus suite had passed over it.
2. **State is asserted as perceived, not just as markup.** `aria-expanded="false"` is paired with an assertion that the panel is genuinely hidden. Either one alone can pass while the widget is broken.
3. **No axe-core.** These are hand-written behavioural assertions. Automated rule engines and pattern conformance answer different questions, and only the second one is this repo's job.

## Running the specs

The suite runs against the APG pattern demo pages published by [`AFixt/apg-react`](https://github.com/AFixt/apg-react). That repo is the system under test; this repo deliberately does not vendor a copy of it, so the demos can never silently drift from the components they exercise.

Start the demo server in one terminal:

```sh
git clone https://github.com/AFixt/apg-react.git
cd apg-react
nvm use && npm ci
npm run serve          # serves http://localhost:8080/demos/<pattern>.html
```

> Both workarounds that used to live here are gone as of apg-react v2.1.0
> (2026-08-25): the demo pages and the `serve` script reached `main`
> ([apg-react#168](https://github.com/AFixt/apg-react/issues/168)), and that
> repo's `.nvmrc` and `.node-version` now say `22`, matching its
> `engines.node` of `>=22.13.0`
> ([apg-react#149](https://github.com/AFixt/apg-react/issues/149)). A plain
> clone and a plain `nvm use` both work. This suite targets Node 22 too, so one
> version serves both repos.

Then run the suite in another:

```sh
nvm use && npm ci
npx playwright install
npm test
```

> **If Firefox fails every navigation with `NS_ERROR_NET_RESET`, the demo
> server is bound to IPv6 only.** `vite preview` binds `localhost` to `[::1]`
> alone unless told otherwise, and Firefox resolves `localhost` to
> `127.0.0.1`. Chromium tolerates it, so this only shows up once you run
> `npm run test:engines`. Serve with `--host ::`, or point `APG_BASE_URL` at a
> dual-stack address. The same applies if something else already holds IPv4
> port 8080 — Docker Desktop's proxy is a common culprit.

### Pointing the suite at your own application

Set `APG_BASE_URL` to a server that exposes one page per pattern at `/demos/<pattern>.html`:

```sh
APG_BASE_URL=https://staging.example.com npm test
```

Any implementation that follows the APG should pass these specs unchanged — that is the point of publishing them. In practice you will more often lift a single spec file into your own suite and repoint its locators; the assertions are the reusable part.

## Layout

| Path                   | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `specs/*.spec.js`      | One file per APG pattern                                        |
| `specs/support/apg.js` | Shared helpers — `pressTab`, `tabUntilFocused`, `tabindexes`, … |
| `playwright.config.js` | Chromium, Firefox and WebKit projects                           |

## Browser engines

`npm test` runs Chromium, which is the fast inner loop. `npm run test:engines` runs Chromium, Firefox and WebKit — the same specs, with the same assertions, green on all three.

Getting there took two adjustments in the harness rather than in the assertions, because the engines do not model the tab sequence identically:

- **WebKit does not put links in the plain-Tab ring.** It follows the macOS "full keyboard access" default, where <kbd>Tab</kbd> visits form controls and <kbd>Option</kbd>+<kbd>Tab</kbd> visits everything — which is what a Safari user on default settings actually presses. `pressTab()` probes for this at runtime, by focusing a scaffolding element and seeing which chord reaches a link, and then sends whichever one this host advances focus with. Nothing is skipped, and the probe asks about capability rather than browser name, so a WebKit build that does include links is detected rather than assumed.
- **Firefox parks focus at whichever end of the tab ring it reaches** instead of cycling out through the document. On a demo page whose only tab stop is the widget, "Tab leaves the widget" therefore read as "Tab stayed put" — and so did "Shift+Tab leaves the first trigger". `gotoPattern()` brackets `<body>` with two focusable `div[tabindex="0"]` sentinels, outside `#demo-root`, so focus always has somewhere real to go in both directions. No widget markup is touched, and the sentinels carry no ARIA role, so role-based locators in the specs cannot see them. `tabUntilFocused()` starts counting from the leading sentinel, so a press count of 1 still means "the document's first real tab stop".

Both live in `specs/support/apg.js`. The assertions the specs make — including "this composite is a single tab stop", the one that catches roving-tabindex regressions — are unchanged.

## Repository checks

The suite follows the AFixt standard tooling, so the same commands work here as in the sibling repos:

| Command                  | Checks                                                       |
| ------------------------ | ------------------------------------------------------------ |
| `npm run lint`           | ESLint, including the Playwright plugin's spec-hygiene rules |
| `npm run knip`           | Unused files, exports and dependencies (kept at zero)        |
| `npm run format:check`   | Prettier                                                     |
| `npm run markdownlint`   | Markdown                                                     |
| `npm run dupes`          | jscpd copy/paste detection, failing above 5% duplication     |
| `npm run license:check`  | Dependency licences against the allow-list                   |
| `npm run security:audit` | `npm audit` at `high` and above                              |
| `npm run check`          | lint + knip + format + markdown                              |
| `npm run check:all`      | `check` plus duplication and licences                        |

`.github/workflows/ci.yml` runs the linters, the duplication check, `npm audit` and the full three-engine suite on every pull request. `.github/workflows/security.yml` runs the slower scans — CodeQL, OSV-Scanner, Semgrep's OWASP Top 10 rules, and the licence check — on every pull request too. There is no Dependabot: dependency updates are raised by hand through the repository's own tooling, on demand.

Husky installs a pre-commit hook that runs ESLint, Prettier and markdownlint over staged files. Bypass it with `git commit --no-verify` when you need to.

## Reading a failure

`test.fail()` marks a spec that asserts correct APG behaviour the component does not yet implement, with the tracking issue named in a comment. Those specs are expected to fail today and will report as _unexpectedly passing_ the moment the underlying bug is fixed — which is the signal to remove the marker. A `test.fail()` is a tracked gap, never a silenced test.

## Patterns not covered

| Pattern           | Why                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alertdialog`     | The `AlertDialog` component cannot structurally express the confirm/cancel pattern — [apg-react#143](https://github.com/AFixt/apg-react/issues/143) |
| `window-splitter` | No component exists — [apg-react#140](https://github.com/AFixt/apg-react/issues/140)                                                                |

Hand-rolling either pattern inside a spec would produce a test that cannot fail, so neither is stubbed out here.

## Related

- [apg-gherkin](https://github.com/AFixt/apg-gherkin) — the same patterns as Gherkin features
- [apg-usecases](https://github.com/AFixt/apg-usecases) — machine-readable per-scenario source
- [apg-react](https://github.com/AFixt/apg-react) — the React implementation under test

## License

MIT

## Required vs optional behaviour

Every assertion sits somewhere on two axes: whether the APG _requires_ the
behaviour, and whether the widget under test _implements_ it. Each cell gets a
different treatment, and mixing them up produces tests that report a conforming
widget as broken.

|                        | implemented by the widget | not implemented                        |
| ---------------------- | ------------------------- | -------------------------------------- |
| **APG requires it**    | ordinary `test()`         | `test.fail()` — a real defect          |
| **APG marks optional** | `markOptional(basis)`     | documented in the spec header; no test |

`markOptional(basis)` is called as the first line of a test body:

```js
test('Home moves to the first tab and End to the last', async ({ page }) => {
  markOptional('Tabs § Keyboard Interaction — Home and End are marked "(Optional)"');
  // …ordinary assertions…
});
```

`basis` is required and must cite where the APG says so — a mislabelled
requirement is skipped in conformance runs and silently weakens the suite, and
no runtime check can catch a misreading of the spec, so the citation sits at the
call site where a reviewer sees it.

**The bottom-right cell deliberately has no marker.** If the APG does not
require the behaviour and the widget does not implement it, there is nothing to
assert and no defect to track. Marking it `test.fail` produces a test that turns
red against a _conforming_ implementation that does offer the optional key — see
the type-ahead note in [`specs/menubar.spec.js`](specs/menubar.spec.js), which
was exactly that mistake.

> **Why this differs from the sibling suites.** apg-cypress, apg-mocha,
> apg-jasmine, apg-jest and apg-nightwatch wrap the whole test —
> `itOptional(title, basis, fn)`. Playwright does not, for two reasons: a
> wrapper hides every assertion from `playwright/no-standalone-expect`, which
> has no option to teach it new test-block functions, and it bypasses
> `test.skip(condition, reason)`, Playwright's own conditional-skip API, which
> puts the reason in the report. Calling it in the body keeps assertions inside
> a real `test()` and uses the framework as intended. The semantics are
> identical.

### `APG_REQUIRED_ONLY=1`

Skips every test that calls `markOptional()`, so the run answers "does this
conform?" rather than "does this match the APG's example?":

```sh
APG_REQUIRED_ONLY=1 APG_BASE_URL=https://staging.example.com npm test
```

This is the mode for pointing the suite at your own widget. Without it, a widget
implementing only what the APG mandates is reported as failing — which is the
whole reason the flag exists. The run announces the mode before any result, and
Playwright reports the skips with their reason:

```text
14 skipped
301 passed
```
