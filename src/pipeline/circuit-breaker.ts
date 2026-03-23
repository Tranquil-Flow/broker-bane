import type { CircuitBreakerConfig } from "../types/config.js";
import type { CircuitBreakerRepo } from "../db/repositories/circuit-breaker.repo.js";
import type { DomainCircuitBreakerRepo } from "../db/repositories/domain-circuit-breaker.repo.js";
import { CIRCUIT_STATE } from "../types/pipeline.js";
import type { CircuitState } from "../types/pipeline.js";
import { CircuitBreakerOpenError } from "../util/errors.js";
import { logger } from "../util/logger.js";
import { getRegistrableDomain } from "../util/domain.js";

/**
 * Calculate exponential backoff cooldown duration.
 * Each consecutive open multiplies the cooldown by the multiplier.
 * Capped at 7 days (604800000 ms).
 */
function calculateCooldown(
  baseCooldownMs: number,
  consecutiveOpens: number,
  multiplier: number = 2
): number {
  const maxCooldownMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  const cooldown = baseCooldownMs * Math.pow(multiplier, consecutiveOpens);
  return Math.min(cooldown, maxCooldownMs);
}

export interface CircuitBreakerInit {
  repo: CircuitBreakerRepo;
  domainRepo?: DomainCircuitBreakerRepo;
  config: CircuitBreakerConfig;
  /** Map broker IDs to their domains. If provided, enables per-domain tracking. */
  brokerDomainMap?: Map<string, string>;
}

export class CircuitBreaker {
  private readonly repo: CircuitBreakerRepo;
  private readonly domainRepo?: DomainCircuitBreakerRepo;
  private readonly config: CircuitBreakerConfig;
  private readonly brokerDomainMap: Map<string, string>;

  constructor(init: CircuitBreakerInit);
  /** @deprecated Use object initializer for new code */
  constructor(repo: CircuitBreakerRepo, config: CircuitBreakerConfig);
  constructor(
    initOrRepo: CircuitBreakerInit | CircuitBreakerRepo,
    config?: CircuitBreakerConfig
  ) {
    if ("repo" in initOrRepo) {
      // New object initializer
      this.repo = initOrRepo.repo;
      this.domainRepo = initOrRepo.domainRepo;
      this.config = initOrRepo.config;
      this.brokerDomainMap = initOrRepo.brokerDomainMap ?? new Map();
    } else {
      // Legacy two-arg constructor
      this.repo = initOrRepo;
      this.config = config!;
      this.brokerDomainMap = new Map();
    }
  }

  /** Extract domain from a broker ID using the map, or try to guess from the ID */
  private getDomain(brokerId: string): string | null {
    if (this.brokerDomainMap.has(brokerId)) {
      return this.brokerDomainMap.get(brokerId)!;
    }
    // Fallback: try to extract domain from broker ID if it looks like a domain
    const guessed = getRegistrableDomain(brokerId);
    return guessed;
  }

  check(brokerId: string): void {
    // Check broker-level circuit breaker
    const state = this.repo.get(brokerId);
    if (state && state.state === CIRCUIT_STATE.open) {
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
          domain: state.domain ?? undefined,
        });
        logger.info({ brokerId }, "Circuit breaker half-opened");
      }
    }

    // Check domain-level circuit breaker
    if (this.domainRepo) {
      const domain = this.getDomain(brokerId);
      if (domain) {
        const domainState = this.domainRepo.get(domain);
        if (domainState && domainState.state === CIRCUIT_STATE.open) {
          if (domainState.cooldown_until) {
            const cooldownEnd = new Date(domainState.cooldown_until);
            if (new Date() < cooldownEnd) {
              throw new CircuitBreakerOpenError(
                `domain:${domain}`,
                cooldownEnd,
                `Domain ${domain} is blocked (affects broker ${brokerId})`
              );
            }
            // Cooldown expired, transition to half_open
            this.domainRepo.upsert({
              domain,
              state: CIRCUIT_STATE.half_open,
              failureCount: domainState.failure_count,
              consecutiveOpens: domainState.consecutive_opens,
              lastFailureAt: domainState.last_failure_at ?? undefined,
            });
            logger.info({ domain, brokerId }, "Domain circuit breaker half-opened");
          }
        }
      }
    }
  }

  recordSuccess(brokerId: string): void {
    // Reset broker-level circuit breaker
    const state = this.repo.get(brokerId);
    if (state && state.state !== CIRCUIT_STATE.closed) {
      this.repo.reset(brokerId);
      logger.info({ brokerId }, "Circuit breaker reset to closed");
    }

    // Reset domain-level circuit breaker
    if (this.domainRepo) {
      const domain = this.getDomain(brokerId);
      if (domain) {
        const domainState = this.domainRepo.get(domain);
        if (domainState && domainState.state !== CIRCUIT_STATE.closed) {
          this.domainRepo.reset(domain);
          logger.info({ domain, brokerId }, "Domain circuit breaker reset to closed");
        }
      }
    }
  }

  recordFailure(brokerId: string): void {
    const domain = this.getDomain(brokerId);
    const now = new Date().toISOString();

    // Record broker-level failure
    const state = this.repo.get(brokerId);
    const currentFailures = (state?.failure_count ?? 0) + 1;

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
        domain: domain ?? undefined,
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
        domain: domain ?? undefined,
      });
    }

    // Record domain-level failure (if domain tracking enabled)
    if (this.domainRepo && domain) {
      const domainState = this.domainRepo.get(domain);
      const domainFailures = (domainState?.failure_count ?? 0) + 1;
      const consecutiveOpens = domainState?.consecutive_opens ?? 0;

      // Domain threshold is 2x broker threshold (need multiple brokers failing)
      const domainThreshold = this.config.failure_threshold * 2;

      if (domainFailures >= domainThreshold) {
        const newConsecutiveOpens = consecutiveOpens + 1;
        const cooldownMs = calculateCooldown(
          this.config.cooldown_ms,
          consecutiveOpens // Use previous value for this opening
        );
        const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();

        this.domainRepo.upsert({
          domain,
          state: CIRCUIT_STATE.open,
          failureCount: domainFailures,
          consecutiveOpens: newConsecutiveOpens,
          lastFailureAt: now,
          cooldownUntil,
        });

        logger.warn(
          {
            domain,
            failures: domainFailures,
            consecutiveOpens: newConsecutiveOpens,
            cooldownMs,
            cooldownUntil,
          },
          "Domain circuit breaker opened with exponential backoff"
        );
      } else {
        this.domainRepo.upsert({
          domain,
          state: domainState?.state ?? CIRCUIT_STATE.closed,
          failureCount: domainFailures,
          consecutiveOpens,
          lastFailureAt: now,
        });
      }
    }
  }

  getState(brokerId: string): CircuitState {
    const state = this.repo.get(brokerId);
    return (state?.state as CircuitState) ?? CIRCUIT_STATE.closed;
  }

  getDomainState(domain: string): CircuitState {
    if (!this.domainRepo) return CIRCUIT_STATE.closed;
    const state = this.domainRepo.get(domain);
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

  /** Check if a domain is currently blocked */
  isDomainOpen(domain: string): boolean {
    if (!this.domainRepo) return false;
    const state = this.domainRepo.get(domain);
    if (!state || state.state !== CIRCUIT_STATE.open) return false;
    if (!state.cooldown_until) return false;
    return new Date() < new Date(state.cooldown_until);
  }

  /** Get all open domain circuit breakers */
  getOpenDomains(): string[] {
    if (!this.domainRepo) return [];
    return this.domainRepo.getOpen().map((r) => r.domain);
  }
}
