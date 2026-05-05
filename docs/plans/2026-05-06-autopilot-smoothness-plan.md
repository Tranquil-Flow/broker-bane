# BrokerBane Smooth Autopilot Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn BrokerBane from a careful local testing tool into a smooth, privacy-safe autopilot that previews work before side effects, paces sends over days, retries safely, monitors confirmations, and only interrupts the user when action is needed.

**Architecture:** Keep the CLI/core as the real automation engine; keep the local dashboard as the friendly control surface over that engine; keep the PWA as a browser-first guided/manual-safe surface with honest limits. All irreversible work must flow through shared safety helpers: broker-facing identity, daily cap, pacing, preview, retry, and confirmation state. No warm-up swarm, no automatic consumer mailbox creation, no real broker contact without explicit user approval.

**Tech Stack:** Node.js 20+, TypeScript, Commander CLI, Hono dashboard, SQLite via better-sqlite3, Nodemailer/IMAPFlow, Vite/React PWA, Vitest.

---

## 0. Product doctrine

1. BrokerBane needs real known/profile identifiers so brokers can find records to delete.
2. BrokerBane should send and receive through a dedicated broker-facing removal mailbox whenever possible.
3. Same-mailbox mode is a legacy fallback and must be visibly labelled as main-inbox contamination risk.
4. First real contact must be tiny, previewed, and reversible in spirit: dry-run first, sandbox first, then 1-2 real brokers.
5. Autopilot means quiet paced work, retry, confirmation monitoring, and clear status — not blasting every broker.
6. PWA-only automation has browser limits; do not pretend it can background-monitor IMAP or run forever without a local helper.
7. The happy path should feel like: “connect a dedicated removal mailbox, preview today’s tiny batch, turn on local autopilot, check only when BrokerBane asks.”

---

## 1. Current ground truth after latest hardening

Completed and committed locally:

- CLI `init` separates known/profile email from broker-facing removal mailbox.
- Local dashboard setup separates known/profile email from removal mailbox and writes the shared init config shape.
- PWA onboarding explains identifiers vs sending inbox and saves `broker-identity` separately.
- CLI `settings show` labels profile email, broker-facing mailbox, identity mode, privacy level, SMTP, confirmation monitoring, and same-mailbox warning.
- CLI `settings edit` can update broker-facing mailbox, daily cap, pacing delay, and dry-run default while preserving unrelated config fields.
- README distinguishes CLI, local dashboard, PWA, and nonexistent native desktop app.
- Core/PWA daily caps exist.
- Core shared batch preview exists: `Orchestrator.preview()`.
- CLI `remove --preview-today` exists and shows the concrete capped broker batch without side effects.
- PWA blocks restored OAuth providers without an in-memory access token and gates mailto drafts behind explicit user confirmation.
- PWA fake smoke-test mode exists and blocks real send/draft actions until exited.
- Ethereal sandbox smoke docs exist.
- Local dashboard manual task actions exist.
- Capped `RetryWorker` exists and respects identity daily caps.
- Foreground `brokerbane autopilot status/start/stop` exists.
- Autopilot runner previews before each cycle, respects daily caps, can run once or as a foreground loop, and supports test mode.
- Persistent `ConfirmationWorker` exists and is wrapped by autopilot lifecycle.

Known remaining gaps:

- Autopilot CLI does not yet instantiate and wire a real `RetryWorker`; the runner supports one, but `src/commands/autopilot.cmd.ts` does not pass it.
- Retry tasks do not yet have production handlers that reconstruct/resend email requests or re-run safe web/manual paths.
- Orchestrator email/web failures are not consistently enqueued into the retry queue with enough payload to retry later.
- Autopilot status does not yet show confirmation-monitor health, awaiting-confirmation counts, last confirmation, last cycle time, or auth-expired state.
- Notifications are still missing.
- Service/daemon install is intentionally not built yet; foreground mode must stay the only supported worker until real safety/status is solid.
- Top-tier broker dataset/playbook freshness needs repeatable audits.
- A repeatable pre-release verification script/checklist is still needed.
- Full real-email pilot has not been run. Real use should wait for sandbox SMTP/IMAP plus one-broker dedicated-mailbox smoke testing.

---

## 2. Execution status matrix

| Phase | Task | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Shared batch preview model | Done | `src/pipeline/orchestrator.ts`, preview tests |
| 1 | `remove --preview-today` | Done | `src/commands/remove.cmd.ts`, CLI build |
| 1 | Safe `settings edit` controls | Done | `src/commands/settings.cmd.ts` |
| 2 | PWA real-testing checklist | Done | `pwa/src/components/OnboardingWizard.tsx` |
| 2 | PWA fake smoke-test mode | Done | `pwa/src/components/OnboardingWizard.tsx`, `Dashboard.tsx` |
| 2 | Ethereal sandbox runbook | Done as docs | `docs/testing/ethereal-sandbox-smoke.md` |
| 3 | Capped retry worker | Done as worker | `src/pipeline/retry-worker.ts` |
| 3 | Foreground autopilot runner | Done | `src/pipeline/autopilot.ts`, `src/commands/autopilot.cmd.ts` |
| 3 | Persistent confirmation worker | Done | `src/inbox/confirmation-worker.ts` |
| 4 | Dashboard manual task actions | Done | dashboard task routes/views |
| 5 | Notifications | Not started | needs design + tests |
| 5 | Broker URL/playbook audit | Not started | needs command/script |
| 5 | Pre-release verification gate | Not started | needs script + docs |

---

## 3. Next sprint — make autopilot truly operational

### Task 3.4: Create retry handler factory for email retries

**Objective:** Give `RetryWorker` a production email handler that can safely retry a failed email task from persisted retry payload.

**Files:**
- Create: `src/pipeline/retry-handlers.ts`
- Modify if needed: `src/pipeline/orchestrator.ts`
- Test: `tests/unit/retry-handlers.test.ts`

**Required behavior:**

- Export a factory such as `createRetryHandlers(init)` returning `RetryWorkerHandlers`.
- The email handler must accept payloads with at least:
  - `requestId`
  - `brokerId`
  - `to`
  - optional `subject`
  - optional `body`
  - optional `templateName`
- If subject/body are missing, reconstruct them from config profile + broker + broker-facing email using the same template path as normal sends.
- Use `EmailSender` with broker identity SMTP, broker identity id, and test-mode/dry-run support.
- Record an outbound `email_log` row with `identity_id`, `from_addr`, `to_addr`, subject, message id, and sent/rejected status.
- Update request status through sending -> sent on success.
- Throw on all-recipient rejection so `RetryWorker` can requeue/remove based on retry policy.
- Do not send anything when dry-run/test-mode is true.

**TDD steps:**

1. Write a failing test that seeds a removal request and broker, injects a fake sender, processes an email retry, and expects:
   - fake sender called once with broker-facing `from`
   - `email_log.identity_id` equals broker identity id
   - request status becomes sent
   - queue task removed by `RetryWorker`
2. Write a failing test for rejected email: handler throws, worker records failure/requeue.
3. Write a failing test for missing broker/request: handler throws a permanent-looking error and the worker removes it after recordResult.
4. Implement minimal `retry-handlers.ts`.
5. Run focused tests and build.

**Verification:**

```bash
npm test -- tests/unit/retry-handlers.test.ts tests/unit/retry-worker.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

### Task 3.5: Enqueue transient send/web failures from orchestrator

**Objective:** Ensure real transient failures become durable retry tasks instead of disappearing as summary failures.

**Files:**
- Modify: `src/pipeline/orchestrator.ts`
- Test: `tests/unit/pipeline.test.ts` or `tests/unit/orchestrator-retry-enqueue.test.ts`

**Required behavior:**

- Create `RetryQueueRepo` and `RetryQueue` inside `Orchestrator.run()`.
- When email send fails with a transient error, enqueue `taskType: "email"` with enough payload for Task 3.4.
- When browser/playbook failure is transient and safe to retry, enqueue `taskType: "web_form"` with broker/request context; CAPTCHA/manual-required should not be retried forever.
- Preserve existing summary failure/manual counts.
- Do not enqueue in dry-run mode.
- Do not enqueue permanent/manual failures.

**TDD steps:**

1. Write a failing test with fake email sender throwing `ECONNRESET`; assert one retry_queue row with request id and broker id.
2. Write a failing test with permanent email error; assert no retry row.
3. Write a failing test with dry-run; assert no retry row.
4. Implement enqueue logic.
5. Run focused tests and build.

**Verification:**

```bash
npm test -- tests/unit/pipeline.test.ts tests/unit/retry-queue.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

### Task 3.6: Wire real RetryWorker into `brokerbane autopilot start`

**Objective:** Make the foreground autopilot actually process ready retry tasks during each cycle.

**Files:**
- Modify: `src/commands/autopilot.cmd.ts`
- Modify if needed: `src/pipeline/autopilot.ts`
- Test: `tests/unit/autopilot-command.test.ts` or extend `tests/unit/autopilot.test.ts`

**Required behavior:**

- In `autopilot start`, instantiate:
  - `RetryQueueRepo`
  - `RetryQueue`
  - `EmailLogRepo`
  - `RetryWorker`
  - real retry handlers from Task 3.4
- Pass the worker into `AutopilotRunner`.
- Preserve test-mode safety: in `--test-mode`, handler/sender must dry-run and no real SMTP/IMAP/web contact should happen.
- Expose a conservative default retry limit, e.g. 5 per cycle.
- Ensure worker DB closes exactly once on shutdown.

**TDD steps:**

1. Write a failing runner/command test showing `retryWorker.processReady()` is invoked once per cycle.
2. Write a failing CLI construction test with fake factories if command tests are feasible; otherwise keep command composition behind an injectable builder.
3. Implement wiring.
4. Run focused tests and build.

**Verification:**

```bash
npm test -- tests/unit/autopilot.test.ts tests/unit/retry-worker.test.ts tests/unit/retry-handlers.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
node dist/cli.js autopilot status
node dist/cli.js autopilot start --once --test-mode
```

### Task 3.7: Add autopilot state snapshot repository

**Objective:** Persist last-cycle and worker-health facts so status can answer “is BrokerBane quietly working?” without reading logs.

**Files:**
- Create: migration for `autopilot_state` or use existing key-value/settings table if present
- Create: `src/db/repositories/autopilot-state.repo.ts`
- Modify: `src/pipeline/autopilot.ts`
- Test: `tests/unit/autopilot-state.test.ts`

**Required behavior:**

Persist after each cycle:
- last cycle started/finished timestamps
- preview count
- sent/failed/manual counts
- retry processed/succeeded/failed/requeued/skippedDailyCap
- skipped reason
- confirmation worker configured boolean
- confirmation worker last start/stop/error if available
- test-mode boolean

**TDD steps:**

1. Write repository tests for upsert/get latest snapshot.
2. Write AutopilotRunner test that a cycle persists snapshot through an injected reporter/repo.
3. Implement repository + runner hook.
4. Run focused tests and build.

**Verification:**

```bash
npm test -- tests/unit/autopilot-state.test.ts tests/unit/autopilot.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

### Task 3.8: Upgrade `brokerbane autopilot status`

**Objective:** Make status an honest readiness/health diagnostic, not only a preview.

**Files:**
- Modify: `src/commands/autopilot.cmd.ts`
- Modify/create: `src/db/repositories/autopilot-state.repo.ts`
- Test: `tests/unit/autopilot-status.test.ts`

**Required output:**

- broker-facing mailbox and privacy mode
- daily cap / sent today / remaining today
- next capped broker batch
- retry pending and ready counts
- awaiting confirmation count
- confirmed today count
- last cycle timestamp and result summary
- confirmation monitor: configured / active last cycle / last error
- warning when SMTP/inbox auth is missing or same-mailbox mode is active
- next suggested command: preview, start once in test mode, or start foreground

**Verification:**

```bash
npm test -- tests/unit/autopilot-status.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
node dist/cli.js autopilot status
```

---

## 4. Next sprint — notifications that interrupt only when needed

### Task 5.2.1: Define notification events and sink interface

**Objective:** Create a small notification layer without coupling BrokerBane to one platform.

**Files:**
- Create: `src/notifications/events.ts`
- Create: `src/notifications/notifier.ts`
- Test: `tests/unit/notifier.test.ts`

**Required events:**

- `daily_batch_sent`
- `confirmation_received`
- `manual_action_required`
- `failure_spike`
- `mailbox_auth_expired`
- `daily_cap_reached`
- `same_mailbox_warning`

**Initial sinks:**

- Console/log sink only.
- Optional webhook/email/system notifications stay later; do not overbuild.

**Verification:**

```bash
npm test -- tests/unit/notifier.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

### Task 5.2.2: Emit notifications from autopilot boundaries

**Objective:** Notify only at meaningful boundaries, never for every broker unless manually requested.

**Files:**
- Modify: `src/pipeline/autopilot.ts`
- Modify: `src/inbox/confirmation-worker.ts`
- Test: `tests/unit/autopilot-notifications.test.ts`

**Required behavior:**

- Emit daily summary after a send cycle.
- Emit when daily cap is reached.
- Emit when ready retries fail repeatedly or a failure spike threshold is crossed.
- Emit when confirmation worker confirms a broker.
- Emit when inbox/SMTP auth errors occur.
- Keep notification payload PII-minimal by default: broker id/name and counts, not full profile details.

---

## 5. Next sprint — broker data and release gate

### Task 5.3: Top-tier broker URL/playbook audit command

**Objective:** Repeatedly verify that top broker opt-out URLs/playbooks are alive enough for testing.

**Files:**
- Create: `src/commands/audit-broker-urls.cmd.ts`
- Modify: `src/cli.ts`
- Create: `tests/unit/audit-broker-urls.test.ts`
- Create/update: `docs/testing/broker-url-audit.md`

**Required behavior:**

- Check top N brokers by tier/priority.
- Classify each as `live`, `blocked_or_auth`, `captcha`, `stale`, `missing_opt_out_url`, or `network_error`.
- Do not treat 401/403 as stale without browser-like GET evidence.
- Output compact table plus JSON option for CI.
- Default to low concurrency.

**Verification:**

```bash
npm test -- tests/unit/audit-broker-urls.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
node dist/cli.js audit-broker-urls --tier 1 --limit 10 --timeout-ms 10000 --json
```

### Task 5.4: Pre-release verification script

**Objective:** One repeatable gate before public claims or a wider pilot.

**Files:**
- Create: `docs/testing/pre-release-verification.md`
- Create: `scripts/pre-release-check.sh`

**Required checks:**

```bash
npm run build
npm test -- --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run audit:broker-urls -- --tier 1 --limit 40 --timeout-ms 30000
cd pwa && npm test -- --run --no-file-parallelism --pool=threads --maxWorkers=1 && npm run build
```

Also include:
- package smoke install in a temp project
- temp dry-run database smoke
- `remove --preview-today` side-effect check
- `autopilot start --once --test-mode` smoke
- Ethereal SMTP/IMAP sandbox smoke
- explicit “no real broker contact happened” verification for dry-run/test-mode paths

---

## 6. Real testing ladder

Do not jump straight from build-passing to full broker contact. Use this ladder:

1. Local fake PWA smoke mode.
2. CLI preview on a tiny broker subset:
   ```bash
   node dist/cli.js remove --preview-today --brokers zoominfo,clearbit --config /path/to/test-config.yaml
   ```
3. CLI dry run on the same tiny subset.
4. `autopilot start --once --test-mode` on the same tiny subset.
5. Ethereal SMTP/IMAP sandbox with one controlled message and confirmation-like reply.
6. Dedicated real removal mailbox, no main inbox.
7. One real email-only broker, daily cap 1, monitor confirmation/reply behavior.
8. Two to three email-only brokers, daily cap 2-3.
9. Add hybrid/manual webform brokers only after dashboard manual queue and status are pleasant.
10. Wider beta only after pre-release verification and broker URL audit pass.

---

## 7. Recommended execution order from here

1. Task 3.4 — retry handler factory for email retries.
2. Task 3.5 — enqueue transient failures from orchestrator.
3. Task 3.6 — wire real RetryWorker into autopilot CLI.
4. Task 3.7 — autopilot state snapshot repository.
5. Task 3.8 — richer autopilot status.
6. Task 5.2.1 — notification event/sink interface.
7. Task 5.2.2 — emit autopilot/confirmation notifications.
8. Task 5.3 — broker URL/playbook audit command.
9. Task 5.4 — pre-release verification gate.
10. Run the real testing ladder through Ethereal, then one real broker with a dedicated mailbox.

---

## 8. Smooth user journey acceptance criteria

BrokerBane should be judged by whether a non-technical user can run it without their normal life being disrupted. The acceptance test is not “can the CLI send email”; it is “can the user set this up once, understand what will happen, and trust the quiet worker.”

### Journey A: first local setup

**User story:** A user installs BrokerBane locally and wants maximum privacy without hand-editing YAML.

**Required path:**

1. User runs `brokerbane init` or local dashboard setup.
2. Setup asks for legal/profile identifiers separately from the broker-facing removal mailbox.
3. Setup recommends a dedicated mailbox and labels same-mailbox mode as legacy/risky.
4. Setup verifies SMTP before enabling real sends.
5. Setup verifies IMAP before enabling confirmation monitoring.
6. Setup defaults to dry-run until the user explicitly flips to real mode.
7. Setup defaults to a conservative daily cap, ideally 10/day for fresh mailboxes.
8. Setup ends with a concrete next command: preview today, dry-run, or autopilot test mode.

**Pass criteria:** The user never has to paste their personal mailbox as the operational sender unless they intentionally choose legacy mode.

### Journey B: first safe test

**User story:** A user wants to test BrokerBane without contacting brokers.

**Required path:**

1. PWA fake smoke-test mode works with no real identity.
2. `remove --preview-today` shows exact brokers and no side effects.
3. `remove --dry-run` renders requests but sends no SMTP.
4. `autopilot start --once --test-mode` proves the worker loop without SMTP/IMAP/web contact.
5. Ethereal sandbox proves real SMTP/IMAP plumbing but no broker delivery.

**Pass criteria:** A test run cannot accidentally open 1000 mailto drafts, send real broker emails, start a real monitor, or mutate the live user database.

### Journey C: first real broker pilot

**User story:** A user has a dedicated mailbox and is ready to contact one broker.

**Required path:**

1. User runs preview for one selected email-capable broker.
2. User runs dry-run for the same broker.
3. User sets daily cap to 1.
4. User starts `autopilot start --once` or runs `remove` for that one broker.
5. Status shows sent/awaiting confirmation.
6. Confirmation worker or manual task queue shows any next action.
7. User can pause everything.

**Pass criteria:** Exactly one outbound message is sent from the dedicated mailbox; replies/confirmations do not land in the main inbox.

### Journey D: quiet autopilot

**User story:** A user wants BrokerBane to keep working over days without babysitting.

**Required path:**

1. User sees status: next batch, daily cap, mailbox, retries, confirmations, manual tasks.
2. User starts foreground autopilot.
3. Autopilot previews before each cycle and sends only up to cap.
4. Autopilot retries transient failures later.
5. Autopilot monitors confirmations.
6. Autopilot emits a daily summary and alerts only for action-required states.
7. User can stop with Ctrl-C safely.

**Pass criteria:** No surprise sends, no hidden daemon, no silent auth expiry, no buried manual work.

---

## 9. Dedicated mailbox guidance and setup hardening

### Task 6.1: Add provider-specific dedicated-mailbox setup guides

**Objective:** Make it clear that BrokerBane does not auto-create mailboxes, while still guiding users smoothly through creating one.

**Files:**
- Create: `docs/setup/dedicated-mailbox.md`
- Modify: `README.md`
- Modify: CLI/dashboard setup copy if docs reveal mismatches

**Required content:**

- Recommended mailbox naming pattern, e.g. `privacy-removals@...` without exposing main identity unnecessarily.
- Gmail app-password path and caveats.
- Outlook app-password/OAuth path and caveats.
- Proton/Tuta caveat: consumer webmail may not expose SMTP/IMAP without a bridge/paid plan.
- Fastmail/custom-domain path as a good privacy-friendly option.
- Explicit split:
  - known/profile emails = identifiers brokers search for
  - broker-facing mailbox = operational sender/reply inbox
  - notification email = optional user-facing alerts later
- Warning that plus aliases are not equivalent to a dedicated mailbox.

**Verification:**

```bash
npm run build
```

### Task 6.2: Add `test-config` checks for privacy-safe identity

**Objective:** Catch misconfiguration before the first real send.

**Files:**
- Modify: `src/commands/test-config.cmd.ts` or equivalent config test command
- Test: `tests/unit/test-config-command.test.ts`

**Required behavior:**

- Warn when broker-facing mailbox equals profile email.
- Warn when SMTP auth user differs from broker identity email unless explicitly acknowledged.
- Warn when inbox auth user differs from broker identity email.
- Fail real-send readiness if SMTP cannot verify.
- Fail confirmation-monitor readiness if IMAP cannot verify.
- Keep dry-run readiness separate from real-send readiness.

**Verification:**

```bash
npm test -- tests/unit/test-config-command.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
node dist/cli.js test-config --config /tmp/brokerbane-test-config.yaml
```

---

## 10. Dashboard control center tasks

### Task 7.1: Dashboard autopilot status card

**Objective:** Give the local dashboard the same “is it working?” signal as the CLI.

**Files:**
- Modify: `src/dashboard/routes/dashboard.ts`
- Modify: `src/dashboard/views/components.ts`
- Use/create: `src/db/repositories/autopilot-state.repo.ts`
- Test: dashboard route/component tests

**Required UI:**

- Broker-facing mailbox and privacy mode.
- Daily cap, sent today, remaining today.
- Next batch preview count and first few broker names.
- Retry queue ready/pending.
- Awaiting confirmation.
- Manual tasks count.
- Last autopilot cycle time and result.
- Clear CTA:
  - Preview today
  - Start one safe test cycle
  - Open manual tasks
  - Fix mailbox auth

### Task 7.2: Dashboard pause/resume safety switch

**Objective:** Make “stop touching brokers” obvious and durable.

**Files:**
- Add config/state field if needed: `autopilot.paused`
- Modify: dashboard settings/routes
- Modify: `src/pipeline/autopilot.ts`
- Test: pause/resume tests

**Required behavior:**

- Pause prevents new sends and web actions.
- Pause does not prevent read-only status or manual viewing.
- Pause can optionally leave confirmation monitoring on; UI must label this clearly.
- Autopilot status shows paused state and next action.

---

## 11. PWA/local-dashboard boundary plan

The PWA is useful for onboarding, education, manual review, and smoke testing. The CLI/local dashboard is the real automation engine. Do not blur this boundary.

### Task 8.1: PWA handoff to local engine

**Objective:** When the PWA hits a browser limitation, guide users to the implemented local path instead of implying a nonexistent desktop app.

**Files:**
- Modify: `pwa/src/components/Dashboard.tsx`
- Modify: `pwa/src/components/Settings.tsx` if present
- Test: PWA component tests

**Required behavior:**

- PWA explains that background confirmation monitoring requires CLI/local dashboard.
- PWA offers copyable CLI commands for:
  - `brokerbane remove --preview-today`
  - `brokerbane autopilot status`
  - `brokerbane autopilot start --once --test-mode`
- PWA does not claim background operation when the browser tab is closed.
- Mailto remains a small manual-batch path only.

### Task 8.2: Export/import safe setup bundle between PWA and CLI

**Objective:** Let users start in PWA and continue locally without retyping everything, while keeping secrets out of exported files.

**Files:**
- Create: portable setup schema if not present
- Modify: PWA export UI
- Modify: CLI import command if needed
- Test: export/import schema tests

**Required behavior:**

- Export profile identifiers, broker-facing mailbox address, daily cap, pacing, and selected brokers.
- Do not export SMTP/IMAP passwords or OAuth tokens.
- CLI import prompts for or preserves local-only secrets.
- Export warns if same-mailbox mode is active.

---

## 12. Stop/rollback and evidence plan

### Task 9.1: Add explicit pause-all and recovery docs

**Objective:** Users need a moonlit emergency brake.

**Files:**
- Create: `docs/operations/pause-and-recovery.md`
- Modify: CLI help/status copy if needed

**Required content:**

- How to stop foreground autopilot.
- How to set dry-run true.
- How to reduce daily cap to 1.
- How to pause/disable a broker.
- How to inspect retry queue.
- How to export evidence before filing a bug.
- What to do if replies hit the main inbox.
- What to do on SMTP bounce spike, auth expiry, CAPTCHA wall, or legal/sensitive-ID request.

### Task 9.2: Evidence and audit export for pilots

**Objective:** Every real pilot should leave a compact, privacy-redacted record.

**Files:**
- Modify: export command if present
- Create/update: `docs/testing/pilot-evidence-template.md`
- Test: export redaction tests

**Required output:**

- config privacy mode and broker-facing mailbox domain, not full address by default
- broker ids/names contacted
- timestamps
- request statuses
- email status counts
- retry counts
- confirmation/manual-action counts
- redacted error summaries

---

## 13. Pilot readiness gates

### Gate A: no-contact local readiness

Must pass before any SMTP credentials are used:

```bash
npm run build
npm test -- --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
cd pwa && npm test -- --run --no-file-parallelism --pool=threads --maxWorkers=1 && npm run build
```

Plus manual checks:
- PWA fake smoke-test mode cannot send/open drafts.
- `remove --preview-today` creates no DB side effects.
- `autopilot start --once --test-mode` sends nothing.

### Gate B: sandbox email readiness

Must pass before any real broker email:

- Ethereal SMTP message is captured.
- From and Reply-To equal broker-facing mailbox.
- Dry-run sends nothing.
- Test-mode autopilot sends nothing.
- Confirmation monitor does not start during dry-run.

### Gate C: one-broker live readiness

Must pass before daily cap above 1:

- Dedicated real mailbox created and verified.
- SPF/DKIM/DMARC are acceptable for the sending domain if custom domain is used.
- `test-config` passes real-send and monitor checks.
- One broker selected explicitly.
- Daily cap set to 1.
- Main inbox receives no broker reply.
- Status and evidence export are understandable.

### Gate D: small beta readiness

Must pass before more than 3 brokers/day:

- Retry worker wired and tested.
- Autopilot status includes last cycle/retry/confirmation health.
- Notifications exist for auth expiry, manual action, failure spike, and daily summary.
- Broker URL audit passes on top-tier subset or known failures are documented.
- Pause/recovery docs exist.

---

## 14. Implementation contracts for the next code sprint

These contracts are intentionally explicit so the next implementation can proceed task-by-task without rediscovering intent.

### 14.1 Retry payload contract

Use a versioned payload so future migrations are possible.

```ts
export interface EmailRetryPayloadV1 {
  version: 1;
  kind: "email";
  requestId: number;
  brokerId: string;
  to: string;
  subject?: string;
  body?: string;
  templateName?: string;
  identityId: string;
  createdFrom: "orchestrator" | "manual" | "import";
  originalError?: {
    message: string;
    code?: string;
  };
}
```

Rules:

- `identityId` must match the broker-facing identity used for daily-cap accounting.
- `to` must be the broker email address, never the user profile email.
- `subject/body` may be persisted for exact replay, but the handler must also support reconstruction from template.
- Handler must validate request and broker still exist before sending.
- If request status is already confirmed/completed, handler should no-op successfully and remove the retry task.
- If request status is cancelled/manual_required due to user action, handler should no-op successfully and remove the retry task.
- If broker no longer has email capability, handler should throw a permanent error.

### 14.2 Retry handler dependency injection

Make retry handlers testable without live SMTP. Prefer this shape:

```ts
export interface RetryHandlerFactoryInit {
  config: AppConfig;
  brokers: readonly Broker[];
  requestRepo: RemovalRequestRepo;
  emailLogRepo: EmailLogRepo;
  senderFactory?: (smtp: SmtpConfig, dryRun: boolean, identityId: string) => Pick<EmailSender, "send" | "close">;
  dryRun?: boolean;
}

export function createRetryHandlers(init: RetryHandlerFactoryInit): RetryWorkerHandlers;
```

Rules:

- Tests must inject `senderFactory`; no test should rely on Nodemailer internals.
- The factory must close a sender it creates, or the caller must own sender lifecycle explicitly. Do not leak pooled transports.
- Dry-run/test-mode must use a no-side-effect sender path and still write enough local status for observability.
- Do not copy production template logic into tests. Tests should call the real template engine or assert only on stable fields like `from`, `to`, and status.

### 14.3 Autopilot status snapshot contract

Use one latest-row table plus optional historical rows later. Start simple.

Suggested schema:

```sql
CREATE TABLE IF NOT EXISTS autopilot_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  updated_at TEXT NOT NULL,
  last_cycle_started_at TEXT,
  last_cycle_finished_at TEXT,
  mode TEXT NOT NULL DEFAULT 'foreground',
  test_mode INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  preview_count INTEGER NOT NULL DEFAULT 0,
  remaining_today INTEGER NOT NULL DEFAULT 0,
  skipped_reason TEXT,
  pipeline_sent INTEGER NOT NULL DEFAULT 0,
  pipeline_failed INTEGER NOT NULL DEFAULT 0,
  pipeline_manual_required INTEGER NOT NULL DEFAULT 0,
  retry_processed INTEGER NOT NULL DEFAULT 0,
  retry_succeeded INTEGER NOT NULL DEFAULT 0,
  retry_failed INTEGER NOT NULL DEFAULT 0,
  retry_requeued INTEGER NOT NULL DEFAULT 0,
  retry_skipped_daily_cap INTEGER NOT NULL DEFAULT 0,
  confirmation_worker_configured INTEGER NOT NULL DEFAULT 0,
  confirmation_worker_started_at TEXT,
  confirmation_worker_stopped_at TEXT,
  confirmation_worker_last_error TEXT,
  last_error TEXT
);
```

Status command rules:

- If no snapshot exists, say “No autopilot cycle has run yet.”
- If snapshot is older than 24 hours and autopilot is expected to be running, show stale warning.
- Show paused/test-mode prominently.
- Show same-mailbox warning regardless of snapshot.
- Never print full profile address, phone, address, or DOB.

### 14.4 Notification event payload contract

Keep notification payloads PII-minimal.

```ts
export type NotificationSeverity = "info" | "warning" | "urgent";

export interface BrokerBaneNotification {
  type:
    | "daily_batch_sent"
    | "daily_cap_reached"
    | "confirmation_received"
    | "manual_action_required"
    | "failure_spike"
    | "mailbox_auth_expired"
    | "same_mailbox_warning"
    | "autopilot_stale";
  severity: NotificationSeverity;
  createdAt: string;
  title: string;
  message: string;
  brokerId?: string;
  brokerName?: string;
  counts?: Record<string, number>;
  nextAction?: string;
}
```

Rules:

- Notification text should say what happened and what the user should do next.
- Do not include full email bodies or profile details.
- Start with console/log/dashboard sinks only. Webhooks/system notifications are later.
- Failure-spike detection should be aggregate, e.g. more than 3 failures in a cycle or more than 20% failures, not one alert per broker.

---

## 15. Concrete testing fixtures to add

### 15.1 Shared fake config builder

**Objective:** Avoid brittle test setup and prevent accidental real SMTP/IMAP usage in unit tests.

**Files:**
- Create: `tests/helpers/config.ts` or extend existing helper

**Required helper:**

- `createTestConfig(overrides)` returns an `AppConfig` with:
  - profile email: `profile@example.invalid`
  - broker identity email: `removals@example.invalid`
  - SMTP host: `localhost`, password auth, no pool
  - inbox host: `localhost`, password auth, disabled unless explicitly requested
  - database path supplied per test
  - dry_run true by default
  - daily_limit 1 by default

**Rule:** Tests that verify real-send readiness must opt into `dry_run: false` explicitly.

### 15.2 Fake broker fixtures

**Files:**
- Create: `tests/fixtures/brokers.ts`

Required brokers:

- `email-basic`: email-only, has broker email, no confirmation required.
- `email-confirm`: email-only, requires email confirmation.
- `hybrid-basic`: hybrid with email and opt-out URL.
- `web-manual`: web_form only, opt-out URL.
- `captcha-web`: web_form only, CAPTCHA required.

Use these in retry/status/autopilot tests instead of relying on the full 1000+ broker dataset.

### 15.3 Side-effect sentinel tests

Add a small suite that protects the sacred boundaries:

- `remove --preview-today` does not create pipeline runs, requests, email logs, pending tasks, retry rows, or broker responses.
- `autopilot start --once --test-mode` does not call real sender, real inbox monitor, or browser launcher.
- PWA smoke-test mode disables OAuth send and mailto open paths.
- Same-mailbox mode always displays a warning in settings/status surfaces.

---

## 16. Pilot broker selection plan

Before any real broker email, choose targets deliberately.

### Email-only pilot candidates

Criteria:

- email-capable broker with stable contact mailbox
- no known sensitive-ID upload requirement
- no CAPTCHA-only opt-out path
- low legal/operational risk
- not a parent-company cluster that would cause duplicate requests across many child brokers

Selection task:

1. Add `brokerbane list-brokers --method email --tier 1 --json` if it does not exist.
2. Pick 5 candidates manually.
3. Run URL/contact audit on those candidates.
4. Select 1 for Gate C.
5. Save pilot notes in `docs/testing/pilot-candidates.md`.

### Webform pilot candidates

Do not include webform pilots until:

- manual queue UI is comfortable
- browser live checklist passes on fake profile
- CAPTCHA/manual-action statuses are clear
- user understands that webform automation is beta

First webform pilot should be a broker from `docs/testing/browser-automation-live-checklist.md`, likely `truepeoplesearch`, but only after current selectors are reverified.

---

## 17. Release-readiness claim levels

Use claim levels to avoid overpromising.

### Level 0 — local development only

Allowed claim:

- “Core flows build and tests pass locally.”

Not allowed:

- “Ready for real removals.”

### Level 1 — no-contact testing ready

Requirements:

- Gate A passes.
- PWA smoke mode verified.
- Preview/test-mode side-effect sentinels pass.

Allowed claim:

- “Ready for safe local exploration without contacting brokers.”

### Level 2 — sandbox email ready

Requirements:

- Gate B passes.
- Ethereal send verifies headers and identity.

Allowed claim:

- “Ready to validate email plumbing safely with a sandbox mailbox.”

### Level 3 — one-broker pilot ready

Requirements:

- Gate C passes.
- Retry handler wired.
- Status/evidence export understandable.

Allowed claim:

- “Ready for a one-broker pilot from a dedicated removal mailbox.”

### Level 4 — small beta ready

Requirements:

- Gate D passes.
- Notifications implemented.
- Broker URL audit passes for chosen subset.
- Pause/recovery docs complete.

Allowed claim:

- “Ready for small beta batches with conservative caps.”

Do not claim “fully automated broker removal” until browser automation, confirmations, manual queues, and broker dataset quality are proven across a broad real-world sample.

---

## 18. Suggested immediate implementation bundle

Bundle the next code work into one tight branch/commit series:

1. Add test fixtures/config builder.
2. Add retry payload types and retry handler factory.
3. Add orchestrator retry enqueue payloads.
4. Wire RetryWorker into autopilot CLI.
5. Add side-effect sentinel for `autopilot start --once --test-mode`.
6. Run:
   ```bash
   npm test -- tests/unit/retry-handlers.test.ts tests/unit/retry-worker.test.ts tests/unit/autopilot.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
   npm run build
   node dist/cli.js autopilot start --once --test-mode
   ```
7. Commit as:
   ```bash
   git commit -m "feat: wire autopilot retry handlers"
   ```

This bundle is the smallest useful step toward real autopilot: it converts retries from stored intent into safe, capped, broker-facing action.

---

## 19. Non-goals

- Do not auto-create a consumer mailbox.
- Do not build or imply a warm-up swarm.
- Do not contact real brokers without explicit user approval.
- Do not claim a native desktop app exists.
- Do not claim browser automation is production-ready until live browser/playbook tests pass.
- Do not make PWA-only background monitoring claims the browser cannot support.
- Do not install a hidden daemon until foreground autopilot has clear status, retry behavior, confirmation monitoring, and notification boundaries.
