import { removeCommand } from "./remove.cmd.js";

export async function resumeCommand(options: {
  config?: string;
}): Promise<void> {
  console.log("Resuming interrupted pipeline...\n");
  await removeCommand({ resume: true, config: options.config });
}
