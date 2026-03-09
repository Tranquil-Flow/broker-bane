import { describe, it, expect, vi } from "vitest";
import { detectBlock, waitForChallenge } from "../../src/browser/block-detector.js";

describe("detectBlock", () => {
  it("returns not blocked for a normal page", async () => {
    const page = {
      title: vi.fn().mockResolvedValue("My Opt Out Page"),
      url: vi.fn().mockReturnValue("https://example.com/optout"),
      content: vi.fn().mockResolvedValue("<html><body>Form here</body></html>"),
    };

    const result = await detectBlock(page);
    expect(result.blocked).toBe(false);
  });

  it("detects Cloudflare challenge by title", async () => {
    const page = {
      title: vi.fn().mockResolvedValue("Just a moment..."),
      url: vi.fn().mockReturnValue("https://example.com/optout"),
      content: vi.fn().mockResolvedValue("<html><body></body></html>"),
    };

    const result = await detectBlock(page);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
  });

  it("detects Cloudflare challenge by URL", async () => {
    const page = {
      title: vi.fn().mockResolvedValue("Checking your browser"),
      url: vi.fn().mockReturnValue("https://example.com/cdn-cgi/challenge"),
      content: vi.fn().mockResolvedValue("<html></html>"),
    };

    const result = await detectBlock(page);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
  });

  it("detects Cloudflare challenge by body marker", async () => {
    const page = {
      title: vi.fn().mockResolvedValue(""),
      url: vi.fn().mockReturnValue("https://example.com/optout"),
      content: vi.fn().mockResolvedValue("<html><body>challenge-platform</body></html>"),
    };

    const result = await detectBlock(page);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
  });

  it("detects access denied", async () => {
    const page = {
      title: vi.fn().mockResolvedValue("Access Denied"),
      url: vi.fn().mockReturnValue("https://example.com/optout"),
      content: vi.fn().mockResolvedValue("<html>Forbidden</html>"),
    };

    const result = await detectBlock(page);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("access_denied");
  });

  it("detects captcha wall", async () => {
    const page = {
      title: vi.fn().mockResolvedValue("Security Check"),
      url: vi.fn().mockReturnValue("https://example.com/optout"),
      content: vi.fn().mockResolvedValue("<html><body><div class='g-recaptcha'></div></body></html>"),
    };

    const result = await detectBlock(page);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("captcha_wall");
  });

  it("handles content() throwing gracefully", async () => {
    const page = {
      title: vi.fn().mockResolvedValue("Normal Page"),
      url: vi.fn().mockReturnValue("https://example.com/optout"),
      content: vi.fn().mockRejectedValue(new Error("content unavailable")),
    };

    const result = await detectBlock(page);
    expect(result.blocked).toBe(false);
  });
});

describe("waitForChallenge", () => {
  it("returns unblocked immediately if page is not blocked", async () => {
    const page = {
      title: vi.fn().mockResolvedValue("My Opt Out Page"),
      url: vi.fn().mockReturnValue("https://example.com/optout"),
      content: vi.fn().mockResolvedValue("<html><body>Form here</body></html>"),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };

    const result = await waitForChallenge(page, { maxWaitMs: 10_000, pollIntervalMs: 1_000 });
    expect(result.blocked).toBe(false);
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });

  it("retries and resolves when challenge clears", async () => {
    let callCount = 0;
    const page = {
      title: vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount <= 2 ? "Just a moment..." : "Broker Opt Out";
      }),
      url: vi.fn().mockReturnValue("https://example.com/optout"),
      content: vi.fn().mockResolvedValue("<html><body>Content</body></html>"),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };

    const result = await waitForChallenge(page, { maxWaitMs: 15_000, pollIntervalMs: 100 });
    expect(result.blocked).toBe(false);
    expect(page.waitForTimeout).toHaveBeenCalled();
  });

  it("gives up after maxWaitMs", async () => {
    const page = {
      title: vi.fn().mockResolvedValue("Just a moment..."),
      url: vi.fn().mockReturnValue("https://example.com/cdn-cgi/challenge"),
      content: vi.fn().mockResolvedValue("<html>challenge-platform</html>"),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };

    const result = await waitForChallenge(page, { maxWaitMs: 500, pollIntervalMs: 100 });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
  });

  it("does not retry for access_denied (non-transient)", async () => {
    const page = {
      title: vi.fn().mockResolvedValue("Access Denied"),
      url: vi.fn().mockReturnValue("https://example.com/optout"),
      content: vi.fn().mockResolvedValue("<html>Forbidden</html>"),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };

    const result = await waitForChallenge(page, { maxWaitMs: 10_000, pollIntervalMs: 100 });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("access_denied");
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });
});
