/**
 * Tests for scripts/osv-production.sh — the production-only OSV scan behind
 * `npm run security:osv` and security.yml's OSV-Scanner job.
 *
 * These pin what reaches the scanner, not the advisory database: a stub
 * `osv-scanner` on PATH records the lockfile it was handed and exits with a
 * chosen status, so the tests are offline and deterministic. That the real
 * scanner then fails on a production advisory was checked by hand when the
 * script was written (lodash 4.17.20 planted as a production entry: exit 1).
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'osv-production.sh');

const STUB = `#!/usr/bin/env bash
for arg in "$@"; do
  case "$arg" in --lockfile=*) cp "\${arg#--lockfile=}" "$OSV_STUB_CAPTURE" ;; esac
done
exit "$OSV_STUB_EXIT"
`;

const lockfile = (packages) => ({
  name: 'fixture',
  lockfileVersion: 3,
  requires: true,
  packages: { '': { name: 'fixture' }, ...packages },
});

describe('scripts/osv-production.sh', () => {
  let dir;
  let capture;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osv-production-'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'bin', 'osv-scanner'), STUB, { mode: 0o755 });
    capture = path.join(dir, 'scanned.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = (lock, stubExit = 0) => {
    const file = path.join(dir, 'package-lock.json');
    fs.writeFileSync(file, JSON.stringify(lock));
    return spawnSync('bash', [SCRIPT, file], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(dir, 'bin')}${path.delimiter}${process.env.PATH}`,
        OSV_STUB_CAPTURE: capture,
        OSV_STUB_EXIT: String(stubExit),
      },
    });
  };

  it('hands the scanner every entry except the dev-only ones', () => {
    const result = run(
      lockfile({
        'node_modules/prod': { version: '1.0.0' },
        'node_modules/opt': { version: '1.0.0', optional: true },
        'node_modules/both': { version: '1.0.0', devOptional: true },
        'node_modules/devonly': { version: '1.0.0', dev: true },
      })
    );
    assert.equal(result.status, 0, result.stderr);
    const scanned = JSON.parse(fs.readFileSync(capture, 'utf8'));
    assert.deepEqual(Object.keys(scanned.packages).sort(), [
      '',
      'node_modules/both',
      'node_modules/opt',
      'node_modules/prod',
    ]);
  });

  it('fails when the scanner reports a finding in production entries', () => {
    const result = run(lockfile({ 'node_modules/prod': { version: '1.0.0' } }), 1);
    assert.equal(result.status, 1);
  });

  it('does not swallow a scanner error when there is something to scan', () => {
    const result = run(lockfile({ 'node_modules/prod': { version: '1.0.0' } }), 128);
    assert.equal(result.status, 128);
  });

  it('passes without calling the scanner when every entry is dev-only', () => {
    const result = run(lockfile({ 'node_modules/devonly': { version: '1.0.0', dev: true } }), 1);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no production dependencies/);
    assert.equal(fs.existsSync(capture), false);
  });
});
