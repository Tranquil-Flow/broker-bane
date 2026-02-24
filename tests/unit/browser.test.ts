import { getScreenshotPath } from "../../src/browser/screenshot.js";
import { CAPTCHA_TYPE } from "../../src/captcha/detector.js";
import { getDailySolveCount, resetDailySolveCount } from "../../src/captcha/solver.js";

describe("Screenshot", () => {
  describe("getScreenshotPath", () => {
    it("generates path with broker id and suffix", () => {
      const path = getScreenshotPath("spokeo", "success", "/tmp/screenshots");
      expect(path).toContain("spokeo");
      expect(path).toContain("success");
      expect(path).toContain("/tmp/screenshots/");
      expect(path).toMatch(/\.png$/);
    });

    it("generates unique timestamps", () => {
      const path1 = getScreenshotPath("test", "a", "/tmp");
      const path2 = getScreenshotPath("test", "b", "/tmp");
      expect(path1).not.toBe(path2);
    });

    it("uses default dir when not specified", () => {
      const path = getScreenshotPath("test", "check");
      expect(path).toContain(".brokerbane");
      expect(path).toContain("screenshots");
    });
  });
});

describe("CAPTCHA Types", () => {
  it("has all expected types", () => {
    expect(CAPTCHA_TYPE.recaptcha_v2).toBe("recaptcha_v2");
    expect(CAPTCHA_TYPE.recaptcha_v3).toBe("recaptcha_v3");
    expect(CAPTCHA_TYPE.hcaptcha).toBe("hcaptcha");
    expect(CAPTCHA_TYPE.turnstile).toBe("turnstile");
    expect(CAPTCHA_TYPE.none).toBe("none");
    expect(CAPTCHA_TYPE.unknown).toBe("unknown");
  });
});

describe("CAPTCHA Solver Daily Count", () => {
  beforeEach(() => {
    resetDailySolveCount();
  });

  it("starts at zero", () => {
    expect(getDailySolveCount()).toBe(0);
  });

  it("resets count", () => {
    // Count is 0 after reset
    resetDailySolveCount();
    expect(getDailySolveCount()).toBe(0);
  });
});
