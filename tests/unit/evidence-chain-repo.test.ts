import Database from "better-sqlite3";
import { createInMemoryDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { EvidenceChainRepo } from "../../src/db/repositories/evidence-chain.repo.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { ScanRunRepo, ScanResultRepo } from "../../src/db/repositories/scan.repo.js";

const GENESIS_HASH = "0".repeat(64);

describe("EvidenceChainRepo", () => {
  let db: InstanceType<typeof Database>;
  let repo: EvidenceChainRepo;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    repo = new EvidenceChainRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates and retrieves an entry", () => {
    const entry = repo.create({
      entryType: "before_scan",
      contentHash: "abc123",
      prevHash: GENESIS_HASH,
      brokerId: "spokeo",
      pageText: "John Doe found",
      pageTextHash: "text_hash_123",
      brokerUrl: "https://spokeo.com",
    });

    expect(entry.id).toBeDefined();
    expect(entry.entry_type).toBe("before_scan");
    expect(entry.content_hash).toBe("abc123");
    expect(entry.prev_hash).toBe(GENESIS_HASH);
    expect(entry.broker_id).toBe("spokeo");
  });

  it("returns genesis hash when chain is empty", () => {
    expect(repo.getLatestHash()).toBe(GENESIS_HASH);
  });

  it("returns latest hash from chain", () => {
    repo.create({
      entryType: "before_scan",
      contentHash: "hash_1",
      prevHash: GENESIS_HASH,
      brokerId: "test",
    });
    repo.create({
      entryType: "after_removal",
      contentHash: "hash_2",
      prevHash: "hash_1",
      brokerId: "test",
    });

    expect(repo.getLatestHash()).toBe("hash_2");
  });

  it("gets all entries in order", () => {
    repo.create({ entryType: "before_scan", contentHash: "h1", prevHash: GENESIS_HASH, brokerId: "a" });
    repo.create({ entryType: "after_removal", contentHash: "h2", prevHash: "h1", brokerId: "b" });
    repo.create({ entryType: "re_verification", contentHash: "h3", prevHash: "h2", brokerId: "a" });

    const all = repo.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].content_hash).toBe("h1");
    expect(all[2].content_hash).toBe("h3");
  });

  it("gets entries by broker id", () => {
    repo.create({ entryType: "before_scan", contentHash: "h1", prevHash: GENESIS_HASH, brokerId: "spokeo" });
    repo.create({ entryType: "before_scan", contentHash: "h2", prevHash: "h1", brokerId: "radaris" });
    repo.create({ entryType: "after_removal", contentHash: "h3", prevHash: "h2", brokerId: "spokeo" });

    const spokeoEntries = repo.getByBrokerId("spokeo");
    expect(spokeoEntries).toHaveLength(2);
    expect(spokeoEntries[0].content_hash).toBe("h1");
    expect(spokeoEntries[1].content_hash).toBe("h3");
  });

  it("gets chain segment", () => {
    const e1 = repo.create({ entryType: "before_scan", contentHash: "h1", prevHash: GENESIS_HASH, brokerId: "a" });
    const e2 = repo.create({ entryType: "after_removal", contentHash: "h2", prevHash: "h1", brokerId: "a" });
    const e3 = repo.create({ entryType: "re_verification", contentHash: "h3", prevHash: "h2", brokerId: "a" });

    const segment = repo.getChainSegment(e1.id, e2.id);
    expect(segment).toHaveLength(2);
    expect(segment[0].id).toBe(e1.id);
    expect(segment[1].id).toBe(e2.id);
  });

  it("counts entries", () => {
    expect(repo.count()).toBe(0);
    repo.create({ entryType: "before_scan", contentHash: "h1", prevHash: GENESIS_HASH, brokerId: "a" });
    repo.create({ entryType: "after_removal", contentHash: "h2", prevHash: "h1", brokerId: "b" });
    expect(repo.count()).toBe(2);
  });

  it("supports optional request_id and scan_result_id", () => {
    // Create parent records to satisfy foreign key constraints
    const requestRepo = new RemovalRequestRepo(db);
    const request = requestRepo.create({ brokerId: "test", method: "email" });

    const scanRunRepo = new ScanRunRepo(db);
    const scanRun = scanRunRepo.create(1);
    const scanResultRepo = new ScanResultRepo(db);
    const scanResult = scanResultRepo.create({
      scanRunId: scanRun.id,
      brokerId: "test",
      found: true,
    });

    const entry = repo.create({
      requestId: request.id,
      scanResultId: scanResult.id,
      entryType: "after_removal",
      contentHash: "h1",
      prevHash: GENESIS_HASH,
      brokerId: "test",
    });

    expect(entry.request_id).toBe(request.id);
    expect(entry.scan_result_id).toBe(scanResult.id);

    const byRequest = repo.getByRequestId(request.id);
    expect(byRequest).toHaveLength(1);

    const byScan = repo.getByScanResultId(scanResult.id);
    expect(byScan).toHaveLength(1);
  });
});
