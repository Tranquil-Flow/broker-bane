import { escapeHtml } from "./components.js";
import type { ProviderConfig } from "../../providers/types.js";

const STEPS = [
  { num: 1, label: "PROFILE" },
  { num: 2, label: "CONNECT" },
  { num: 3, label: "OPTIONS" },
  { num: 4, label: "TEST" },
  { num: 5, label: "DONE" },
];

export function renderProgress(currentStep: number): string {
  return `<div class="wizard-progress">${STEPS.map((s, i) => {
    const cls = s.num < currentStep ? "completed" : s.num === currentStep ? "active" : "";
    const icon = s.num < currentStep ? "✓" : s.num === currentStep ? "●" : "○";
    const sep = i < STEPS.length - 1 ? '<span class="wizard-sep">─</span>' : "";
    return `<span class="wizard-step ${cls}">${icon} ${s.label}</span>${sep}`;
  }).join("")}</div>`;
}

export function renderStep1Profile(errors?: Record<string, string>): string {
  const e = errors ?? {};
  return `${renderProgress(1)}
<div class="wizard-body">
  <h3>Personal Information</h3>
  <p style="color:var(--text-dim);font-size:0.7rem;margin-bottom:1rem;">This information is included in your opt-out requests to data brokers. For best privacy, use a separate removal mailbox here instead of your everyday personal inbox.</p>
  <form hx-post="/api/setup/profile" hx-target="#wizard-container" hx-swap="innerHTML">
    <div class="wizard-row">
      <div class="wizard-field">
        <label for="first_name">First name *</label>
        <input type="text" id="first_name" name="first_name" required>
        ${e.first_name ? `<div class="field-error">${escapeHtml(e.first_name)}</div>` : ""}
      </div>
      <div class="wizard-field">
        <label for="last_name">Last name *</label>
        <input type="text" id="last_name" name="last_name" required>
        ${e.last_name ? `<div class="field-error">${escapeHtml(e.last_name)}</div>` : ""}
      </div>
    </div>
    <div class="wizard-field">
      <label for="email">Removal mailbox email *</label>
      <input type="email" id="email" name="email" required>
      ${e.email ? `<div class="field-error">${escapeHtml(e.email)}</div>` : ""}
      <div class="field-hint">Brokers will see this address. A dedicated removal mailbox is recommended.</div>
    </div>
    <div class="wizard-field">
      <label for="country">Country *</label>
      <select id="country" name="country">
        <option value="US">United States</option>
        <option value="UK">United Kingdom</option>
        <option value="EU">European Union</option>
        <option value="Other">Other</option>
      </select>
    </div>
    <details style="margin-top:1rem;">
      <summary style="color:var(--text-dim);font-size:0.7rem;cursor:pointer;letter-spacing:0.1em;">[+] ADDITIONAL DETAILS (optional)</summary>
      <div style="padding-top:0.75rem;">
        <div class="wizard-row">
          <div class="wizard-field">
            <label for="address">Address</label>
            <input type="text" id="address" name="address">
          </div>
          <div class="wizard-field">
            <label for="city">City</label>
            <input type="text" id="city" name="city">
          </div>
        </div>
        <div class="wizard-row">
          <div class="wizard-field">
            <label for="state">State</label>
            <input type="text" id="state" name="state">
          </div>
          <div class="wizard-field">
            <label for="zip">ZIP code</label>
            <input type="text" id="zip" name="zip">
          </div>
        </div>
        <div class="wizard-row">
          <div class="wizard-field">
            <label for="phone">Phone</label>
            <input type="text" id="phone" name="phone">
          </div>
          <div class="wizard-field">
            <label for="date_of_birth">Date of birth (YYYY-MM-DD)</label>
            <input type="text" id="date_of_birth" name="date_of_birth" placeholder="1990-01-15">
          </div>
        </div>
      </div>
    </details>
    <div class="wizard-actions">
      <button type="submit" class="wizard-btn">CONTINUE →</button>
    </div>
  </form>
</div>`;
}

export function renderStep2Connect(
  provider: ProviderConfig | null,
  email: string,
  oauthAvailable: boolean,
  error?: string,
): string {
  const providerName = provider?.name ?? "Custom";
  const detected = provider
    ? `<div class="wizard-alert success">✓ Detected: ${escapeHtml(providerName)} from ${escapeHtml(email)}</div>`
    : `<div class="wizard-alert info">ℹ Custom email provider — enter server details manually.</div>`;

  let authHtml = "";

  if (provider?.authMethods.includes("oauth2") && oauthAvailable) {
    // OAuth + app password fallback
    authHtml = `
      <a href="/api/setup/oauth-start" class="wizard-btn oauth" style="display:block;text-align:center;margin-bottom:1rem;">
        SIGN IN WITH ${escapeHtml(providerName.toUpperCase())}
      </a>
      <div style="text-align:center;color:var(--text-dim);font-size:0.65rem;margin-bottom:1rem;">── or ──</div>
      <form hx-post="/api/setup/auth" hx-target="#wizard-container" hx-swap="innerHTML">
        <div class="wizard-field">
          <label for="app_password">App password</label>
          <input type="password" id="app_password" name="app_password">
          ${provider.appPasswordPrereq ? `<div class="field-hint">⚠ ${escapeHtml(provider.appPasswordPrereq)}</div>` : ""}
          ${provider.appPasswordUrl ? `<div class="field-hint">→ Generate at: <a href="${escapeHtml(provider.appPasswordUrl)}" target="_blank" style="color:var(--cyan)">${escapeHtml(provider.appPasswordUrl)}</a></div>` : ""}
        </div>
        <div class="wizard-actions">
          <button type="submit" class="wizard-btn">CONTINUE →</button>
        </div>
      </form>`;
  } else if (provider?.authMethods.includes("bridge_password")) {
    // ProtonMail Bridge
    authHtml = `
      <form hx-post="/api/setup/auth" hx-target="#wizard-container" hx-swap="innerHTML">
        ${provider.bridgeInstructions ? `<div class="wizard-alert warn">⚠ ${escapeHtml(provider.bridgeInstructions)}</div>` : ""}
        <div class="wizard-field">
          <label for="app_password">Bridge password</label>
          <input type="password" id="app_password" name="app_password" required>
        </div>
        <div class="wizard-actions">
          <button type="submit" class="wizard-btn">CONTINUE →</button>
        </div>
      </form>`;
  } else if (provider?.authMethods.includes("app_password")) {
    // App password only (Yahoo, iCloud)
    authHtml = `
      <form hx-post="/api/setup/auth" hx-target="#wizard-container" hx-swap="innerHTML">
        <div class="wizard-field">
          <label for="app_password">App password</label>
          <input type="password" id="app_password" name="app_password" required>
          ${provider.appPasswordPrereq ? `<div class="field-hint">⚠ ${escapeHtml(provider.appPasswordPrereq)}</div>` : ""}
          ${provider.appPasswordUrl ? `<div class="field-hint">→ Generate at: <a href="${escapeHtml(provider.appPasswordUrl)}" target="_blank" style="color:var(--cyan)">${escapeHtml(provider.appPasswordUrl)}</a></div>` : ""}
        </div>
        <div class="wizard-actions">
          <button type="submit" class="wizard-btn">CONTINUE →</button>
        </div>
      </form>`;
  } else {
    // Custom SMTP
    authHtml = `
      <form hx-post="/api/setup/auth" hx-target="#wizard-container" hx-swap="innerHTML">
        <div class="wizard-row">
          <div class="wizard-field">
            <label for="smtp_host">SMTP host</label>
            <input type="text" id="smtp_host" name="smtp_host" required placeholder="smtp.example.com">
          </div>
          <div class="wizard-field">
            <label for="smtp_port">SMTP port</label>
            <input type="number" id="smtp_port" name="smtp_port" value="587">
          </div>
        </div>
        <div class="wizard-field">
          <label for="smtp_user">Username</label>
          <input type="text" id="smtp_user" name="smtp_user" required>
        </div>
        <div class="wizard-field">
          <label for="app_password">Password</label>
          <input type="password" id="app_password" name="app_password" required>
        </div>
        <div class="wizard-actions">
          <button type="submit" class="wizard-btn">CONTINUE →</button>
        </div>
      </form>`;
  }

  return `${renderProgress(2)}
<div class="wizard-body">
  <h3>Connect your removal mailbox (${escapeHtml(providerName)})</h3>
  ${detected}
  ${error ? `<div class="wizard-alert error">${escapeHtml(error)}</div>` : ""}
  ${authHtml}
</div>`;
}

export function renderStep3Options(
  provider: ProviderConfig | null,
  email: string,
  usedOAuth: boolean,
  country: string,
): string {
  // Alias section
  let aliasHtml = "";
  if (provider?.generateAlias) {
    const alias = provider.generateAlias(email);
    aliasHtml = `
      <div class="wizard-section">
        <h3>Sending Address</h3>
        <p style="color:var(--text-dim);font-size:0.7rem;margin-bottom:0.75rem;">Optional: add an alias on top of your removal mailbox for extra separation.</p>
        <div class="wizard-radio">
          <input type="radio" id="alias_generated" name="alias_choice" value="generated" checked>
          <label for="alias_generated">${escapeHtml(alias)} <span style="color:var(--green-dim)">(recommended)</span></label>
        </div>
        <div class="wizard-radio">
          <input type="radio" id="alias_real" name="alias_choice" value="real">
          <label for="alias_real">${escapeHtml(email)}</label>
        </div>
        <div class="wizard-radio">
          <input type="radio" id="alias_custom" name="alias_choice" value="custom">
          <label for="alias_custom">Custom:</label>
          <input type="text" name="custom_alias" style="width:auto;display:inline-block;margin-left:0.5rem;padding:0.25rem 0.5rem;font-size:0.7rem;background:var(--bg);color:var(--text);border:1px solid var(--border);font-family:var(--font);">
        </div>
        <input type="hidden" name="generated_alias" value="${escapeHtml(alias)}">
      </div>`;
  } else {
    aliasHtml = `
      <div class="wizard-section">
        <h3>Sending Address</h3>
        <div class="wizard-alert warn">Note: ${escapeHtml(provider?.name ?? "Your provider")} doesn't support email aliases. Brokers will see the removal mailbox you connected.</div>
      </div>`;
  }

  // IMAP section
  const imapInfo = usedOAuth
    ? "No extra setup — uses your existing sign-in."
    : provider
      ? "Uses the same credentials as your email connection."
      : "";

  let imapExtraFields = "";
  if (!provider) {
    imapExtraFields = `
      <div id="imap-fields" style="margin-top:0.75rem;display:none;">
        <div class="wizard-row">
          <div class="wizard-field">
            <label for="imap_host">IMAP host</label>
            <input type="text" id="imap_host" name="imap_host" placeholder="imap.example.com">
          </div>
          <div class="wizard-field">
            <label for="imap_port">IMAP port</label>
            <input type="number" id="imap_port" name="imap_port" value="993">
          </div>
        </div>
        <div class="wizard-field">
          <label for="imap_user">Username</label>
          <input type="text" id="imap_user" name="imap_user">
        </div>
        <div class="wizard-field">
          <label for="imap_pass">Password</label>
          <input type="password" id="imap_pass" name="imap_pass">
        </div>
      </div>
      <script>
        document.querySelector('[name="enable_imap"]').addEventListener('change', function() {
          document.getElementById('imap-fields').style.display = this.checked ? 'block' : 'none';
        });
      </script>`;
  }

  // Template section
  const suggestedTemplate = country === "US" ? "ccpa" : (country === "UK" || country === "EU") ? "gdpr" : "generic";
  const templates = ["gdpr", "ccpa", "generic"];

  return `${renderProgress(3)}
<div class="wizard-body">
  <form hx-post="/api/setup/options" hx-target="#wizard-container" hx-swap="innerHTML">
    ${aliasHtml}

    <div class="wizard-section">
      <h3>Inbox Monitoring</h3>
      <div class="wizard-check">
        <input type="checkbox" id="enable_imap" name="enable_imap" value="1" checked>
        <label for="enable_imap">Automatically handle broker confirmation emails</label>
      </div>
      ${imapInfo ? `<div class="field-hint" style="margin-left:1.5rem;">ℹ ${escapeHtml(imapInfo)}</div>` : ""}
      ${imapExtraFields}
    </div>

    <div class="wizard-section">
      <h3>Privacy Law</h3>
      <div class="wizard-field">
        <label for="template">Email template</label>
        <select id="template" name="template">
          ${templates.map((t) => `<option value="${t}"${t === suggestedTemplate ? " selected" : ""}>${t.toUpperCase()}${t === suggestedTemplate ? " (recommended)" : ""}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="wizard-actions">
      <button type="submit" class="wizard-btn">CONTINUE →</button>
    </div>
  </form>
</div>`;
}

export function renderStep4Test(): string {
  return `${renderProgress(4)}
<div class="wizard-body">
  <h3>Testing Connection</h3>
  <div id="test-results" hx-post="/api/setup/test" hx-trigger="load" hx-swap="innerHTML">
    <div class="wizard-test-row">
      <span class="test-label">SMTP</span>
      <span class="test-loading">Testing...</span>
    </div>
  </div>
</div>`;
}

export function renderStep4TestResults(
  smtpOk: boolean,
  smtpError: string | null,
  imapOk: boolean | null,
  imapError: string | null,
  providerHelpUrl?: string,
): string {
  const smtpHtml = smtpOk
    ? `<div class="wizard-test-row"><span class="test-label">SMTP</span><span class="test-pass">✓ Connected</span></div>`
    : `<div class="wizard-test-row"><span class="test-label">SMTP</span><span class="test-fail">✗ ${escapeHtml(smtpError ?? "Connection failed")}</span></div>`;

  let imapHtml = "";
  if (imapOk !== null) {
    imapHtml = imapOk
      ? `<div class="wizard-test-row"><span class="test-label">IMAP</span><span class="test-pass">✓ Connected</span></div>`
      : `<div class="wizard-test-row"><span class="test-label">IMAP</span><span class="test-fail">✗ ${escapeHtml(imapError ?? "Connection failed")}</span></div>`;
  }

  const allOk = smtpOk && (imapOk === null || imapOk);

  const helpHtml = !allOk && providerHelpUrl
    ? `<div class="wizard-alert warn" style="margin-top:1rem;">Check your credentials. <a href="${escapeHtml(providerHelpUrl)}" target="_blank" style="color:var(--cyan)">Generate a new app password →</a></div>`
    : "";

  const actions = allOk
    ? `<div class="wizard-actions">
        <form hx-post="/api/setup/complete" hx-target="#wizard-container" hx-swap="innerHTML">
          <button type="submit" class="wizard-btn">CONTINUE →</button>
        </form>
      </div>`
    : `<div class="wizard-actions">
        <a href="/setup" class="wizard-btn secondary">← BACK</a>
        <form hx-post="/api/setup/test" hx-target="#test-results" hx-swap="innerHTML" style="display:inline;">
          <button type="submit" class="wizard-btn">RETRY</button>
        </form>
      </div>`;

  return `${smtpHtml}${imapHtml}${helpHtml}${actions}`;
}

export function renderStep5Done(
  providerName: string,
  sendingAddress: string,
  template: string,
  imapEnabled: boolean,
  imapMethod: string,
): string {
  return `${renderProgress(5)}
<div class="wizard-body">
  <h3>Setup Complete</h3>
  <div class="wizard-alert success">✓ Configuration saved to ~/.brokerbane/config.yaml</div>
  <dl class="wizard-summary">
    <dt>Provider</dt><dd>${escapeHtml(providerName)}</dd>
    <dt>Sending as</dt><dd>${escapeHtml(sendingAddress)}</dd>
    <dt>Template</dt><dd>${escapeHtml(template.toUpperCase())}</dd>
    <dt>Inbox monitoring</dt><dd>${imapEnabled ? `Enabled (${escapeHtml(imapMethod)})` : "Disabled"}</dd>
  </dl>
  <div class="ascii-flow" style="margin-top:1rem;">  Next steps:
  $ brokerbane remove --dry-run   Preview removals
  $ brokerbane remove             Start removing data</div>
  <div class="wizard-actions">
    <a href="/" class="wizard-btn">GO TO DASHBOARD →</a>
  </div>
</div>`;
}
