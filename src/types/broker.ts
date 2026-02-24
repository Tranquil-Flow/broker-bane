import { z } from "zod";

export const RemovalMethodSchema = z.enum(["email", "web_form", "hybrid"]);
export const DifficultySchema = z.enum(["easy", "medium", "hard", "manual"]);
export const BrokerTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const RegionSchema = z.enum(["us", "eu", "global"]);

export const BrokerSchema = z.object({
  // Core fields (from Eraser)
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  email: z.string().email().optional(),
  region: RegionSchema,
  category: z.string(),
  privacy_policy_url: z.string().url().optional(),

  // Extended fields
  search_url: z.string().url().optional(),
  removal_method: RemovalMethodSchema,
  requires_captcha: z.boolean().default(false),
  requires_email_confirm: z.boolean().default(false),
  requires_id_upload: z.boolean().default(false),
  difficulty: DifficultySchema.default("medium"),
  confirm_sender_pattern: z.string().optional(),
  tier: BrokerTierSchema.default(2),
  parent_company: z.string().optional(),
  subsidiary_of: z.string().optional(),
  public_directory: z.boolean().default(false),
  verify_before_send: z.boolean().default(false),
  form_hints: z.string().optional(),
  opt_out_url: z.string().url().optional(),
});

export const BrokerDatabaseSchema = z.object({
  version: z.string(),
  updated: z.string(),
  brokers: z.array(BrokerSchema),
});

export type Broker = z.infer<typeof BrokerSchema>;
export type BrokerDatabase = z.infer<typeof BrokerDatabaseSchema>;
export type RemovalMethod = z.infer<typeof RemovalMethodSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type BrokerTier = z.infer<typeof BrokerTierSchema>;
export type Region = z.infer<typeof RegionSchema>;
