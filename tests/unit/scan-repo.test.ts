import Database from "better-sqlite3";
import { createInMemoryDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { ScanRunRepo, ScanResultRepo } from "../../src/db/repositories/scan.repo.js";

describe("ScanRunRepo", () => {
  let db: InstanceType<typeof Database>;
  let repo: ScanRunRepo;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    repo = new ScanRunRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates a scan run", () => {
    const run = repo.create(50);
    expect(run.total_brokers).toBe(50);
    expect(run.status).toBe("running");
    expect(run.found_count).toBe(0);
    expect(run.not_found_count).toBe(0);
    expect(run.error_count).toBe(0);
  });

  it("finishes a run with counts", () => {
    const run = repo.create(50);
    repo.finish(run.id, "completed", { found: 10, notFound: 35, errors: 5 });
    const updated = repo.getById(run.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.found_count).toBe(10);
    expect(updated?.not_found_count).toBe(35);
    expect(updated?.error_count).toBe(5);
    expect(updated?.finished_at).toBeTruthy();
  });

  it("increments counts individually", () => {
    const run = repo.create(10);
    repo.incrementFound(run.id);
    repo.incrementFound(run.id);
    repo.incrementNotFound(run.id);
    repo.incrementError(run.id);
    const updated = repo.getById(run.id);
    expect(updated?.found_count).toBe(2);
    expect(updated?.not_found_count).toBe(1);
    expect(updated?.error_count).toBe(1);
  });

  it("gets latest run", () => {
    repo.create(10);
    const second = repo.create(20);
    const latest = repo.getLatest();
    expect(latest?.id).toBe(second.id);
  });

  it("gets history with limit", () => {
    repo.create(10);
    repo.create(20);
    repo.create(30);
    const history = repo.getHistory(2);
    expect(history).toHaveLength(2);
  });
});

describe("ScanResultRepo", () => {
  let db: InstanceType<typeof Database>;
  let runRepo: ScanRunRepo;
  let repo: ScanResultRepo;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    runRepo = new ScanRunRepo(db);
    repo = new ScanResultRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates a scan result", () => {
    const run = runRepo.create(5);
    const result = repo.create({
      scanRunId: run.id,
      brokerId: "spokeo",
      found: true,
      confidence: 0.95,
      pageText: "John Doe found",
    });
    expect(result.found).toBe(1);
    expect(result.confidence).toBe(0.95);
    expect(result.broker_id).toBe("spokeo");
  });

  it("gets results by run id", () => {
    const run = runRepo.create(3);
    repo.create({ scanRunId: run.id, brokerId: "a", found: true });
    repo.create({ scanRunId: run.id, brokerId: "b", found: false });
    repo.create({ scanRunId: run.id, brokerId: "c", found: true });

    const results = repo.getByRunId(run.id);
    expect(results).toHaveLength(3);
  });

  it("gets only found results", () => {
    const run = runRepo.create(3);
    repo.create({ scanRunId: run.id, brokerId: "a", found: true });
    repo.create({ scanRunId: run.id, brokerId: "b", found: false });
    repo.create({ scanRunId: run.id, brokerId: "c", found: true });

    const found = repo.getFoundByRunId(run.id);
    expect(found).toHaveLength(2);
    expect(found[0].broker_id).toBe("a");
  });

  it("gets latest result for broker", () => {
    const run1 = runRepo.create(1);
    repo.create({ scanRunId: run1.id, brokerId: "spokeo", found: true });
    const run2 = runRepo.create(1);
    const latest = repo.create({ scanRunId: run2.id, brokerId: "spokeo", found: false });

    const result = repo.getLatestForBroker("spokeo");
    expect(result?.id).toBe(latest.id);
    expect(result?.found).toBe(0);
  });

  it("stores error information", () => {
    const run = runRepo.create(1);
    const result = repo.create({
      scanRunId: run.id,
      brokerId: "broken",
      found: false,
      error: "Connection timeout",
    });
    expect(result.error).toBe("Connection timeout");
    expect(result.found).toBe(0);
  });
});
