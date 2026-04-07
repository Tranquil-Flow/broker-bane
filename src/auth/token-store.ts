import keytar from "keytar";

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
  await keytar.setPassword(SERVICE, accountKey(provider, identityId), JSON.stringify(tokens));
}

export async function loadTokens(
  provider: "google" | "microsoft",
  identityId = DEFAULT_IDENTITY_ID,
): Promise<OAuthTokens | null> {
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
  await keytar.deletePassword(SERVICE, accountKey(provider, identityId));
  if (identityId === DEFAULT_IDENTITY_ID) {
    await keytar.deletePassword(SERVICE, provider);
  }
}

export function isExpired(tokens: OAuthTokens): boolean {
  return Date.now() >= tokens.expiresAt - 60_000; // 1 min buffer
}
