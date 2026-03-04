import type { ProviderConfig } from "./types.js";

function plusAlias(email: string): string {
  const [user, domain] = email.split("@");
  return `${user}+brokerbane@${domain}`;
}

const GMAIL: ProviderConfig = {
  key: "gmail",
  name: "Gmail",
  domains: ["gmail.com", "googlemail.com"],
  smtp: { host: "smtp.gmail.com", port: 587 },
  imap: { host: "imap.gmail.com", port: 993 },
  authMethods: ["oauth2", "app_password"],
  oauthProvider: "google",
  generateAlias: plusAlias,
  appPasswordUrl: "https://myaccount.google.com/apppasswords",
  appPasswordPrereq: "2-Step Verification must be enabled first",
};

const OUTLOOK: ProviderConfig = {
  key: "outlook",
  name: "Outlook",
  domains: ["outlook.com", "hotmail.com", "live.com"],
  smtp: { host: "smtp-mail.outlook.com", port: 587 },
  imap: { host: "outlook.office365.com", port: 993 },
  authMethods: ["oauth2", "app_password"],
  oauthProvider: "microsoft",
  generateAlias: plusAlias,
  appPasswordUrl: "https://account.microsoft.com/security",
};

const YAHOO: ProviderConfig = {
  key: "yahoo",
  name: "Yahoo",
  domains: ["yahoo.com", "ymail.com"],
  smtp: { host: "smtp.mail.yahoo.com", port: 587 },
  imap: { host: "imap.mail.yahoo.com", port: 993 },
  authMethods: ["app_password"],
  appPasswordUrl: "https://login.yahoo.com/account/security",
  appPasswordPrereq: "2-step verification must be enabled",
};

const ICLOUD: ProviderConfig = {
  key: "icloud",
  name: "iCloud",
  domains: ["icloud.com", "me.com", "mac.com"],
  smtp: { host: "smtp.mail.me.com", port: 587 },
  imap: { host: "imap.mail.me.com", port: 993 },
  authMethods: ["app_password"],
  appPasswordUrl: "https://appleid.apple.com/account/manage",
  appPasswordPrereq: "Two-factor authentication must be enabled",
};

const PROTONMAIL: ProviderConfig = {
  key: "protonmail",
  name: "ProtonMail",
  domains: ["protonmail.com", "proton.me", "pm.me"],
  smtp: { host: "127.0.0.1", port: 1025 },
  imap: { host: "127.0.0.1", port: 1143 },
  authMethods: ["bridge_password"],
  generateAlias: plusAlias,
  bridgeRequired: true,
  bridgeInstructions: "Install and log into ProtonMail Bridge first. Download from https://proton.me/mail/bridge",
};

export const PROVIDERS: ProviderConfig[] = [GMAIL, OUTLOOK, YAHOO, ICLOUD, PROTONMAIL];

const domainMap = new Map<string, ProviderConfig>();
for (const provider of PROVIDERS) {
  for (const domain of provider.domains) {
    domainMap.set(domain.toLowerCase(), provider);
  }
}

export function detectProvider(email: string): ProviderConfig | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return domainMap.get(domain) ?? null;
}

export function getProviderByKey(key: string): ProviderConfig | null {
  return PROVIDERS.find((p) => p.key === key) ?? null;
}
