#!/usr/bin/env bash
# Run trufflehog if available. Skip with a warning otherwise so the script
# can sit in pre-commit without breaking contributors who haven't installed
# the binary yet.
#
#   TRUFFLEHOG_MODE=staged   scan exactly what is staged for the next commit
#                            (the pre-commit hook uses this)
#   TRUFFLEHOG_MODE=full     scan the full git history (the default)
#
#   TRUFFLEHOG_RESULTS       optional trufflehog --results filter, e.g.
#                            "verified,unknown,unverified". Unset means
#                            "verified,unknown", which is what the hooks use.
#
# Why "verified,unknown" and not --only-verified (see
# AFixt/detect-features#112): trufflehog files a candidate whose verification
# could not complete (connection refused, or a verification request that
# timed out on a loaded machine) under "unknown", not "verified".
# --only-verified dropped those and exited 0, so a live secret staged on a
# busy or offline machine passed the hook as clean. A scan that could not
# decide now blocks instead. "unverified" (the provider answered and said
# no) stays excluded, as before.
#
# Ported from AFixt/shareable#191 (issue #54 here).
set -euo pipefail

if ! command -v trufflehog >/dev/null 2>&1; then
  echo "warning: trufflehog not installed — skipping secret scan."
  echo "         install with 'brew install trufflehog'"
  exit 0
fi

if [ -n "${TRUFFLEHOG_RESULTS:-}" ]; then
  RESULTS_FLAG="--results=${TRUFFLEHOG_RESULTS}"
else
  RESULTS_FLAG="--results=verified,unknown"
fi

if [ "${TRUFFLEHOG_MODE:-full}" = "staged" ]; then
  # Why not `trufflehog git file://. --since-commit HEAD`, which the
  # pre-commit hook used to run (#54):
  #
  #   1. It never saw staged content. trufflehog's git source scans commits,
  #      and a staged change is not a commit yet, so the range was empty and
  #      the scan passed whatever was about to be committed.
  #   2. It failed outright in a git worktree, where .git is a pointer file
  #      rather than a directory: trufflehog tries to open .git/index and
  #      errors with "not a directory", blocking every commit made there.
  #
  # Instead, write the staged version of every added, copied, modified,
  # renamed or type-changed file into a private temporary directory and scan
  # that as a filesystem. `git checkout-index` reads the index, not the working
  # tree, so this is exactly what the commit will contain (partially staged
  # files included), and plain git plumbing resolves the pointer file in a
  # worktree the same way it does everywhere else.
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/staged-secrets.XXXXXXXX")"
  cleanup() { rm -rf "$WORK"; }
  trap cleanup EXIT
  trap 'exit 1' INT TERM HUP

  # Deletions are excluded: they add nothing to scan. A gitlink (submodule
  # pointer) has no content of its own, and checkout-index writes none for it.
  # --ignore-submodules=all leaves gitlinks out of the list, so every path
  # left in it must come out of checkout-index as exactly one file or symlink.
  git diff --cached --name-only --diff-filter=ACMRT --ignore-submodules=all -z \
    >"$WORK/paths"
  mkdir "$WORK/files"
  git checkout-index --prefix="$WORK/files/" -z --stdin <"$WORK/paths"

  # Refuse to call anything clean that was not exported for scanning (see
  # AFixt/detect-features#112). Without this, an export that silently wrote
  # fewer files than are staged would be scanned as if complete, and one
  # that wrote none would take the "nothing staged" exit below and pass the
  # commit unscanned. On a case-insensitive filesystem, two staged paths
  # differing only in case export to one file; that blocks too, correctly,
  # since one went unscanned.
  STAGED="$(tr -cd '\0' <"$WORK/paths" | wc -c | tr -d ' ')"
  EXPORTED="$(find "$WORK/files" \( -type f -o -type l \) -print0 | tr -cd '\0' | wc -c | tr -d ' ')"
  if [ "$STAGED" != "$EXPORTED" ]; then
    echo "trufflehog: exported ${EXPORTED} of ${STAGED} staged files; refusing to report a partial scan as clean." >&2
    exit 1
  fi

  if [ "$STAGED" = "0" ]; then
    echo "trufflehog: nothing staged with content to scan."
    exit 0
  fi

  trufflehog filesystem "$WORK/files" "$RESULTS_FLAG" --fail --fail-on-scan-errors --no-update
else
  # Scan the repository's object store directly rather than file://., for the
  # same worktree reason: trufflehog's non-bare git source insists on reading
  # <path>/.git/index, which is a file in a worktree. The common git dir holds
  # every ref and commit whichever checkout this runs from, and --bare tells
  # trufflehog not to look for a working tree there.
  GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
  trufflehog git "file://${GIT_COMMON_DIR}" --bare "$RESULTS_FLAG" --fail --no-update
fi
