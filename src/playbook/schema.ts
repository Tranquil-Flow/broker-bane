import { z } from "zod";

const GotoStep = z.object({
  action: z.literal("goto"),
  url: z.string().url(),
});

const FillStep = z.object({
  action: z.literal("fill"),
  selector: z.string().min(1),
  value: z.string(),
});

const ClickStep = z.object({
  action: z.literal("click"),
  selector: z.string().min(1),
});

const WaitStep = z.object({
  action: z.literal("wait"),
  ms: z.number().positive().optional(),
  selector: z.string().optional(),
}).refine((s) => s.ms !== undefined || s.selector !== undefined, {
  message: "wait step requires either ms or selector",
});

const ScreenshotStep = z.object({
  action: z.literal("screenshot"),
  label: z.string().min(1),
});

const SelectStep = z.object({
  action: z.literal("select"),
  selector: z.string().min(1),
  value: z.string(),
});

const CheckStep = z.object({
  action: z.literal("check"),
  selector: z.string().min(1),
});

export const PlaybookStepSchema = z.union([
  GotoStep,
  FillStep,
  ClickStep,
  WaitStep,
  ScreenshotStep,
  SelectStep,
  CheckStep,
]);

export const PlaybookPhaseSchema = z.object({
  name: z.string().min(1),
  steps: z.array(PlaybookStepSchema).min(1),
});

export const PlaybookSchema = z.object({
  broker_id: z.string().min(1),
  version: z.number().int().positive(),
  last_verified: z.string(),
  phases: z.array(PlaybookPhaseSchema).min(1),
});

export type Playbook = z.infer<typeof PlaybookSchema>;
export type PlaybookStep = z.infer<typeof PlaybookStepSchema>;
export type PlaybookPhase = z.infer<typeof PlaybookPhaseSchema>;
