#!/usr/bin/env bash
# Installs a pre-commit hook that blocks a commit containing secrets.
#   ./scripts/install-git-hooks.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .git/hooks
cat > .git/hooks/pre-commit <<'HOOK'
#!/usr/bin/env bash
exec ./scripts/scan-secrets.sh
HOOK
chmod +x .git/hooks/pre-commit
echo "✓ pre-commit hook installed — commits are now scanned for secrets."
echo "  Bypass once (only if you are certain): git commit --no-verify"
