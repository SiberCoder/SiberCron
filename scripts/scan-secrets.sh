#!/usr/bin/env bash
# Secret scanner for SiberCron.
#   ./scripts/scan-secrets.sh          scan tracked files in the working tree
#   ./scripts/scan-secrets.sh --history  also scan every blob in git history
# Exits non-zero if anything matches, so it can gate CI and `npm publish`.
set -uo pipefail
cd "$(dirname "$0")/.."

PATTERNS='sk-ant-[A-Za-z0-9_-]{20,}
sk-proj-[A-Za-z0-9_-]{20,}
sk-[A-Za-z0-9]{32,}
AIza[0-9A-Za-z_-]{35}
gsk_[A-Za-z0-9]{40,}
ghp_[A-Za-z0-9]{36}
gho_[A-Za-z0-9]{36}
github_pat_[A-Za-z0-9_]{50,}
xox[baprs]-[A-Za-z0-9-]{10,}
AKIA[0-9A-Z]{16}
[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}
SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}
-----BEGIN [A-Z ]*PRIVATE KEY-----
npm_[A-Za-z0-9]{36}
dckr_pat_[A-Za-z0-9_-]{20,}
(mongodb(\+srv)?|postgres(ql)?|mysql|redis|amqp)://[^[:space:]"'"'"'<]*:[^[:space:]"'"'"'<@]+@'

# Lockfiles and this script itself carry pattern-shaped noise, never real secrets.
EXCLUDE='pnpm-lock\.yaml|package-lock\.json|yarn\.lock|scripts/scan-secrets\.sh|\.github/workflows/secret-scan\.yml'

# Lines that merely *look* like a credential: code that builds a URL from variables
# (`redis://:${password}@`), and documented placeholders in templates and comments.
PLACEHOLDER='\$\{|\$[A-Z_]+|%s|\{\{|<[a-z_]+>|:password@|:pass@|:changeme@|:secret@|:yourpassword@|user:password|USER:PASS|example\.com|EXAMPLE'

# Drop hits that are placeholders rather than live credentials.
filter_noise() { grep -vE "$EXCLUDE" | grep -vE "$PLACEHOLDER"; }

fail=0

scan_tree() {
  echo "→ Scanning tracked files…"
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    hits=$(git grep -nIE "$pat" -- . 2>/dev/null | filter_noise)
    if [ -n "$hits" ]; then
      echo "  ✗ pattern: $pat"
      echo "$hits" | sed 's/^/      /' | cut -c1-200
      fail=1
    fi
  done <<< "$PATTERNS"
}

scan_history() {
  echo "→ Scanning full git history…"
  revs=$(git rev-list --all)
  [ -z "$revs" ] && return
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    hits=$(git grep -IE "$pat" $revs -- . 2>/dev/null | filter_noise | head -5)
    if [ -n "$hits" ]; then
      echo "  ✗ pattern in history: $pat"
      echo "$hits" | sed 's/^/      /' | cut -c1-200
      fail=1
    fi
  done <<< "$PATTERNS"
}

# A committed .env is always a mistake, even if it holds no recognised token shape.
scan_env_files() {
  echo "→ Checking for committed env files…"
  bad=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$')
  if [ -n "$bad" ]; then
    echo "  ✗ env file is tracked:"; echo "$bad" | sed 's/^/      /'; fail=1
  fi
  # .env.example must stay a template: every key blank or a placeholder.
  if [ -f .env.example ]; then
    filled=$(grep -vE '^\s*#|^\s*$' .env.example | grep -E '=.+' \
      | grep -viE '=(localhost|0\.0\.0\.0|development|production|sqlite://|redis://localhost|http://localhost|3001|your-|<|\$\{)' || true)
    if [ -n "$filled" ]; then
      echo "  ⚠ .env.example has non-placeholder values — verify by hand:"
      echo "$filled" | sed 's/^/      /'
    fi
  fi
}

scan_tree
scan_env_files
[ "${1:-}" = "--history" ] && scan_history

echo
if [ $fail -ne 0 ]; then
  echo "✗ SECRET SCAN FAILED — do not commit, push or publish."
  echo "  Rotate anything that leaked; removing the file is not enough once it is pushed."
  exit 1
fi
echo "✓ Secret scan clean."
