import keytar from "keytar";

const SERVICE = "brokerbane";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

export async function saveTokens(provider: "google" | "microsoft", tokens: OAuthTokens): Promise<void> {
  await keytar.setPassword(SERVICE, provider, JSON.stringify(tokens));
}

export async function loadTokens(provider: "google" | "microsoft"): Promise<OAuthTokens | null> {
  const raw = await keytar.getPassword(SERVICE, provider);
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

export async function deleteTokens(provider: "google" | "microsoft"): Promise<void> {
  await keytar.deletePassword(SERVICE, provider);
}

export function isExpired(tokens: OAuthTokens): boolean {
  return Date.now() >= tokens.expiresAt - 60_000; // 1 min buffer
}
