import { loadConfig } from "../config/loader.js";
import { reconfigureLogger } from "../util/logger.js";
import { startDashboard } from "../dashboard/server.js";

export async function dashboardCommand(options: {
  port?: number;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  reconfigureLogger({
    level: config.logging.level,
    file: config.logging.file,
    redactPii: config.logging.redact_pii,
  });
  const port = options.port ?? 3847;
  await startDashboard(config, port);
}
