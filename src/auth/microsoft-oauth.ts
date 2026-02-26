import { createServer } from "node:http";
import { URL } from "node:url";
import { PublicClientApplication } from "@azure/msal-node";
import open from "open";
import { saveTokens, type OAuthTokens } from "./token-store.js";

const CLIENT_ID = process.env.BROKERBANE_MICROSOFT_CLIENT_ID ?? "";
const REDIRECT_PORT = 9234;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = ["https://outlook.office.com/SMTP.Send", "offline_access"];

export async function runMicrosoftOAuthFlow(): Promise<OAuthTokens> {
  if (!CLIENT_ID) {
    throw new Error("Microsoft OAuth not configured in this build. Use app password instead.");
  }

  const pca = new PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: "https://login.microsoftonline.com/common",
    },
  });

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
    refreshToken: (tokenResponse as any).refreshToken ?? "",
    expiresAt: tokenResponse.expiresOn?.getTime() ?? Date.now() + 3600_000,
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
        res.end("<h2>✅ Authorised! You can close this tab and return to the terminal.</h2>");
        server.close();
        resolve(code);
      } else {
        res.end(`<h2>❌ Authorisation failed: ${error ?? "unknown error"}</h2>`);
        server.close();
        reject(new Error(`OAuth error: ${error ?? "unknown"}`));
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
