import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the auth modules
vi.mock("../../src/auth/token-store.js", () => ({
  loadTokens: vi.fn(),
  isExpired: vi.fn(),
}));
vi.mock("../../src/auth/google-oauth.js", () => ({
  refreshGoogleToken: vi.fn(),
}));
vi.mock("../../src/auth/microsoft-oauth.js", () => ({
  refreshMicrosoftToken: vi.fn(),
}));

import { resolveImapAuth } from "../../src/inbox/monitor.js";

describe("resolveImapAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user/pass for password auth", async () => {
    const auth = { type: "password" as const, user: "jane@gmail.com", pass: "app-pass" };
    const result = await resolveImapAuth(auth);
    expect(result).toEqual({ user: "jane@gmail.com", pass: "app-pass" });
  });

  it("returns user/accessToken for oauth2 auth", async () => {
    const { loadTokens, isExpired } = await import("../../src/auth/token-store.js");
    (loadTokens as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: "token123",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600000,
    });
    (isExpired as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const auth = { type: "oauth2" as const, user: "jane@gmail.com", provider: "google" as const };
    const result = await resolveImapAuth(auth);
    expect(result).toEqual({
      user: "jane@gmail.com",
      accessToken: "token123",
    });
  });

  it("refreshes expired google token", async () => {
    const { loadTokens, isExpired } = await import("../../src/auth/token-store.js");
    const { refreshGoogleToken } = await import("../../src/auth/google-oauth.js");
    (loadTokens as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: "old",
      refreshToken: "refresh",
      expiresAt: Date.now() - 1000,
    });
    (isExpired as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (refreshGoogleToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: "fresh",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600000,
    });

    const auth = { type: "oauth2" as const, user: "jane@gmail.com", provider: "google" as const };
    const result = await resolveImapAuth(auth);
    expect(result).toEqual({ user: "jane@gmail.com", accessToken: "fresh" });
    expect(refreshGoogleToken).toHaveBeenCalledWith("refresh");
  });
});
