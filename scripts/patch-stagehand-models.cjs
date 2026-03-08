#!/usr/bin/env node
/**
 * Patches Stagehand's model registry to include newer Claude model names.
 * Run automatically via npm postinstall.
 */
const fs = require("fs");
const path = require("path");

const stagehandDist = path.join(__dirname, "..", "node_modules", "@browserbasehq", "stagehand", "dist", "index.js");

if (!fs.existsSync(stagehandDist)) {
  console.log("  [patch-stagehand] Stagehand not installed, skipping");
  process.exit(0);
}

let content = fs.readFileSync(stagehandDist, "utf8");

const modelsToAdd = {
  "claude-haiku-4-5-20251001": "anthropic",
  "claude-sonnet-4-5-20250514": "anthropic",
  "claude-sonnet-4-6-20250620": "anthropic",
  "claude-opus-4-6-20250620": "anthropic",
};

let patched = false;
for (const [model, provider] of Object.entries(modelsToAdd)) {
  if (!content.includes(`"${model}"`)) {
    content = content.replace(
      '"claude-3-7-sonnet-latest": "anthropic",',
      `"claude-3-7-sonnet-latest": "anthropic",\n  "${model}": "${provider}",`
    );
    patched = true;
  }
}

if (patched) {
  fs.writeFileSync(stagehandDist, content);
  console.log("  [patch-stagehand] Added new Claude model names to Stagehand registry");
} else {
  console.log("  [patch-stagehand] Models already present, no patch needed");
}
