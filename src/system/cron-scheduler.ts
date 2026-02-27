import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
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

export function buildLaunchdPlist(binaryPath: string, configPath: string): string {
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
    <dict><key>Month</key><integer>1</integer><key>Day</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Month</key><integer>4</integer><key>Day</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Month</key><integer>7</integer><key>Day</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Month</key><integer>10</integer><key>Day</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
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

export function buildCrontabLine(binaryPath: string, configPath: string): string {
  return `0 9 1 */3 * ${binaryPath} remove --config ${configPath} >> ${LOG_PATH} 2>&1 ${CRON_MARKER}`;
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

export function installSchedule(binaryPath: string, configPath: string): void {
  const platform = detectPlatform();
  mkdirSync(join(homedir(), ".brokerbane"), { recursive: true });

  if (platform === "macos") {
    mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(PLIST_PATH, buildLaunchdPlist(binaryPath, configPath), "utf-8");
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
      buildCrontabLine(binaryPath, configPath) + "\n";
    // Write to temp file then pass to crontab (avoids shell pipe)
    const tmpFile = join(tmpdir(), "brokerbane-crontab.tmp");
    writeFileSync(tmpFile, updated, "utf-8");
    run("crontab", [tmpFile]);
    return;
  }

  if (platform === "windows") {
    run("schtasks", [
      "/create", "/tn", "BrokerBaneQuarterly",
      "/tr", `"${binaryPath}" remove --config "${configPath}"`,
      "/sc", "MONTHLY", "/mo", "3", "/d", "1", "/st", "09:00", "/f",
    ]);
  }
}

export function uninstallSchedule(): void {
  const platform = detectPlatform();

  if (platform === "macos") {
    if (existsSync(PLIST_PATH)) {
      spawnSync("launchctl", ["unload", PLIST_PATH], { stdio: "pipe" }); // ignore errors
      run("rm", [PLIST_PATH]);
    }
    return;
  }

  if (platform === "linux") {
    const result = spawnSync("crontab", ["-l"], { encoding: "utf-8", stdio: "pipe" });
    if (result.status !== 0) return; // no crontab
    const updated = removeCrontabLine(result.stdout);
    if (updated) {
      const tmpFile = join(tmpdir(), "brokerbane-crontab.tmp");
      writeFileSync(tmpFile, updated + "\n", "utf-8");
      run("crontab", [tmpFile]);
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
  const quarterly = "1 Jan, 1 Apr, 1 Jul, 1 Oct at 9:00 AM";

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
    return { installed, platform, nextRunDescription: quarterly, configPath };
  }

  if (platform === "linux") {
    const result = spawnSync("crontab", ["-l"], { encoding: "utf-8", stdio: "pipe" });
    const crontab = result.status === 0 ? result.stdout : "";
    const installed = isScheduleInstalled(crontab);
    let configPath: string | null = null;
    if (installed) {
      const line = crontab.split("\n").find((l) => l.includes(CRON_MARKER));
      const match = line?.match(/--config\s+(\S+)/);
      configPath = match?.[1] ?? null;
    }
    return { installed, platform, nextRunDescription: "1st of every 3rd month at 9:00 AM", configPath };
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
