import Database from "better-sqlite3";
import { createInMemoryDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { EvidenceChainRepo } from "../../src/db/repositories/evidence-chain.repo.js";
import { EvidenceChainService } from "../../src/pipeline/evidence-chain.js";

const GENESIS_HASH = "0".repeat(64);

describe("EvidenceChainService", () => {
  let db: InstanceType<typeof Database>;
  let repo: EvidenceChainRepo;
  let service: EvidenceChainService;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    repo = new EvidenceChainRepo(db);
    service = new EvidenceChainService(repo);
  });

  afterEach(() => {
    db.close();
  });

  describe("recordEvidence", () => {
    it("creates genesis entry with prev_hash = 0*64", () => {
      const entry = service.recordEvidence({
        entryType: "before_scan",
        brokerId: "spokeo",
        brokerUrl: "https://spokeo.com",
        pageText: "John Doe, 123 Main St",
      });

      expect(entry.prev_hash).toBe(GENESIS_HASH);
      expect(entry.content_hash).toBeTruthy();
      expect(entry.content_hash).not.toBe(GENESIS_HASH);
      expect(entry.entry_type).toBe("before_scan");
      expect(entry.broker_id).toBe("spokeo");
      expect(entry.page_text_hash).toBeTruthy();
    });

    it("chains subsequent entries to the previous", () => {
      const first = service.recordEvidence({
        entryType: "before_scan",
        brokerId: "spokeo",
        pageText: "listing found",
      });

      const second = service.recordEvidence({
        entryType: "after_removal",
        brokerId: "spokeo",
        pageText: "listing removed",
      });

      expect(second.prev_hash).toBe(first.content_hash);
      expect(second.content_hash).not.toBe(first.content_hash);
    });
  });

  describe("verifyChain", () => {
    it("returns valid for empty chain", () => {
      const result = service.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(0);
    });

    it("verifies a chain of 10 entries as valid", () => {
      for (let i = 0; i < 10; i++) {
        service.recordEvidence({
          entryType: "before_scan",
          brokerId: `broker-${i}`,
          pageText: `page text ${i}`,
        });
      }

      const result = service.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(10);
    });

    it("detects modified page_text at entry 5", () => {
      for (let i = 0; i < 10; i++) {
        service.recordEvidence({
          entryType: "before_scan",
          brokerId: `broker-${i}`,
          pageText: `page text ${i}`,
        });
      }

      // Tamper with entry 5's page_text_hash
      const entries = repo.getAll();
      const entry5 = entries[4]; // 0-indexed
      db.prepare("UPDATE evidence_chain SET page_text_hash = ? WHERE id = ?")
        .run("tampered_hash", entry5.id);

      const result = service.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(entry5.id);
      expect(result.error).toContain("Content hash mismatch");
    });

    it("detects deleted entry breaking the chain", () => {
      for (let i = 0; i < 5; i++) {
        service.recordEvidence({
          entryType: "before_scan",
          brokerId: `broker-${i}`,
          pageText: `page text ${i}`,
        });
      }

      // Delete entry 3 (0-indexed: entry at index 2)
      const entries = repo.getAll();
      db.prepare("DELETE FROM evidence_chain WHERE id = ?").run(entries[2].id);

      const result = service.verifyChain();
      expect(result.valid).toBe(false);
      // Entry 4 (entries[3]) should detect that its prev_hash doesn't match entries[1]
      expect(result.brokenAt).toBe(entries[3].id);
      expect(result.error).toContain("prev_hash does not match");
    });

    it("detects tampered genesis prev_hash", () => {
      service.recordEvidence({
        entryType: "before_scan",
        brokerId: "test",
        pageText: "test",
      });

      const entry = repo.getAll()[0];
      db.prepare("UPDATE evidence_chain SET prev_hash = ? WHERE id = ?")
        .run("bad_genesis", entry.id);

      const result = service.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(entry.id);
      expect(result.error).toContain("Genesis entry");
    });
  });

  describe("repairChain", () => {
    it("returns null for valid chain", () => {
      service.recordEvidence({
        entryType: "before_scan",
        brokerId: "test",
        pageText: "ok",
      });

      const result = service.repairChain();
      expect(result).toBeNull();
    });

    it("starts new segment after break", () => {
      for (let i = 0; i < 5; i++) {
        service.recordEvidence({
          entryType: "before_scan",
          brokerId: `broker-${i}`,
          pageText: `text ${i}`,
        });
      }

      // Break the chain by tampering with an entry's page_text_hash
      const entries = repo.getAll();
      const tamperedEntry = entries[2];
      db.prepare("UPDATE evidence_chain SET page_text_hash = ? WHERE id = ?")
        .run("tampered", tamperedEntry.id);

      const repairResult = service.repairChain();
      expect(repairResult).not.toBeNull();
      expect(repairResult!.repairedAt).toBe(tamperedEntry.id);

      // The repair adds a new entry that should chain properly from the latest
      const allEntries = repo.getAll();
      const lastEntry = allEntries[allEntries.length - 1];
      expect(lastEntry.entry_type).toBe("re_verification");
      const meta = JSON.parse(lastEntry.metadata!);
      expect(meta.repair).toBe(true);
    });
  });

  describe("getTextDiff", () => {
    it("returns null when no before/after entries exist", () => {
      const result = service.getTextDiff("unknown-broker");
      expect(result).toBeNull();
    });

    it("computes diff between before_scan and after_removal", () => {
      service.recordEvidence({
        entryType: "before_scan",
        brokerId: "spokeo",
        pageText: "John Doe\n123 Main St\nAge: 35\nPhone: 555-1234",
      });

      service.recordEvidence({
        entryType: "after_removal",
        brokerId: "spokeo",
        pageText: "No results found\nTry a different search",
      });

      const diff = service.getTextDiff("spokeo");
      expect(diff).not.toBeNull();
      expect(diff!.removedLines).toContain("John Doe");
      expect(diff!.removedLines).toContain("123 Main St");
      expect(diff!.removedLines).toContain("Age: 35");
      expect(diff!.addedLines).toContain("No results found");
    });
  });
});
