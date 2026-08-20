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
git clone --branch develop https://github.com/AFixt/apg-react.git
cd apg-react
nvm use 22 && npm ci   # NOT `nvm use` — see the note below
npm run serve          # serves http://localhost:8080/demos/<pattern>.html
```

> **Clone `develop`, not the default branch.** The demo pages and the `serve`
> script live on apg-react's `develop` branch and have not reached `main` yet,
> so a plain `git clone` lands on a checkout with no `npm run serve` at all.
>
> **Use Node 22 for apg-react, not its `.nvmrc`.** That repo pins `.nvmrc` to
> `20` while its `package.json` requires `>=22.13.0` with `engine-strict=true`,
> so the documented `nvm use && npm ci` fails with `EBADENGINE`. Tracked as
> [apg-react#149](https://github.com/AFixt/apg-react/issues/149). This suite
> also targets Node 22 so a single version serves both repos.

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
| `npm run format:check`   | Prettier                                                     |
| `npm run markdownlint`   | Markdown                                                     |
| `npm run dupes`          | jscpd copy/paste detection, failing above 5% duplication     |
| `npm run license:check`  | Dependency licences against the allow-list                   |
| `npm run security:audit` | `npm audit` at `high` and above                              |
| `npm run check`          | lint + format + markdown                                     |
| `npm run check:all`      | `check` plus duplication and licences                        |

`.github/workflows/ci.yml` runs the linters, the duplication check, `npm audit` and the full three-engine suite on every pull request. `.github/workflows/security.yml` runs the slower scans — CodeQL, OSV-Scanner, Semgrep's OWASP Top 10 rules, and the licence check — every Monday. Dependabot opens grouped dependency PRs weekly.

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
