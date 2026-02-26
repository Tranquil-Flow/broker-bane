import { loadBrokerDatabase } from "../../src/data/broker-loader.js";

describe("loadBrokerDatabase", () => {
  it("gives every broker an opt_out_validity_days value (defaults to 180)", () => {
    const db = loadBrokerDatabase();
    for (const broker of db.brokers) {
      expect(typeof broker.opt_out_validity_days).toBe("number");
      expect(broker.opt_out_validity_days).toBeGreaterThan(0);
    }
  });
});
