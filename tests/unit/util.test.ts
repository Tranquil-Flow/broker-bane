import {
  doDomainsMatch,
  isUrlShortener,
  isHttps,
  isValidDomain,
  emailDomainMatchesWebsite,
  getRegistrableDomain,
} from "../../src/util/domain.js";
import { exponentialBackoff } from "../../src/util/delay.js";
import {
  BrokerBaneError,
  ConfigError,
  StateTransitionError,
  LinkValidationError,
} from "../../src/util/errors.js";

describe("domain utils", () => {
  describe("doDomainsMatch", () => {
    it("matches same domain", () => {
      expect(doDomainsMatch("spokeo.com", "spokeo.com")).toBe(true);
    });

    it("matches subdomains to root", () => {
      expect(doDomainsMatch("www.spokeo.com", "spokeo.com")).toBe(true);
    });

    it("matches different subdomains", () => {
      expect(doDomainsMatch("mail.spokeo.com", "api.spokeo.com")).toBe(true);
    });

    it("rejects different domains", () => {
      expect(doDomainsMatch("spokeo.com", "evil.com")).toBe(false);
    });

    it("prevents endsWith attacks", () => {
      // evil-spokeo.com should NOT match spokeo.com
      expect(doDomainsMatch("evil-spokeo.com", "spokeo.com")).toBe(false);
    });

    it("handles full URLs", () => {
      expect(doDomainsMatch("https://www.spokeo.com/optout", "spokeo.com")).toBe(true);
    });
  });

  describe("isUrlShortener", () => {
    it("detects bit.ly", () => {
      expect(isUrlShortener("https://bit.ly/abc123")).toBe(true);
    });

    it("detects t.co", () => {
      expect(isUrlShortener("https://t.co/xyz")).toBe(true);
    });

    it("rejects normal domains", () => {
      expect(isUrlShortener("https://spokeo.com")).toBe(false);
    });
  });

  describe("isHttps", () => {
    it("accepts https", () => {
      expect(isHttps("https://spokeo.com")).toBe(true);
    });

    it("rejects http", () => {
      expect(isHttps("http://spokeo.com")).toBe(false);
    });

    it("rejects invalid urls", () => {
      expect(isHttps("not-a-url")).toBe(false);
    });
  });

  describe("isValidDomain", () => {
    it("accepts valid domains", () => {
      expect(isValidDomain("spokeo.com")).toBe(true);
    });

    it("rejects invalid domains", () => {
      expect(isValidDomain("not-a-domain")).toBe(false);
    });
  });

  describe("emailDomainMatchesWebsite", () => {
    it("matches email domain to website", () => {
      expect(emailDomainMatchesWebsite("privacy@spokeo.com", "spokeo.com")).toBe(true);
    });

    it("rejects mismatched domains", () => {
      expect(emailDomainMatchesWebsite("privacy@evil.com", "spokeo.com")).toBe(false);
    });

    it("handles subdomains", () => {
      expect(emailDomainMatchesWebsite("info@mail.spokeo.com", "www.spokeo.com")).toBe(true);
    });
  });

  describe("getRegistrableDomain", () => {
    it("extracts registrable domain", () => {
      expect(getRegistrableDomain("www.spokeo.com")).toBe("spokeo.com");
    });

    it("handles already-bare domains", () => {
      expect(getRegistrableDomain("spokeo.com")).toBe("spokeo.com");
    });
  });
});

describe("delay utils", () => {
  describe("exponentialBackoff", () => {
    it("calculates base delay for attempt 0", () => {
      // With 0 jitter, should be exactly initialDelay
      const delay = exponentialBackoff(0, 1000, 2, 0);
      expect(delay).toBe(1000);
    });

    it("doubles with multiplier 2", () => {
      const delay = exponentialBackoff(1, 1000, 2, 0);
      expect(delay).toBe(2000);
    });

    it("applies jitter within bounds", () => {
      const delays = Array.from({ length: 100 }, () =>
        exponentialBackoff(0, 1000, 2, 0.25)
      );
      // With 25% jitter on 1000ms base: 750-1250
      expect(delays.every((d) => d >= 750 && d <= 1250)).toBe(true);
    });
  });
});

describe("errors", () => {
  it("BrokerBaneError has code", () => {
    const err = new BrokerBaneError("test", "TEST_CODE");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test");
    expect(err.name).toBe("BrokerBaneError");
  });

  it("ConfigError extends BrokerBaneError", () => {
    const err = new ConfigError("bad config");
    expect(err).toBeInstanceOf(BrokerBaneError);
    expect(err.code).toBe("CONFIG_ERROR");
  });

  it("StateTransitionError includes from/to", () => {
    const err = new StateTransitionError("pending", "completed");
    expect(err.message).toContain("pending");
    expect(err.message).toContain("completed");
  });

  it("LinkValidationError includes url and reason", () => {
    const err = new LinkValidationError("http://evil.com", "not HTTPS");
    expect(err.message).toContain("evil.com");
    expect(err.message).toContain("not HTTPS");
  });
});
