import { createServer } from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";
import open from "open";
import { saveTokens, type OAuthTokens } from "./token-store.js";

const CLIENT_ID = process.env.BROKERBANE_GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.BROKERBANE_GOOGLE_CLIENT_SECRET ?? "";
const REDIRECT_PORT = 9234;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = ["https://mail.google.com/"];

export async function runGoogleOAuthFlow(): Promise<OAuthTokens> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google OAuth not configured in this build. Use app password instead.");
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n  Opening your browser to sign in with Google...");
  console.log("  If it doesn't open automatically, visit:");
  console.log(`  ${authUrl}\n`);

  await open(authUrl);

  const code = await waitForCallbackCode();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Google did not return the required tokens. Try again.");
  }

  const oauthTokens: OAuthTokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
  };

  await saveTokens("google", oauthTokens);
  return oauthTokens;
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

export function getGoogleAuthUrl(redirectUri: string): string {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google OAuth not configured in this build. Use app password instead.");
  }
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthTokens> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google OAuth not configured in this build. Use app password instead.");
  }
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Google did not return the required tokens. Try again.");
  }

  const oauthTokens: OAuthTokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
  };

  await saveTokens("google", oauthTokens);
  return oauthTokens;
}

export async function refreshGoogleToken(refreshToken: string): Promise<OAuthTokens> {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  const tokens: OAuthTokens = {
    accessToken: credentials.access_token!,
    refreshToken: credentials.refresh_token ?? refreshToken,
    expiresAt: credentials.expiry_date ?? Date.now() + 3600_000,
  };

  await saveTokens("google", tokens);
  return tokens;
}
