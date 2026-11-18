#!/usr/bin/env bash
# Run the CodeQL analysis the security workflow's `codeql` job runs, then its
# gate, without GitHub Actions (#62). This is `npm run security:codeql`.
#
# Same language and query suite as the job (javascript-typescript,
# security-extended). The SARIF goes to reports/codeql/javascript.sarif, and
# scripts/check-codeql-sarif.sh judges it exactly as it does in CI.
#
# The database is built in a temporary directory and removed afterwards, so no
# extracted copy of the source lands in the checkout for ESLint, Prettier or
# jscpd to trip over.
#
# Needs the CodeQL CLI with the codeql/javascript-queries pack (it downloads
# the pack on first use) and jq. A missing CLI exits 2: an analysis that did
# not run must not read as a clean one.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${root}/reports/codeql"

if ! command -v codeql >/dev/null 2>&1; then
  echo "The CodeQL CLI is not installed, so the CodeQL analysis did not run." >&2
  echo "Install it (e.g. brew install codeql) and re-run npm run security:codeql." >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$out"
rm -f "$out"/*.sarif

codeql database create "${work}/db" \
  --language=javascript-typescript \
  --source-root="$root"

codeql database analyze "${work}/db" \
  codeql/javascript-queries:codeql-suites/javascript-security-extended.qls \
  --download \
  --format=sarif-latest \
  --output="${out}/javascript.sarif"

bash "${root}/scripts/check-codeql-sarif.sh" "$out"
