import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BrowserProfileStore } from "../../src/browser/profile-store.js";

describe("BrowserProfileStore", () => {
  let tempDir: string;
  let store: BrowserProfileStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brokerbane-profiles-"));
    store = new BrowserProfileStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null for unknown domain", () => {
    const state = store.load("example.com");
    expect(state).toBeNull();
  });

  it("saves and loads storage state for a domain", () => {
    const state = {
      cookies: [{ name: "cf_clearance", value: "abc123", domain: ".example.com", path: "/" }],
      origins: [],
    };
    store.save("example.com", state);

    const loaded = store.load("example.com");
    expect(loaded).toEqual(state);
  });

  it("sanitizes domain names for filenames", () => {
    const state = { cookies: [], origins: [] };
    store.save("sub.example.com", state);
    expect(existsSync(join(tempDir, "sub.example.com.json"))).toBe(true);
  });

  it("overwrites existing state on re-save", () => {
    store.save("example.com", { cookies: [{ name: "old", value: "1" }], origins: [] });
    store.save("example.com", { cookies: [{ name: "new", value: "2" }], origins: [] });

    const loaded = store.load("example.com");
    expect(loaded?.cookies).toHaveLength(1);
    expect(loaded?.cookies[0].name).toBe("new");
  });

  it("sets restrictive file permissions (0600)", () => {
    store.save("example.com", { cookies: [], origins: [] });
    const filePath = join(tempDir, "example.com.json");
    if (process.platform !== "win32") {
      const mode = statSync(filePath).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });
});
