/**
 * Tests for scripts/check-codeql-sarif.sh — the CodeQL gate that the security
 * workflow's `codeql` job and `npm run security:codeql` both run (#62).
 *
 * Each case writes SARIF into a throwaway directory, runs the real script
 * against it, and asserts on the exit code, since that is what the job and
 * the npm script react to. The rule table mirrors what CodeQL actually emits:
 * rules live in tool.driver.rules with a defaultConfiguration.level and a
 * string security-severity property.
 *
 * Skipped when jq is not installed, since the script cannot run without it.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-codeql-sarif.sh');

const hasJq = spawnSync('jq', ['--version']).status === 0;
const skip = hasJq ? false : 'jq is not installed';

/**
 * rules[0] is an error-level rule with low security-severity, rules[1] a
 * note, rules[2] a warning with a high security-severity — the shape an
 * error-only gate lets through — and rules[3] a warning just under High.
 */
const RULES = [
  {
    id: 'js/error-rule',
    defaultConfiguration: { level: 'error' },
    properties: { 'security-severity': '5.0' },
  },
  { id: 'js/note-rule', defaultConfiguration: { level: 'note' } },
  {
    id: 'js/high-warning',
    defaultConfiguration: { level: 'warning' },
    properties: { 'security-severity': '7.5' },
  },
  {
    id: 'js/medium-warning',
    defaultConfiguration: { level: 'warning' },
    properties: { 'security-severity': '6.9' },
  },
];

const directories = [];

/** Write each run's results to its own SARIF file in a fresh directory. */
function sarifDirectory(...runs) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-gate-'));
  directories.push(directory);
  runs.forEach((results, index) => {
    const log = { version: '2.1.0', runs: [{ tool: { driver: { rules: RULES } }, results }] };
    fs.writeFileSync(path.join(directory, `run-${index}.sarif`), JSON.stringify(log));
  });
  return directory;
}

/** Run the gate against a directory; return its exit status and output. */
function gate(directory) {
  const run = spawnSync('bash', [SCRIPT, directory], { encoding: 'utf8' });
  return { status: run.status, output: run.stdout + run.stderr };
}

after(() => {
  for (const directory of directories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('check-codeql-sarif.sh', { skip }, () => {
  it('passes when there are no results', () => {
    const run = gate(sarifDirectory([]));
    assert.match(run.output, /threshold: 0/);
    assert.equal(run.status, 0);
  });

  it('fails closed when the directory holds no SARIF', () => {
    const run = gate(sarifDirectory());
    assert.match(run.output, /nothing was checked/);
    assert.equal(run.status, 1);
  });

  it("fails on a result's own error level", () => {
    assert.equal(gate(sarifDirectory([{ ruleId: 'js/note-rule', level: 'error' }])).status, 1);
  });

  it('fails on a warning whose rule is High security-severity, and names it', () => {
    const run = gate(
      sarifDirectory([
        {
          ruleId: 'js/high-warning',
          ruleIndex: 2,
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: 'specs/a.spec.js' },
                region: { startLine: 12 },
              },
            },
          ],
        },
      ])
    );
    assert.equal(run.status, 1);
    assert.match(run.output, /js\/high-warning .*specs\/a\.spec\.js:12/);
  });

  it('passes a warning just under High, and a note', () => {
    assert.equal(gate(sarifDirectory([{ ruleId: 'js/medium-warning', ruleIndex: 3 }])).status, 0);
    assert.equal(gate(sarifDirectory([{ ruleId: 'js/note-rule', ruleIndex: 1 }])).status, 0);
  });

  it("takes the rule by index, never rules[0]'s level", () => {
    assert.equal(gate(sarifDirectory([{ ruleId: 'js/note-rule', rule: { index: 1 } }])).status, 0);
    assert.equal(gate(sarifDirectory([{ ruleId: 'js/error-rule', ruleIndex: 0 }])).status, 1);
  });

  it("takes the index into the extension the result names, not the driver's rules", () => {
    const directory = sarifDirectory();
    const extensionRules = [
      { id: 'js/ext-note', defaultConfiguration: { level: 'note' } },
      {
        id: 'js/ext-high',
        defaultConfiguration: { level: 'warning' },
        properties: { 'security-severity': '8.1' },
      },
    ];
    const log = {
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { rules: RULES }, extensions: [{ rules: extensionRules }] },
          results: [
            // Index 0 in the driver is the error rule; in the extension it is a note.
            { ruleId: 'js/ext-note', rule: { index: 0, toolComponent: { index: 0 } } },
          ],
        },
      ],
    };
    fs.writeFileSync(path.join(directory, 'ext.sarif'), JSON.stringify(log));
    assert.equal(gate(directory).status, 0);
    log.runs[0].results = [
      { ruleId: 'js/ext-high', rule: { index: 1, toolComponent: { index: 0 } } },
    ];
    fs.writeFileSync(path.join(directory, 'ext.sarif'), JSON.stringify(log));
    assert.equal(gate(directory).status, 1);
  });

  it('looks the rule up by id when the result carries no index', () => {
    assert.equal(gate(sarifDirectory([{ ruleId: 'js/error-rule' }])).status, 1);
    assert.equal(gate(sarifDirectory([{ ruleId: 'js/high-warning' }])).status, 1);
    assert.equal(gate(sarifDirectory([{ ruleId: 'js/note-rule' }])).status, 0);
  });

  it('defaults an unknown rule to a warning with no severity, which passes', () => {
    assert.equal(gate(sarifDirectory([{ ruleId: 'js/unknown-rule' }])).status, 0);
  });

  it('counts findings across every SARIF file in the directory', () => {
    const run = gate(
      sarifDirectory([], [{ ruleId: 'js/error-rule' }], [{ ruleId: 'js/high-warning' }])
    );
    assert.equal(run.status, 1);
    assert.match(run.output, /threshold: 2/);
  });

  it('does not pass malformed SARIF', () => {
    const directory = sarifDirectory();
    fs.writeFileSync(path.join(directory, 'broken.sarif'), '{ not json');
    assert.notEqual(gate(directory).status, 0);
  });
});
