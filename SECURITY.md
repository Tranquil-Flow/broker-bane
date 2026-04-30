# Security Policy

BrokerBane handles personal data and sends authenticated email on a user's behalf, so security and privacy issues are taken seriously.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:
1. Go to https://github.com/Tranquil-Flow/broker-bane/security/advisories
2. Click "Report a vulnerability"
3. Fill in the details

We aim to acknowledge reports within 7 days and provide a remediation plan or fix within 30 days for high-severity issues.

## In scope

The following are considered security issues for BrokerBane:

- **Local PII exposure** — config files written without `0600` permissions, PII written to logs, PII leaking into telemetry or external API calls
- **Credential exposure** — SMTP credentials, OAuth tokens, IMAP passwords, NopeCHA API keys leaking via logs, error messages, or unintended files
- **Network egress** — any code path that sends user PII to a destination other than the broker being contacted (or services explicitly opted into, e.g. Stagehand/NopeCHA)
- **Email impersonation / spoofing** — flaws in the email sending pipeline that could let a third party send mail as the user
- **Dependency vulnerabilities** — known CVEs in pinned dependencies (please include the advisory ID)
- **Browser automation escape** — Stagehand workflows that exfiltrate PII beyond the broker's intended form
- **OAuth flows** — token storage, refresh, or scope escalation issues in the Gmail/Outlook integration
- **Database** — SQL injection, encryption-at-rest gaps, or path traversal in the SQLite layer

## Out of scope

- **Brokers' own websites** — BrokerBane interacts with third-party data broker sites. Vulnerabilities on those sites should be reported to the broker, not to us.
- **CAPTCHA solving via NopeCHA** — by design, this is opt-in and users provide their own API key.
- **Self-inflicted misconfiguration** — e.g. the user setting permissive file permissions on their own config.
- **DoS via running BrokerBane against many brokers** — this is the intended behavior. Rate limiting is the user's responsibility.

## Data handling

BrokerBane is designed so that personal data never leaves the user's machine except to the broker being contacted. If you find a code path where this guarantee breaks, please report it.

- Config (`config.yaml`) is written with `0600` permissions
- PII is redacted from logs by default
- The PWA stores data in IndexedDB only; no remote sync
- OAuth access tokens are not persisted (re-acquired per session)

## Responsible disclosure

We will:
- Acknowledge your report and keep you updated on progress
- Credit you in the release notes (unless you prefer to remain anonymous)
- Not pursue legal action for good-faith security research

Thank you for helping keep BrokerBane and its users safe.
