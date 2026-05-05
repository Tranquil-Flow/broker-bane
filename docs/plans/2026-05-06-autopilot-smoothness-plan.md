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

## 8. Non-goals

- Do not auto-create a consumer mailbox.
- Do not build or imply a warm-up swarm.
- Do not contact real brokers without explicit user approval.
- Do not claim a native desktop app exists.
- Do not claim browser automation is production-ready until live browser/playbook tests pass.
- Do not make PWA-only background monitoring claims the browser cannot support.
- Do not install a hidden daemon until foreground autopilot has clear status, retry behavior, confirmation monitoring, and notification boundaries.
