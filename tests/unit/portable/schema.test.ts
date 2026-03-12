import { describe, it, expect } from "vitest";
import {
  PortableProfileSchema,
  PortableSettingsSchema,
  PortableRemovalRequestSchema,
  PortableBrokerResponseSchema,
  PortableEmailLogSchema,
  PortableEvidenceChainSchema,
  PortablePendingTaskSchema,
  PortableScanRunSchema,
  PortableScanResultSchema,
  PortablePipelineRunSchema,
  PortableWarningsSchema,
  PortablePayloadSchema,
  CryptoParamsSchema,
  SummarySchema,
  ExportEnvelopeSchema,
} from "../../../src/portable/schema.js";

// ---------------------------------------------------------------------------
// PortableProfileSchema
// ---------------------------------------------------------------------------
describe("PortableProfileSchema", () => {
  it("parses a complete profile", () => {
    const result = PortableProfileSchema.parse({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      country: "US",
    });
    expect(result.first_name).toBe("Jane");
    expect(result.aliases).toEqual([]);
  });

  it("allows optional fields to be absent", () => {
    const result = PortableProfileSchema.parse({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
    });
    expect(result.country).toBe("US");
    expect(result.address).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });

  it("rejects missing required fields", () => {
    expect(() => PortableProfileSchema.parse({ first_name: "Jane" })).toThrow();
  });

  it("accepts all optional fields when provided", () => {
    const result = PortableProfileSchema.parse({
      first_name: "John",
      last_name: "Smith",
      email: "john@example.com",
      address: "123 Main St",
      city: "Springfield",
      state: "IL",
      zip: "62701",
      country: "US",
      phone: "+1-555-555-5555",
      date_of_birth: "1990-01-01",
      aliases: ["Johnny", "J. Smith"],
    });
    expect(result.address).toBe("123 Main St");
    expect(result.aliases).toEqual(["Johnny", "J. Smith"]);
  });

  it("rejects invalid email", () => {
    expect(() =>
      PortableProfileSchema.parse({
        first_name: "Jane",
        last_name: "Doe",
        email: "not-an-email",
      })
    ).toThrow();
  });

  it("rejects empty first_name", () => {
    expect(() =>
      PortableProfileSchema.parse({
        first_name: "",
        last_name: "Doe",
        email: "jane@example.com",
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PortableSettingsSchema
// ---------------------------------------------------------------------------
describe("PortableSettingsSchema", () => {
  it("applies defaults when no fields provided", () => {
    const result = PortableSettingsSchema.parse({});
    expect(result.template).toBe("gdpr");
    expect(result.regions).toEqual(["us"]);
    expect(result.tiers).toEqual([1, 2, 3]);
    expect(result.excluded_brokers).toEqual([]);
    expect(result.delay_min_ms).toBe(5_000);
    expect(result.delay_max_ms).toBe(15_000);
    expect(result.dry_run).toBe(false);
    expect(result.verify_before_send).toBe(false);
    expect(result.scan_interval_days).toBe(30);
  });

  it("daily_limit is optional with no default", () => {
    const result = PortableSettingsSchema.parse({});
    expect(result.daily_limit).toBeUndefined();
  });

  it("daily_limit accepts a positive integer", () => {
    const result = PortableSettingsSchema.parse({ daily_limit: 10 });
    expect(result.daily_limit).toBe(10);
  });

  it("daily_limit rejects zero", () => {
    expect(() => PortableSettingsSchema.parse({ daily_limit: 0 })).toThrow();
  });

  it("daily_limit rejects negative", () => {
    expect(() => PortableSettingsSchema.parse({ daily_limit: -1 })).toThrow();
  });

  it("rejects invalid template enum value", () => {
    expect(() =>
      PortableSettingsSchema.parse({ template: "unknown" })
    ).toThrow();
  });

  it("accepts all valid template values", () => {
    for (const template of ["gdpr", "ccpa", "generic"] as const) {
      const result = PortableSettingsSchema.parse({ template });
      expect(result.template).toBe(template);
    }
  });
});

// ---------------------------------------------------------------------------
// PortableRemovalRequestSchema
// ---------------------------------------------------------------------------
describe("PortableRemovalRequestSchema", () => {
  const validRequest = {
    _export_id: "req-001",
    broker_id: "broker-acme",
    method: "email",
    status: "sent",
    template_used: "gdpr",
    email_sent_to: "privacy@acme.com",
    confidence_score: 0.95,
    attempt_count: 1,
    last_error: null,
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };

  it("parses a valid removal request", () => {
    const result = PortableRemovalRequestSchema.parse(validRequest);
    expect(result._export_id).toBe("req-001");
    expect(result.broker_id).toBe("broker-acme");
  });

  it("nullable fields accept null values", () => {
    const result = PortableRemovalRequestSchema.parse({
      ...validRequest,
      email_sent_to: null,
      confidence_score: null,
      last_error: null,
      metadata: null,
    });
    expect(result.email_sent_to).toBeNull();
    expect(result.confidence_score).toBeNull();
  });

  it("nullable fields accept non-null values", () => {
    const result = PortableRemovalRequestSchema.parse({
      ...validRequest,
      last_error: "Connection timeout",
      metadata: '{"key":"value"}',
    });
    expect(result.last_error).toBe("Connection timeout");
    expect(result.metadata).toBe('{"key":"value"}');
  });

  it("rejects missing _export_id", () => {
    const { _export_id, ...rest } = validRequest;
    expect(() => PortableRemovalRequestSchema.parse(rest)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PortableBrokerResponseSchema
// ---------------------------------------------------------------------------
describe("PortableBrokerResponseSchema", () => {
  const validResponse = {
    _export_id: "resp-001",
    _request_ref: "req-001",
    response_type: "confirmation",
    raw_subject: "Your request has been processed",
    raw_from: "privacy@acme.com",
    raw_body_hash: "abc123hash",
    confirmation_url: "https://acme.com/confirm/xyz",
    url_domain: "acme.com",
    is_processed: true,
    created_at: "2026-01-05T00:00:00Z",
  };

  it("parses a valid broker response", () => {
    const result = PortableBrokerResponseSchema.parse(validResponse);
    expect(result._export_id).toBe("resp-001");
    expect(result._request_ref).toBe("req-001");
  });

  it("nullable fields accept null", () => {
    const result = PortableBrokerResponseSchema.parse({
      ...validResponse,
      raw_subject: null,
      raw_from: null,
      confirmation_url: null,
      url_domain: null,
    });
    expect(result.raw_subject).toBeNull();
    expect(result.url_domain).toBeNull();
  });

  it("rejects missing _request_ref", () => {
    const { _request_ref, ...rest } = validResponse;
    expect(() => PortableBrokerResponseSchema.parse(rest)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PortableEvidenceChainSchema
// ---------------------------------------------------------------------------
describe("PortableEvidenceChainSchema", () => {
  const validEntry = {
    _export_id: "ev-001",
    _request_ref: "req-001",
    _scan_result_ref: null,
    broker_id: "broker-acme",
    entry_type: "email_sent",
    content_hash: "hash-abc",
    prev_hash: "hash-000",
    page_text_hash: null,
    broker_url: null,
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
  };

  it("parses a valid evidence chain entry", () => {
    const result = PortableEvidenceChainSchema.parse(validEntry);
    expect(result._export_id).toBe("ev-001");
  });

  it("both _request_ref and _scan_result_ref can be null", () => {
    const result = PortableEvidenceChainSchema.parse({
      ...validEntry,
      _request_ref: null,
      _scan_result_ref: null,
    });
    expect(result._request_ref).toBeNull();
    expect(result._scan_result_ref).toBeNull();
  });

  it("both _request_ref and _scan_result_ref can be non-null", () => {
    const result = PortableEvidenceChainSchema.parse({
      ...validEntry,
      _request_ref: "req-001",
      _scan_result_ref: "scan-001",
    });
    expect(result._request_ref).toBe("req-001");
    expect(result._scan_result_ref).toBe("scan-001");
  });
});

// ---------------------------------------------------------------------------
// PortablePayloadSchema
// ---------------------------------------------------------------------------
describe("PortablePayloadSchema", () => {
  const minimalPayload = {
    profile: {
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
    },
    settings: {},
    removal_requests: [],
    broker_responses: [],
    email_log: [],
    evidence_chain: [],
    pending_tasks: [],
    scan_runs: [],
    scan_results: [],
    pipeline_runs: [],
    warnings: {},
  };

  it("parses a valid payload with empty arrays", () => {
    const result = PortablePayloadSchema.parse(minimalPayload);
    expect(result.removal_requests).toEqual([]);
    expect(result.broker_responses).toEqual([]);
    expect(result.email_log).toEqual([]);
    expect(result.evidence_chain).toEqual([]);
    expect(result.pending_tasks).toEqual([]);
    expect(result.scan_runs).toEqual([]);
    expect(result.scan_results).toEqual([]);
    expect(result.pipeline_runs).toEqual([]);
  });

  it("applies nested defaults (profile.country, settings.template, warnings)", () => {
    const result = PortablePayloadSchema.parse(minimalPayload);
    expect(result.profile.country).toBe("US");
    expect(result.settings.template).toBe("gdpr");
    expect(result.warnings.screenshots_excluded).toBe(true);
    expect(result.warnings.credentials_excluded).toBe(true);
  });

  it("rejects missing profile", () => {
    const { profile, ...rest } = minimalPayload;
    expect(() => PortablePayloadSchema.parse(rest)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CryptoParamsSchema
// ---------------------------------------------------------------------------
describe("CryptoParamsSchema", () => {
  const validCrypto = {
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2",
    iterations: 100_000,
    hash: "SHA-256",
    salt: "base64-salt-here",
    iv: "base64-iv-here",
    checksum: "sha256-checksum",
  };

  it("parses valid crypto params", () => {
    const result = CryptoParamsSchema.parse(validCrypto);
    expect(result.algorithm).toBe("AES-256-GCM");
    expect(result.kdf).toBe("PBKDF2");
    expect(result.hash).toBe("SHA-256");
  });

  it("rejects wrong algorithm string", () => {
    expect(() =>
      CryptoParamsSchema.parse({ ...validCrypto, algorithm: "AES-128-GCM" })
    ).toThrow();
  });

  it("rejects wrong kdf string", () => {
    expect(() =>
      CryptoParamsSchema.parse({ ...validCrypto, kdf: "scrypt" })
    ).toThrow();
  });

  it("rejects wrong hash string", () => {
    expect(() =>
      CryptoParamsSchema.parse({ ...validCrypto, hash: "SHA-512" })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ExportEnvelopeSchema
// ---------------------------------------------------------------------------
describe("ExportEnvelopeSchema", () => {
  const validEnvelope = {
    format: "brokerbane-export",
    version: 1,
    app_version: "2.0.0",
    created_at: "2026-01-01T00:00:00Z",
    source: "cli",
    crypto: {
      algorithm: "AES-256-GCM",
      kdf: "PBKDF2",
      iterations: 100_000,
      hash: "SHA-256",
      salt: "abc",
      iv: "def",
      checksum: "ghi",
    },
    summary: {
      removal_requests: 5,
      broker_responses: 3,
      email_log: 10,
      evidence_chain: 15,
      pending_tasks: 2,
      scan_runs: 1,
      scan_results: 50,
      pipeline_runs: 1,
    },
    payload: "encrypted-base64-blob",
  };

  it("parses a valid export envelope", () => {
    const result = ExportEnvelopeSchema.parse(validEnvelope);
    expect(result.format).toBe("brokerbane-export");
    expect(result.source).toBe("cli");
    expect(result.crypto.algorithm).toBe("AES-256-GCM");
  });

  it("rejects wrong format literal", () => {
    expect(() =>
      ExportEnvelopeSchema.parse({ ...validEnvelope, format: "other-format" })
    ).toThrow();
  });

  it("rejects invalid source value", () => {
    expect(() =>
      ExportEnvelopeSchema.parse({ ...validEnvelope, source: "mobile" })
    ).toThrow();
  });

  it("accepts all valid source values", () => {
    for (const source of ["cli", "pwa", "dashboard"] as const) {
      const result = ExportEnvelopeSchema.parse({ ...validEnvelope, source });
      expect(result.source).toBe(source);
    }
  });

  it("validates crypto params within envelope", () => {
    expect(() =>
      ExportEnvelopeSchema.parse({
        ...validEnvelope,
        crypto: { ...validEnvelope.crypto, algorithm: "AES-128-GCM" },
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PortableWarningsSchema
// ---------------------------------------------------------------------------
describe("PortableWarningsSchema", () => {
  it("applies defaults when empty", () => {
    const result = PortableWarningsSchema.parse({});
    expect(result.screenshots_excluded).toBe(true);
    expect(result.credentials_excluded).toBe(true);
    expect(result.extra_profile_data_truncated).toBeUndefined();
  });

  it("accepts extra_profile_data_truncated when provided", () => {
    const result = PortableWarningsSchema.parse({
      extra_profile_data_truncated: true,
    });
    expect(result.extra_profile_data_truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PortableScanRunSchema
// ---------------------------------------------------------------------------
describe("PortableScanRunSchema", () => {
  it("parses a valid scan run", () => {
    const result = PortableScanRunSchema.parse({
      _export_id: "run-001",
      started_at: "2026-01-01T00:00:00Z",
      finished_at: "2026-01-01T01:00:00Z",
      status: "completed",
      total_brokers: 100,
      found_count: 12,
      not_found_count: 85,
      error_count: 3,
    });
    expect(result._export_id).toBe("run-001");
    expect(result.finished_at).toBe("2026-01-01T01:00:00Z");
  });

  it("finished_at can be null", () => {
    const result = PortableScanRunSchema.parse({
      _export_id: "run-002",
      started_at: "2026-01-01T00:00:00Z",
      finished_at: null,
      status: "running",
      total_brokers: 100,
      found_count: 0,
      not_found_count: 0,
      error_count: 0,
    });
    expect(result.finished_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PortableScanResultSchema
// ---------------------------------------------------------------------------
describe("PortableScanResultSchema", () => {
  it("parses a valid scan result", () => {
    const result = PortableScanResultSchema.parse({
      _export_id: "sr-001",
      _scan_run_ref: "run-001",
      broker_id: "broker-acme",
      found: true,
      confidence: 0.85,
      profile_data: '{"name":"Jane"}',
      error: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(result.found).toBe(true);
    expect(result.confidence).toBe(0.85);
  });

  it("nullable fields work correctly", () => {
    const result = PortableScanResultSchema.parse({
      _export_id: "sr-002",
      _scan_run_ref: "run-001",
      broker_id: "broker-beta",
      found: false,
      confidence: null,
      profile_data: null,
      error: "Timeout",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(result.confidence).toBeNull();
    expect(result.profile_data).toBeNull();
    expect(result.error).toBe("Timeout");
  });
});
