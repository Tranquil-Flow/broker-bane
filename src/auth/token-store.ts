type KeytarModule = {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

let keytarPromise: Promise<KeytarModule> | null = null;

export async function getKeytar(): Promise<KeytarModule> {
  keytarPromise ??= import("keytar")
    .then((mod) => ((mod as { default?: KeytarModule }).default ?? mod) as KeytarModule)
    .catch((error) => {
      throw new Error(
        "OAuth token storage requires the optional native dependency 'keytar'. " +
        "Install OS keychain build prerequisites (Linux: libsecret-1-dev/pkg-config) " +
        `or use SMTP/app-password auth instead. Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  return keytarPromise;
}

const SERVICE = "brokerbane";
const DEFAULT_IDENTITY_ID = "default";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

function accountKey(provider: "google" | "microsoft", identityId = DEFAULT_IDENTITY_ID): string {
  return `${provider}:${identityId}`;
}

export async function saveTokens(
  provider: "google" | "microsoft",
  tokens: OAuthTokens,
  identityId = DEFAULT_IDENTITY_ID,
): Promise<void> {
  const keytar = await getKeytar();
  await keytar.setPassword(SERVICE, accountKey(provider, identityId), JSON.stringify(tokens));
}

export async function loadTokens(
  provider: "google" | "microsoft",
  identityId = DEFAULT_IDENTITY_ID,
): Promise<OAuthTokens | null> {
  const keytar = await getKeytar();
  const raw = await keytar.getPassword(SERVICE, accountKey(provider, identityId))
    ?? (identityId === DEFAULT_IDENTITY_ID ? await keytar.getPassword(SERVICE, provider) : null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.accessToken === "string" &&
      typeof parsed?.refreshToken === "string" &&
      typeof parsed?.expiresAt === "number"
    ) {
      return parsed as OAuthTokens;
    }
    return null;
  } catch {
    return null;
  }
}

export async function deleteTokens(
  provider: "google" | "microsoft",
  identityId = DEFAULT_IDENTITY_ID,
): Promise<void> {
  const keytar = await getKeytar();
  await keytar.deletePassword(SERVICE, accountKey(provider, identityId));
  if (identityId === DEFAULT_IDENTITY_ID) {
    await keytar.deletePassword(SERVICE, provider);
  }
}

export function isExpired(tokens: OAuthTokens): boolean {
  return Date.now() >= tokens.expiresAt - 60_000; // 1 min buffer
}
