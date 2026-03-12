// src/portable/diff.ts
import type { PortablePayload, ProfileConflict } from "./schema.js";

export interface DiffResult {
  added: Record<string, number>;
  skipped: Record<string, number>;
  conflicts: ProfileConflict[];
}

export function diff(incoming: PortablePayload, existing: PortablePayload): DiffResult {
  const added: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const conflicts: ProfileConflict[] = [];

  // Profile conflicts: only flag if BOTH sides have a non-empty value AND they differ
  const profileFields = ["first_name", "last_name", "email", "address", "city", "state", "zip", "country", "phone", "date_of_birth"] as const;
  for (const field of profileFields) {
    const curr = existing.profile[field] ?? "";
    const imp = incoming.profile[field] ?? "";
    if (curr && imp && curr !== imp) {
      conflicts.push({ field, currentValue: String(curr), importedValue: String(imp) });
    }
  }

  // Removal requests: match on broker_id + created_at
  const existingRRKeys = new Set(existing.removal_requests.map((r) => `${r.broker_id}|${r.created_at}`));
  const newRR = incoming.removal_requests.filter((r) => !existingRRKeys.has(`${r.broker_id}|${r.created_at}`));
  added.removal_requests = newRR.length;
  skipped.removal_requests = incoming.removal_requests.length - newRR.length;

  // Email log: match on message_id (null IDs always treated as new)
  const existingMsgIds = new Set(
    existing.email_log.filter((e) => e.message_id != null).map((e) => e.message_id!)
  );
  const newEL = incoming.email_log.filter((e) => e.message_id == null || !existingMsgIds.has(e.message_id));
  added.email_log = newEL.length;
  skipped.email_log = incoming.email_log.length - newEL.length;

  // Other tables: composite key matching
  const tables = [
    {
      name: "broker_responses",
      incoming: incoming.broker_responses,
      existing: existing.broker_responses,
      key: (r: typeof incoming.broker_responses[0]) => `${r._request_ref}|${r.response_type}|${r.created_at}`,
    },
    {
      name: "evidence_chain",
      incoming: incoming.evidence_chain,
      existing: existing.evidence_chain,
      key: (r: typeof incoming.evidence_chain[0]) => `${r.broker_id}|${r.entry_type}|${r.created_at}`,
    },
    {
      name: "pending_tasks",
      incoming: incoming.pending_tasks,
      existing: existing.pending_tasks,
      key: (r: typeof incoming.pending_tasks[0]) => `${r._request_ref}|${r.task_type}|${r.created_at}`,
    },
    {
      name: "scan_runs",
      incoming: incoming.scan_runs,
      existing: existing.scan_runs,
      key: (r: typeof incoming.scan_runs[0]) => `${r.started_at}|${r.status}`,
    },
    {
      name: "scan_results",
      incoming: incoming.scan_results,
      existing: existing.scan_results,
      key: (r: typeof incoming.scan_results[0]) => `${r.broker_id}|${r.created_at}`,
    },
    {
      name: "pipeline_runs",
      incoming: incoming.pipeline_runs,
      existing: existing.pipeline_runs,
      key: (r: typeof incoming.pipeline_runs[0]) => `${r.started_at}|${r.status}`,
    },
  ] as const;

  for (const table of tables) {
    const existingKeys = new Set(table.existing.map(table.key as (r: unknown) => string));
    const newRecords = table.incoming.filter((r) => !existingKeys.has((table.key as (r: unknown) => string)(r)));
    added[table.name] = newRecords.length;
    skipped[table.name] = table.incoming.length - newRecords.length;
  }

  return { added, skipped, conflicts };
}
