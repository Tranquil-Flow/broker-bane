import { z } from "zod";

export const PortableProfileSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().default("US"),
  phone: z.string().optional(),
  date_of_birth: z.string().optional(),
  aliases: z.array(z.string()).default([]),
});

export type PortableProfile = z.infer<typeof PortableProfileSchema>;

export const PortableSettingsSchema = z.object({
  template: z.enum(["gdpr", "ccpa", "generic"]).default("gdpr"),
  regions: z.array(z.string()).default(["us"]),
  tiers: z.array(z.number()).default([1, 2, 3]),
  excluded_brokers: z.array(z.string()).default([]),
  delay_min_ms: z.number().default(5_000),
  delay_max_ms: z.number().default(15_000),
  daily_limit: z.number().int().positive().optional(),
  dry_run: z.boolean().default(false),
  verify_before_send: z.boolean().default(false),
  scan_interval_days: z.number().int().positive().default(30),
});

export type PortableSettings = z.infer<typeof PortableSettingsSchema>;

export const PortableRemovalRequestSchema = z.object({
  _export_id: z.string(),
  broker_id: z.string(),
  method: z.string(),
  status: z.string(),
  template_used: z.string(),
  email_sent_to: z.string().nullable(),
  confidence_score: z.number().nullable(),
  attempt_count: z.number(),
  last_error: z.string().nullable(),
  metadata: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PortableBrokerResponseSchema = z.object({
  _export_id: z.string(),
  _request_ref: z.string(),
  response_type: z.string(),
  raw_subject: z.string().nullable(),
  raw_from: z.string().nullable(),
  raw_body_hash: z.string(),
  confirmation_url: z.string().nullable(),
  url_domain: z.string().nullable(),
  is_processed: z.boolean(),
  created_at: z.string(),
});

export const PortableEmailLogSchema = z.object({
  _export_id: z.string(),
  _request_ref: z.string(),
  direction: z.string(),
  message_id: z.string().nullable(),
  from_addr: z.string(),
  to_addr: z.string(),
  subject: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export const PortableEvidenceChainSchema = z.object({
  _export_id: z.string(),
  _request_ref: z.string().nullable(),
  _scan_result_ref: z.string().nullable(),
  broker_id: z.string(),
  entry_type: z.string(),
  content_hash: z.string(),
  prev_hash: z.string(),
  page_text_hash: z.string().nullable(),
  broker_url: z.string().nullable(),
  metadata: z.string().nullable(),
  created_at: z.string(),
});

export const PortablePendingTaskSchema = z.object({
  _export_id: z.string(),
  _request_ref: z.string(),
  task_type: z.string(),
  description: z.string(),
  url: z.string().nullable(),
  is_completed: z.boolean(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

export const PortableScanRunSchema = z.object({
  _export_id: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  status: z.string(),
  total_brokers: z.number(),
  found_count: z.number(),
  not_found_count: z.number(),
  error_count: z.number(),
});

export const PortableScanResultSchema = z.object({
  _export_id: z.string(),
  _scan_run_ref: z.string(),
  broker_id: z.string(),
  found: z.boolean(),
  confidence: z.number().nullable(),
  profile_data: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
});

export const PortablePipelineRunSchema = z.object({
  _export_id: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  status: z.string(),
  total_brokers: z.number(),
  sent_count: z.number(),
  failed_count: z.number(),
  skipped_count: z.number(),
});

export const PortableWarningsSchema = z.object({
  screenshots_excluded: z.boolean().default(true),
  credentials_excluded: z.boolean().default(true),
  extra_profile_data_truncated: z.boolean().optional(),
});

export const PortablePayloadSchema = z.object({
  profile: PortableProfileSchema,
  settings: PortableSettingsSchema,
  removal_requests: z.array(PortableRemovalRequestSchema),
  broker_responses: z.array(PortableBrokerResponseSchema),
  email_log: z.array(PortableEmailLogSchema),
  evidence_chain: z.array(PortableEvidenceChainSchema),
  pending_tasks: z.array(PortablePendingTaskSchema),
  scan_runs: z.array(PortableScanRunSchema),
  scan_results: z.array(PortableScanResultSchema),
  pipeline_runs: z.array(PortablePipelineRunSchema),
  warnings: PortableWarningsSchema,
});

export type PortablePayload = z.infer<typeof PortablePayloadSchema>;

export const CryptoParamsSchema = z.object({
  algorithm: z.literal("AES-256-GCM"),
  kdf: z.literal("PBKDF2"),
  iterations: z.number(),
  hash: z.literal("SHA-256"),
  salt: z.string(),
  iv: z.string(),
  checksum: z.string(),
});

export const SummarySchema = z.object({
  removal_requests: z.number(),
  broker_responses: z.number(),
  email_log: z.number(),
  evidence_chain: z.number(),
  pending_tasks: z.number(),
  scan_runs: z.number(),
  scan_results: z.number(),
  pipeline_runs: z.number(),
});

export const ExportEnvelopeSchema = z.object({
  format: z.literal("brokerbane-export"),
  version: z.number(),
  app_version: z.string(),
  created_at: z.string(),
  source: z.enum(["cli", "pwa", "dashboard"]),
  crypto: CryptoParamsSchema,
  summary: SummarySchema,
  payload: z.string(),
});

export type ExportEnvelope = z.infer<typeof ExportEnvelopeSchema>;

export interface ProfileConflict {
  field: string;
  currentValue: string;
  importedValue: string;
}

export interface ImportResult {
  added: Record<string, number>;
  skipped: Record<string, number>;
  conflicts: ProfileConflict[];
  warnings: string[];
  credentialsNeeded: boolean;
}
