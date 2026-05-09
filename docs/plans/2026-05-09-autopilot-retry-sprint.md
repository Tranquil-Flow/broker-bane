# BrokerBane Autopilot Retry Sprint Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Wire BrokerBane autopilot retries end-to-end so transient failures become durable retry tasks, `brokerbane autopilot start --once --test-mode` can process retry work safely, and status can show whether the worker is healthy enough for sandbox testing.

**Architecture:** Keep side effects behind injectable adapters. Unit tests use fake senders, fake broker fixtures, and temp SQLite databases. Production code uses the same retry queue, removal request repository, email template path, email sender, and daily-cap accounting as normal sends. Test mode and dry-run must be no-contact paths.

**Tech Stack:** Node.js 20+, TypeScript, Vitest, Commander CLI, SQLite via better-sqlite3, Nodemailer through existing `EmailSender` abstraction.

---

## Definition of done

This sprint is complete when all of the following are true:

- transient email failures are persisted into `retry_queue` with a versioned payload
- `RetryWorker` has a production `email` handler factory
- retry tests inject a fake sender and never touch live SMTP
- retries respect broker-facing identity daily caps
- dry-run and `--test-mode` produce no SMTP, IMAP, browser, or broker contact
- `brokerbane autopilot start --once --test-mode` wires the real worker and exits cleanly
- `brokerbane autopilot status` can show pending/ready retry counts
- focused tests pass
- `npm run build` passes
- a local commit exists with the implementation

Non-goal for this sprint: notifications, daemon install, real broker contact, webform retry automation, and full dashboard UI polish.

---

## Safety invariants

1. No real network side effect in unit tests.
2. No real SMTP in dry-run or test-mode.
3. No real IMAP in dry-run or test-mode.
4. No browser launch in dry-run or test-mode.
5. The broker-facing mailbox is the sender/reply identity; profile emails are identifiers only.
6. A retry payload `to` address is always a broker address, never a user profile address.
7. Missing broker/request data must not create blind sends.
8. Already completed, confirmed, cancelled, or manual-required requests should no-op and remove the retry task.
9. Permanent/manual/CAPTCHA failures should not be retried forever.
10. Tests must not copy production template logic into helpers; use real template code or assert stable metadata only.

---

## Task 0: Baseline branch and test snapshot

**Objective:** Start from a known clean state and know which tests currently pass before changing code.

**Files:**
- No source changes.

**Steps:**

1. Check status.

```bash
git status --short
```

Expected: no unexpected user work. If there is unrelated work, stop and ask before touching it.

2. Create branch if needed.

```bash
git switch -c feat/autopilot-retry-handlers
```

If already on a suitable branch, stay there.

3. Run the focused baseline.

```bash
npm test -- tests/unit/retry-worker.test.ts tests/unit/autopilot.test.ts tests/unit/pipeline.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
```

Expected: existing tests pass. If not, record failures before editing.

---

## Task 1: Add shared fake config builder

**Objective:** Make retry/autopilot tests concise and safe by default.

**Files:**
- Create or extend: `tests/helpers/config.ts`
- Modify tests only if existing imports require index exports.

**Required helper:**

```ts
import type { AppConfig } from "../../src/types/config.js";

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return deepMergeDefaults({
    profile: {
      name: "Test User",
      emails: ["profile@example.invalid"],
    },
    brokerIdentity: {
      mode: "dedicated_mailbox",
      email: "removals@example.invalid",
    },
    email: {
      smtp: {
        host: "localhost",
        port: 2525,
        secure: false,
        auth: { user: "removals@example.invalid", pass: "test-password" },
        pool: false,
      },
      daily_limit: 1,
      delay_between_sends: 0,
    },
    inbox: {
      enabled: false,
      host: "localhost",
      port: 1143,
      secure: false,
      auth: { user: "removals@example.invalid", pass: "test-password" },
    },
    privacy: {
      dry_run: true,
    },
  }, overrides);
}
```

Use the actual project config shape and existing merge helper if names differ. The above is a contract, not a blind paste.

**TDD steps:**

1. Add a tiny test or use the helper in the first retry-handler test.
2. Verify default `dry_run` is true.
3. Verify overriding `privacy.dry_run` to false is explicit.

**Verification:**

```bash
npm test -- tests/unit/retry-worker.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
```

Commit:

```bash
git add tests/helpers/config.ts tests/unit/retry-worker.test.ts
git commit -m "test: add safe BrokerBane config fixture"
```

---

## Task 2: Add fake broker fixtures

**Objective:** Avoid coupling retry/status tests to the 1000+ real broker dataset.

**Files:**
- Create: `tests/fixtures/brokers.ts`

**Required fixtures:**

```ts
export const emailBasicBroker = {
  id: "email-basic",
  name: "Email Basic Broker",
  removal_method: "email",
  email: "privacy@email-basic.example.invalid",
  opt_out_url: undefined,
  requires_captcha: false,
};

export const emailConfirmBroker = {
  id: "email-confirm",
  name: "Email Confirm Broker",
  removal_method: "email",
  email: "privacy@email-confirm.example.invalid",
  requires_email_confirmation: true,
};

export const hybridBasicBroker = {
  id: "hybrid-basic",
  name: "Hybrid Basic Broker",
  removal_method: "hybrid",
  email: "privacy@hybrid-basic.example.invalid",
  opt_out_url: "https://hybrid-basic.example.invalid/opt-out",
};

export const webManualBroker = {
  id: "web-manual",
  name: "Web Manual Broker",
  removal_method: "web_form",
  opt_out_url: "https://web-manual.example.invalid/opt-out",
};

export const captchaWebBroker = {
  id: "captcha-web",
  name: "Captcha Web Broker",
  removal_method: "web_form",
  opt_out_url: "https://captcha-web.example.invalid/opt-out",
  requires_captcha: true,
};

export const testBrokers = [
  emailBasicBroker,
  emailConfirmBroker,
  hybridBasicBroker,
  webManualBroker,
  captchaWebBroker,
];
```

Adjust property names to the actual `Broker` type.

**Verification:**

```bash
npm run build
```

Commit:

```bash
git add tests/fixtures/brokers.ts
git commit -m "test: add BrokerBane broker fixtures"
```

---

## Task 3: Define retry payload types

**Objective:** Make retry payloads versioned and type-safe before handlers depend on them.

**Files:**
- Create: `src/pipeline/retry-payloads.ts`
- Test: `tests/unit/retry-payloads.test.ts`

**Implementation contract:**

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

export type RetryPayload = EmailRetryPayloadV1;

export function isEmailRetryPayloadV1(value: unknown): value is EmailRetryPayloadV1;
```

**TDD steps:**

1. Test valid payload passes.
2. Test wrong version fails.
3. Test wrong kind fails.
4. Test missing `requestId`, `brokerId`, `to`, or `identityId` fails.
5. Test `to` rejects obvious profile placeholder if the helper receives known profile emails; if validation requires config, leave this to handler tests.

**Verification:**

```bash
npm test -- tests/unit/retry-payloads.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

Commit:

```bash
git add src/pipeline/retry-payloads.ts tests/unit/retry-payloads.test.ts
git commit -m "feat: define retry payload contracts"
```

---

## Task 4: Create retry handler factory skeleton

**Objective:** Introduce `createRetryHandlers()` with dependency injection but no real send yet.

**Files:**
- Create: `src/pipeline/retry-handlers.ts`
- Test: `tests/unit/retry-handlers.test.ts`

**Factory contract:**

```ts
import type { EmailSender } from "../email/sender.js";
import type { AppConfig, SmtpConfig } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import type { EmailLogRepo } from "../db/repositories/email-log.repo.js";
import type { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";
import type { RetryWorkerHandlers } from "./retry-worker.js";

export interface RetryHandlerFactoryInit {
  config: AppConfig;
  brokers: readonly Broker[];
  requestRepo: RemovalRequestRepo;
  emailLogRepo: EmailLogRepo;
  senderFactory?: (
    smtp: SmtpConfig,
    dryRun: boolean,
    identityId: string
  ) => Pick<EmailSender, "send" | "close">;
  dryRun?: boolean;
}

export function createRetryHandlers(init: RetryHandlerFactoryInit): RetryWorkerHandlers {
  return {
    email: async (context) => {
      throw new Error("email retry handler not implemented");
    },
  };
}
```

Use actual project type names. If `SmtpConfig` is nested under another type, import that instead.

**TDD steps:**

1. Write a failing test that `createRetryHandlers()` returns an `email` handler.
2. Keep handler behavior test pending until Task 5.
3. Implement minimal skeleton.

**Verification:**

```bash
npm test -- tests/unit/retry-handlers.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

Commit:

```bash
git add src/pipeline/retry-handlers.ts tests/unit/retry-handlers.test.ts
git commit -m "feat: add retry handler factory"
```

---

## Task 5: Implement successful email retry handler

**Objective:** A queued email retry can resend through an injected sender and update local state.

**Files:**
- Modify: `src/pipeline/retry-handlers.ts`
- Modify: `tests/unit/retry-handlers.test.ts`

**Required behavior:**

- Validate payload with `isEmailRetryPayloadV1`.
- Load request by `payload.requestId`.
- Load broker by `payload.brokerId`.
- No-op successfully if request is already `sent`, `confirmed`, `completed`, `cancelled`, or `manual_required` depending on actual status enum.
- Throw permanent-looking error if broker missing or broker no longer has an email address.
- Use `payload.subject/body` if present.
- If subject/body missing, call the same production template/render path as normal email sends.
- Sender `from`/identity must be broker-facing mailbox, not profile email.
- Log email through `EmailLogRepo` with identity id, from, to, subject, message id, and status.
- Update request status to `sent` on success.
- Close sender if this factory owns it.

**Test shape:**

```ts
it("retries an email task using the broker-facing identity", async () => {
  const fakeSender = {
    send: vi.fn().mockResolvedValue({ messageId: "retry-message-1", accepted: ["privacy@email-basic.example.invalid"], rejected: [] }),
    close: vi.fn(),
  };

  const handlers = createRetryHandlers({
    config,
    brokers: [emailBasicBroker],
    requestRepo,
    emailLogRepo,
    senderFactory: vi.fn(() => fakeSender),
    dryRun: false,
  });

  await handlers.email!({ row, payload });

  expect(fakeSender.send).toHaveBeenCalledOnce();
  expect(fakeSender.send.mock.calls[0][0]).toMatchObject({
    to: "privacy@email-basic.example.invalid",
  });
  expect(emailLogRepo.countSentToday("broker-facing-removals@example.invalid or identity id")).toBe(1);
  expect(requestRepo.getById(request.id)?.status).toBe("sent");
});
```

Adjust identity value to match actual repository semantics.

**Verification:**

```bash
npm test -- tests/unit/retry-handlers.test.ts tests/unit/retry-worker.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

Commit:

```bash
git add src/pipeline/retry-handlers.ts tests/unit/retry-handlers.test.ts
git commit -m "feat: retry email removal requests"
```

---

## Task 6: Implement rejected/permanent/no-op retry paths

**Objective:** Retries should fail loudly when appropriate and disappear quietly when user action made them obsolete.

**Files:**
- Modify: `src/pipeline/retry-handlers.ts`
- Modify: `tests/unit/retry-handlers.test.ts`

**Required tests:**

1. Rejected all recipients:
   - fake sender returns all broker recipients in `rejected`
   - handler throws
   - `RetryWorker` records failure/requeue according to policy

2. Partial accept:
   - accepted contains broker recipient
   - handler succeeds

3. Missing request:
   - handler throws permanent error
   - worker removes after max attempts or marks failed according to existing queue behavior

4. Missing broker:
   - handler throws permanent error

5. Request already confirmed/completed:
   - handler returns successfully
   - sender not called
   - retry task removed by `RetryWorker`

6. Dry-run:
   - sender not called, or sender is called only if the injected fake is explicitly the dry-run adapter used by existing code
   - no outbound SMTP side effect
   - local status is sufficient for observability

**Verification:**

```bash
npm test -- tests/unit/retry-handlers.test.ts tests/unit/retry-worker.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

Commit:

```bash
git add src/pipeline/retry-handlers.ts tests/unit/retry-handlers.test.ts
git commit -m "test: cover retry email edge cases"
```

---

## Task 7: Enqueue transient orchestrator email failures

**Objective:** Normal pipeline failures should become durable retry work when safe.

**Files:**
- Modify: `src/pipeline/orchestrator.ts`
- Modify/create: `tests/unit/orchestrator-retry-enqueue.test.ts` or extend `tests/unit/pipeline.test.ts`

**Required behavior:**

- Create/use `RetryQueueRepo` and `RetryQueue` inside `Orchestrator.run()` or inject them for tests.
- When email send fails transiently, enqueue `task_type: "email"`.
- Payload must match `EmailRetryPayloadV1`:
  - `version: 1`
  - `kind: "email"`
  - `requestId`
  - `brokerId`
  - `to`
  - `subject/body` if already rendered
  - `identityId`
  - `createdFrom: "orchestrator"`
  - `originalError.message/code`
- Do not enqueue in dry-run.
- Do not enqueue permanent auth/validation/manual/CAPTCHA failures.
- Preserve existing summary failure counts.

**Transient classifier starting point:**

Treat these as transient:
- `ECONNRESET`
- `ETIMEDOUT`
- `EAI_AGAIN`
- SMTP 4xx codes
- network timeout errors

Treat these as permanent/manual until proven otherwise:
- invalid recipient / SMTP 5xx except rate-limit edge cases
- missing broker email
- missing profile identifiers
- CAPTCHA required
- sensitive ID upload required
- user-cancelled/manual-required

**TDD steps:**

1. Fake sender throws `ECONNRESET`; assert one retry row.
2. Fake sender throws permanent invalid recipient; assert no retry row.
3. Dry-run failed render/send path; assert no retry row.
4. Assert summary still reports failure.
5. Implement minimal enqueue logic.

**Verification:**

```bash
npm test -- tests/unit/orchestrator-retry-enqueue.test.ts tests/unit/pipeline.test.ts tests/unit/retry-queue.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

Commit:

```bash
git add src/pipeline/orchestrator.ts tests/unit/orchestrator-retry-enqueue.test.ts tests/unit/pipeline.test.ts
git commit -m "feat: enqueue transient email retries"
```

---

## Task 8: Wire real RetryWorker into autopilot start

**Objective:** `brokerbane autopilot start` should process ready retry tasks each cycle.

**Files:**
- Modify: `src/commands/autopilot.cmd.ts`
- Modify if needed: `src/pipeline/autopilot.ts`
- Test: `tests/unit/autopilot.test.ts` and/or `tests/unit/autopilot-command.test.ts`

**Required construction in command:**

- Open config/database as existing command does.
- Instantiate:
  - `RetryQueueRepo`
  - `RetryQueue`
  - `EmailLogRepo`
  - `RemovalRequestRepo`
  - `RetryWorker`
  - retry handlers from `createRetryHandlers()`
- Pass worker into `AutopilotRunner`.
- Use conservative default retry limit: 5 per cycle.
- In `--test-mode`, pass `dryRun: true` into retry handlers.
- Ensure DB/sender resources close once on shutdown.

**TDD steps:**

1. Runner-level test: when a retry worker is present, `processReady({ limit: 5 })` is called after preview/run decisions.
2. Command composition test if feasible: fake builder receives `testMode: true` and constructs dry-run retry handlers.
3. CLI smoke after build:

```bash
node dist/cli.js autopilot status
node dist/cli.js autopilot start --once --test-mode
```

Expected: exits cleanly; output says test mode/dry-run; no SMTP/IMAP/browser contact.

**Verification:**

```bash
npm test -- tests/unit/autopilot.test.ts tests/unit/retry-worker.test.ts tests/unit/retry-handlers.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
node dist/cli.js autopilot start --once --test-mode
```

Commit:

```bash
git add src/commands/autopilot.cmd.ts src/pipeline/autopilot.ts tests/unit/autopilot.test.ts tests/unit/autopilot-command.test.ts
git commit -m "feat: wire retry worker into autopilot"
```

---

## Task 9: Add side-effect sentinel for autopilot test mode

**Objective:** Lock the no-contact promise into the test suite.

**Files:**
- Create or modify: `tests/unit/autopilot-side-effects.test.ts`

**Required sentinel:**

- `autopilot start --once --test-mode` or equivalent runner/command path must not call:
  - real `EmailSender.send`
  - real inbox monitor start
  - browser launcher/playbook executor
- It may write safe local DB state.
- It may render templates.
- It may process retry queue rows only through dry-run handlers.

**Implementation guidance:**

If full CLI invocation is hard to isolate, expose a command builder or dependency factory from `autopilot.cmd.ts` so tests can pass spies for sender/inbox/browser factories. Do not skip the sentinel because the command is awkward; improve the seam.

**Verification:**

```bash
npm test -- tests/unit/autopilot-side-effects.test.ts tests/unit/autopilot.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
```

Commit:

```bash
git add src/commands/autopilot.cmd.ts tests/unit/autopilot-side-effects.test.ts
git commit -m "test: guard autopilot test mode side effects"
```

---

## Task 10: Show retry counts in autopilot status

**Objective:** Make status useful immediately after retry wiring, even before the full `autopilot_state` table lands.

**Files:**
- Modify: `src/commands/autopilot.cmd.ts`
- Test: `tests/unit/autopilot-status.test.ts`

**Required output:**

- pending retry count
- ready retry count
- daily cap
- sent today
- remaining today
- broker-facing mailbox/privacy mode
- same-mailbox warning when applicable
- suggested next command

**Example output shape:**

```text
Autopilot status
Broker-facing mailbox: removals@example.com
Identity mode: dedicated mailbox
Daily cap: 10
Sent today: 2
Remaining today: 8
Retries: 3 pending, 1 ready
Next: brokerbane autopilot start --once --test-mode
```

Do not print full profile address, phone, address, DOB, or generated email body.

**Verification:**

```bash
npm test -- tests/unit/autopilot-status.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
node dist/cli.js autopilot status
```

Commit:

```bash
git add src/commands/autopilot.cmd.ts tests/unit/autopilot-status.test.ts
git commit -m "feat: show retry health in autopilot status"
```

---

## Task 11: End-of-sprint verification

**Objective:** Prove the sprint is ready to hand to sandbox testing.

**Files:**
- No source changes unless docs need updates.

**Commands:**

```bash
npm test -- tests/unit/retry-payloads.test.ts tests/unit/retry-handlers.test.ts tests/unit/retry-worker.test.ts tests/unit/orchestrator-retry-enqueue.test.ts tests/unit/autopilot.test.ts tests/unit/autopilot-side-effects.test.ts tests/unit/autopilot-status.test.ts --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm run build
node dist/cli.js autopilot status
node dist/cli.js autopilot start --once --test-mode
```

If focused tests pass, run broader suite if time permits:

```bash
npm test -- --run --no-file-parallelism --maxWorkers=1 --minWorkers=1
```

Expected:

- focused tests pass
- build passes
- status command works
- test-mode command exits cleanly
- no real SMTP/IMAP/browser contact occurs

Commit any final docs or cleanup:

```bash
git status --short
git add <changed-files>
git commit -m "docs: record autopilot retry sprint verification"
```

---

## Handoff after this sprint

After this sprint, BrokerBane should move from Level 1 no-contact local readiness toward Level 2 sandbox email readiness.

Next sprint should be one of:

1. `autopilot_state` snapshot repository and richer status
2. Ethereal SMTP/IMAP sandbox smoke automation
3. notification event/sink interface
4. dedicated mailbox setup docs and `test-config` privacy checks

Do not run a real broker pilot until:

- retry worker is wired and tested
- status shows retry/confirmation health clearly
- sandbox SMTP/IMAP smoke passes
- a dedicated removal mailbox is configured
- daily cap is set to 1
- the selected broker is explicitly approved for live contact
