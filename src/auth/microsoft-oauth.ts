import { createServer } from "node:http";
import { URL } from "node:url";
import { PublicClientApplication } from "@azure/msal-node";
import open from "open";
import keytar from "keytar";
import { saveTokens, type OAuthTokens } from "./token-store.js";

const CLIENT_ID = process.env.BROKERBANE_MICROSOFT_CLIENT_ID ?? "";
const REDIRECT_PORT = 9234;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = [
  "https://outlook.office.com/SMTP.Send",
  "https://outlook.office.com/IMAP.AccessAsUser.All",
  "offline_access",
];

const MSAL_CACHE_KEY = "brokerbane-msal-cache";
const MSAL_CACHE_ACCOUNT = "cache";

function createPCAWithCache(): PublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: "https://login.microsoftonline.com/common",
    },
    cache: {
      cachePlugin: {
        beforeCacheAccess: async (context) => {
          const cached = await keytar.getPassword(MSAL_CACHE_KEY, MSAL_CACHE_ACCOUNT);
          if (cached) context.tokenCache.deserialize(cached);
        },
        afterCacheAccess: async (context) => {
          if (context.cacheHasChanged) {
            await keytar.setPassword(MSAL_CACHE_KEY, MSAL_CACHE_ACCOUNT, context.tokenCache.serialize());
          }
        },
      },
    },
  });
}

export async function runMicrosoftOAuthFlow(): Promise<OAuthTokens> {
  if (!CLIENT_ID) {
    throw new Error("Microsoft OAuth not configured in this build. Use app password instead.");
  }

  const pca = createPCAWithCache();

  const { verifier, challenge } = await generatePKCE();

  const authUrl = await pca.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });

  console.log("\n  Opening your browser to sign in with Microsoft...");
  console.log("  If it doesn't open automatically, visit:");
  console.log(`  ${authUrl}\n`);

  await open(authUrl);

  const code = await waitForCallbackCode();

  const tokenResponse = await pca.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    codeVerifier: verifier,
  });

  if (!tokenResponse?.accessToken) {
    throw new Error("Microsoft did not return an access token. Try again.");
  }

  const tokens: OAuthTokens = {
    accessToken: tokenResponse.accessToken,
    refreshToken: "msal-managed",
    expiresAt: tokenResponse.expiresOn?.getTime() ?? Date.now() + 3600_000,
  };

  await saveTokens("microsoft", tokens);
  return tokens;
}

export async function getMicrosoftAuthUrl(redirectUri: string): Promise<{ url: string; verifier: string }> {
  if (!CLIENT_ID) {
    throw new Error("Microsoft OAuth not configured in this build. Use app password instead.");
  }
  const pca = createPCAWithCache();
  const { verifier, challenge } = await generatePKCE();
  const url = await pca.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  return { url, verifier };
}

export async function exchangeMicrosoftCode(
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<OAuthTokens> {
  const pca = createPCAWithCache();
  const result = await pca.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri,
    codeVerifier: verifier,
  });

  if (!result?.accessToken) {
    throw new Error("Microsoft did not return the required tokens. Try again.");
  }

  const oauthTokens: OAuthTokens = {
    accessToken: result.accessToken,
    refreshToken: "msal-managed",
    expiresAt: result.expiresOn ? result.expiresOn.getTime() : Date.now() + 3600_000,
  };

  await saveTokens("microsoft", oauthTokens);
  return oauthTokens;
}

export async function refreshMicrosoftToken(user: string): Promise<OAuthTokens> {
  const pca = createPCAWithCache();

  const accounts = await pca.getTokenCache().getAllAccounts();
  const account = accounts.find(a => a.username === user) ?? accounts[0];
  if (!account) throw new Error("No Microsoft account found in cache. Run 'brokerbane init' to reconnect.");

  const result = await pca.acquireTokenSilent({
    scopes: SCOPES,
    account,
  });

  if (!result?.accessToken) throw new Error("Microsoft token refresh failed. Run 'brokerbane init' to reconnect.");

  const tokens: OAuthTokens = {
    accessToken: result.accessToken,
    refreshToken: "msal-managed",
    expiresAt: result.expiresOn?.getTime() ?? Date.now() + 3600_000,
  };
  await saveTokens("microsoft", tokens);
  return tokens;
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const { randomBytes, createHash } = await import("node:crypto");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function waitForCallbackCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });

      if (code) {
        res.end("<h2>✅ Authorised! You can close this tab and return to the terminal.</h2>", () => {
          server.close();
          resolve(code);
        });
      } else {
        const safeError = (error ?? "unknown error")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        res.end(`<h2>Authorisation failed: ${safeError}</h2>`, () => {
          server.close();
          reject(new Error(`OAuth error: ${error ?? "unknown"}`));
        });
      }
    });

    server.listen(REDIRECT_PORT, "localhost");
    server.on("error", reject);

    setTimeout(() => {
      server.close();
      reject(new Error("OAuth timed out waiting for browser authorisation."));
    }, 5 * 60_000);
  });
}
