import { scoreProfileMatch, normalizePhone } from "../../src/matcher/profile-matcher.js";
import type { Profile } from "../../src/types/config.js";

const testProfile: Profile = {
  first_name: "John",
  last_name: "Doe",
  email: "john@example.com",
  address: "123 Main St",
  city: "San Francisco",
  state: "CA",
  zip: "94102",
  country: "US",
  phone: "(415) 555-1234",
  date_of_birth: "1990-06-15",
  aliases: ["Michael"],
};

describe("ProfileMatcher", () => {
  describe("normalizePhone", () => {
    it("strips non-digits and takes last 10", () => {
      expect(normalizePhone("(415) 555-1234")).toBe("4155551234");
      expect(normalizePhone("+1-415-555-1234")).toBe("4155551234");
      expect(normalizePhone("4155551234")).toBe("4155551234");
    });

    it("handles short numbers", () => {
      expect(normalizePhone("555-1234")).toBe("5551234");
    });
  });

  describe("scoreProfileMatch", () => {
    it("scores full match highly", () => {
      const brokerData = {
        name: "John Doe",
        city: "San Francisco",
        state: "CA",
        age: "35",
        address: "123 Main St Apt 4",
        phone: "415-555-1234",
      };
      const result = scoreProfileMatch(testProfile, brokerData);
      expect(result.totalScore).toBeGreaterThanOrEqual(60);
      expect(result.recommendation).toBe("auto_remove");
    });

    it("scores name-only match below manual threshold as skip", () => {
      const brokerData = { name: "John Doe" };
      const result = scoreProfileMatch(testProfile, brokerData);
      expect(result.totalScore).toBe(30);
      expect(result.recommendation).toBe("skip");
    });

    it("scores no match as skip", () => {
      const brokerData = { name: "Jane Smith", city: "New York" };
      const result = scoreProfileMatch(testProfile, brokerData);
      expect(result.totalScore).toBe(0);
      expect(result.recommendation).toBe("skip");
    });

    it("gives 30 points for name match", () => {
      const result = scoreProfileMatch(testProfile, { name: "John Doe" });
      const nameField = result.fields.find((f) => f.field === "name");
      expect(nameField?.matched).toBe(true);
      expect(nameField?.score).toBe(30);
    });

    it("gives 20 points for city match", () => {
      const result = scoreProfileMatch(testProfile, {
        name: "John Doe",
        city: "San Francisco",
      });
      const cityField = result.fields.find((f) => f.field === "city");
      expect(cityField?.matched).toBe(true);
      expect(cityField?.score).toBe(20);
    });

    it("gives 25 points for phone match", () => {
      const result = scoreProfileMatch(testProfile, {
        name: "John Doe",
        phone: "(415) 555-1234",
      });
      const phoneField = result.fields.find((f) => f.field === "phone");
      expect(phoneField?.matched).toBe(true);
      expect(phoneField?.score).toBe(25);
    });

    it("matches age within 2 years", () => {
      const result = scoreProfileMatch(testProfile, {
        name: "John Doe",
        age: "36",
      });
      const ageField = result.fields.find((f) => f.field === "age");
      expect(ageField?.matched).toBe(true);
    });

    it("rejects age difference > 2 years", () => {
      const result = scoreProfileMatch(testProfile, {
        name: "John Doe",
        age: "45",
      });
      const ageField = result.fields.find((f) => f.field === "age");
      expect(ageField?.matched).toBe(false);
    });

    it("matches middle name from aliases", () => {
      const result = scoreProfileMatch(testProfile, {
        name: "John Doe",
        middle_name: "Michael",
      });
      const middleField = result.fields.find((f) => f.field === "middle_name");
      expect(middleField?.matched).toBe(true);
      expect(middleField?.score).toBe(15);
    });

    it("respects custom thresholds", () => {
      const result = scoreProfileMatch(
        testProfile,
        { name: "John Doe" },
        { auto: 25, manual: 10 }
      );
      expect(result.recommendation).toBe("auto_remove");
    });

    it("handles missing broker data gracefully", () => {
      const result = scoreProfileMatch(testProfile, {});
      expect(result.totalScore).toBe(0);
      expect(result.fields).toHaveLength(0);
    });
  });
});
