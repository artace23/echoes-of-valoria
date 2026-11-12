import { describe, expect, it } from "vitest";
import type { ItemDefinition, ItemId } from "@valoria/game-types";
import {
  addItem,
  countItem,
  createEquipment,
  createInventory,
  equipWeapon,
  removeItem,
  rollDrops,
  unequipWeapon,
  useConsumable,
  withEquipment,
} from "./inventory";
import { deriveStats } from "./progression";

const potion: ItemDefinition = {
  id: "health-potion",
  name: "Health Potion",
  description: "",
  kind: "consumable",
  stackable: true,
  healAmount: 40,
};
const rusty: ItemDefinition = {
  id: "rusty-sword",
  name: "Rusty Sword",
  description: "",
  kind: "weapon",
  stackable: false,
  attackPower: 2,
};
const iron: ItemDefinition = {
  id: "iron-sword",
  name: "Iron Sword",
  description: "",
  kind: "weapon",
  stackable: false,
  attackPower: 7,
};
const items: Record<ItemId, ItemDefinition> = {
  "health-potion": potion,
  "rusty-sword": rusty,
  "iron-sword": iron,
};
const lookup = (id: ItemId) => items[id];

describe("addItem", () => {
  it("stacks stackable items in one slot", () => {
    let inventory = createInventory();
    inventory = addItem(inventory, potion, 2).inventory;
    const result = addItem(inventory, potion);
    expect(result.added).toBe(1);
    expect(result.inventory.stacks).toEqual([{ itemId: "health-potion", quantity: 3 }]);
  });

  it("gives each non-stackable item its own slot", () => {
    const result = addItem(createInventory(), iron, 2);
    expect(result.added).toBe(2);
    expect(result.inventory.stacks).toHaveLength(2);
  });

  it("refuses new stacks when full, but still tops up an existing stack", () => {
    let inventory = createInventory(2);
    inventory = addItem(inventory, potion).inventory;
    inventory = addItem(inventory, iron).inventory;

    const sword = addItem(inventory, rusty);
    expect(sword.added).toBe(0);
    expect(sword.inventory).toBe(inventory);

    expect(addItem(inventory, potion, 5).added).toBe(5);
  });

  it("adds only as many non-stackable items as there are free slots", () => {
    const result = addItem(createInventory(2), iron, 5);
    expect(result.added).toBe(2);
  });

  it("does not mutate the original inventory", () => {
    const inventory = createInventory();
    addItem(inventory, potion, 3);
    expect(inventory.stacks).toEqual([]);
  });
});

describe("removeItem", () => {
  const inventory = addItem(createInventory(), potion, 3).inventory;

  it("reduces a stack and drops it when empty", () => {
    expect(countItem(removeItem(inventory, "health-potion")!, "health-potion")).toBe(2);
    expect(removeItem(inventory, "health-potion", 3)!.stacks).toEqual([]);
  });

  it("returns null when there are not enough", () => {
    expect(removeItem(inventory, "health-potion", 4)).toBeNull();
    expect(removeItem(inventory, "iron-sword")).toBeNull();
  });
});

describe("useConsumable", () => {
  const inventory = addItem(createInventory(), potion, 2).inventory;

  it("heals and consumes one", () => {
    const result = useConsumable(inventory, potion, 50, 100)!;
    expect(result.healed).toBe(40);
    expect(countItem(result.inventory, "health-potion")).toBe(1);
  });

  it("never heals past the maximum", () => {
    expect(useConsumable(inventory, potion, 90, 100)!.healed).toBe(10);
  });

  it("does nothing at full health, when dead, or with none held", () => {
    expect(useConsumable(inventory, potion, 100, 100)).toBeNull();
    expect(useConsumable(inventory, potion, 0, 100)).toBeNull();
    expect(useConsumable(createInventory(), potion, 50, 100)).toBeNull();
  });

  it("rejects items that are not consumables", () => {
    const withSword = addItem(createInventory(), iron).inventory;
    expect(useConsumable(withSword, iron, 50, 100)).toBeNull();
  });
});

describe("equipment", () => {
  it("moves a weapon from the inventory into the weapon slot", () => {
    const inventory = addItem(createInventory(), iron).inventory;
    const result = equipWeapon(inventory, createEquipment(), iron, lookup)!;
    expect(result.equipment.weapon).toBe("iron-sword");
    expect(result.inventory.stacks).toEqual([]);
  });

  it("swaps with the equipped weapon, even when the inventory is full", () => {
    const inventory = addItem(createInventory(1), iron).inventory;
    const result = equipWeapon(inventory, { weapon: "rusty-sword" }, iron, lookup)!;
    expect(result.equipment.weapon).toBe("iron-sword");
    expect(result.inventory.stacks).toEqual([{ itemId: "rusty-sword", quantity: 1 }]);
  });

  it("refuses to equip something not held, or not a weapon", () => {
    expect(equipWeapon(createInventory(), createEquipment(), iron, lookup)).toBeNull();
    const withPotion = addItem(createInventory(), potion).inventory;
    expect(equipWeapon(withPotion, createEquipment(), potion, lookup)).toBeNull();
  });

  it("unequips into the inventory when there is room", () => {
    const result = unequipWeapon(createInventory(), { weapon: "iron-sword" }, lookup)!;
    expect(result.equipment.weapon).toBeNull();
    expect(countItem(result.inventory, "iron-sword")).toBe(1);
  });

  it("refuses to unequip with nothing equipped or a full inventory", () => {
    expect(unequipWeapon(createInventory(), createEquipment(), lookup)).toBeNull();
    const full = addItem(createInventory(1), potion).inventory;
    expect(unequipWeapon(full, { weapon: "iron-sword" }, lookup)).toBeNull();
  });

  it("adds the weapon's attack power to the character's stats", () => {
    const base = deriveStats(3);
    expect(withEquipment(base, createEquipment(), lookup)).toEqual(base);
    expect(withEquipment(base, { weapon: "iron-sword" }, lookup)).toEqual({
      ...base,
      attackPower: base.attackPower + 7,
    });
  });
});

describe("rollDrops", () => {
  const drops = [
    { itemId: "health-potion" as const, chance: 0.5 },
    { itemId: "iron-sword" as const, chance: 0.1 },
  ];

  it("drops each item whose roll is under its chance", () => {
    expect(rollDrops(drops, () => 0.05)).toEqual(["health-potion", "iron-sword"]);
    expect(rollDrops(drops, () => 0.3)).toEqual(["health-potion"]);
    expect(rollDrops(drops, () => 0.9)).toEqual([]);
  });

  it("never drops at chance 0 and always drops at chance 1", () => {
    expect(rollDrops([{ itemId: "health-potion", chance: 0 }], () => 0)).toEqual([]);
    expect(rollDrops([{ itemId: "health-potion", chance: 1 }], () => 0.999)).toEqual([
      "health-potion",
    ]);
  });
});
