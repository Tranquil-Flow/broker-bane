export interface ProviderSmtpConfig {
  host: string;
  port: number;
}

export interface ProviderImapConfig {
  host: string;
  port: number;
}

export interface ProviderConfig {
  key: string;
  name: string;
  domains: string[];
  smtp: ProviderSmtpConfig;
  imap: ProviderImapConfig;
  authMethods: ("oauth2" | "app_password" | "bridge_password")[];
  oauthProvider?: "google" | "microsoft";
  generateAlias?: (email: string) => string;
  appPasswordUrl?: string;
  appPasswordPrereq?: string;
  bridgeRequired?: boolean;
  bridgeInstructions?: string;
}
