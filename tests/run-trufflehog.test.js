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
 * never verify, so most tests widen the result filter with TRUFFLEHOG_RESULTS
 * instead of relying on the hook's default. What is under test is whether the
 * staged content reaches the scanner at all.
 *
 * This repo's Playwright runner is for the APG specs only, so these use the
 * built-in node:test runner: `npm run test:scripts`. Skipped when trufflehog
 * is not installed, exactly as the script itself skips.
 */

const { spawnSync } = require('node:child_process');
const { randomInt } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'run-trufflehog.sh');
const FOUND = 183;

const hasTrufflehog = spawnSync('trufflehog', ['--version'], { encoding: 'utf8' }).status === 0;
const skip = hasTrufflehog ? false : 'trufflehog is not installed';

/** A random ASCII letter, either case. */
function randomLetter() {
  const index = randomInt(52);
  return String.fromCodePoint(index < 26 ? 0x41 + index : 0x61 + index - 26);
}

/**
 * A fresh, random, never-valid GitHub-PAT-shaped string.
 *
 * Letters and digits alternate, so no two letters are ever adjacent
 * (AFixt/detect-features#112). trufflehog discards an unverified result whose
 * value contains a dictionary word, case-insensitively, as a likely false
 * positive. The canary used to be 36 fully random alphanumerics, and a few in
 * a thousand of those contain a word ("ghp_…eGeFROmecor…" holds "from"), which
 * trufflehog then dropped: the staged-canary test failed at random. With no
 * letter pairs there is no word to find.
 */
function canary() {
  let body = '';
  for (let index = 0; index < 36; index++) {
    body += index % 2 === 0 ? randomLetter() : String(randomInt(10));
  }
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

/** The widened result filter most tests use; see the file header. */
const WIDE = { TRUFFLEHOG_RESULTS: 'unknown,unverified' };

/**
 * Run the script under test in `cwd` and return its exit status and output.
 * `env` is laid over the isolated environment; it defaults to the widened
 * result filter.
 */
function scan(cwd, mode, env = WIDE) {
  const result = spawnSync('bash', [SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: isolatedEnv({ TRUFFLEHOG_MODE: mode, ...env }),
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** Stage a random canary in `cwd`. */
function stageCanary(cwd) {
  fs.writeFileSync(path.join(cwd, 'config.txt'), `token = "${canary()}"\n`);
  git(cwd, 'add', 'config.txt');
}

/**
 * Stage a submodule (a gitlink, which has no content of its own) in `cwd`,
 * cloned from a throwaway repository under `root`.
 */
function stageGitlink(cwd, root) {
  const sub = path.join(root, 'sub');
  fs.mkdirSync(sub);
  git(sub, 'init', '-q');
  git(sub, 'commit', '-q', '--allow-empty', '-m', 'sub');
  git(cwd, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub, 'vendor/sub');
}

/**
 * A directory under `root` holding a `git` that behaves like the real one
 * except that `checkout-index` swallows its input and writes nothing: an
 * export that "succeeds" without exporting.
 */
function gitWithSilentExport(root) {
  const realGit = spawnSync('bash', ['-c', 'command -v git'], {
    encoding: 'utf8',
    env: isolatedEnv(),
  }).stdout.trim();
  const bin = path.join(root, 'shim-bin');
  fs.mkdirSync(bin);
  const shim = path.join(bin, 'git');
  fs.writeFileSync(
    shim,
    [
      '#!/usr/bin/env bash',
      'if [ "$1" = checkout-index ]; then cat >/dev/null; exit 0; fi',
      `exec "${realGit}" "$@"`,
      '',
    ].join('\n')
  );
  fs.chmodSync(shim, 0o755);
  return bin;
}

describe('run-trufflehog.sh', { skip, timeout: 120_000 }, () => {
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

  it('every canary the tests can generate is one trufflehog reports (AFixt/detect-features#112)', () => {
    // The premise of every "catches" test below. 1000 canaries in one scan;
    // under the old fully random shape, about 2 or 3 of them went missing.
    const dir = path.join(root, 'canaries');
    fs.mkdirSync(dir);
    const count = 1000;
    for (let index = 0; index < count; index++) {
      fs.writeFileSync(path.join(dir, `c${String(index)}.txt`), `token = "${canary()}"\n`);
    }

    const result = spawnSync(
      'trufflehog',
      [
        'filesystem',
        dir,
        '--results=unknown,unverified',
        '--no-verification',
        '--no-update',
        '--json',
      ],
      { encoding: 'utf8', env: isolatedEnv(), maxBuffer: 64 * 1024 * 1024 }
    );

    const found = new Set(
      result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).Raw)
    );
    assert.equal(found.size, count, result.stderr);
  });

  describe('staged mode fails closed (AFixt/detect-features#112)', () => {
    it('blocks when verification cannot complete, under the hook default filter', () => {
      // A dead proxy makes every verification request fail, as a timeout on a
      // loaded or offline machine does. trufflehog then reports the canary as
      // "unknown"; --only-verified used to drop it and exit 0.
      stageCanary(checkout);
      const deadProxy = 'http://127.0.0.1:9';

      const { status, output } = scan(checkout, 'staged', {
        HTTPS_PROXY: deadProxy,
        https_proxy: deadProxy,
        NO_PROXY: '',
        no_proxy: '',
        TRUFFLEHOG_RESULTS: '',
      });

      assert.equal(status, FOUND, output);
    });

    it('refuses to report clean when the export wrote fewer files than are staged', () => {
      stageCanary(checkout);
      const shimBin = gitWithSilentExport(root);

      const { status, output } = scan(checkout, 'staged', {
        ...WIDE,
        PATH: `${shimBin}${path.delimiter}${process.env.PATH ?? ''}`,
      });

      assert.match(output, /exported 0 of 1 staged files/);
      assert.equal(status, 1, output);
    });
  });

  for (const [label, dir] of [
    ['a normal checkout', () => checkout],
    ['a git worktree', () => worktree],
  ]) {
    describe(`staged mode in ${label}`, () => {
      it('catches a staged canary', () => {
        const cwd = dir();
        stageCanary(cwd);

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

      it('still catches a canary staged alongside a submodule', () => {
        const cwd = dir();
        stageGitlink(cwd, root);
        stageCanary(cwd);

        const { status, output } = scan(cwd, 'staged');

        assert.doesNotMatch(output, /refusing/);
        assert.equal(status, FOUND, output);
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
