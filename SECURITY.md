# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems.
Report them privately through
[GitHub Security Advisories](https://github.com/SiberCoder/SiberCron/security/advisories/new).
You can expect an initial response within 7 days.

## How SiberCron handles your secrets

SiberCron stores credentials (AI provider keys, bot tokens, database passwords)
in its own database, encrypted with the key in `ENCRYPTION_KEY`.

- Generate it with `openssl rand -hex 32`, and keep it out of version control.
- Never commit a `.env` file — only `.env.example`, whose values are always blank.
- Credentials are masked in the UI and redacted from execution logs.

## Secret scanning in this repository

Every push and pull request runs `scripts/scan-secrets.sh` over the working tree
**and the full git history** (`.github/workflows/secret-scan.yml`).
Contributors can install the same check locally as a pre-commit hook:

```bash
./scripts/install-git-hooks.sh
```

Run it by hand at any time:

```bash
./scripts/scan-secrets.sh            # tracked files
./scripts/scan-secrets.sh --history  # every commit as well
```

If a secret ever does reach a push, **rotate it**. Deleting the file is not
enough: the value stays reachable in the git history, in forks, and in caches.
