#!/usr/bin/env bash
#
# OSV scan over the PRODUCTION dependency tree only. Exposed as
# `npm run security:osv`, and security.yml's OSV-Scanner job runs exactly that
# command, so a local run and CI scan the same thing.
#
# Karl's fleet ruling, 2026-11-17: dependency-audit gates scan production
# dependencies only. osv-scanner has no --omit=dev flag and reads every package
# in package-lock.json, so dev-only advisories (picomatch GHSA-fc5q-39xc-vjpf,
# which has no fixed release, reached only through lint tooling) kept the job
# red on develop from 2026-09-30.
#
# The production set comes from the lockfile itself, as in AFixt/livechat#206:
# npm marks every package that only dev dependencies reach with `"dev": true`,
# so this copies package-lock.json without those entries and runs osv-scanner
# on the copy. Everything else stays in scope, including optional and
# devOptional packages (devOptional means a production path reaches it too).
# The copy keeps the name package-lock.json so osv-scanner recognises the
# format. (`npm sbom --omit=dev` is not used: in workspace repos it silently
# drops real production packages.)
#
# Every dependency in this repository is a devDependency today, so the
# production set is empty and the scan has nothing to read. osv-scanner exits
# 128 ("No package sources found") on an empty lockfile, which would be a red
# job for no finding, so that one case is reported by name and passes. The
# moment a production dependency is added, it is scanned and any advisory
# against it fails the job.
#
# Usage: scripts/osv-production.sh [path/to/package-lock.json]
set -euo pipefail

lockfile=""
if [ $# -gt 0 ]; then
  # Resolved before the cd below, so a relative path means what the caller meant.
  lockfile="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
fi

cd "$(dirname "$0")/.."

lockfile="${lockfile:-package-lock.json}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# The single quotes are deliberate: the $ expressions below are JavaScript.
# shellcheck disable=SC2016
kept="$(node -e '
const fs = require("node:fs");
const [src, dest] = process.argv.slice(1);
const lock = JSON.parse(fs.readFileSync(src, "utf8"));
const kept = {};
let packages = 0;
let dropped = 0;
for (const [path, info] of Object.entries(lock.packages || {})) {
  if (info.dev === true) {
    dropped += 1;
    continue;
  }
  kept[path] = info;
  // "" is the root project itself, not a dependency.
  if (path !== "") packages += 1;
}
lock.packages = kept;
fs.writeFileSync(dest, JSON.stringify(lock));
console.error(`osv-production: ${packages} production lockfile entries to scan (${dropped} dev-only entries left out).`);
console.log(packages);
' "$lockfile" "$tmp/package-lock.json")"

if [ "$kept" -eq 0 ]; then
  echo "osv-production: no production dependencies, so there is nothing to scan."
  exit 0
fi

osv-scanner --lockfile="$tmp/package-lock.json"
