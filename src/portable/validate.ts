// src/portable/validate.ts
import type { PortablePayload } from "./schema.js";

export interface ValidationWarning {
  type: "unknown_broker" | "orphaned_reference" | "future_date" | "duplicate_entry";
  message: string;
  count: number;
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  errors: string[];
}

export function validate(payload: PortablePayload, knownBrokerIds: Set<string>): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: string[] = [];

  // Unknown broker IDs
  const allBrokerIds = [
    ...payload.removal_requests.map((r) => r.broker_id),
    ...payload.evidence_chain.map((e) => e.broker_id),
    ...payload.scan_results.map((s) => s.broker_id),
  ];
  const unknownBrokers = new Set(allBrokerIds.filter((id) => !knownBrokerIds.has(id)));
  if (unknownBrokers.size > 0) {
    const preview = [...unknownBrokers].slice(0, 5).join(", ");
    warnings.push({
      type: "unknown_broker",
      message: `${unknownBrokers.size} broker(s) not in current database: ${preview}${unknownBrokers.size > 5 ? "..." : ""}`,
      count: unknownBrokers.size,
    });
  }

  // Duplicate _export_ids
  const exportIds = new Set<string>();
  const allRecords = [
    ...payload.removal_requests, ...payload.broker_responses, ...payload.email_log,
    ...payload.evidence_chain, ...payload.pending_tasks, ...payload.scan_runs,
    ...payload.scan_results, ...payload.pipeline_runs,
  ];
  let dupeCount = 0;
  for (const record of allRecords) {
    const id = (record as Record<string, unknown>)._export_id as string;
    if (exportIds.has(id)) dupeCount++;
    exportIds.add(id);
  }
  if (dupeCount > 0) {
    warnings.push({ type: "duplicate_entry", message: `${dupeCount} duplicate _export_id(s) found`, count: dupeCount });
  }

  // Orphaned _request_refs
  const rrIds = new Set(payload.removal_requests.map((r) => r._export_id));
  const refTables = [
    { name: "broker_responses", records: payload.broker_responses as Array<{ _request_ref: string }> },
    { name: "email_log", records: payload.email_log as Array<{ _request_ref: string }> },
    { name: "pending_tasks", records: payload.pending_tasks as Array<{ _request_ref: string }> },
  ];
  for (const { name, records } of refTables) {
    const orphaned = records.filter((r) => !rrIds.has(r._request_ref));
    if (orphaned.length > 0) {
      warnings.push({
        type: "orphaned_reference",
        message: `${orphaned.length} ${name} entries reference nonexistent removal requests`,
        count: orphaned.length,
      });
    }
  }

  // Orphaned _scan_run_refs
  const srunIds = new Set(payload.scan_runs.map((r) => r._export_id));
  const orphanedScanResults = payload.scan_results.filter((r) => !srunIds.has(r._scan_run_ref));
  if (orphanedScanResults.length > 0) {
    warnings.push({
      type: "orphaned_reference",
      message: `${orphanedScanResults.length} scan_results reference nonexistent scan runs`,
      count: orphanedScanResults.length,
    });
  }

  // Orphaned evidence chain refs
  const sresIds = new Set(payload.scan_results.map((r) => r._export_id));
  for (const ec of payload.evidence_chain) {
    if (ec._request_ref && !rrIds.has(ec._request_ref)) {
      warnings.push({ type: "orphaned_reference", message: `Evidence chain entry references nonexistent removal request: ${ec._request_ref}`, count: 1 });
    }
    if (ec._scan_result_ref && !sresIds.has(ec._scan_result_ref)) {
      warnings.push({ type: "orphaned_reference", message: `Evidence chain entry references nonexistent scan result: ${ec._scan_result_ref}`, count: 1 });
    }
  }

  // Future dates (1-day tolerance)
  const now = Date.now();
  const tolerance = 86_400_000;
  const dateFields = [
    ...payload.removal_requests.map((r) => r.created_at),
    ...payload.email_log.map((e) => e.created_at),
    ...payload.scan_results.map((s) => s.created_at),
  ];
  const futureDates = dateFields.filter((d) => new Date(d).getTime() > now + tolerance);
  if (futureDates.length > 0) {
    warnings.push({ type: "future_date", message: `${futureDates.length} records have dates more than 1 day in the future`, count: futureDates.length });
  }

  return { valid: errors.length === 0, warnings, errors };
}
