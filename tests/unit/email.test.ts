import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("keytar", () => ({
  default: {
    setPassword: vi.fn(async () => undefined),
    getPassword: vi.fn(async () => null),
    deletePassword: vi.fn(async () => true),
  },
}));

import { buildTemplateVariables, renderTemplate, clearTemplateCache } from "../../src/email/template-engine.js";
import { isValidEmail, validateBrokerEmail, extractEmailDomain } from "../../src/email/validator.js";
import { EmailSender } from "../../src/email/sender.js";
import type { Profile } from "../../src/types/config.js";
import type { SmtpConfig } from "../../src/types/config.js";

const testProfile: Profile = {
  first_name: "John",
  last_name: "Doe",
  email: "john.doe@example.com",
  address: "123 Main St",
  city: "San Francisco",
  state: "CA",
  zip: "94102",
  country: "US",
  phone: "415-555-1234",
  date_of_birth: "1990-01-15",
  aliases: [],
};

describe("TemplateEngine", () => {
  afterEach(() => {
    clearTemplateCache();
  });

  describe("buildTemplateVariables", () => {
    it("builds complete variables from profile", () => {
      const vars = buildTemplateVariables(testProfile, "Spokeo");
      expect(vars.BrokerName).toBe("Spokeo");
      expect(vars.FullName).toBe("John Doe");
      expect(vars.FirstName).toBe("John");
      expect(vars.LastName).toBe("Doe");
      expect(vars.Email).toBe("john.doe@example.com");
      expect(vars.Address).toBe("123 Main St");
      expect(vars.Phone).toBe("415-555-1234");
      expect(vars.Date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("handles missing optional fields", () => {
      const minProfile: Profile = {
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@example.com",
        country: "US",
        aliases: [],
      };
      const vars = buildTemplateVariables(minProfile, "Acxiom");
      expect(vars.Address).toBeUndefined();
      expect(vars.Phone).toBeUndefined();
    });

    it("uses broker-facing contact email when provided", () => {
      const vars = buildTemplateVariables(testProfile, "Spokeo", "removals@example.net");
      expect(vars.Email).toBe("removals@example.net");
    });
  });

  describe("renderTemplate", () => {
    it("renders GDPR template", () => {
      const vars = buildTemplateVariables(testProfile, "Spokeo");
      const email = renderTemplate("gdpr", vars);
      expect(email.subject).toContain("GDPR");
      expect(email.subject).toContain("John Doe");
      expect(email.body).toContain("Article 17");
      expect(email.body).toContain("Spokeo");
      expect(email.body).toContain("john.doe@example.com");
    });

    it("renders CCPA template", () => {
      const vars = buildTemplateVariables(testProfile, "Acxiom");
      const email = renderTemplate("ccpa", vars);
      expect(email.subject).toContain("CCPA");
      expect(email.body).toContain("1798.105");
      expect(email.body).toContain("45 calendar days");
    });

    it("renders generic template", () => {
      const vars = buildTemplateVariables(testProfile, "Equifax");
      const email = renderTemplate("generic", vars);
      expect(email.subject).toContain("Personal Data Deletion");
      expect(email.body).toContain("GDPR");
      expect(email.body).toContain("CCPA");
    });

    it("includes address when provided", () => {
      const vars = buildTemplateVariables(testProfile, "Test");
      const email = renderTemplate("gdpr", vars);
      expect(email.body).toContain("123 Main St");
      expect(email.body).toContain("San Francisco");
    });

    it("omits optional fields when not provided", () => {
      const minProfile: Profile = {
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@example.com",
        country: "US",
        aliases: [],
      };
      const vars = buildTemplateVariables(minProfile, "Test");
      const email = renderTemplate("gdpr", vars);
      expect(email.body).not.toContain("Address:");
      expect(email.body).not.toContain("Phone:");
    });

    it("selects variant 1 by default (no seed)", () => {
      const vars = buildTemplateVariables(testProfile, "Spokeo");
      const email = renderTemplate("gdpr", vars);
      expect(email.subject).toBeTruthy();
      expect(email.body).toBeTruthy();
    });

    it("selects deterministically by seed", () => {
      const vars = buildTemplateVariables(testProfile, "Spokeo");
      const first = renderTemplate("gdpr", vars, "spokeo");
      const second = renderTemplate("gdpr", vars, "spokeo");
      expect(first.subject).toBe(second.subject);
    });

    it("selects differently for different seeds (when multiple variants exist)", () => {
      const vars = buildTemplateVariables(testProfile, "Test");
      const subjects = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const email = renderTemplate("gdpr", vars, `broker-${i}`);
        subjects.add(email.subject);
      }
      // With 50 variants, 20 different seeds should produce at least 3 unique subjects
      expect(subjects.size).toBeGreaterThanOrEqual(3);
    });

    it("does not throw for any variant index within discovered count", () => {
      const vars = buildTemplateVariables(testProfile, "Test");
      // Test 60 different seeds to exercise all possible variant indices
      for (let i = 0; i < 60; i++) {
        expect(() => renderTemplate("gdpr", vars, `test-seed-${i}`)).not.toThrow();
      }
    });
  });
});

describe("EmailValidator", () => {
  describe("isValidEmail", () => {
    it("accepts valid emails", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("privacy@spokeo.com")).toBe(true);
    });

    it("rejects invalid emails", () => {
      expect(isValidEmail("not-an-email")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
      expect(isValidEmail("user@")).toBe(false);
      expect(isValidEmail("")).toBe(false);
    });
  });

  describe("validateBrokerEmail", () => {
    it("accepts matching email and domain", () => {
      expect(() => validateBrokerEmail("privacy@spokeo.com", "spokeo.com")).not.toThrow();
    });

    it("rejects mismatched email and domain", () => {
      expect(() => validateBrokerEmail("privacy@evil.com", "spokeo.com")).toThrow();
    });
  });

  describe("extractEmailDomain", () => {
    it("extracts domain from email", () => {
      expect(extractEmailDomain("user@spokeo.com")).toBe("spokeo.com");
    });

    it("returns null for invalid email", () => {
      expect(extractEmailDomain("invalid")).toBeNull();
    });
  });
});

describe("EmailSender", () => {
  const dryRunConfig: SmtpConfig = {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: "test@gmail.com", pass: "app-password" },
    pool: true,
    rate_limit: 5,
    rate_delta_ms: 60000,
  };

  it("returns dry run result without sending", async () => {
    const sender = new EmailSender(dryRunConfig, true);
    const result = await sender.send({
      to: "privacy@spokeo.com",
      subject: "Test",
      text: "Test body",
      from: "test@gmail.com",
    });
    expect(result.messageId).toContain("dry-run");
    expect(result.accepted).toContain("privacy@spokeo.com");
    expect(result.rejected).toHaveLength(0);
    await sender.close();
  });

  it("reports dry run verification as true", async () => {
    const sender = new EmailSender(dryRunConfig, true);
    const verified = await sender.verify();
    expect(verified).toBe(true);
    await sender.close();
  });

  it("dry run never has rejected recipients", async () => {
    const sender = new EmailSender(dryRunConfig, true);
    const result = await sender.send({
      to: "anyone@example.com",
      subject: "Test",
      text: "Body",
      from: "test@gmail.com",
    });
    expect(result.rejected).toHaveLength(0);
    await sender.close();
  });

  it("suppresses X-Mailer header and adds Reply-To in sendMail args", async () => {
    let capturedOptions: any = null;
    const mockTransport = {
      sendMail: vi.fn().mockImplementation((opts: any) => {
        capturedOptions = opts;
        return Promise.resolve({
          messageId: "test-id",
          accepted: ["to@example.com"],
          rejected: [],
        });
      }),
      verify: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };

    const sender = new EmailSender(dryRunConfig, false);
    (sender as any).transporter = mockTransport;

    await sender.send({
      from: "me@example.com",
      to: "to@example.com",
      subject: "Test",
      text: "Body",
    });

    expect(capturedOptions.xMailer).toBe(false);
    expect(capturedOptions.headers?.["Reply-To"]).toBe("me@example.com");
    await sender.close();
  });
});
