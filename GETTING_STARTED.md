# Getting Started with BrokerBane

BrokerBane automates GDPR and CCPA data removal requests to 1,169+ data brokers.
Everything runs locally on your machine. Your personal data never leaves your
computer except in the removal requests sent directly to each broker.

---

## Prerequisites

- Node.js 20 or later
- npm (comes with Node.js)
- An email account for sending removal requests (Gmail, ProtonMail, etc.)
- Optionally: a separate IMAP-accessible email to monitor broker responses

---

## 1. Install

```bash
git clone <repo-url>
cd broker-bane
npm install
```

Verify the install works:

```bash
npx brokerbane --help
```

---

## 2. Run the Setup Wizard

The setup wizard collects the personal data that brokers need to locate and
remove your records. This data is stored locally with strict file permissions
(0600) and never sent anywhere except to the broker being contacted.

```bash
npx brokerbane setup
```

The wizard will ask for:

### Personal information

| Field | Why it's needed | Example |
|---|---|---|
| Full name | Brokers match records by name | Jane Doe |
| Email address | Required in removal requests; brokers reply here | jane@example.com |
| Phone number | Some brokers match by phone | +1-555-0123 |
| Mailing address | Many US data brokers match by address | 123 Main St, City, ST 12345 |
| Date of birth | Optional; helps brokers find the right record | 1990-01-15 |

### Email configuration (for automated sending)

| Field | Purpose |
|---|---|
| SMTP host | Outgoing mail server (e.g., smtp.gmail.com) |
| SMTP port | Usually 587 (TLS) or 465 (SSL) |
| SMTP username | Your email login |
| SMTP password | App password (not your main password — see note below) |

### IMAP configuration (optional, for response monitoring)

| Field | Purpose |
|---|---|
| IMAP host | Incoming mail server (e.g., imap.gmail.com) |
| IMAP port | Usually 993 (SSL) |
| IMAP username | Your email login |
| IMAP password | Same app password as SMTP |

**Gmail users:** You must use an App Password, not your main Google password.
Go to https://myaccount.google.com/apppasswords to generate one.

---

## 3. Privacy Assurances

- **All data stays local.** Config is stored in your home directory with `0600`
  permissions (owner-only read/write). No telemetry, no cloud sync.
- **PII is redacted from logs.** Your name, email, and address never appear in
  log output. Only broker names and request statuses are logged.
- **Stagehand and NopeCHA are optional.** The tool works without any browser
  automation or CAPTCHA-solving services. You only need those for brokers that
  require filling out web forms (and even then, the tool falls back to email).
- **You control the pace.** The pipeline has a configurable daily limit
  (default: 50 brokers per run) and per-domain rate limiting with exponential
  backoff.

---

## 4. Run Your First Scan

Once setup is complete, start the removal pipeline:

```bash
npx brokerbane run
```

This will:
1. Load the broker database (1,169 entries in `data/brokers.yaml`)
2. For each broker, select the appropriate template (GDPR, CCPA, or generic)
3. Send removal requests via email (or flag brokers that need web forms)
4. Record each request in the local SQLite database
5. Stop after the daily limit is reached

### What to expect on the first run

- The first run processes up to 50 brokers (configurable)
- Most brokers receive an email. Some are flagged for manual action.
- Total time: 5-15 minutes depending on SMTP rate limits
- Check results: `npx brokerbane report`

---

## 5. Monitor Responses

If you configured IMAP, BrokerBane can watch for broker responses:

```bash
npx brokerbane monitor
```

This uses IMAP IDLE to watch for incoming emails from known broker domains.
When a broker confirms removal, the database is updated automatically.

---

## 6. Re-scan for Stale Requests

Brokers that haven't confirmed removal after 30 days are marked stale.
Re-send requests to them:

```bash
npx brokerbane rescan
```

You can also set up scheduled re-scanning (every 90 days by default):

```bash
npx brokerbane rescan --schedule
```

---

## 7. Check Your Status

```bash
npx brokerbane report
```

Shows:
- Total brokers contacted
- Confirmed removals
- Pending (no response yet)
- Stale (no confirmation after 30 days)
- Failed (email bounced or broker unreachable)

Export as JSON:
```bash
npx brokerbane report --json > report.json
```

---

## Common Issues

### "SMTP authentication failed"

- Gmail: Use an App Password, not your regular password
- ProtonMail: Use the ProtonMail Bridge SMTP settings
- Check that SMTP port matches your server (587 for TLS, 465 for SSL)

### "No brokers processed"

- Make sure you ran `brokerbane setup` first
- Check that your personal data is populated: the pipeline skips if name/email
  are missing

### Browser automation brokers

Some brokers require filling out web forms. These are flagged during the run.
To handle them:

1. Install Stagehand (optional): `npm install @browserbasehq/stagehand`
2. Run: `npx brokerbane run --browser`
3. For CAPTCHA-protected forms, install NopeCHA

Without Stagehand, these brokers are skipped and listed in the report as
"needs manual action."

---

## Key Files

| File | Purpose |
|---|---|
| `data/brokers.yaml` | Full broker database (1,169 entries) |
| `templates/gdpr.hbs` | GDPR removal email template |
| `templates/ccpa.hbs` | CCPA removal email template |
| `templates/generic.hbs` | Generic removal email template |
| `src/cli.ts` | CLI entry point |
| `src/pipeline/orchestrator.ts` | Main pipeline logic |
| `src/db/` | SQLite storage (request history, schedule) |

---

## Next Steps

- Run `brokerbane report` weekly to track progress
- Set up `brokerbane rescan --schedule` for automatic follow-up
- Review `docs/broker-audit-2026-03.md` for known dead/changed broker URLs
