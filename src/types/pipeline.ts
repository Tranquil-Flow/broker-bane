export const REQUEST_STATUS = {
  pending: "pending",
  scanning: "scanning",
  matched: "matched",
  sending: "sending",
  sent: "sent",
  awaiting_confirmation: "awaiting_confirmation",
  confirmed: "confirmed",
  completed: "completed",
  failed: "failed",
  skipped: "skipped",
  manual_required: "manual_required",
} as const;

export type RequestStatus = (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS];

export const PIPELINE_STATUS = {
  running: "running",
  completed: "completed",
  failed: "failed",
  interrupted: "interrupted",
} as const;

export type PipelineStatus = (typeof PIPELINE_STATUS)[keyof typeof PIPELINE_STATUS];

export const TASK_TYPE = {
  captcha_solve: "captcha_solve",
  id_upload: "id_upload",
  manual_form: "manual_form",
  manual_confirm: "manual_confirm",
  review_match: "review_match",
} as const;

export type TaskType = (typeof TASK_TYPE)[keyof typeof TASK_TYPE];

export const CIRCUIT_STATE = {
  closed: "closed",
  open: "open",
  half_open: "half_open",
} as const;

export type CircuitState = (typeof CIRCUIT_STATE)[keyof typeof CIRCUIT_STATE];

export const EMAIL_DIRECTION = {
  inbound: "inbound",
  outbound: "outbound",
} as const;

export type EmailDirection = (typeof EMAIL_DIRECTION)[keyof typeof EMAIL_DIRECTION];

export const RESPONSE_TYPE = {
  confirmation: "confirmation",
  acknowledgment: "acknowledgment",
  rejection: "rejection",
  info_request: "info_request",
  unknown: "unknown",
} as const;

export type ResponseType = (typeof RESPONSE_TYPE)[keyof typeof RESPONSE_TYPE];

// Valid state transitions for removal requests
export const VALID_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  pending: ["scanning", "sending", "skipped", "manual_required"],
  scanning: ["matched", "skipped", "failed"],
  matched: ["sending", "manual_required", "skipped"],
  sending: ["sent", "failed"],
  sent: ["awaiting_confirmation", "completed", "failed"],
  awaiting_confirmation: ["confirmed", "failed", "manual_required"],
  confirmed: ["completed", "failed"],
  completed: [],
  failed: ["pending"],
  skipped: [],
  manual_required: ["pending", "completed"],
} as const;
