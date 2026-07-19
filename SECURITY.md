# Security Policy

Sift is a single-user, self-hosted tool with no built-in authentication (by
design — see the README's "No authentication" warning) and it handles live
LLM provider API keys. If you find a genuine security vulnerability, please
report it privately rather than opening a public issue.

## Reporting a Vulnerability

Report security issues privately via GitHub's Security Advisories for this
repository:

https://github.com/FreddyZeta1847/sift/security/advisories/new

Do not open a public GitHub issue for security reports — that would disclose
a live exploit before anyone has a chance to fix it.

## What's in scope

- Anything that would let a request reach beyond what a single trusted local
  user should be able to do (e.g. a way to exfiltrate stored API keys or the
  database without local access).
- Prompt-injection paths that bypass the existing article-fetch sanitization
  or the drafted-output leakage linter in a way that leaks the system prompt
  or attacker-controlled instructions into a published post.

## What's already a known, accepted trade-off (not a vulnerability report)

- Sift has no login/session system. Running it beyond a trusted local network
  without your own authentication or reverse proxy in front of it is a
  configuration risk, not a bug in sift itself.
- API keys are stored in plaintext in a gitignored local file
  (`config/providers.json`). There is no encryption-at-rest — this is a
  deliberate trade-off for a single-user local tool, not an oversight.
