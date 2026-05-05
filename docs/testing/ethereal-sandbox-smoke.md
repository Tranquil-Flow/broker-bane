# Ethereal SMTP/IMAP Sandbox Smoke

Purpose: prove BrokerBane's real email plumbing without contacting real brokers or sending from the user's main inbox.

Ethereal is a fake SMTP service intended for Nodemailer testing. It accepts normal SMTP messages with real test credentials, captures them in a web UI, and does not deliver messages to real recipients. Use it as the final email-system gate before live broker testing.

## What this smoke proves

- SMTP credentials validate through BrokerBane config.
- A generated removal email reaches a controlled sink, not a broker.
- `From` / `Reply-To` / broker-facing identity are the dedicated removal mailbox, not the user's profile email.
- Dry runs do not send SMTP and do not start confirmation monitoring.
- Real send mode can send one controlled test message to the Ethereal inbox.

## What this smoke does not prove

- Broker deliverability from a real mailbox.
- Broker reply behavior.
- CAPTCHA or browser-playbook completion.
- Long-running IMAP monitoring reliability.

## Prerequisites

From the repo root:

```bash
cd /workspace/Projects/broker-bane
npm run build
```

Create an Ethereal account. Either use Nodemailer's generated test account helper in a scratch Node script, or create credentials from the Ethereal web UI.

Record:

- SMTP host, usually `smtp.ethereal.email`
- SMTP port, usually `587`
- SMTP username
- SMTP password
- Ethereal inbox preview URL or login URL

## Test config

Create a temporary config outside the real user config. Never overwrite the user's live BrokerBane config for this smoke.

Example:

```yaml
profile:
  first_name: Test
  last_name: User
  email: real-identifier@example.invalid
  aliases: []
  country: US

broker_identity:
  id: ethereal-removal-sandbox
  label: Ethereal removal sandbox
  mode: dedicated_mailbox
  privacy_level: balanced
  email: ETHEREAL_USERNAME_HERE
  provider: ethereal
  smtp:
    host: smtp.ethereal.email
    port: 587
    secure: false
    auth:
      type: password
      user: ETHEREAL_USERNAME_HERE
      pass: ETHEREAL_PASSWORD_HERE
    pool: false
    rate_limit: 1
    rate_delta_ms: 60000
  inbox:
    host: imap.ethereal.email
    port: 993
    secure: true
    auth:
      type: password
      user: ETHEREAL_USERNAME_HERE
      pass: ETHEREAL_PASSWORD_HERE

email:
  host: smtp.ethereal.email
  port: 587
  secure: false
  auth:
    type: password
    user: ETHEREAL_USERNAME_HERE
    pass: ETHEREAL_PASSWORD_HERE
  pool: false
  rate_limit: 1
  rate_delta_ms: 60000

options:
  dry_run: true
  daily_limit: 1
  delay_min_ms: 0
  delay_max_ms: 0
  regions: [us]
  tiers: [1]
  excluded_brokers: []
  template: gdpr
  verify_before_send: false

browser:
  headless: true
  model: gpt-4o
  provider: openai
  timeout_ms: 30000

captcha:
  provider: nopecha
  daily_limit: 0

retry:
  max_attempts: 3
  initial_delay_ms: 60000
  backoff_multiplier: 2
  jitter: 0.25

circuit_breaker:
  failure_threshold: 3
  cooldown_ms: 86400000
  half_open_max_attempts: 1

matcher:
  auto_threshold: 60
  manual_threshold: 40

logging:
  level: info
  redact_pii: true

database:
  path: /tmp/brokerbane-ethereal-smoke.sqlite
```

## Smoke sequence

### 1. Reset isolated state

```bash
rm -f /tmp/brokerbane-ethereal-smoke.sqlite
```

### 2. Validate config

```bash
node dist/cli.js test-config --config /tmp/brokerbane-ethereal.yaml
```

Pass criteria:

- Config loads.
- SMTP configuration is accepted.
- No main personal inbox is required.

### 3. Preview today's batch

```bash
node dist/cli.js remove --preview-today --brokers zoominfo --config /tmp/brokerbane-ethereal.yaml
```

Pass criteria:

- Output names the broker-facing Ethereal mailbox.
- Daily cap is `1`.
- It lists at most one broker.
- No removal requests or email logs are created.

### 4. Dry-run the same broker

```bash
node dist/cli.js remove --dry-run --brokers zoominfo --config /tmp/brokerbane-ethereal.yaml
```

Pass criteria:

- No message appears in Ethereal.
- No confirmation monitor starts.
- Any local DB mutation is limited to dry-run/test-safe records expected by the current CLI behavior.

### 5. Explicit one-message send

Only after reviewing the preview and dry-run output, temporarily set:

```yaml
options:
  dry_run: false
  daily_limit: 1
```

Then run:

```bash
node dist/cli.js remove --brokers zoominfo --config /tmp/brokerbane-ethereal.yaml
```

Pass criteria:

- Exactly one outbound message appears in the Ethereal inbox.
- Subject/body identify the target broker request.
- `From` and `Reply-To` are the Ethereal broker-facing mailbox.
- The user's profile email appears only as a record-lookup identifier when needed, not as the sending account.
- DB status is `sent` or `awaiting_confirmation`, depending on broker metadata.

### 6. Inspect status and export evidence

```bash
node dist/cli.js status --config /tmp/brokerbane-ethereal.yaml
node dist/cli.js export --format json --config /tmp/brokerbane-ethereal.yaml > /tmp/brokerbane-ethereal-export.json
```

Pass criteria:

- Status shows one controlled request.
- Export contains the request/log metadata but no accidental real broker expansion.

## Failure handling

Stop before live broker testing if any of these occur:

- SMTP sends from the profile/main email rather than `broker_identity.email`.
- Dry-run sends a message.
- More than one message is sent during the explicit one-message step.
- Confirmation monitoring starts during dry-run.
- The config path points at the user's real BrokerBane database.

If a product bug is found, write a failing unit test first, then fix the smallest boundary that allows the unsafe behavior.

## References

- Nodemailer Ethereal testing guide: <https://nodemailer.com/guides/testing-with-ethereal>
- Ethereal FAQ: <https://ethereal.email/faq>
