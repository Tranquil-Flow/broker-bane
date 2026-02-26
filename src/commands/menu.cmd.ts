import { printHeader } from "../ui/header.js";
import { initCommand } from "./init.cmd.js";
import { removeCommand } from "./remove.cmd.js";
import { statusCommand } from "./status.cmd.js";
import { confirmCommand } from "./confirm.cmd.js";
import { testConfigCommand } from "./test-config.cmd.js";
import { existsSync } from "node:fs";
import { resolveConfigPath } from "../config/loader.js";

export async function menuCommand(): Promise<void> {
  printHeader();

  const inquirer = await import("inquirer");
  const prompt = inquirer.default.prompt ?? inquirer.default;

  const configExists = existsSync(resolveConfigPath());

  if (!configExists) {
    console.log("  No config found. Let's get you set up first.\n");
    await initCommand();
    return;
  }

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { name: "🚀  Run opt-out requests          (send to all brokers)", value: "remove" },
        { name: "👁   Dry run                       (preview, no emails sent)", value: "dry-run" },
        { name: "📊  Check status                  (see progress)", value: "status" },
        { name: "⚠️   Manual tasks                  (brokers needing form submission)", value: "confirm" },
        { name: "🔧  Test configuration             (verify SMTP/IMAP)", value: "test-config" },
        { name: "⚙️   Settings                      (reconfigure)", value: "init" },
        new inquirer.default.Separator(),
        { name: "✕   Quit", value: "quit" },
      ],
    },
  ]);

  switch (action) {
    case "remove":
      await removeCommand({});
      break;
    case "dry-run":
      await removeCommand({ dryRun: true });
      break;
    case "status":
      await statusCommand({});
      break;
    case "confirm":
      await confirmCommand({});
      break;
    case "test-config":
      await testConfigCommand({});
      break;
    case "init":
      await initCommand();
      break;
    case "quit":
      process.exit(0);
  }
}
