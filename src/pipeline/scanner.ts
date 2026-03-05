import type { AppConfig } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import { loadBrokerDatabase } from "../data/broker-loader.js";
import { BrokerStore } from "../data/broker-store.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { ScanRunRepo, ScanResultRepo } from "../db/repositories/scan.repo.js";
import { EvidenceChainRepo } from "../db/repositories/evidence-chain.repo.js";
import { EvidenceChainService } from "./evidence-chain.js";
import { randomDelay } from "../util/delay.js";
import { logger } from "../util/logger.js";

import type Database from "better-sqlite3";

export interface ScanOptions {
  dryRun?: boolean;
  autoRemove?: boolean;
  category?: string;
  brokerIds?: string[];
}

export interface ScanSummary {
  totalScanned: number;
  found: number;
  notFound: number;
  errors: number;
  autoRemoveTriggered: number;
  dryRun: boolean;
  foundBrokerIds: string[];
}

export class Scanner {
  private db: InstanceType<typeof Database> | null = null;
  private aborted = false;

  constructor(private readonly config: AppConfig) {}

  async scan(options: ScanOptions = {}): Promise<ScanSummary> {
    const dryRun = options.dryRun ?? false;

    this.db = createDatabase(this.config.database.path);
    runMigrations(this.db);

    const scanRunRepo = new ScanRunRepo(this.db);
    const scanResultRepo = new ScanResultRepo(this.db);
    const evidenceRepo = new EvidenceChainRepo(this.db);
    const evidenceService = new EvidenceChainService(evidenceRepo);

    // Load and filter brokers to people_search category
    const brokerDb = loadBrokerDatabase();
    const store = new BrokerStore(brokerDb.brokers);

    let brokers: readonly Broker[];
    if (options.brokerIds?.length) {
      brokers = options.brokerIds
        .map((id) => store.getById(id))
        .filter((b): b is Broker => b !== undefined);
    } else {
      brokers = store.filter({
        categories: [options.category ?? "people_search"],
        hasSearchUrl: true,
        regions: this.config.options.regions as any,
        tiers: this.config.options.tiers,
        excludeIds: this.config.options.excluded_brokers,
      });
    }

    // Group by parent company — scan one representative per group
    const parentGroups = new Map<string, Broker[]>();
    const ungrouped: Broker[] = [];
    for (const broker of brokers) {
      if (broker.parent_company && !broker.subsidiary_of) {
        const group = parentGroups.get(broker.parent_company);
        if (group) group.push(broker);
        else parentGroups.set(broker.parent_company, [broker]);
      } else if (!broker.subsidiary_of) {
        ungrouped.push(broker);
      }
      // Skip subsidiaries — parent representative covers the group
    }

    const toScan = [
      ...Array.from(parentGroups.values()).map((group) => group[0]),
      ...ungrouped,
    ];

    logger.info(
      { total: toScan.length, parentGroups: parentGroups.size, ungrouped: ungrouped.length, dryRun },
      "Starting scan"
    );

    if (dryRun) {
      return {
        totalScanned: toScan.length,
        found: 0,
        notFound: 0,
        errors: 0,
        autoRemoveTriggered: 0,
        dryRun: true,
        foundBrokerIds: [],
      };
    }

    const scanRun = scanRunRepo.create(toScan.length);
    const summary: ScanSummary = {
      totalScanned: toScan.length,
      found: 0,
      notFound: 0,
      errors: 0,
      autoRemoveTriggered: 0,
      dryRun: false,
      foundBrokerIds: [],
    };

    // Try to initialize browser
    let browser: import("../browser/session.js").StagehandInstance | null = null;
    if (this.config.browser.api_key) {
      try {
        const { initBrowser } = await import("../browser/session.js");
        browser = await initBrowser(this.config.browser);
        logger.info("Browser initialized for scanning");
      } catch (err) {
        logger.error({ err }, "Browser initialization failed — cannot scan");
        scanRunRepo.finish(scanRun.id, "failed", { found: 0, notFound: 0, errors: toScan.length });
        return { ...summary, errors: toScan.length };
      }
    } else {
      logger.error("No browser API key configured — scanning requires browser automation");
      scanRunRepo.finish(scanRun.id, "failed", { found: 0, notFound: 0, errors: toScan.length });
      return { ...summary, errors: toScan.length };
    }

    for (const broker of toScan) {
      if (this.aborted) {
        logger.info("Scan aborted by user");
        break;
      }

      try {
        const { verifyProfileListing } = await import("../browser/removal-engine.js");
        const result = await verifyProfileListing(browser, broker, this.config.profile, {
          timeoutMs: this.config.browser.timeout_ms,
          screenshotDir: undefined,
        });

        const scanResult = scanResultRepo.create({
          scanRunId: scanRun.id,
          brokerId: broker.id,
          found: result.found,
          pageText: result.pageText,
          screenshotPath: result.screenshotPath,
        });

        if (result.found) {
          summary.found++;
          summary.foundBrokerIds.push(broker.id);
          scanRunRepo.incrementFound(scanRun.id);

          // Record evidence
          evidenceService.recordEvidence({
            scanResultId: scanResult.id,
            entryType: "before_scan",
            brokerId: broker.id,
            brokerUrl: broker.search_url ?? `https://${broker.domain}`,
            screenshotPath: result.screenshotPath,
            pageText: result.pageText,
          });

          logger.info({ brokerId: broker.id }, "Profile FOUND on broker");
        } else {
          summary.notFound++;
          scanRunRepo.incrementNotFound(scanRun.id);
          logger.info({ brokerId: broker.id }, "Profile not found on broker");
        }

        await randomDelay(
          this.config.options.delay_min_ms,
          this.config.options.delay_max_ms
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ brokerId: broker.id, err: message }, "Scan error for broker");
        summary.errors++;
        scanRunRepo.incrementError(scanRun.id);

        scanResultRepo.create({
          scanRunId: scanRun.id,
          brokerId: broker.id,
          found: false,
          error: message,
        });
      }
    }

    // Auto-remove if enabled and listings found
    if (options.autoRemove && summary.foundBrokerIds.length > 0) {
      try {
        const { Orchestrator } = await import("./orchestrator.js");
        const orchestrator = new Orchestrator(this.config);
        logger.info(
          { brokerIds: summary.foundBrokerIds },
          "Auto-removing found listings"
        );
        await orchestrator.run({
          brokerIds: summary.foundBrokerIds,
          dryRun: false,
        });
        summary.autoRemoveTriggered = summary.foundBrokerIds.length;
      } catch (err) {
        logger.error({ err }, "Auto-remove failed");
      }
    }

    scanRunRepo.finish(
      scanRun.id,
      this.aborted ? "interrupted" : "completed",
      { found: summary.found, notFound: summary.notFound, errors: summary.errors }
    );

    // Close browser
    if (browser) {
      try {
        const { closeBrowser } = await import("../browser/session.js");
        await closeBrowser();
      } catch (err) {
        logger.warn({ err }, "Error closing browser");
      }
    }

    logger.info(summary, "Scan completed");
    return summary;
  }

  abort(): void {
    this.aborted = true;
  }

  cleanup(): void {
    if (this.db) {
      closeDatabase(this.db);
      this.db = null;
    }
  }
}
