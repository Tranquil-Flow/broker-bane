import type { CircuitBreakerConfig } from "../types/config.js";
import type { CircuitBreakerRepo } from "../db/repositories/circuit-breaker.repo.js";
import { CIRCUIT_STATE } from "../types/pipeline.js";
import type { CircuitState } from "../types/pipeline.js";
import { CircuitBreakerOpenError } from "../util/errors.js";
import { logger } from "../util/logger.js";

export class CircuitBreaker {
  constructor(
    private readonly repo: CircuitBreakerRepo,
    private readonly config: CircuitBreakerConfig
  ) {}

  check(brokerId: string): void {
    const state = this.repo.get(brokerId);
    if (!state) return; // No record = closed

    if (state.state === CIRCUIT_STATE.open) {
      if (state.cooldown_until) {
        const cooldownEnd = new Date(state.cooldown_until);
        if (new Date() < cooldownEnd) {
          throw new CircuitBreakerOpenError(brokerId, cooldownEnd);
        }
        // Cooldown expired, transition to half_open
        this.repo.upsert({
          brokerId,
          state: CIRCUIT_STATE.half_open,
          failureCount: state.failure_count,
          lastFailureAt: state.last_failure_at ?? undefined,
        });
        logger.info({ brokerId }, "Circuit breaker half-opened");
      }
    }
  }

  recordSuccess(brokerId: string): void {
    const state = this.repo.get(brokerId);
    if (state && state.state !== CIRCUIT_STATE.closed) {
      this.repo.reset(brokerId);
      logger.info({ brokerId }, "Circuit breaker reset to closed");
    }
  }

  recordFailure(brokerId: string): void {
    const state = this.repo.get(brokerId);
    const currentFailures = (state?.failure_count ?? 0) + 1;
    const now = new Date().toISOString();

    if (currentFailures >= this.config.failure_threshold) {
      const cooldownUntil = new Date(
        Date.now() + this.config.cooldown_ms
      ).toISOString();

      this.repo.upsert({
        brokerId,
        state: CIRCUIT_STATE.open,
        failureCount: currentFailures,
        lastFailureAt: now,
        cooldownUntil,
      });

      logger.warn(
        { brokerId, failures: currentFailures, cooldownUntil },
        "Circuit breaker opened"
      );
    } else {
      this.repo.upsert({
        brokerId,
        state: state?.state ?? CIRCUIT_STATE.closed,
        failureCount: currentFailures,
        lastFailureAt: now,
      });
    }
  }

  getState(brokerId: string): CircuitState {
    const state = this.repo.get(brokerId);
    return (state?.state as CircuitState) ?? CIRCUIT_STATE.closed;
  }

  isOpen(brokerId: string): boolean {
    try {
      this.check(brokerId);
      return false;
    } catch {
      return true;
    }
  }
}
