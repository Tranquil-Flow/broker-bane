import { describe, it, expect } from "vitest";
import { detectProvider, getProviderByKey, PROVIDERS } from "../../src/providers/registry.js";

describe("Provider registry", () => {
  describe("detectProvider", () => {
    it("detects Gmail from @gmail.com", () => {
      const p = detectProvider("user@gmail.com");
      expect(p).not.toBeNull();
      expect(p!.key).toBe("gmail");
      expect(p!.smtp.host).toBe("smtp.gmail.com");
    });

    it("detects Gmail from @googlemail.com", () => {
      const p = detectProvider("user@googlemail.com");
      expect(p!.key).toBe("gmail");
    });

    it("detects Outlook from @outlook.com", () => {
      const p = detectProvider("user@outlook.com");
      expect(p!.key).toBe("outlook");
      expect(p!.smtp.host).toBe("smtp-mail.outlook.com");
    });

    it("detects Outlook from @hotmail.com", () => {
      const p = detectProvider("user@hotmail.com");
      expect(p!.key).toBe("outlook");
    });

    it("detects Outlook from @live.com", () => {
      const p = detectProvider("user@live.com");
      expect(p!.key).toBe("outlook");
    });

    it("detects Yahoo from @yahoo.com", () => {
      const p = detectProvider("user@yahoo.com");
      expect(p!.key).toBe("yahoo");
      expect(p!.smtp.host).toBe("smtp.mail.yahoo.com");
    });

    it("detects Yahoo from @ymail.com", () => {
      const p = detectProvider("user@ymail.com");
      expect(p!.key).toBe("yahoo");
    });

    it("detects iCloud from @icloud.com", () => {
      const p = detectProvider("user@icloud.com");
      expect(p!.key).toBe("icloud");
      expect(p!.smtp.host).toBe("smtp.mail.me.com");
    });

    it("detects iCloud from @me.com", () => {
      const p = detectProvider("user@me.com");
      expect(p!.key).toBe("icloud");
    });

    it("detects ProtonMail from @protonmail.com", () => {
      const p = detectProvider("user@protonmail.com");
      expect(p!.key).toBe("protonmail");
      expect(p!.smtp.host).toBe("127.0.0.1");
      expect(p!.bridgeRequired).toBe(true);
    });

    it("detects ProtonMail from @proton.me", () => {
      const p = detectProvider("user@proton.me");
      expect(p!.key).toBe("protonmail");
    });

    it("returns null for unknown domains", () => {
      expect(detectProvider("user@company.com")).toBeNull();
    });

    it("is case-insensitive", () => {
      const p = detectProvider("User@Gmail.COM");
      expect(p!.key).toBe("gmail");
    });
  });

  describe("alias generation", () => {
    it("generates Gmail + alias", () => {
      const p = detectProvider("jane@gmail.com");
      expect(p!.generateAlias?.("jane@gmail.com")).toBe("jane+brokerbane@gmail.com");
    });

    it("generates Outlook + alias", () => {
      const p = detectProvider("jane@outlook.com");
      expect(p!.generateAlias?.("jane@outlook.com")).toBe("jane+brokerbane@outlook.com");
    });

    it("generates ProtonMail + alias", () => {
      const p = detectProvider("jane@protonmail.com");
      expect(p!.generateAlias?.("jane@protonmail.com")).toBe("jane+brokerbane@protonmail.com");
    });

    it("returns null alias for Yahoo (no + alias support)", () => {
      const p = detectProvider("jane@yahoo.com");
      expect(p!.generateAlias).toBeUndefined();
    });

    it("returns null alias for iCloud (no + alias support)", () => {
      const p = detectProvider("jane@icloud.com");
      expect(p!.generateAlias).toBeUndefined();
    });
  });

  describe("getProviderByKey", () => {
    it("retrieves gmail provider by key", () => {
      const p = getProviderByKey("gmail");
      expect(p).not.toBeNull();
      expect(p!.name).toBe("Gmail");
    });

    it("returns null for unknown key", () => {
      expect(getProviderByKey("aol")).toBeNull();
    });
  });
});
