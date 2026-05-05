# BrokerBane Real-World Smoke Test Runbook

Smoke tests validate that BrokerBane's email pipeline actually works against
real data brokers before you commit to a full run.  All tests use a dedicated
removal mailbox, never a personal inbox.

---

## 1. Preconditions

| Requirement | Notes |
|---|---|
| Node.js 20+ | `node --version` must report >= 20.0.0 |
| Dedicated removal mailbox | A Gmail/Outlook/IMAP mailbox created specifically for BrokerBane.  Its main inbox holds incoming broker replies. |
| App password or OAuth credentials | IMAP app-password (Gmail) or Azure AD OAuth client-id/secret for Microsoft Graph. |
| `.env` configured | Copy `.env.example` to `.env` and fill in `IMAP_*` / `SMTP_*` / `BROKERBANE_EMAIL`, and optionally `AZURE_*` OAuth vars. |
| No main inbox leakage | Unless you are explicitly testing legacy mode, broker replies must arrive in the **removal mailbox's inbox**, not your personal inbox. |
| Brokerbane installed | `npm install` (or `npm run build` if using from source). |

---

## 2. CLI Dry-Run Smoke

Dry-run sends zero real emails.  Use it to verify the pipeline loads, identity
substitution works, and template rendering is correct.

```bash
# smoke-1: dry-run with no brokers selected (lists what would run)
brokerbane remove --dry-run

# smoke-2: dry-run against one specific broker ID
# Replace <BROKER_ID> with an actual broker ID from `brokerbane list-brokers`
brokerbane remove --dry-run --brokers <BROKER_ID>

# smoke-3: preview today's capped batch with no DB side effects
brokerbane remove --preview-today --brokers <BROKER_ID>
```

**Pass criteria:** no error thrown, output shows broker name, no SMTP/IMAP
connections opened. `--preview-today` must not create removal requests, pipeline
runs, email-log rows, browser sessions, or inbox monitors.

---

## 3. CLI Real-Send Smoke (1-2 Brokers)

Pick 1–2 low-risk brokers (Tier 3, web-form or hybrid, no known CAPTCHA).
Send real removal requests.

```bash
# Replace <BROKER_ID_1> and <BROKER_ID_2> with real broker IDs
# The --brokers flag accepts comma-separated IDs

# smoke-4: real send to 1 broker
brokerbane remove --brokers <BROKER_ID_1>

# smoke-5: real send to 2 brokers
brokerbane remove --brokers <BROKER_ID_1>,<BROKER_ID_2>
```

**Pass criteria:** brokerbane remove exits with code 0, IMAP connection logs
show message delivery, SMTP transport log shows 250 OK.

---

## 4. PWA mailto Smoke

Opens the system mail client with a pre-filled removal request.

```bash
# smoke-6: verify the PWA registers and mailto link is generated
# Serve the PWA dist (built):
cd pwa && npm install && npm run build && npx serve dist -p 3000 &
# Then open http://localhost:3000 in a browser
# Navigate to the removal form, fill in identity, select one broker,
# and click "Send Removal Request".  The system mail client should open
# with a mailto: URL containing encoded subject/body.
```

**Alternative CLI check (no browser required):**

```bash
# smoke-6b: check the mailto URL is correctly formed in the PWA source
grep -r "mailto:" pwa/dist/
```

**Pass criteria:** `mailto:` link is present in PWA output, subject line
contains broker name and GDPR/CCPA keyword.

---

## 5. PWA OAuth Smoke (Only if OAuth env vars are configured)

OAuth lets the PWA send email directly without opening the system mail client.

```bash
# Prerequisites: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
# must be set in .env on the PWA host.

# smoke-7: PWA OAuth flow
# Serve PWA and open http://localhost:3000
# Click "Sign in with Microsoft", complete the OAuth consent flow.
# The UI should show "Connected as <email>".
# Proceed to send a removal request — no system mail client should open.
```

**Pass criteria:** OAuth token is acquired, email sent via Microsoft Graph API
(verify in the removal mailbox sent folder).

---

## 6. Confirmation-Monitor Smoke

After sending, wait for broker confirmation and verify the inbox monitor
detects it.

```bash
# smoke-8: scan the removal mailbox once for pending confirmation tasks
brokerbane confirm

# smoke-9: repeat after a few minutes if brokers are expected to reply later
brokerbane confirm
```

**Pass criteria:** `brokerbane confirm` exits with code 0 and lists any pending
manual confirmation tasks. If a confirmation is detected, the database status
for the targeted broker should advance accordingly. Persistent watch mode is a
planned autopilot feature and is not yet exposed by the CLI.

---

## 7. What to Record After 24 h / 48 h / 72 h

After a real-send smoke, log into the removal mailbox and check for broker
replies.  Document each of the following checkpoints:

| Time | What to check |
|---|---|
| **24 h** | Any auto-acknowledgement?  Is the subject line and sender domain expected?  Mark request as ACKNOWLEDGED in `brokerbane status`. |
| **48 h** | Any processing notification?  Any request for additional identity documents?  Note any CAPTCHA or identity-verification link. |
| **72 h** | Has the broker confirmed permanent deletion?  Or have they asked for something unusual (see Stop Conditions)?  Finalise `brokerbane status` to COMPLETED or ESCALATED. |

**Commands to run at each checkpoint:**

```bash
# Refresh broker status in DB
brokerbane status --format table

# Export current evidence/status snapshot
brokerbane export --format json > ./smoke-$(date +%Y%m%d).json

# Optional: run a dry scan for selected people-search brokers
brokerbane scan --dry-run --brokers <BROKER_ID>
```

---

## 8. Stop Conditions — Abort the Run

**Do NOT proceed** with any broker if any of the following occur.  Mark the
request as ESCALATED in the database and open an issue at
https://github.com/Tranquil-Flow/broker-bane/issues.

| Condition | Why it matters | Action |
|---|---|---|
| **Bounce spike** — SMTP returns 5xx for > 20 % of requests in a single run | Indicates possible blacklisting or broker mail-system issue | Stop run, inspect SMTP logs, do not retry until root cause is known |
| **Spam warning** — removal email lands in the broker's spam/junk folder | Violates deliverability best practices; may damage sender reputation | Halt, check email headers, DKIM/SPF alignment, consider rescheduling |
| **Unexpected reply to main inbox** — broker responds to your personal address instead of the removal mailbox | Indicates misconfigured identity or forwarding rule; risks your personal inbox being flagged | Immediately switch identity, do not send further requests from that address |
| **Broker asks for sensitive ID upload** — broker email contains a link to upload government ID, passport, driver's licence | Legitimate brokers never ask for this via email | Do NOT click the link; mark as ESCALATED, report to project maintainers |
| **CAPTCHA wall** — broker's removal flow presents a CAPTCHA that cannot be solved programmatically | Current pipeline cannot bypass CAPTCHAs automatically | Pause broker in the database (`brokerbane settings edit --broker <ID> --pause`), open a bug report |
| **Legal threat or statutory demand** — broker's reply contains legal language, pre-litigation notices, or refers to police/law enforcement | Could indicate the broker disputes the data subject request | Stop all automation immediately, consult a lawyer before proceeding |

---

## Quick Reference: Smoke Commands Summary

```
# Preconditions check
node --version                              # must be >= 20
brokerbane list-brokers                     # confirm broker DB loads

# Phase 1: dry-run
brokerbane remove --dry-run
brokerbane remove --dry-run --brokers <ID>

# Phase 2: real send (1-2 brokers only)
brokerbane remove --brokers <ID_1>
brokerbane remove --brokers <ID_1>,<ID_2>

# Phase 3: PWA
# serve pwa/dist on localhost, open browser
grep -r "mailto:" pwa/dist/               # verify mailto presence

# Phase 4: monitor / confirmations
brokerbane confirm
brokerbane scan --dry-run --brokers <ID>

# Phase 5: evidence recording at 24/48/72 h
brokerbane status --format table
brokerbane export --format json > ./smoke-$(date +%Y%m%d).json
```

**Reminder:** No real broker sends without explicit approval from the project
maintainer or the owner of the removal mailbox.  All broker communication must
route through the dedicated removal mailbox.
