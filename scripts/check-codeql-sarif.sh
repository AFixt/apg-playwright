#!/usr/bin/env bash
# Fail on the CodeQL findings that would turn the CodeQL check red (#62).
#
# Usage: bash scripts/check-codeql-sarif.sh [sarif-dir]   (default: reports/codeql)
#
# The `codeql` job in .github/workflows/security.yml runs this after
# `codeql-action/analyze`, and `npm run security:codeql` runs it after a local
# analysis (scripts/run-codeql.sh), so the verdict comes from the same script
# in both places and can be reached before pushing.
#
# Threshold: GitHub's default for code-scanning check runs, which is what
# decided this job before the gate existed. A finding fails the gate when
#   - its level is "error", or
#   - its rule's security-severity is 7.0 or above ("High or higher").
# The second arm is not a formality: 34 of the 103 rules in CodeQL's
# javascript-security-extended suite are warning-level with a high or critical
# security-severity, and an error-only gate would wave all of them through.
#
# Exit status: 0 when nothing reaches the threshold; 1 when something does, or
# when the directory holds no SARIF; 2 when jq is missing. Malformed SARIF also
# exits non-zero, because a gate that could not read its input checked nothing.
set -euo pipefail

dir="${1:-reports/codeql}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to read the CodeQL SARIF, and it is not installed." >&2
  exit 2
fi

# No SARIF means the analysis produced nothing, so there is nothing to judge.
# Reporting success here would be exactly the lie this gate exists to prevent.
shopt -s nullglob
sarifs=("$dir"/*.sarif)
if [ ${#sarifs[@]} -eq 0 ]; then
  echo "No SARIF in ${dir}: CodeQL produced no output, so nothing was checked." >&2
  exit 1
fi

# Resolve each result's rule by index when it carries one and by id when it
# does not -- never by falling back to rules[0], which would borrow an
# unrelated rule's severity. The level follows SARIF 2.1.0 section 3.27.10: the
# result's own level, else the rule's defaultConfiguration.level, else
# "warning". `-s` reads every file into one array, so one pass covers them all.
findings=$(jq -rs '
  [ .[] | .runs[] as $run
    | ($run.tool.driver.rules // []) as $rules
    | ($run.results // [])[] as $res
    | (($res.rule.index // $res.ruleIndex) as $i
       | if $i == null
         then ([$rules[] | select(.id == ($res.ruleId // $res.rule.id))] | first)
         else $rules[$i]
         end) as $rule
    | ($res.level // $rule.defaultConfiguration.level // "warning") as $level
    | (($rule.properties["security-severity"] // "0") | tonumber) as $sev
    | select($level == "error" or $sev >= 7.0)
    | "\($res.ruleId // $res.rule.id // "unknown-rule") [level=\($level), security-severity=\($sev)] "
      + "\($res.locations[0].physicalLocation.artifactLocation.uri // "?"):"
      + "\($res.locations[0].physicalLocation.region.startLine // "?")"
  ] | .[]' "${sarifs[@]}")

if [ -z "$findings" ]; then
  echo "CodeQL findings at or above the gate threshold: 0"
  exit 0
fi

count=$(printf '%s\n' "$findings" | wc -l | tr -d ' ')
echo "CodeQL findings at or above the gate threshold: ${count}"
printf '%s\n' "$findings" | sed 's/^/  /'
exit 1
