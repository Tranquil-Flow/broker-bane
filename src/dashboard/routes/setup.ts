import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import yaml from "js-yaml";
import type { AppConfig } from "../../types/config.js";
import { resolveConfigPath } from "../../config/loader.js";
import { detectProvider } from "../../providers/registry.js";
import type { ProviderConfig } from "../../providers/types.js";
import { layout } from "../views/layout.js";
import {
  renderStep1Profile,
  renderStep2Connect,
  renderStep3Options,
  renderStep4Test,
  renderStep4TestResults,
  renderStep5Done,
} from "../views/setup-steps.js";

// ── Wizard state (module-level, single-user localhost) ──

interface WizardProfile {
  first_name: string;
  last_name: string;
  email: string;
  country: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  date_of_birth?: string;
}

interface WizardState {
  profile?: WizardProfile;
  provider?: ProviderConfig | null;
  smtpAuth?: { type: "password"; user: string; pass: string } | { type: "oauth2"; user: string; provider: "google" | "microsoft" };
  smtpHost?: string;
  smtpPort?: number;
  usedOAuth?: boolean;
  alias?: string;
  enableImap?: boolean;
  imapAuth?: { type: "password"; user: string; pass: string } | { type: "oauth2"; user: string; provider: "google" | "microsoft" };
  imapHost?: string;
  imapPort?: number;
  template?: string;
  msftVerifier?: string; // PKCE verifier for Microsoft OAuth
}

let wizardState: WizardState = {};

// ── Helper ──

function oauthAvailable(provider: ProviderConfig | null): boolean {
  if (!provider?.oauthProvider) return false;
  if (provider.oauthProvider === "google") {
    return !!(process.env.BROKERBANE_GOOGLE_CLIENT_ID && process.env.BROKERBANE_GOOGLE_CLIENT_SECRET);
  }
  if (provider.oauthProvider === "microsoft") {
    return !!process.env.BROKERBANE_MICROSOFT_CLIENT_ID;
  }
  return false;
}

function str(val: unknown): string {
  return typeof val === "string" ? val.trim() : "";
}

function startPageHtml(): string {
  return layout("Setup", "SETUP", `<div class="panel"><div id="wizard-container">${renderStep1Profile()}</div></div>`);
}

// ── Route registration ──

export function registerSetupRoutes(app: Hono, _db: Database, _config?: AppConfig, dashboardPort?: number): void {
  const port = dashboardPort ?? 3847;
  const callbackUri = `http://localhost:${port}/api/setup/oauth-callback`;

  // GET /setup — full page, reset wizard, show step 1
  app.get("/setup", (c) => {
    wizardState = {};
    const bodyHtml = `<div class="panel"><div id="wizard-container">${renderStep1Profile()}</div></div>`;
    return c.html(layout("Setup", "SETUP", bodyHtml));
  });

  // POST /api/setup/profile — validate profile, detect provider, return step 2
  app.post("/api/setup/profile", async (c) => {
    const body = await c.req.parseBody();
    const firstName = str(body["first_name"]);
    const lastName = str(body["last_name"]);
    const email = str(body["email"]);
    const country = str(body["country"]) || "US";

    // Validation
    const errors: Record<string, string> = {};
    if (!firstName) errors.first_name = "Required";
    if (!lastName) errors.last_name = "Required";
    if (!email || !email.includes("@")) errors.email = "Valid email required";

    if (Object.keys(errors).length > 0) {
      return c.html(renderStep1Profile(errors));
    }

    const provider = detectProvider(email);

    wizardState.profile = {
      first_name: firstName,
      last_name: lastName,
      email,
      country,
      address: str(body["address"]) || undefined,
      city: str(body["city"]) || undefined,
      state: str(body["state"]) || undefined,
      zip: str(body["zip"]) || undefined,
      phone: str(body["phone"]) || undefined,
      date_of_birth: str(body["date_of_birth"]) || undefined,
    };
    wizardState.provider = provider;

    // Set SMTP defaults from provider
    if (provider) {
      wizardState.smtpHost = provider.smtp.host;
      wizardState.smtpPort = provider.smtp.port;
    }

    return c.html(renderStep2Connect(provider, email, oauthAvailable(provider)));
  });

  // GET /api/setup/oauth-start — redirect to Google/Microsoft OAuth
  app.get("/api/setup/oauth-start", async (c) => {
    const provider = wizardState.provider;
    if (!provider?.oauthProvider) {
      return c.html(renderStep2Connect(provider ?? null, wizardState.profile?.email ?? "", false, "OAuth not available for this provider."));
    }

    try {
      if (provider.oauthProvider === "google") {
        const { getGoogleAuthUrl } = await import("../../auth/google-oauth.js");
        const authUrl = getGoogleAuthUrl(callbackUri);
        return c.redirect(authUrl);
      } else {
        const { getMicrosoftAuthUrl } = await import("../../auth/microsoft-oauth.js");
        const { url, verifier } = await getMicrosoftAuthUrl(callbackUri);
        wizardState.msftVerifier = verifier;
        return c.redirect(url);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OAuth flow failed";
      return c.html(layout("Setup", "SETUP",
        `<div class="panel"><div id="wizard-container">${renderStep2Connect(provider, wizardState.profile?.email ?? "", false, msg)}</div></div>`
      ));
    }
  });

  // GET /api/setup/oauth-callback — exchange code, return full page at step 3
  app.get("/api/setup/oauth-callback", async (c) => {
    const code = c.req.query("code");
    const error = c.req.query("error");
    const provider = wizardState.provider;
    const email = wizardState.profile?.email ?? "";

    if (error || !code) {
      const msg = error ?? "No authorization code received.";
      return c.html(layout("Setup", "SETUP",
        `<div class="panel"><div id="wizard-container">${renderStep2Connect(provider ?? null, email, oauthAvailable(provider ?? null), msg)}</div></div>`
      ));
    }

    try {
      if (provider?.oauthProvider === "google") {
        const { exchangeGoogleCode } = await import("../../auth/google-oauth.js");
        await exchangeGoogleCode(code, callbackUri);
      } else if (provider?.oauthProvider === "microsoft") {
        const { exchangeMicrosoftCode } = await import("../../auth/microsoft-oauth.js");
        await exchangeMicrosoftCode(code, callbackUri, wizardState.msftVerifier ?? "");
      }

      wizardState.smtpAuth = { type: "oauth2", user: email, provider: provider!.oauthProvider! };
      wizardState.usedOAuth = true;

      // Return full page at step 3
      const bodyHtml = `<div class="panel"><div id="wizard-container">${renderStep3Options(provider ?? null, email, true, wizardState.profile?.country ?? "US")}</div></div>`;
      return c.html(layout("Setup", "SETUP", bodyHtml));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Token exchange failed";
      return c.html(layout("Setup", "SETUP",
        `<div class="panel"><div id="wizard-container">${renderStep2Connect(provider ?? null, email, oauthAvailable(provider ?? null), msg)}</div></div>`
      ));
    }
  });

  // POST /api/setup/auth — handle app password submission, return step 3
  app.post("/api/setup/auth", async (c) => {
    const body = await c.req.parseBody();
    const email = wizardState.profile?.email ?? "";
    const provider = wizardState.provider;
    // Strip spaces from app passwords for known providers (Google/Apple format with spaces)
    const rawPassword = str(body["app_password"]);
    const password = provider ? rawPassword.replace(/\s/g, "") : rawPassword;

    // Custom SMTP fields
    const smtpHost = str(body["smtp_host"]);
    const smtpPort = parseInt(str(body["smtp_port"]) || "587", 10);
    const smtpUser = str(body["smtp_user"]) || email;

    if (!password) {
      return c.html(renderStep2Connect(provider ?? null, email, oauthAvailable(provider ?? null), "Password is required."));
    }

    if (!provider) {
      // Custom provider
      if (!smtpHost) {
        return c.html(renderStep2Connect(null, email, false, "SMTP host is required."));
      }
      wizardState.smtpHost = smtpHost;
      wizardState.smtpPort = smtpPort;
      wizardState.smtpAuth = { type: "password", user: smtpUser, pass: password };
    } else {
      wizardState.smtpAuth = { type: "password", user: email, pass: password };
    }
    wizardState.usedOAuth = false;

    return c.html(renderStep3Options(provider ?? null, email, false, wizardState.profile?.country ?? "US"));
  });

  // POST /api/setup/options — save alias/imap/template, return step 4
  app.post("/api/setup/options", async (c) => {
    const body = await c.req.parseBody();
    const provider = wizardState.provider;
    const email = wizardState.profile?.email ?? "";

    // Alias
    const aliasChoice = str(body["alias_choice"]);
    if (aliasChoice === "generated") {
      wizardState.alias = str(body["generated_alias"]);
    } else if (aliasChoice === "custom") {
      wizardState.alias = str(body["custom_alias"]) || undefined;
    } else {
      wizardState.alias = undefined;
    }

    // IMAP
    const enableImap = body["enable_imap"] === "1";
    wizardState.enableImap = enableImap;

    if (enableImap) {
      if (wizardState.usedOAuth && provider?.oauthProvider) {
        wizardState.imapAuth = { type: "oauth2", user: email, provider: provider.oauthProvider };
        wizardState.imapHost = provider.imap.host;
        wizardState.imapPort = provider.imap.port;
      } else if (provider) {
        wizardState.imapAuth = wizardState.smtpAuth as { type: "password"; user: string; pass: string };
        wizardState.imapHost = provider.imap.host;
        wizardState.imapPort = provider.imap.port;
      } else {
        // Custom provider
        const imapHost = str(body["imap_host"]);
        const imapPort = parseInt(str(body["imap_port"]) || "993", 10);
        const imapUser = str(body["imap_user"]) || email;
        const imapPass = str(body["imap_pass"]);
        wizardState.imapHost = imapHost;
        wizardState.imapPort = imapPort;
        wizardState.imapAuth = { type: "password", user: imapUser, pass: imapPass };
      }
    }

    // Template
    wizardState.template = str(body["template"]) || "generic";

    return c.html(renderStep4Test());
  });

  // POST /api/setup/test — run connection tests, return results
  app.post("/api/setup/test", async (c) => {
    if (!wizardState.profile || !wizardState.smtpAuth) {
      return c.html(startPageHtml());
    }

    let smtpOk = false;
    let smtpError: string | null = null;
    let imapOk: boolean | null = null;
    let imapError: string | null = null;

    // Test SMTP
    try {
      const { EmailSender } = await import("../../email/sender.js");
      const sender = new EmailSender({
        host: wizardState.smtpHost!,
        port: wizardState.smtpPort!,
        secure: false,
        auth: wizardState.smtpAuth!,
        pool: false,
        rate_limit: 5,
        rate_delta_ms: 60000,
      }, false);
      await sender.verify();
      await sender.close();
      smtpOk = true;
    } catch (err) {
      smtpError = err instanceof Error ? err.message : "SMTP connection failed";
    }

    // Test IMAP
    if (wizardState.enableImap && wizardState.imapHost) {
      try {
        const { resolveImapAuth } = await import("../../inbox/monitor.js");
        const { ImapFlow } = await import("imapflow");
        const imapAuth = await resolveImapAuth(wizardState.imapAuth!);
        const client = new ImapFlow({
          host: wizardState.imapHost,
          port: wizardState.imapPort ?? 993,
          secure: true,
          auth: imapAuth as { user: string; pass: string },
          logger: false,
        });
        await client.connect();
        await client.logout();
        imapOk = true;
      } catch (err) {
        imapOk = false;
        imapError = err instanceof Error ? err.message : "IMAP connection failed";
      }
    }

    return c.html(renderStep4TestResults(
      smtpOk,
      smtpError,
      imapOk,
      imapError,
      wizardState.provider?.appPasswordUrl,
    ));
  });

  // POST /api/setup/complete — write config, return step 5
  app.post("/api/setup/complete", async (c) => {
    if (!wizardState.profile || !wizardState.smtpAuth || !wizardState.smtpHost) {
      return c.html(startPageHtml());
    }

    const profile = wizardState.profile;
    const provider = wizardState.provider;

    const config: Record<string, unknown> = {
      profile: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        country: profile.country,
        ...(profile.address && { address: profile.address }),
        ...(profile.city && { city: profile.city }),
        ...(profile.state && { state: profile.state }),
        ...(profile.zip && { zip: profile.zip }),
        ...(profile.phone && { phone: profile.phone }),
        ...(profile.date_of_birth && { date_of_birth: profile.date_of_birth }),
        aliases: [],
      },
      email: {
        host: wizardState.smtpHost,
        port: wizardState.smtpPort,
        secure: false,
        auth: wizardState.smtpAuth,
        ...(provider && { provider: provider.key }),
        ...(wizardState.alias && { alias: wizardState.alias }),
        pool: true,
        rate_limit: 5,
        rate_delta_ms: 60000,
      },
      broker_identity: {
        id: "default",
        label: "Broker-facing identity",
        mode: wizardState.alias ? "plus_alias" : "same_mailbox",
        email: wizardState.alias ?? profile.email,
        ...(provider && { provider: provider.key }),
        privacy_level: wizardState.alias ? "balanced" : "legacy",
        smtp: {
          host: wizardState.smtpHost,
          port: wizardState.smtpPort,
          secure: false,
          auth: wizardState.smtpAuth,
          ...(provider && { provider: provider.key }),
          ...(wizardState.alias && { alias: wizardState.alias }),
          pool: true,
          rate_limit: 5,
          rate_delta_ms: 60000,
        },
      },
      options: {
        template: wizardState.template ?? "generic",
        dry_run: false,
        regions: ["us"],
        excluded_brokers: [],
        tiers: [1, 2, 3],
        verify_before_send: false,
      },
      logging: {
        level: "info",
        redact_pii: true,
      },
    };

    if (wizardState.enableImap && wizardState.imapHost) {
      config.inbox = {
        host: wizardState.imapHost,
        port: wizardState.imapPort ?? 993,
        secure: true,
        auth: wizardState.imapAuth,
        mailbox: "INBOX",
      };
      (config.broker_identity as { inbox?: Record<string, unknown> }).inbox = config.inbox as Record<string, unknown>;
    }

    // Write config
    const configPath = resolveConfigPath();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, yaml.dump(config, { lineWidth: -1 }), { mode: 0o600 });

    const sendingAddress = wizardState.alias ?? profile.email;
    const imapMethod = wizardState.usedOAuth ? "OAuth" : "password";

    const result = renderStep5Done(
      provider?.name ?? "Custom",
      sendingAddress,
      wizardState.template ?? "generic",
      wizardState.enableImap ?? false,
      imapMethod,
    );

    // Clear sensitive state after config is written
    wizardState = {};

    return c.html(result);
  });
}
