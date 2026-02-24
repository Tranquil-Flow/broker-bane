# BrokerBane

**Free, open-source CLI tool for automated GDPR/CCPA data broker removal requests.**

BrokerBane sends opt-out emails and submits web forms to 59+ data brokers on your behalf. It's fully local — your personal data never leaves your machine.

## Features

- **Email removal** — sends templated GDPR/CCPA opt-out emails with retry logic and rate limiting
- **Web form removal** — uses [Stagehand](https://github.com/browserbasehq/stagehand) (optional) for AI-driven browser automation
- **Inbox monitoring** — auto-clicks confirmation email links via IMAP (optional)
- **Resumable pipeline** — SQLite-backed state survives interruption; resume where you left off
- **Circuit breaker** — stops hammering brokers that keep failing
- **Dry-run mode** — preview everything before sending a single email
- **59 brokers** — people-search, marketing data, background-check, credit bureaus, EU/GDPR targets

## Requirements

- Node.js 20+
- An email account with SMTP app-password support (Gmail, Outlook, or custom)

## Installation

```bash
npm install -g broker-bane
```

Or run from source:

```bash
git clone https://github.com/yourorg/broker-bane
cd broker-bane
npm install
npm run build
npm link
```

## Quick Start

```bash
# 1. Run the interactive setup wizard
brokerbane init

# 2. Verify your configuration
brokerbane test-config

# 3. Preview what would be sent (no emails sent)
brokerbane remove --dry-run

# 4. Send removal requests
brokerbane remove
```

## Commands

### `brokerbane init`

Interactive wizard that creates `~/.brokerbane/config.yaml` with your profile, email credentials, and preferences.

### `brokerbane remove`

Runs the removal pipeline. Options:

| Flag | Description |
|------|-------------|
| `--dry-run`, `-d` | Preview without sending |
| `--brokers <ids>` | Comma-separated broker IDs (e.g. `spokeo,beenverified`) |
| `--method <method>` | Filter by method: `email`, `web`, `all` (default: `all`) |
| `--resume`, `-r` | Skip brokers already marked completed |
| `--config <path>` | Override config file path |

### `brokerbane status`

Show pipeline progress and pending tasks.

```
brokerbane status
brokerbane status --format json
```

### `brokerbane resume`

Alias for `brokerbane remove --resume`. Resumes an interrupted pipeline run.

### `brokerbane list-brokers`

Browse and filter the broker database.

```bash
brokerbane list-brokers
brokerbane list-brokers --region us --tier 1
brokerbane list-brokers --method email
brokerbane list-brokers --search "people"
brokerbane list-brokers --format json
```

### `brokerbane confirm`

Handle pending manual tasks (web forms that need human intervention).

```bash
brokerbane confirm          # List pending tasks
brokerbane confirm --all    # Mark all as completed
```

### `brokerbane export`

Export results to JSON or CSV.

```bash
brokerbane export
brokerbane export --format csv > results.csv
```

### `brokerbane test-config`

Validates your config file, broker database, SQLite connection, and SMTP credentials.

## Configuration

Config lives at `~/.brokerbane/config.yaml` (permissions: `0600`).

```yaml
profile:
  first_name: Jane
  last_name: Doe
  email: jane@example.com
  address: 123 Main St      # optional
  city: Springfield         # optional
  state: IL                 # optional
  zip: "62701"              # optional
  country: US
  phone: "555-123-4567"     # optional
  date_of_birth: "1985-06-15"  # optional
  aliases: []               # other names you go by

email:
  host: smtp.gmail.com
  port: 587
  secure: false
  auth:
    user: jane@gmail.com
    pass: your-app-password  # NOT your Gmail password - use an App Password
  pool: true
  rate_limit: 5       # max emails per rate_delta_ms window
  rate_delta_ms: 60000

# Optional: IMAP inbox monitoring for auto-confirming removal emails
# inbox:
#   host: imap.gmail.com
#   port: 993
#   secure: true
#   auth:
#     user: jane@gmail.com
#     pass: your-app-password
#   mailbox: INBOX

# Optional: AI browser automation for web form removals
# Requires: npm install @browserbasehq/stagehand
# browser:
#   headless: true
#   provider: openai        # openai, anthropic, or ollama
#   api_key: sk-...
#   model: gpt-4o
#   timeout_ms: 30000

options:
  template: gdpr          # gdpr, ccpa, or generic
  dry_run: false
  regions: [us]           # us, eu, or global
  tiers: [1, 2, 3]        # 1=major, 2=medium, 3=minor
  excluded_brokers: []
  delay_min_ms: 5000      # random delay between brokers (anti-bot)
  delay_max_ms: 15000

logging:
  level: info             # trace, debug, info, warn, error
  redact_pii: true        # redact names/emails from logs
```

## Email Provider Setup

### Gmail

1. Enable 2-factor authentication
2. Go to **Google Account → Security → App Passwords**
3. Create an app password for "Mail"
4. Use that as `auth.pass` in your config

### Outlook / Hotmail

1. Enable 2-factor authentication
2. Go to **account.microsoft.com → Security → Advanced security options → App passwords**
3. Create an app password and use it as `auth.pass`

## Browser Automation (Optional)

For web-form-only brokers (e.g. Spokeo, BeenVerified), BrokerBane can use AI-powered browser automation via [Stagehand](https://github.com/browserbasehq/stagehand):

```bash
npm install @browserbasehq/stagehand playwright
npx playwright install chromium
```

Then add to your config:

```yaml
browser:
  provider: openai        # or anthropic
  api_key: sk-...
  model: gpt-4o
  headless: true
```

Or use a local model with Ollama (zero data exfiltration):

```yaml
browser:
  provider: ollama
  model: llama3.2
```

Without browser automation, web-form brokers are queued as manual tasks visible in `brokerbane confirm`.

## Inbox Monitoring (Optional)

When `inbox` is configured, BrokerBane monitors your inbox during pipeline runs and automatically clicks confirmation links from brokers. This handles the common "click to confirm your opt-out" flow.

## Privacy & Security

- **Local-only**: your personal data never leaves your machine
- **Config permissions**: `~/.brokerbane/config.yaml` is created with mode `0600`
- **PII redaction**: logs redact names and email addresses by default (`logging.redact_pii: true`)
- **No tracking**: BrokerBane does not phone home or collect analytics

## Broker Database

The broker database (`data/brokers.yaml`) is community-maintained. Contributions welcome.

Current coverage: **59 brokers** across:
- People-search (Spokeo, BeenVerified, Whitepages, Radaris, TruthFinder, ...)
- Marketing data (Acxiom, Epsilon, LiveRamp, Oracle/BlueKai, ...)
- Background check (Checkr, HireRight, Sterling, ...)
- Credit bureaus (Equifax, Experian, TransUnion)
- Business data (ZoomInfo, Clearbit, FullContact)
- Data aggregators (LexisNexis, CoreLogic, Verisk)
- EU/GDPR targets (Acxiom UK, Experian UK, Equifax UK)

## Contributing

Bug reports, new broker definitions, and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[AGPL-3.0](LICENSE) — free to use, modify, and distribute under the same terms.
