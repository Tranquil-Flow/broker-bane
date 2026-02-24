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
  it("returns dry run result without sending", async () => {
    const config: SmtpConfig = {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: "test@gmail.com", pass: "app-password" },
      pool: true,
      rate_limit: 5,
      rate_delta_ms: 60000,
    };
    const sender = new EmailSender(config, true);
    const result = await sender.send({
      to: "privacy@spokeo.com",
      subject: "Test",
      text: "Test body",
      from: "test@gmail.com",
    });
    expect(result.messageId).toContain("dry-run");
    expect(result.accepted).toContain("privacy@spokeo.com");
    await sender.close();
  });

  it("reports dry run verification as true", async () => {
    const config: SmtpConfig = {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: "test@gmail.com", pass: "app-password" },
      pool: true,
      rate_limit: 5,
      rate_delta_ms: 60000,
    };
    const sender = new EmailSender(config, true);
    const verified = await sender.verify();
    expect(verified).toBe(true);
    await sender.close();
  });
});
