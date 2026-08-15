#!/usr/bin/env bash
# scrub.sh — secret/PII safety rail.
#
# Usage: scripts/scrub.sh <file> [file ...]
#
# Greps each given file against:
#   - scripts/scrub-patterns.txt (committed, regex patterns, extended-regex)
#   - .scrub-secrets.local (gitignored, optional, one literal string per line)
#
# Prints every match as "<file>:<line>: <match text>  [pattern: <pattern>]"
# and exits 1 if ANY file matches ANY pattern. Exits 0 only if every file is
# clean. Deliberately conservative: a hit here means "a human looks before
# this goes further," not "this is definitely a real secret." False
# positives (an email in a doc, a 32-hex string that isn't a facility ID)
# are expected and should be judged by a human, not silenced in this script.
#
# This script does not modify or delete anything — it only reports.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PATTERNS_FILE="$SCRIPT_DIR/scrub-patterns.txt"
LOCAL_SECRETS_FILE="$REPO_ROOT/.scrub-secrets.local"

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <file> [file ...]" >&2
  exit 2
fi

if [ ! -f "$PATTERNS_FILE" ]; then
  echo "scrub.sh: missing $PATTERNS_FILE — refusing to run with no patterns" >&2
  exit 2
fi

found_match=0

# Load regex patterns (skip blank lines and comments)
mapfile -t PATTERNS < <(grep -vE '^\s*(#|$)' "$PATTERNS_FILE")

for target in "$@"; do
  if [ ! -f "$target" ]; then
    echo "scrub.sh: skipping missing file: $target" >&2
    continue
  fi

  for pattern in "${PATTERNS[@]}"; do
    while IFS=: read -r lineno line; do
      [ -z "${lineno:-}" ] && continue
      echo "${target}:${lineno}: ${line}  [pattern: ${pattern}]"
      found_match=1
    done < <(grep -nE "$pattern" "$target" 2>/dev/null)
  done

  if [ -f "$LOCAL_SECRETS_FILE" ]; then
    while IFS= read -r literal; do
      [ -z "$literal" ] && continue
      case "$literal" in \#*) continue ;; esac
      while IFS=: read -r lineno line; do
        [ -z "${lineno:-}" ] && continue
        echo "${target}:${lineno}: ${line}  [local-secret-match]"
        found_match=1
      done < <(grep -nF -- "$literal" "$target" 2>/dev/null)
    done < "$LOCAL_SECRETS_FILE"
  fi
done

if [ "$found_match" -eq 1 ]; then
  echo "" >&2
  echo "scrub.sh: FAILED — suspicious content found above. Review before committing." >&2
  exit 1
fi

exit 0
