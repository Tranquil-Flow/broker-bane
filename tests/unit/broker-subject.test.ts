import { BrokerSchema } from "../../src/types/broker.js";

describe("BrokerSchema subject_template", () => {
  it("accepts subject_template field", () => {
    const result = BrokerSchema.safeParse({
      id: "test",
      name: "Test Broker",
      domain: "test.com",
      region: "us",
      category: "people_search",
      removal_method: "email",
      email: "privacy@test.com",
      subject_template: "California Privacy Request - {{FullName}}",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject_template).toBe("California Privacy Request - {{FullName}}");
    }
  });

  it("subject_template is optional", () => {
    const result = BrokerSchema.safeParse({
      id: "test",
      name: "Test Broker",
      domain: "test.com",
      region: "us",
      category: "people_search",
      removal_method: "email",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject_template).toBeUndefined();
    }
  });
});
