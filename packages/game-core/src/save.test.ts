import { describe, expect, it } from "vitest";
import type { ItemDefinition, QuestDefinition } from "@valoria/game-types";
import {
  SAVE_VERSION,
  parseSave,
  serializeSave,
  type SaveContext,
  type SaveData,
} from "./save";

const items: Record<string, ItemDefinition> = {
  "health-potion": {
    id: "health-potion",
    name: "Health Potion",
    description: "",
    kind: "consumable",
    stackable: true,
    healAmount: 40,
  },
  "rusty-sword": {
    id: "rusty-sword",
    name: "Rusty Sword",
    description: "",
    kind: "weapon",
    stackable: false,
    attackPower: 2,
  },
  "iron-sword": {
    id: "iron-sword",
    name: "Iron Sword",
    description: "",
    kind: "weapon",
    stackable: false,
    attackPower: 7,
  },
};
const quest: QuestDefinition = {
  id: "cull-the-pack",
  name: "Cull the Pack",
  description: "",
  objective: { kind: "defeat", enemyId: "corrupted-wolf", count: 3 },
  reward: { xp: 80, gold: 40 },
};
const context: SaveContext = { items, quest, inventoryCapacity: 12 };

const valid: SaveData = {
  version: SAVE_VERSION,
  progress: { level: 2, xp: 45, gold: 72 },
  health: 88,
  inventory: {
    capacity: 12,
    stacks: [
      { itemId: "health-potion", quantity: 3 },
      { itemId: "rusty-sword", quantity: 1 },
    ],
  },
  equipment: { weapon: "iron-sword" },
  quest: { questId: "cull-the-pack", status: "active", count: 2 },
  collectedPickups: ["village-potion", "cart-iron-sword"],
};

/** Parse a copy of the valid save with some fields replaced. */
function parseWith(changes: Record<string, unknown>) {
  return parseSave(JSON.stringify({ ...valid, ...changes }), context);
}

describe("round trip", () => {
  it("restores exactly what was saved", () => {
    expect(parseSave(serializeSave(valid), context)).toEqual(valid);
  });

  it("accepts a fresh character", () => {
    const fresh: SaveData = {
      version: SAVE_VERSION,
      progress: { level: 1, xp: 0, gold: 0 },
      health: 100,
      inventory: { capacity: 12, stacks: [] },
      equipment: { weapon: null },
      quest: { questId: "cull-the-pack", status: "available", count: 0 },
      collectedPickups: [],
    };
    expect(parseSave(serializeSave(fresh), context)).toEqual(fresh);
  });
});

describe("rejects unusable saves", () => {
  it("that are not JSON, or not an object", () => {
    expect(parseSave("not json {", context)).toBeNull();
    expect(parseSave("", context)).toBeNull();
    expect(parseSave("null", context)).toBeNull();
    expect(parseSave("[1,2,3]", context)).toBeNull();
    expect(parseSave('"text"', context)).toBeNull();
  });

  it("from a different version", () => {
    expect(parseWith({ version: 2 })).toBeNull();
    expect(parseWith({ version: undefined })).toBeNull();
  });

  it("with missing sections", () => {
    for (const key of ["progress", "inventory", "equipment", "quest", "health"]) {
      expect(parseWith({ [key]: undefined })).toBeNull();
    }
  });
});

describe("rejects tampered progress", () => {
  it("with a level outside the valid range", () => {
    expect(parseWith({ progress: { level: 0, xp: 0, gold: 0 } })).toBeNull();
    expect(parseWith({ progress: { level: 999, xp: 0, gold: 0 } })).toBeNull();
    expect(parseWith({ progress: { level: 1.5, xp: 0, gold: 0 } })).toBeNull();
    expect(parseWith({ progress: { level: "9", xp: 0, gold: 0 } })).toBeNull();
  });

  it("with XP at or beyond the next level's threshold", () => {
    // Level 2 needs 170 XP to advance.
    expect(parseWith({ progress: { level: 2, xp: 169, gold: 0 } })).not.toBeNull();
    expect(parseWith({ progress: { level: 2, xp: 170, gold: 0 } })).toBeNull();
    expect(parseWith({ progress: { level: 2, xp: -1, gold: 0 } })).toBeNull();
  });

  it("with XP above zero at the level cap", () => {
    expect(parseWith({ progress: { level: 20, xp: 0, gold: 5 } })).not.toBeNull();
    expect(parseWith({ progress: { level: 20, xp: 1, gold: 5 } })).toBeNull();
  });

  it("with negative, fractional or absurd gold", () => {
    expect(parseWith({ progress: { level: 1, xp: 0, gold: -5 } })).toBeNull();
    expect(parseWith({ progress: { level: 1, xp: 0, gold: 1.5 } })).toBeNull();
    expect(parseWith({ progress: { level: 1, xp: 0, gold: 1e12 } })).toBeNull();
  });

  it("with invalid health", () => {
    expect(parseWith({ health: 0 })).toBeNull();
    expect(parseWith({ health: -10 })).toBeNull();
    expect(parseWith({ health: "100" })).toBeNull();
    expect(parseSave(serializeSave(valid).replace('"health":88', '"health":1e999'), context)).toBeNull();
  });
});

describe("rejects tampered inventory and equipment", () => {
  it("with unknown items", () => {
    expect(
      parseWith({ inventory: { capacity: 12, stacks: [{ itemId: "god-sword", quantity: 1 }] } }),
    ).toBeNull();
  });

  it("with invalid quantities", () => {
    const stack = (quantity: unknown, itemId = "health-potion") =>
      parseWith({ inventory: { capacity: 12, stacks: [{ itemId, quantity }] } });
    expect(stack(0)).toBeNull();
    expect(stack(-3)).toBeNull();
    expect(stack(2.5)).toBeNull();
    expect(stack(1_000_000)).toBeNull();
    // Weapons do not stack.
    expect(stack(2, "iron-sword")).toBeNull();
  });

  it("with more stacks than slots, or duplicate stacks of a stackable item", () => {
    const many = Array.from({ length: 13 }, () => ({ itemId: "iron-sword", quantity: 1 }));
    expect(parseWith({ inventory: { capacity: 12, stacks: many } })).toBeNull();
    expect(
      parseWith({
        inventory: {
          capacity: 12,
          stacks: [
            { itemId: "health-potion", quantity: 1 },
            { itemId: "health-potion", quantity: 1 },
          ],
        },
      }),
    ).toBeNull();
  });

  it("ignores a capacity written into the save", () => {
    const result = parseWith({ inventory: { capacity: 500, stacks: [] } });
    expect(result?.inventory.capacity).toBe(12);
  });

  it("with an equipped item that is unknown or not a weapon", () => {
    expect(parseWith({ equipment: { weapon: "god-sword" } })).toBeNull();
    expect(parseWith({ equipment: { weapon: "health-potion" } })).toBeNull();
    expect(parseWith({ equipment: { weapon: 7 } })).toBeNull();
    expect(parseWith({ equipment: { weapon: null } })?.equipment.weapon).toBeNull();
  });
});

describe("rejects tampered quest progress", () => {
  const withQuest = (status: string, count: number, questId = "cull-the-pack") =>
    parseWith({ quest: { questId, status, count } });

  it("for an unknown quest or status", () => {
    expect(withQuest("active", 1, "other-quest")).toBeNull();
    expect(withQuest("finished", 3)).toBeNull();
  });

  it("with a count outside the objective", () => {
    expect(withQuest("active", -1)).toBeNull();
    expect(withQuest("active", 4)).toBeNull();
  });

  it("whose count disagrees with its status", () => {
    // Claiming "ready" without the kills would hand out the reward.
    expect(withQuest("ready", 0)).toBeNull();
    expect(withQuest("completed", 1)).toBeNull();
    expect(withQuest("available", 2)).toBeNull();
    expect(withQuest("active", 3)).toBeNull();
  });

  it("accepts every consistent state", () => {
    expect(withQuest("available", 0)).not.toBeNull();
    expect(withQuest("active", 0)).not.toBeNull();
    expect(withQuest("active", 2)).not.toBeNull();
    expect(withQuest("ready", 3)).not.toBeNull();
    expect(withQuest("completed", 3)).not.toBeNull();
  });
});

describe("collected pickups", () => {
  it("removes duplicates", () => {
    expect(parseWith({ collectedPickups: ["a", "a", "b"] })?.collectedPickups).toEqual(["a", "b"]);
  });

  it("rejects anything that is not a short list of strings", () => {
    expect(parseWith({ collectedPickups: "a" })).toBeNull();
    expect(parseWith({ collectedPickups: [1, 2] })).toBeNull();
    expect(parseWith({ collectedPickups: ["x".repeat(65)] })).toBeNull();
    expect(parseWith({ collectedPickups: Array.from({ length: 300 }, (_, i) => `p${i}`) })).toBeNull();
  });
});
