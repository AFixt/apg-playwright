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

Then run the suite in another:

```sh
nvm use && npm ci
npx playwright install
npm test
```

### Pointing the suite at your own application

Set `APG_BASE_URL` to a server that exposes one page per pattern at `/demos/<pattern>.html`:

```sh
APG_BASE_URL=https://staging.example.com npm test
```

Any implementation that follows the APG should pass these specs unchanged — that is the point of publishing them. In practice you will more often lift a single spec file into your own suite and repoint its locators; the assertions are the reusable part.

## Layout

| Path                   | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `specs/*.spec.js`      | One file per APG pattern                                         |
| `specs/support/apg.js` | Shared helpers — `tabUntilFocused`, `isFocused`, `tabindexes`, … |
| `playwright.config.js` | Chromium, Firefox and WebKit projects                            |

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
