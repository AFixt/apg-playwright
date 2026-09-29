/**
 * Tests for scripts/run-trufflehog.sh — the secret scan the pre-commit hook
 * runs as `TRUFFLEHOG_MODE=staged` (#54, a port of AFixt/shareable#191).
 *
 * The hook used to run `trufflehog git file://. --since-commit HEAD`, which
 * (a) scanned no staged content at all, because a staged change is not a
 * commit yet, and (b) errored in a git worktree, where `.git` is a pointer
 * file. These drive the real script against throwaway fixture repositories —
 * a normal checkout and a worktree of it — and assert on the exit code, which
 * is what the hook reacts to: 183 is trufflehog's "found something" under
 * --fail, 0 is clean, anything else is a scan that did not work.
 *
 * The canary is a random GitHub-token-shaped string built at run time, so no
 * credential-shaped literal lives in this file. It is not a real token; it can
 * never verify, so the tests widen the result filter with TRUFFLEHOG_RESULTS
 * instead of relying on the hook's --only-verified default. What is under test
 * is whether the staged content reaches the scanner at all.
 *
 * This repo's Playwright runner is for the APG specs only, so these use the
 * built-in node:test runner: `npm run test:scripts`. Skipped when trufflehog
 * is not installed, exactly as the script itself skips.
 */

const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'run-trufflehog.sh');
const FOUND = 183;

const hasTrufflehog = spawnSync('trufflehog', ['--version'], { encoding: 'utf8' }).status === 0;
const skip = hasTrufflehog ? false : 'trufflehog is not installed';

/** A fresh, random, never-valid GitHub-PAT-shaped string. */
function canary() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const body = Array.from(randomBytes(36), (b) => alphabet[b % alphabet.length]).join('');
  return `ghp_${body}`;
}

/**
 * `process.env` with the variables git uses to locate a repository removed.
 *
 * If this suite ever runs inside a hook or wrapper that has GIT_DIR,
 * GIT_WORK_TREE, GIT_INDEX_FILE, GIT_COMMON_DIR or GIT_OBJECT_DIRECTORY set,
 * those take precedence over `cwd` for every git invocation below — a
 * fixture-scoped `git init`/`add`/`commit`/`worktree add` would silently
 * operate on whatever repo the inherited variables name instead of the
 * throwaway fixture, up to and including writing commits with the fixture's
 * fake identity into a real repository. Stripping them here is what makes
 * `cwd` the sole source of truth for every spawn in this file.
 */
function isolatedEnv(extra = {}) {
  const env = { ...process.env };
  for (const name of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  ]) {
    delete env[name];
  }
  return { ...env, ...extra };
}

/** Run git in `cwd`, isolated from the user's global hooks and signing. */
function git(cwd, ...args) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.com',
      ...args,
    ],
    { cwd, encoding: 'utf8', env: isolatedEnv() }
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/** Run the script under test in `cwd` and return its exit status and output. */
function scan(cwd, mode) {
  const result = spawnSync('bash', [SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: isolatedEnv({
      TRUFFLEHOG_MODE: mode,
      TRUFFLEHOG_RESULTS: 'unknown,unverified',
    }),
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('run-trufflehog.sh', { skip, timeout: 60_000 }, () => {
  let root;
  let checkout;
  let worktree;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'trufflehog-gate-'));
    checkout = path.join(root, 'checkout');
    worktree = path.join(root, 'worktree');
    fs.mkdirSync(checkout);
    git(checkout, 'init', '-q');
    fs.writeFileSync(path.join(checkout, 'README.md'), 'fixture\n');
    git(checkout, 'add', 'README.md');
    git(checkout, 'commit', '-q', '-m', 'init');
    git(checkout, 'worktree', 'add', '-q', worktree, '-b', 'review');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the fixture worktree really has a .git pointer file', () => {
    assert.equal(fs.statSync(path.join(worktree, '.git')).isFile(), true);
  });

  for (const [label, dir] of [
    ['a normal checkout', () => checkout],
    ['a git worktree', () => worktree],
  ]) {
    describe(`staged mode in ${label}`, () => {
      it('catches a staged canary', () => {
        const cwd = dir();
        fs.writeFileSync(path.join(cwd, 'config.txt'), `token = "${canary()}"\n`);
        git(cwd, 'add', 'config.txt');

        const { status, output } = scan(cwd, 'staged');

        assert.doesNotMatch(output, /not a directory/);
        assert.equal(status, FOUND, output);
      });

      it('scans the staged version, not the working tree', () => {
        const cwd = dir();
        fs.writeFileSync(path.join(cwd, 'config.txt'), 'token = "placeholder"\n');
        git(cwd, 'add', 'config.txt');
        // Unstaged edit: this is not what the commit would contain.
        fs.writeFileSync(path.join(cwd, 'config.txt'), `token = "${canary()}"\n`);

        const { status, output } = scan(cwd, 'staged');

        assert.equal(status, 0, output);
      });

      it('passes when only deletions are staged', () => {
        const cwd = dir();
        git(cwd, 'rm', '-q', 'README.md');

        const { status, output } = scan(cwd, 'staged');

        assert.equal(status, 0, output);
        assert.match(output, /nothing staged/);
      });
    });

    describe(`full mode in ${label}`, () => {
      it('catches a committed canary', () => {
        const cwd = dir();
        fs.writeFileSync(path.join(cwd, 'config.txt'), `token = "${canary()}"\n`);
        git(cwd, 'add', 'config.txt');
        git(cwd, 'commit', '-q', '-m', 'add config');

        const { status, output } = scan(cwd, 'full');

        assert.doesNotMatch(output, /not a directory/);
        assert.equal(status, FOUND, output);
      });
    });
  }
});
