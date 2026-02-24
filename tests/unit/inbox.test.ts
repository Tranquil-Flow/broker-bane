import { validateConfirmationLink, assertLinkSafe } from "../../src/inbox/link-validator.js";
import { hashEmailBody, extractUrls, matchEmailToBroker } from "../../src/inbox/parser.js";
import type { Broker } from "../../src/types/broker.js";

const mockBrokers: Broker[] = [
  {
    id: "spokeo",
    name: "Spokeo",
    domain: "spokeo.com",
    email: "privacy@spokeo.com",
    region: "us",
    category: "people_search",
    removal_method: "web_form",
    requires_captcha: false,
    requires_email_confirm: true,
    requires_id_upload: false,
    difficulty: "easy",
    tier: 1,
    public_directory: true,
    verify_before_send: true,
    confirm_sender_pattern: "noreply@spokeo.com",
  },
  {
    id: "acxiom",
    name: "Acxiom",
    domain: "acxiom.com",
    email: "privacy@acxiom.com",
    region: "us",
    category: "data_broker",
    removal_method: "email",
    requires_captcha: false,
    requires_email_confirm: false,
    requires_id_upload: false,
    difficulty: "medium",
    tier: 1,
    public_directory: false,
    verify_before_send: false,
  },
];

describe("LinkValidator", () => {
  describe("validateConfirmationLink", () => {
    it("accepts valid HTTPS link matching broker domain", () => {
      const result = validateConfirmationLink("https://www.spokeo.com/confirm/abc123", "spokeo.com");
      expect(result.safe).toBe(true);
    });

    it("rejects HTTP links", () => {
      const result = validateConfirmationLink("http://spokeo.com/confirm", "spokeo.com");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("not HTTPS");
    });

    it("rejects URL shorteners", () => {
      const result = validateConfirmationLink("https://bit.ly/abc123", "spokeo.com");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("shortener");
    });

    it("rejects domain mismatches", () => {
      const result = validateConfirmationLink("https://evil.com/confirm", "spokeo.com");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("mismatch");
    });

    it("prevents endsWith attacks", () => {
      // evil-spokeo.com should NOT match spokeo.com
      const result = validateConfirmationLink("https://evil-spokeo.com/confirm", "spokeo.com");
      expect(result.safe).toBe(false);
    });

    it("accepts subdomain matches", () => {
      const result = validateConfirmationLink("https://mail.spokeo.com/confirm", "spokeo.com");
      expect(result.safe).toBe(true);
    });
  });

  describe("assertLinkSafe", () => {
    it("does not throw for safe links", () => {
      expect(() => assertLinkSafe("https://spokeo.com/confirm", "spokeo.com")).not.toThrow();
    });

    it("throws LinkValidationError for unsafe links", () => {
      expect(() => assertLinkSafe("http://evil.com/phish", "spokeo.com")).toThrow();
    });
  });
});

describe("EmailParser", () => {
  describe("hashEmailBody", () => {
    it("produces consistent SHA-256 hash", () => {
      const hash1 = hashEmailBody("test body");
      const hash2 = hashEmailBody("test body");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it("produces different hashes for different content", () => {
      expect(hashEmailBody("a")).not.toBe(hashEmailBody("b"));
    });
  });

  describe("extractUrls", () => {
    it("extracts URLs from HTML", () => {
      const html = '<a href="https://spokeo.com/confirm/abc">Confirm</a>';
      const urls = extractUrls(html);
      expect(urls).toContain("https://spokeo.com/confirm/abc");
    });

    it("filters out unsubscribe links", () => {
      const html = 'https://spokeo.com/confirm https://spokeo.com/unsubscribe';
      const urls = extractUrls(html);
      expect(urls).toContain("https://spokeo.com/confirm");
      expect(urls).not.toContain("https://spokeo.com/unsubscribe");
    });

    it("filters out image URLs", () => {
      const html = 'https://spokeo.com/confirm https://spokeo.com/logo.png';
      const urls = extractUrls(html);
      expect(urls).not.toContain("https://spokeo.com/logo.png");
    });

    it("deduplicates URLs", () => {
      const html = "https://spokeo.com/confirm https://spokeo.com/confirm";
      const urls = extractUrls(html);
      expect(urls).toHaveLength(1);
    });

    it("returns empty array when no URLs found", () => {
      expect(extractUrls("no urls here")).toEqual([]);
    });
  });

  describe("matchEmailToBroker", () => {
    it("matches by confirm_sender_pattern", () => {
      const broker = matchEmailToBroker("noreply@spokeo.com", mockBrokers);
      expect(broker?.id).toBe("spokeo");
    });

    it("falls back to domain matching", () => {
      const broker = matchEmailToBroker("support@acxiom.com", mockBrokers);
      expect(broker?.id).toBe("acxiom");
    });

    it("matches subdomain emails", () => {
      const broker = matchEmailToBroker("noreply@mail.acxiom.com", mockBrokers);
      expect(broker?.id).toBe("acxiom");
    });

    it("returns undefined for unknown sender", () => {
      const broker = matchEmailToBroker("spam@evil.com", mockBrokers);
      expect(broker).toBeUndefined();
    });
  });
});
