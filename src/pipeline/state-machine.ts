import type { RequestStatus } from "../types/pipeline.js";
import { VALID_TRANSITIONS } from "../types/pipeline.js";
import { StateTransitionError } from "../util/errors.js";
import { logger } from "../util/logger.js";

export function validateTransition(
  from: RequestStatus,
  to: RequestStatus
): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return (allowed as readonly string[]).includes(to);
}

export function transition(
  from: RequestStatus,
  to: RequestStatus
): RequestStatus {
  if (!validateTransition(from, to)) {
    throw new StateTransitionError(from, to);
  }
  logger.debug({ from, to }, "State transition");
  return to;
}

export function getNextStates(current: RequestStatus): readonly RequestStatus[] {
  return VALID_TRANSITIONS[current];
}

export function isTerminal(status: RequestStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}
