import { describe, it, expect } from "vitest";
import { detectBlock } from "../../src/browser/block-detector.js";

function mockPage(overrides: { title?: string; url?: string; content?: string } = {}) {
  return {
    title: async () => overrides.title ?? "Some Broker",
    url: () => overrides.url ?? "https://example.com/optout",
    content: async () => overrides.content ?? "<html><body>Opt out form</body></html>",
  };
}

describe("detectBlock", () => {
  it("returns not blocked for normal pages", async () => {
    const result = await detectBlock(mockPage());
    expect(result.blocked).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("detects Cloudflare challenge by title", async () => {
    const result = await detectBlock(mockPage({ title: "Just a moment..." }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
  });

  it("detects access denied by title", async () => {
    const result = await detectBlock(mockPage({ title: "Access Denied" }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("access_denied");
  });

  it("detects Cloudflare challenge by URL path", async () => {
    const result = await detectBlock(mockPage({ url: "https://example.com/cdn-cgi/challenge-platform/h/b" }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
  });

  it("detects Cloudflare challenge by body content", async () => {
    const result = await detectBlock(mockPage({
      content: '<html><div id="challenge-platform">Please wait</div></html>',
    }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
  });

  it("detects block by 'you have been blocked' title", async () => {
    const result = await detectBlock(mockPage({ title: "Sorry, you have been blocked" }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("access_denied");
  });

  it("detects captcha wall by title", async () => {
    const result = await detectBlock(mockPage({ title: "Attention Required! | Cloudflare" }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("captcha_wall");
  });
});
