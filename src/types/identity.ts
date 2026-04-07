import type { AppConfig, EmailAuth, ImapConfig, SmtpConfig } from "./config.js";

export type BrokerIdentityMode = "dedicated_mailbox" | "masked_alias" | "plus_alias" | "same_mailbox";
export type BrokerIdentityPrivacyLevel = "maximum" | "balanced" | "legacy";

export interface BrokerIdentity {
  id: string;
  label: string;
  mode: BrokerIdentityMode;
  email: string;
  provider?: string;
  privacy_level: BrokerIdentityPrivacyLevel;
  smtp: SmtpConfig;
  inbox?: ImapConfig;
}

export interface BrokerIdentityConfig {
  id: string;
  label: string;
  mode: BrokerIdentityMode;
  email: string;
  provider?: string;
  privacy_level: BrokerIdentityPrivacyLevel;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: EmailAuth;
    pool: boolean;
    rate_limit: number;
    rate_delta_ms: number;
  };
  inbox?: {
    host: string;
    port: number;
    secure: boolean;
    auth: EmailAuth;
    mailbox: string;
  };
}

export function getEffectiveBrokerIdentity(config: AppConfig): BrokerIdentityConfig {
  if (config.broker_identity) {
    return config.broker_identity;
  }

  const visibleEmail = config.email.alias ?? config.profile.email;
  const mode: BrokerIdentityMode = config.email.alias
    ? config.email.alias.includes("+")
      ? "plus_alias"
      : "masked_alias"
    : "same_mailbox";

  return {
    id: "default",
    label: "Imported legacy identity",
    mode,
    email: visibleEmail,
    provider: config.email.provider,
    privacy_level: mode === "same_mailbox" ? "legacy" : "balanced",
    smtp: config.email,
    ...(config.inbox ? { inbox: config.inbox } : {}),
  };
}

export function getBrokerFacingEmail(config: AppConfig): string {
  return getEffectiveBrokerIdentity(config).email;
}

export function getBrokerIdentityImap(config: AppConfig): ImapConfig | undefined {
  return getEffectiveBrokerIdentity(config).inbox ?? config.inbox;
}

export function getBrokerIdentityId(config: AppConfig): string {
  return getEffectiveBrokerIdentity(config).id;
}
