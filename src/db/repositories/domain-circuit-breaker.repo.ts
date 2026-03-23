import type { Database } from "better-sqlite3";
import type { DomainCircuitBreakerRow } from "../../types/database.js";

export class DomainCircuitBreakerRepo {
  constructor(private readonly db: Database) {}

  get(domain: string): DomainCircuitBreakerRow | undefined {
    return this.db
      .prepare("SELECT * FROM domain_circuit_breaker WHERE domain = ?")
      .get(domain) as DomainCircuitBreakerRow | undefined;
  }

  upsert(params: {
    domain: string;
    state: string;
    failureCount: number;
    consecutiveOpens: number;
    lastFailureAt?: string;
    cooldownUntil?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO domain_circuit_breaker (domain, state, failure_count, consecutive_opens, last_failure_at, cooldown_until, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(domain) DO UPDATE SET
           state = excluded.state,
           failure_count = excluded.failure_count,
           consecutive_opens = excluded.consecutive_opens,
           last_failure_at = excluded.last_failure_at,
           cooldown_until = excluded.cooldown_until,
           updated_at = datetime('now')`
      )
      .run(
        params.domain,
        params.state,
        params.failureCount,
        params.consecutiveOpens,
        params.lastFailureAt ?? null,
        params.cooldownUntil ?? null
      );
  }

  reset(domain: string): void {
    this.db
      .prepare(
        "UPDATE domain_circuit_breaker SET state = 'closed', failure_count = 0, cooldown_until = NULL, updated_at = datetime('now') WHERE domain = ?"
      )
      .run(domain);
  }

  getOpen(): DomainCircuitBreakerRow[] {
    return this.db
      .prepare("SELECT * FROM domain_circuit_breaker WHERE state = 'open'")
      .all() as DomainCircuitBreakerRow[];
  }

  getAll(): DomainCircuitBreakerRow[] {
    return this.db
      .prepare("SELECT * FROM domain_circuit_breaker ORDER BY domain")
      .all() as DomainCircuitBreakerRow[];
  }

  /** Get all brokers affected by open domain circuit breakers */
  getAffectedBrokerIds(brokerDomainMap: Map<string, string>): string[] {
    const openDomains = new Set(this.getOpen().map((r) => r.domain));
    const affected: string[] = [];
    for (const [brokerId, domain] of brokerDomainMap) {
      if (openDomains.has(domain)) {
        affected.push(brokerId);
      }
    }
    return affected;
  }
}
