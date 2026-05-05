# Browser Automation Live Checklist

> **Status: BETA** — This feature is considered experimental until live credentials pass all checks.
> Label any browser/webform automation as beta until verified against production brokers.

---

## Required Environment Variables

These are read from `process.env` at test runtime. Set them in your shell or `.env` file before running browser tests.

| Variable | Purpose | Where to Get It |
|---|---|---|
| `BROWSERBASE_API_KEY` | Browserbase cloud browser API key | Browserbase dashboard |
| `BROWSERBASE_PROJECT_ID` | Browserbase project ID | Browserbase dashboard |
| `STAGEHAND_LLM_KEY` | LLM API key (Anthropic or OpenAI) | Anthropic console / OpenAI dashboard |
| `STAGEHAND_PROVIDER` | LLM provider: `anthropic` or `openai` (default: `anthropic`) | — |
| `STAGEHAND_MODEL` | Model name (default: `claude-3-5-sonnet-latest`) | — |

### Verify env vars are set

```sh
# Before running any browser test, confirm these are non-empty:
echo "$BROWSERBASE_API_KEY"
echo "$BROWSERBASE_PROJECT_ID"
echo "$STAGEHAND_LLM_KEY"
```

---

## Command to Run Browser Integration Tests

Run **only** the browser integration tests (skipped automatically when env vars are missing):

```sh
npx vitest run tests/integration/browser.integration.test.ts
```

Run the **playbook selector health checks** (requires `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` only):

```sh
npx vitest run tests/integration/playbook.integration.test.ts
```

Run **all** integration tests:

```sh
npx vitest run tests/integration/
```

---

## Safe Fake Profile Constraints

All browser tests **must** use fake test data. Using real PII is prohibited.

| Field | Test Value | Notes |
|---|---|---|
| `first_name` | `Jane` | Fictional first name |
| `last_name` | `Testington` | Clearly fake surname |
| `email` | `jane.testington@example.com` | Non-routable domain |
| `phone` | `555-0100` | Fictional US phone |
| `address` | `123 Test Street` | Fictional address |
| `city` | `Springfield` | Common placeholder |
| `state` | `IL` | Illinois |
| `zip` | `62704` | Springfield, IL ZIP |
| `country` | `US` | — |

Do **not** use real names, real email addresses, real phone numbers, or real addresses in any browser automation test or playbook.

---

## Broker Selection Strategy

### Start Here: TruePeopleSearch

TruePeopleSearch is the recommended **first target** for live browser testing because:

- No CAPTCHA on the removal page
- No email confirmation required
- `requires_captcha: false`
- `requires_email_confirm: false`
- `difficulty: "easy"`, `tier: 1`
- Immediate removal (no waiting period)
- Opt-out URL: `https://www.truepeoplesearch.com/removal`

### Easy Brokers (Good for Initial Testing)

| Broker ID | Difficulty | CAPTCHA | Email Confirm |
|---|---|---|---|
| `truepeoplesearch` | Easy | No | No |
| `spokeo` | Easy | No | No |
| `whitepages` | Easy | No | No |
| `peoplefinder` | Easy | No | No |

### Harder Brokers (Test After Easy Ones Pass)

Avoid testing harder brokers (high difficulty, CAPTCHA required, email confirmation required) until the easy brokers consistently pass.

---

## Expected Failure Modes

### Bot Detection / Anti-Bot Block

**Symptoms:** Page shows a challenge screen, CAPTCHA, or "access denied" before or during form interaction.

**Likely causes:**
- Browserbase IP ranges are flagged by the broker
- Headless browser is detected via JavaScript fingerprinting
- Too many rapid requests from the same IP

**Mitigation:** Use Browserbase session management; add delays between steps in playbooks.

### Selector Drift

**Symptoms:** Playwright/Stagehand cannot find an element that was previously present; test fails with "selector not found".

**Likely causes:**
- Broker changed their HTML structure or element classes
- A/B test or layout change introduced new elements
- Dynamic content (ads, banners) inserted above target elements

**Mitigation:** Run playbook selector health checks regularly; update selectors when drift is detected.

### CAPTCHA Blocking Form Submission

**Symptoms:** Form displays a CAPTCHA challenge (reCAPTCHA, hCaptcha, image challenge) that cannot be bypassed programmatically.

**Likely causes:**
- Broker introduced CAPTCHA after detecting automated access
- Certain brokers require CAPTCHA at unpredictable intervals

**Mitigation:** Mark broker as `requires_captcha: true`; skip automated submission; flag for manual action.

### Fake Profile Rejected

**Symptoms:** Form accepts input but rejects submission with "invalid data" or "profile not found" message.

**Likely causes:**
- Broker validates against public records — fake names/addresses fail validation
- Form requires a real match to pre-populate (e.g., "search by your record")

**Mitigation:** Accept this as a **known, expected failure** for fake profiles. The system should handle this gracefully and return `success: false` with an informative error, not throw. Playbook execution should never crash on this; it should return a structured result with `failedStep` set.

---

## Running the Checklist

Before doing any live broker testing:

1. [ ] Confirm `BROWSERBASE_API_KEY` is set and non-empty
2. [ ] Confirm `BROWSERBASE_PROJECT_ID` is set and non-empty
3. [ ] Confirm `STAGEHAND_LLM_KEY` is set and non-empty
4. [ ] Run selector health checks: `npx vitest run tests/integration/playbook.integration.test.ts`
5. [ ] Verify TruePeopleSearch selectors pass (no selector drift)
6. [ ] Run TruePeopleSearch live test: `npx vitest run tests/integration/browser.integration.test.ts`
7. [ ] Confirm all tests complete with structured results (no unhandled exceptions)
8. [ ] Mark broker/webform automation as **BETA** in all user-facing documentation

---

## Interpreting Results

### Passing

- `success: true` — removal form submitted or record confirmed removed
- `requiresManualAction: false` — no human intervention needed

### Expected Failures (Do Not Block)

- `success: false` with `error: "profile not found"` — fake profile not in broker's database
- `success: false` with `failedStep` set — form rejected test data; this is normal for fake profiles
- `success: false` with CAPTCHA detected — broker requires human solving

### Blocking Failures (Investigate)

- Test throws an unhandled exception — bug in automation code
- `BROWSERBASE_API_KEY` or `STAGEHAND_LLM_KEY` errors — misconfiguration
- All selectors fail on a broker that previously passed — selector drift
