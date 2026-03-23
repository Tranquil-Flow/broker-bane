import type { Database } from "better-sqlite3";
import type { CircuitBreakerRow } from "../../types/database.js";

export class CircuitBreakerRepo {
  constructor(private readonly db: Database) {}

  get(brokerId: string): CircuitBreakerRow | undefined {
    return this.db
      .prepare("SELECT * FROM circuit_breaker_state WHERE broker_id = ?")
      .get(brokerId) as CircuitBreakerRow | undefined;
  }

  upsert(params: {
    brokerId: string;
    state: string;
    failureCount: number;
    lastFailureAt?: string;
    cooldownUntil?: string;
    domain?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO circuit_breaker_state (broker_id, state, failure_count, last_failure_at, cooldown_until, domain, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(broker_id) DO UPDATE SET
           state = excluded.state,
           failure_count = excluded.failure_count,
           last_failure_at = excluded.last_failure_at,
           cooldown_until = excluded.cooldown_until,
           domain = excluded.domain,
           updated_at = datetime('now')`
      )
      .run(
        params.brokerId,
        params.state,
        params.failureCount,
        params.lastFailureAt ?? null,
        params.cooldownUntil ?? null,
        params.domain ?? null
      );
  }

  /** Get all broker circuit breakers for a specific domain */
  getByDomain(domain: string): CircuitBreakerRow[] {
    return this.db
      .prepare("SELECT * FROM circuit_breaker_state WHERE domain = ?")
      .all(domain) as CircuitBreakerRow[];
  }

  reset(brokerId: string): void {
    this.db
      .prepare(
        "UPDATE circuit_breaker_state SET state = 'closed', failure_count = 0, cooldown_until = NULL, updated_at = datetime('now') WHERE broker_id = ?"
      )
      .run(brokerId);
  }

  getOpen(): CircuitBreakerRow[] {
    return this.db
      .prepare("SELECT * FROM circuit_breaker_state WHERE state = 'open'")
      .all() as CircuitBreakerRow[];
  }

  getAll(): CircuitBreakerRow[] {
    return this.db
      .prepare("SELECT * FROM circuit_breaker_state ORDER BY broker_id")
      .all() as CircuitBreakerRow[];
  }
}
