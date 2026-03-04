import { join } from "node:path";
import { homedir } from "node:os";
import { installSchedule, uninstallSchedule, getScheduleStatus } from "../system/cron-scheduler.js";

const DEFAULT_CONFIG = join(homedir(), ".brokerbane", "config.yaml");

export async function scheduleCommand(
  subcommand: string,
  options: { config?: string; interval?: string }
): Promise<void> {
  switch (subcommand) {
    case "install": {
      const configPath = options.config ?? DEFAULT_CONFIG;
      const interval = options.interval ? parseInt(options.interval, 10) : 90;
      const binaryPath = process.argv[1] ?? "brokerbane";

      try {
        installSchedule(binaryPath, configPath, interval);
        const monthInterval = Math.max(1, Math.min(12, Math.round(interval / 30)));
        console.log(`Schedule installed successfully.`);
        console.log(`  Binary:   ${binaryPath}`);
        console.log(`  Config:   ${configPath}`);
        console.log(`  Interval: every ${interval} days (~${monthInterval} month${monthInterval === 1 ? "" : "s"})`);
        console.log(`\nBrokerBane will run 'remove' automatically on the 1st of every ${monthInterval === 1 ? "" : monthInterval + " "}month${monthInterval === 1 ? "" : "s"} at 9:00 AM.`);
        console.log(`Run 'brokerbane schedule status' to verify.`);
      } catch (err) {
        console.error(`Failed to install schedule: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
      break;
    }

    case "uninstall": {
      try {
        uninstallSchedule();
        console.log("Schedule removed successfully.");
      } catch (err) {
        console.error(`Failed to uninstall schedule: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
      break;
    }

    case "status": {
      try {
        const status = getScheduleStatus();
        console.log(`Schedule status:`);
        console.log(`  Installed: ${status.installed ? "yes" : "no"}`);
        console.log(`  Platform:  ${status.platform}`);
        if (status.installed) {
          console.log(`  Next run:  ${status.nextRunDescription}`);
          if (status.configPath) {
            console.log(`  Config:    ${status.configPath}`);
          }
        }
      } catch (err) {
        console.error(`Failed to get schedule status: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown schedule subcommand: ${subcommand}`);
      console.error(`Usage: brokerbane schedule <install|uninstall|status>`);
      process.exit(1);
  }
}
