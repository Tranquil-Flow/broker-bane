import { BrokerStore } from "../../src/data/broker-store.js";
import type { Broker } from "../../src/types/broker.js";

const mockBrokers: Broker[] = [
  {
    id: "spokeo",
    name: "Spokeo",
    domain: "spokeo.com",
    email: "privacy@spokeo.com",
    region: "us",
    category: "people_search",
    removal_method: "web_form",
    requires_captcha: false,
    requires_email_confirm: true,
    requires_id_upload: false,
    difficulty: "easy",
    tier: 1,
    public_directory: true,
    verify_before_send: true,
    search_url: "https://spokeo.com/search",
  },
  {
    id: "acxiom",
    name: "Acxiom",
    domain: "acxiom.com",
    email: "privacy@acxiom.com",
    region: "us",
    category: "data_broker",
    removal_method: "email",
    requires_captcha: false,
    requires_email_confirm: false,
    requires_id_upload: false,
    difficulty: "medium",
    tier: 1,
    public_directory: false,
    verify_before_send: false,
  },
  {
    id: "gdpr_broker",
    name: "EU Broker",
    domain: "eubroker.eu",
    email: "dpo@eubroker.eu",
    region: "eu",
    category: "data_broker",
    removal_method: "email",
    requires_captcha: false,
    requires_email_confirm: false,
    requires_id_upload: false,
    difficulty: "easy",
    tier: 2,
    public_directory: false,
    verify_before_send: false,
  },
];

describe("BrokerStore", () => {
  let store: BrokerStore;

  beforeEach(() => {
    store = new BrokerStore(mockBrokers);
  });

  it("returns correct size", () => {
    expect(store.size).toBe(3);
  });

  it("gets broker by id", () => {
    const broker = store.getById("spokeo");
    expect(broker?.name).toBe("Spokeo");
  });

  it("returns undefined for unknown id", () => {
    expect(store.getById("nonexistent")).toBeUndefined();
  });

  it("filters by region", () => {
    const us = store.filter({ regions: ["us"] });
    expect(us).toHaveLength(2);
    const eu = store.filter({ regions: ["eu"] });
    expect(eu).toHaveLength(1);
  });

  it("filters by tier", () => {
    const tier1 = store.filter({ tiers: [1] });
    expect(tier1).toHaveLength(2);
  });

  it("filters by method", () => {
    const email = store.filter({ methods: ["email"] });
    expect(email).toHaveLength(2);
    const web = store.filter({ methods: ["web_form"] });
    expect(web).toHaveLength(1);
  });

  it("filters by category", () => {
    const people = store.filter({ categories: ["people_search"] });
    expect(people).toHaveLength(1);
  });

  it("excludes brokers by id", () => {
    const filtered = store.filter({ excludeIds: ["spokeo"] });
    expect(filtered).toHaveLength(2);
    expect(filtered.find((b) => b.id === "spokeo")).toBeUndefined();
  });

  it("filters by public_directory", () => {
    const pub = store.filter({ publicDirectoryOnly: true });
    expect(pub).toHaveLength(1);
    expect(pub[0]!.id).toBe("spokeo");
  });

  it("combines multiple filters", () => {
    const result = store.filter({ regions: ["us"], methods: ["email"] });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("acxiom");
  });

  it("searches by name", () => {
    const results = store.search("spokeo");
    expect(results).toHaveLength(1);
  });

  it("searches by domain", () => {
    const results = store.search("acxiom.com");
    expect(results).toHaveLength(1);
  });

  it("searches case-insensitively", () => {
    const results = store.search("SPOKEO");
    expect(results).toHaveLength(1);
  });

  it("gets categories", () => {
    const cats = store.getCategories();
    expect(cats).toContain("people_search");
    expect(cats).toContain("data_broker");
  });

  it("gets brokers by method including hybrid", () => {
    const emailBrokers = store.getByMethod("email");
    expect(emailBrokers).toHaveLength(2);
  });

  it("gets brokers by tier", () => {
    const tier2 = store.getByTier(2);
    expect(tier2).toHaveLength(1);
    expect(tier2[0]!.id).toBe("gdpr_broker");
  });
});
