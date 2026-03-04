import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, mkdirSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

export type Platform = "macos" | "linux" | "windows";

export function detectPlatform(): Platform {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "linux";
}

// ─── macOS launchd ────────────────────────────────────────────────────────

const PLIST_LABEL = "com.brokerbane.quarterly";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);
const LOG_PATH = join(homedir(), ".brokerbane", "run.log");

/**
 * Convert an interval in days to a month-based schedule.
 * Rounds to the nearest reasonable month count (1–12), minimum 1.
 */
export function daysToMonthInterval(days: number): number {
  return Math.max(1, Math.min(12, Math.round(days / 30)));
}

/**
 * Generate launchd StartCalendarInterval entries for a given month interval.
 * E.g., monthInterval=3 → months 1,4,7,10; monthInterval=6 → months 1,7.
 */
function buildCalendarEntries(monthInterval: number): string {
  const months: number[] = [];
  for (let m = 1; m <= 12; m += monthInterval) {
    months.push(m);
  }
  return months
    .map(m => `    <dict><key>Month</key><integer>${m}</integer><key>Day</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>`)
    .join("\n");
}

export function buildLaunchdPlist(binaryPath: string, configPath: string, intervalDays = 90): string {
  const monthInterval = daysToMonthInterval(intervalDays);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binaryPath}</string>
    <string>remove</string>
    <string>--config</string>
    <string>${configPath}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${buildCalendarEntries(monthInterval)}
  </array>
  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>`;
}

// ─── Linux crontab ────────────────────────────────────────────────────────

const CRON_MARKER = "# BrokerBane quarterly";

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function buildCrontabLine(binaryPath: string, configPath: string, intervalDays = 90): string {
  const monthInterval = daysToMonthInterval(intervalDays);
  return `0 9 1 */${monthInterval} * ${shellQuote(binaryPath)} remove --config ${shellQuote(configPath)} >> ${shellQuote(LOG_PATH)} 2>&1 ${CRON_MARKER}`;
}

export function isScheduleInstalled(crontab: string): boolean {
  return crontab.includes(CRON_MARKER);
}

export function removeCrontabLine(crontab: string): string {
  return crontab
    .split("\n")
    .filter((line) => !line.includes(CRON_MARKER))
    .join("\n")
    .trim();
}

// ─── Shared helper ────────────────────────────────────────────────────────

/** Run a command with args as an array (no shell injection risk). Throws on non-zero exit. */
function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { encoding: "utf-8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `Command failed: ${cmd}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface ScheduleStatus {
  installed: boolean;
  platform: Platform;
  nextRunDescription: string;
  configPath: string | null;
}

export function installSchedule(binaryPath: string, configPath: string, intervalDays = 90): void {
  const platform = detectPlatform();
  const monthInterval = daysToMonthInterval(intervalDays);
  mkdirSync(join(homedir(), ".brokerbane"), { recursive: true });

  if (platform === "macos") {
    mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(PLIST_PATH, buildLaunchdPlist(binaryPath, configPath, intervalDays), "utf-8");
    run("launchctl", ["load", PLIST_PATH]);
    return;
  }

  if (platform === "linux") {
    const result = spawnSync("crontab", ["-l"], { encoding: "utf-8", stdio: "pipe" });
    const existing = result.status === 0 ? result.stdout : "";
    if (isScheduleInstalled(existing)) {
      throw new Error("BrokerBane schedule already installed. Run 'brokerbane schedule uninstall' first.");
    }
    const updated =
      (existing.trim() ? existing.trim() + "\n" : "") +
      buildCrontabLine(binaryPath, configPath, intervalDays) + "\n";
    // Write to temp file then pass to crontab (avoids shell pipe)
    const tmpDir = mkdtempSync(join(tmpdir(), "brokerbane-"));
    const tmpFile = join(tmpDir, "crontab.tmp");
    writeFileSync(tmpFile, updated, "utf-8");
    run("crontab", [tmpFile]);
    unlinkSync(tmpFile);
    rmdirSync(tmpDir);
    return;
  }

  if (platform === "windows") {
    run("schtasks", [
      "/create", "/tn", "BrokerBaneQuarterly",
      "/tr", `"${binaryPath.replace(/"/g, '""')}" remove --config "${configPath.replace(/"/g, '""')}"`,
      "/sc", "MONTHLY", "/mo", String(monthInterval), "/d", "1", "/st", "09:00", "/f",
    ]);
  }
}

export function uninstallSchedule(): void {
  const platform = detectPlatform();

  if (platform === "macos") {
    if (existsSync(PLIST_PATH)) {
      spawnSync("launchctl", ["unload", PLIST_PATH], { stdio: "pipe" }); // ignore errors
      unlinkSync(PLIST_PATH);
    }
    return;
  }

  if (platform === "linux") {
    const result = spawnSync("crontab", ["-l"], { encoding: "utf-8", stdio: "pipe" });
    if (result.status !== 0) return; // no crontab
    const updated = removeCrontabLine(result.stdout);
    if (updated) {
      const tmpDir = mkdtempSync(join(tmpdir(), "brokerbane-"));
      const tmpFile = join(tmpDir, "crontab.tmp");
      writeFileSync(tmpFile, updated + "\n", "utf-8");
      run("crontab", [tmpFile]);
      unlinkSync(tmpFile);
      rmdirSync(tmpDir);
    } else {
      spawnSync("crontab", ["-r"], { stdio: "pipe" });
    }
    return;
  }

  if (platform === "windows") {
    spawnSync("schtasks", ["/delete", "/tn", "BrokerBaneQuarterly", "/f"], { stdio: "pipe" });
  }
}

export function getScheduleStatus(): ScheduleStatus {
  const platform = detectPlatform();
  if (platform === "macos") {
    const installed = existsSync(PLIST_PATH);
    let configPath: string | null = null;
    if (installed) {
      try {
        const content = readFileSync(PLIST_PATH, "utf-8");
        const match = content.match(/<string>([^<]*\.json)<\/string>/);
        configPath = match?.[1] ?? null;
      } catch { /* ignore */ }
    }
    let monthInterval = 3;
    if (installed) {
      try {
        const content = readFileSync(PLIST_PATH, "utf-8");
        const monthMatches = content.match(/<key>Month<\/key>/g) ?? [];
        if (monthMatches.length > 0) monthInterval = Math.round(12 / monthMatches.length);
      } catch { /* ignore */ }
    }
    return { installed, platform, nextRunDescription: `1st of every ${monthInterval === 1 ? "" : monthInterval + " "}month${monthInterval === 1 ? "" : "s"} at 9:00 AM`, configPath };
  }

  if (platform === "linux") {
    const result = spawnSync("crontab", ["-l"], { encoding: "utf-8", stdio: "pipe" });
    const crontab = result.status === 0 ? result.stdout : "";
    const installed = isScheduleInstalled(crontab);
    let configPath: string | null = null;
    let monthInterval = 3;
    if (installed) {
      const line = crontab.split("\n").find((l) => l.includes(CRON_MARKER));
      const match = line?.match(/--config\s+(\S+)/);
      configPath = match?.[1] ?? null;
      const cronMatch = line?.match(/\*\/(\d+)/);
      if (cronMatch) monthInterval = parseInt(cronMatch[1], 10);
    }
    return { installed, platform, nextRunDescription: `1st of every ${monthInterval === 1 ? "" : monthInterval + " "}month${monthInterval === 1 ? "" : "s"} at 9:00 AM`, configPath };
  }

  // Windows
  const result = spawnSync("schtasks", ["/query", "/tn", "BrokerBaneQuarterly"], { stdio: "pipe" });
  return {
    installed: result.status === 0,
    platform,
    nextRunDescription: "1st of every 3rd month at 9:00 AM",
    configPath: null,
  };
}
