import chalk from "chalk";

export function printHeader(): void {
  const purple = chalk.hex("#9B59B6");
  const softWhite = chalk.hex("#E8E8F0");
  const dim = chalk.hex("#6C6C8A");

  console.log();
  console.log(dim("  ✦  ·  ˚  ✧  ˚  ·  ✦  ·  ˚  ✧  ˚  ·  ✦  ·  ˚  ✧"));
  console.log();
  console.log(purple("       ◈ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ◈"));
  console.log();
  console.log(softWhite("            B R O K E R B A N E"));
  console.log();
  console.log(purple("               ☽  🌿  ·  ✦  ·  🌿  ☾"));
  console.log(dim("          your data, returned to you"));
  console.log();
  console.log(purple("       ◈ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ◈"));
  console.log();
  console.log(dim("  ✦  ·  ˚  ✧  ˚  ·  ✦  ·  ˚  ✧  ˚  ·  ✦  ·  ˚  ✧"));
  console.log();
}
