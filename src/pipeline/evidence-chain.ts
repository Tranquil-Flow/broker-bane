import { createHash, type Hash } from "node:crypto";
import { readFileSync } from "node:fs";
import { EvidenceChainRepo } from "../db/repositories/evidence-chain.repo.js";
import type { EvidenceChainRow } from "../types/database.js";
import { logger } from "../util/logger.js";

const GENESIS_HASH = "0".repeat(64);

export type EvidenceEntryType = "before_scan" | "after_removal" | "re_verification" | "confirmation_email";

export interface RecordEvidenceInput {
  requestId?: number;
  scanResultId?: number;
  entryType: EvidenceEntryType;
  brokerId: string;
  brokerUrl?: string;
  screenshotPath?: string;
  pageText?: string;
  metadata?: Record<string, unknown>;
}

export interface ChainVerifyResult {
  valid: boolean;
  totalEntries: number;
  brokenAt?: number;
  error?: string;
}

export interface TextDiffResult {
  brokerId: string;
  beforeText: string;
  afterText: string;
  removedLines: string[];
  addedLines: string[];
}

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf-8").digest("hex");
}

function hashFile(path: string): string | null {
  try {
    const buf = readFileSync(path);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

function computeContentHash(
  prevHash: string,
  entryType: string,
  brokerId: string,
  pageTextHash: string | null,
  screenshotHash: string | null,
  timestamp: string
): string {
  const payload = [
    prevHash,
    entryType,
    brokerId,
    pageTextHash ?? "",
    screenshotHash ?? "",
    timestamp,
  ].join("|");
  return sha256(payload);
}

export class EvidenceChainService {
  constructor(private readonly repo: EvidenceChainRepo) {}

  recordEvidence(input: RecordEvidenceInput): EvidenceChainRow {
    const prevHash = this.repo.getLatestHash();

    const pageTextHash = input.pageText ? sha256(input.pageText) : null;
    let screenshotFileHash: string | null = null;
    if (input.screenshotPath) {
      screenshotFileHash = hashFile(input.screenshotPath);
    }

    // Insert with placeholder hash, then update with real hash using DB timestamp
    const row = this.repo.create({
      requestId: input.requestId,
      scanResultId: input.scanResultId,
      entryType: input.entryType,
      contentHash: "pending",
      prevHash,
      screenshotPath: input.screenshotPath,
      pageText: input.pageText,
      pageTextHash: pageTextHash ?? undefined,
      brokerUrl: input.brokerUrl,
      brokerId: input.brokerId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    });

    // Now compute hash using the DB-assigned created_at
    const contentHash = computeContentHash(
      prevHash,
      input.entryType,
      input.brokerId,
      pageTextHash,
      screenshotFileHash,
      row.created_at
    );

    this.repo.updateContentHash(row.id, contentHash);
    row.content_hash = contentHash;

    logger.debug(
      { brokerId: input.brokerId, entryType: input.entryType, chainId: row.id },
      "Evidence chain entry recorded"
    );

    return row;
  }

  verifyChain(brokerId?: string): ChainVerifyResult {
    const entries = brokerId
      ? this.repo.getByBrokerId(brokerId)
      : this.repo.getAll();

    if (entries.length === 0) {
      return { valid: true, totalEntries: 0 };
    }

    let expectedPrevHash = GENESIS_HASH;

    // If filtering by broker, the first entry for that broker may not be
    // the genesis entry. In that case, trust its prev_hash as the starting
    // anchor (the global chain was already validated by the first entry's
    // predecessor).
    if (brokerId) {
      expectedPrevHash = entries[0].prev_hash;
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Verify prev_hash linkage
      if (i === 0 && !brokerId) {
        if (entry.prev_hash !== GENESIS_HASH) {
          return {
            valid: false,
            totalEntries: entries.length,
            brokenAt: entry.id,
            error: `Genesis entry has unexpected prev_hash: ${entry.prev_hash}`,
          };
        }
      } else if (i > 0) {
        if (entry.prev_hash !== entries[i - 1].content_hash) {
          return {
            valid: false,
            totalEntries: entries.length,
            brokenAt: entry.id,
            error: `Chain broken: entry ${entry.id} prev_hash does not match entry ${entries[i - 1].id} content_hash`,
          };
        }
      }

      // Verify content hash integrity
      const recomputedHash = computeContentHash(
        entry.prev_hash,
        entry.entry_type,
        entry.broker_id,
        entry.page_text_hash,
        entry.screenshot_path ? hashFile(entry.screenshot_path) : null,
        entry.created_at
      );

      if (recomputedHash !== entry.content_hash) {
        return {
          valid: false,
          totalEntries: entries.length,
          brokenAt: entry.id,
          error: `Content hash mismatch at entry ${entry.id}: expected ${recomputedHash}, got ${entry.content_hash}`,
        };
      }
    }

    return { valid: true, totalEntries: entries.length };
  }

  repairChain(): { repairedAt: number; newSegmentStart: number } | null {
    const result = this.verifyChain();
    if (result.valid || result.brokenAt === undefined) {
      return null;
    }

    const brokenEntry = this.repo.getById(result.brokenAt);
    if (!brokenEntry) return null;

    // Find the last valid entry before the break
    const allEntries = this.repo.getAll();
    const brokenIdx = allEntries.findIndex((e) => e.id === result.brokenAt);
    const lastValidEntry = brokenIdx > 0 ? allEntries[brokenIdx - 1] : undefined;
    const anchorHash = lastValidEntry?.content_hash ?? GENESIS_HASH;

    // Record a repair marker entry that starts a new chain segment
    this.recordEvidence({
      entryType: "re_verification",
      brokerId: brokenEntry.broker_id,
      brokerUrl: brokenEntry.broker_url ?? undefined,
      metadata: {
        repair: true,
        broken_at_id: result.brokenAt,
        error: result.error,
        anchor_hash: anchorHash,
      },
    });

    logger.info(
      { brokenAt: result.brokenAt, error: result.error },
      "Evidence chain repaired — new segment started"
    );

    return { repairedAt: result.brokenAt, newSegmentStart: this.repo.count() };
  }

  getTextDiff(brokerId: string): TextDiffResult | null {
    const entries = this.repo.getByBrokerId(brokerId);

    const beforeEntry = entries.find((e) => e.entry_type === "before_scan" && e.page_text);
    const afterEntry = entries
      .filter((e) =>
        (e.entry_type === "after_removal" || e.entry_type === "re_verification") && e.page_text
      )
      .pop(); // most recent

    if (!beforeEntry?.page_text || !afterEntry?.page_text) {
      return null;
    }

    const beforeLines = beforeEntry.page_text.split("\n").map((l) => l.trim()).filter(Boolean);
    const afterLines = afterEntry.page_text.split("\n").map((l) => l.trim()).filter(Boolean);

    const afterSet = new Set(afterLines);
    const beforeSet = new Set(beforeLines);

    return {
      brokerId,
      beforeText: beforeEntry.page_text,
      afterText: afterEntry.page_text,
      removedLines: beforeLines.filter((l) => !afterSet.has(l)),
      addedLines: afterLines.filter((l) => !beforeSet.has(l)),
    };
  }
}
