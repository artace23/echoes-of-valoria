import { describe, expect, it } from "vitest";
import { isLocationUnlocked } from "./index";

describe("isLocationUnlocked", () => {
  it("unlocks when the character meets the required level", () => {
    expect(isLocationUnlocked({ requiredLevel: 2 }, 2)).toBe(true);
    expect(isLocationUnlocked({ requiredLevel: 2 }, 5)).toBe(true);
  });

  it("stays locked below the required level", () => {
    expect(isLocationUnlocked({ requiredLevel: 2 }, 1)).toBe(false);
  });
});
