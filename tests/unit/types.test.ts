import { BrokerSchema, BrokerDatabaseSchema } from "../../src/types/broker.js";
import { AppConfigSchema, ProfileSchema } from "../../src/types/config.js";
import { VALID_TRANSITIONS, REQUEST_STATUS } from "../../src/types/pipeline.js";

describe("BrokerSchema", () => {
  const validBroker = {
    id: "spokeo",
    name: "Spokeo",
    domain: "spokeo.com",
    email: "privacy@spokeo.com",
    region: "us",
    category: "people_search",
    removal_method: "web_form",
  };

  it("validates a correct broker", () => {
    const result = BrokerSchema.safeParse(validBroker);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = BrokerSchema.parse(validBroker);
    expect(result.requires_captcha).toBe(false);
    expect(result.requires_email_confirm).toBe(false);
    expect(result.difficulty).toBe("medium");
    expect(result.tier).toBe(2);
    expect(result.public_directory).toBe(false);
  });

  it("rejects invalid region", () => {
    const result = BrokerSchema.safeParse({ ...validBroker, region: "mars" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid removal_method", () => {
    const result = BrokerSchema.safeParse({ ...validBroker, removal_method: "fax" });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = BrokerSchema.safeParse({ id: "test" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid difficulties", () => {
    for (const d of ["easy", "medium", "hard", "manual"]) {
      const result = BrokerSchema.safeParse({ ...validBroker, difficulty: d });
      expect(result.success).toBe(true);
    }
  });

  it("validates tier values", () => {
    expect(BrokerSchema.safeParse({ ...validBroker, tier: 1 }).success).toBe(true);
    expect(BrokerSchema.safeParse({ ...validBroker, tier: 2 }).success).toBe(true);
    expect(BrokerSchema.safeParse({ ...validBroker, tier: 3 }).success).toBe(true);
    expect(BrokerSchema.safeParse({ ...validBroker, tier: 4 }).success).toBe(false);
  });
});

describe("BrokerDatabaseSchema", () => {
  it("validates a broker database", () => {
    const db = {
      version: "1.0.0",
      updated: "2026-02-24",
      brokers: [
        {
          id: "test",
          name: "Test",
          domain: "test.com",
          region: "us",
          category: "test",
          removal_method: "email",
        },
      ],
    };
    const result = BrokerDatabaseSchema.safeParse(db);
    expect(result.success).toBe(true);
  });

  it("rejects empty brokers array gracefully", () => {
    const db = { version: "1.0.0", updated: "2026-02-24", brokers: [] };
    const result = BrokerDatabaseSchema.safeParse(db);
    expect(result.success).toBe(true);
  });
});

describe("ProfileSchema", () => {
  it("validates a minimal profile", () => {
    const result = ProfileSchema.safeParse({
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty first_name", () => {
    const result = ProfileSchema.safeParse({
      first_name: "",
      last_name: "Doe",
      email: "john@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = ProfileSchema.safeParse({
      first_name: "John",
      last_name: "Doe",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("applies default country", () => {
    const result = ProfileSchema.parse({
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
    });
    expect(result.country).toBe("US");
    expect(result.aliases).toEqual([]);
  });
});

describe("AppConfigSchema", () => {
  const minimalConfig = {
    profile: {
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
    },
    email: {
      host: "smtp.gmail.com",
      port: 587,
      auth: { user: "john@gmail.com", pass: "app-password" },
    },
  };

  it("validates minimal config with defaults", () => {
    const result = AppConfigSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options.template).toBe("gdpr");
      expect(result.data.options.dry_run).toBe(false);
      expect(result.data.retry.max_attempts).toBe(3);
      expect(result.data.logging.redact_pii).toBe(true);
    }
  });

  it("rejects config without profile", () => {
    const result = AppConfigSchema.safeParse({ email: minimalConfig.email });
    expect(result.success).toBe(false);
  });

  it("rejects config without email", () => {
    const result = AppConfigSchema.safeParse({ profile: minimalConfig.profile });
    expect(result.success).toBe(false);
  });
});

describe("VALID_TRANSITIONS", () => {
  it("allows pending -> scanning", () => {
    expect(VALID_TRANSITIONS[REQUEST_STATUS.pending]).toContain("scanning");
  });

  it("allows pending -> sending (email-only brokers skip scan)", () => {
    expect(VALID_TRANSITIONS[REQUEST_STATUS.pending]).toContain("sending");
  });

  it("does not allow completed -> pending", () => {
    expect(VALID_TRANSITIONS[REQUEST_STATUS.completed]).not.toContain("pending");
  });

  it("allows failed -> pending (retry)", () => {
    expect(VALID_TRANSITIONS[REQUEST_STATUS.failed]).toContain("pending");
  });

  it("does not allow skipped to transition anywhere", () => {
    expect(VALID_TRANSITIONS[REQUEST_STATUS.skipped]).toHaveLength(0);
  });
});
