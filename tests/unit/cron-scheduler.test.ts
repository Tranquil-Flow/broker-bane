import { describe, it, expect } from "vitest";
import {
  buildLaunchdPlist,
  buildCrontabLine,
  isScheduleInstalled,
  removeCrontabLine,
  daysToMonthInterval,
} from "../../src/system/cron-scheduler.js";

describe("buildLaunchdPlist", () => {
  it("contains the label, binary path, and config path", () => {
    const plist = buildLaunchdPlist("/usr/local/bin/brokerbane", "/home/user/.brokerbane/config.json");
    expect(plist).toContain("com.brokerbane.quarterly");
    expect(plist).toContain("/usr/local/bin/brokerbane");
    expect(plist).toContain("remove");
    expect(plist).toContain("/home/user/.brokerbane/config.json");
    expect(plist).toContain("StartCalendarInterval");
  });

  it("schedules 4 calendar entries (quarterly) by default", () => {
    const plist = buildLaunchdPlist("/bb", "/cfg.json");
    const monthMatches = plist.match(/<key>Month<\/key>/g) ?? [];
    expect(monthMatches).toHaveLength(4);
  });

  it("respects custom interval (monthly)", () => {
    const plist = buildLaunchdPlist("/bb", "/cfg.json", 30);
    const monthMatches = plist.match(/<key>Month<\/key>/g) ?? [];
    expect(monthMatches).toHaveLength(12);
  });

  it("respects custom interval (semi-annual)", () => {
    const plist = buildLaunchdPlist("/bb", "/cfg.json", 180);
    const monthMatches = plist.match(/<key>Month<\/key>/g) ?? [];
    expect(monthMatches).toHaveLength(2);
  });
});

describe("buildCrontabLine", () => {
  it("contains the binary, config, and marker comment", () => {
    const line = buildCrontabLine("/usr/local/bin/brokerbane", "/home/user/.brokerbane/config.json");
    expect(line).toContain("# BrokerBane quarterly");
    expect(line).toContain("/usr/local/bin/brokerbane");
    expect(line).toContain("remove");
    expect(line).toContain("/home/user/.brokerbane/config.json");
  });

  it("uses quarterly cron schedule (every 3 months, day 1) by default", () => {
    const line = buildCrontabLine("/bb", "/cfg.json");
    expect(line).toMatch(/^\d+ \d+ 1 \*\/3 \*/);
  });

  it("respects custom interval", () => {
    const line = buildCrontabLine("/bb", "/cfg.json", 60);
    expect(line).toMatch(/^\d+ \d+ 1 \*\/2 \*/);
  });
});

describe("daysToMonthInterval", () => {
  it("converts days to months correctly", () => {
    expect(daysToMonthInterval(30)).toBe(1);
    expect(daysToMonthInterval(60)).toBe(2);
    expect(daysToMonthInterval(90)).toBe(3);
    expect(daysToMonthInterval(180)).toBe(6);
    expect(daysToMonthInterval(365)).toBe(12);
  });

  it("clamps to 1-12 range", () => {
    expect(daysToMonthInterval(1)).toBe(1);
    expect(daysToMonthInterval(500)).toBe(12);
  });
});

describe("isScheduleInstalled", () => {
  it("detects BrokerBane marker in crontab", () => {
    const crontab = "0 5 1 * * /other/job\n0 9 1 */3 * /usr/bin/bb remove # BrokerBane quarterly";
    expect(isScheduleInstalled(crontab)).toBe(true);
  });

  it("returns false for empty or unrelated crontab", () => {
    expect(isScheduleInstalled("")).toBe(false);
    expect(isScheduleInstalled("0 5 1 * * /other/job")).toBe(false);
  });
});

describe("removeCrontabLine", () => {
  it("removes the BrokerBane line while preserving others", () => {
    const crontab = "0 5 1 * * /other/job\n0 9 1 */3 * /bb remove # BrokerBane quarterly\n0 0 * * * /another";
    const result = removeCrontabLine(crontab);
    expect(result).toContain("/other/job");
    expect(result).toContain("/another");
    expect(result).not.toContain("BrokerBane quarterly");
  });
});
