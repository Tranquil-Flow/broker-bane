import { beforeEach, describe, expect, it, vi } from "vitest";

const keytarState = new Map<string, string>();

vi.mock("keytar", () => ({
  default: {
    setPassword: vi.fn(async (service: string, account: string, value: string) => {
      keytarState.set(`${service}:${account}`, value);
      return undefined;
    }),
    getPassword: vi.fn(async (service: string, account: string) => {
      return keytarState.get(`${service}:${account}`) ?? null;
    }),
    deletePassword: vi.fn(async (service: string, account: string) => {
      return keytarState.delete(`${service}:${account}`);
    }),
  },
}));

describe("token-store", () => {
  beforeEach(() => {
    keytarState.clear();
  });

  it("stores tokens under provider + identity namespace", async () => {
    const { saveTokens, loadTokens } = await import("../../src/auth/token-store.js");

    await saveTokens("google", {
      accessToken: "token-a",
      refreshToken: "refresh-a",
      expiresAt: 111,
    }, "identity-a");

    await saveTokens("google", {
      accessToken: "token-b",
      refreshToken: "refresh-b",
      expiresAt: 222,
    }, "identity-b");

    await expect(loadTokens("google", "identity-a")).resolves.toMatchObject({
      accessToken: "token-a",
      refreshToken: "refresh-a",
      expiresAt: 111,
    });
    await expect(loadTokens("google", "identity-b")).resolves.toMatchObject({
      accessToken: "token-b",
      refreshToken: "refresh-b",
      expiresAt: 222,
    });
  });

  it("falls back to legacy provider-only key for default identity", async () => {
    keytarState.set("brokerbane:google", JSON.stringify({
      accessToken: "legacy-token",
      refreshToken: "legacy-refresh",
      expiresAt: 333,
    }));

    const { loadTokens } = await import("../../src/auth/token-store.js");

    await expect(loadTokens("google")).resolves.toMatchObject({
      accessToken: "legacy-token",
      refreshToken: "legacy-refresh",
      expiresAt: 333,
    });
  });

  it("deletes namespaced tokens without touching other identities", async () => {
    const { saveTokens, loadTokens, deleteTokens } = await import("../../src/auth/token-store.js");

    await saveTokens("microsoft", {
      accessToken: "token-a",
      refreshToken: "refresh-a",
      expiresAt: 111,
    }, "identity-a");

    await saveTokens("microsoft", {
      accessToken: "token-b",
      refreshToken: "refresh-b",
      expiresAt: 222,
    }, "identity-b");

    await deleteTokens("microsoft", "identity-a");

    await expect(loadTokens("microsoft", "identity-a")).resolves.toBeNull();
    await expect(loadTokens("microsoft", "identity-b")).resolves.toMatchObject({
      accessToken: "token-b",
      refreshToken: "refresh-b",
      expiresAt: 222,
    });
  });
});
