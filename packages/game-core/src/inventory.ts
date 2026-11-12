// Inventory and equipment rules. Inventories are immutable: every operation
// returns a new one, or null when the operation is not allowed.

import type { ItemDefinition, ItemDrop, ItemId } from "@valoria/game-types";
import type { CharacterStats } from "./progression";

export interface InventoryStack {
  readonly itemId: ItemId;
  readonly quantity: number;
}

export interface Inventory {
  /** Number of slots. Each stack occupies one slot. */
  readonly capacity: number;
  readonly stacks: readonly InventoryStack[];
}

export interface Equipment {
  readonly weapon: ItemId | null;
}

/** Resolves an item id to its definition (normally from game-data). */
export type ItemLookup = (id: ItemId) => ItemDefinition;

export const DEFAULT_INVENTORY_CAPACITY = 12;

export function createInventory(
  capacity: number = DEFAULT_INVENTORY_CAPACITY,
): Inventory {
  return { capacity, stacks: [] };
}

export function createEquipment(): Equipment {
  return { weapon: null };
}

export function countItem(inventory: Inventory, itemId: ItemId): number {
  return inventory.stacks.reduce(
    (total, stack) => (stack.itemId === itemId ? total + stack.quantity : total),
    0,
  );
}

/**
 * Add items. Stackable items share one slot; each unit of a non-stackable
 * item needs its own. Returns how many were actually added, which is fewer
 * than requested when the inventory runs out of slots.
 */
export function addItem(
  inventory: Inventory,
  item: ItemDefinition,
  quantity = 1,
): { inventory: Inventory; added: number } {
  const wanted = Math.max(0, Math.floor(quantity));
  if (wanted === 0) return { inventory, added: 0 };

  const stacks = [...inventory.stacks];
  const freeSlots = inventory.capacity - stacks.length;

  if (item.stackable) {
    const index = stacks.findIndex((stack) => stack.itemId === item.id);
    const existing = stacks[index];
    if (existing) {
      stacks[index] = { itemId: item.id, quantity: existing.quantity + wanted };
    } else if (freeSlots > 0) {
      stacks.push({ itemId: item.id, quantity: wanted });
    } else {
      return { inventory, added: 0 };
    }
    return { inventory: { ...inventory, stacks }, added: wanted };
  }

  const added = Math.min(wanted, Math.max(0, freeSlots));
  if (added === 0) return { inventory, added: 0 };
  for (let i = 0; i < added; i++) stacks.push({ itemId: item.id, quantity: 1 });
  return { inventory: { ...inventory, stacks }, added };
}

/** Remove items, or return null if the inventory does not hold enough. */
export function removeItem(
  inventory: Inventory,
  itemId: ItemId,
  quantity = 1,
): Inventory | null {
  if (quantity <= 0) return inventory;
  if (countItem(inventory, itemId) < quantity) return null;

  let remaining = quantity;
  const stacks: InventoryStack[] = [];
  for (const stack of inventory.stacks) {
    if (stack.itemId !== itemId || remaining === 0) {
      stacks.push(stack);
      continue;
    }
    const taken = Math.min(stack.quantity, remaining);
    remaining -= taken;
    if (stack.quantity > taken) {
      stacks.push({ itemId, quantity: stack.quantity - taken });
    }
  }
  return { ...inventory, stacks };
}

/**
 * Drink a healing consumable. Returns null if the item is not a consumable,
 * none is held, or it would do nothing (dead, or already at full health).
 */
export function useConsumable(
  inventory: Inventory,
  item: ItemDefinition,
  health: number,
  healthMax: number,
): { inventory: Inventory; healed: number } | null {
  if (item.kind !== "consumable") return null;
  if (health <= 0 || health >= healthMax) return null;
  const next = removeItem(inventory, item.id);
  if (!next) return null;
  return { inventory: next, healed: Math.min(item.healAmount, healthMax - health) };
}

/**
 * Equip a weapon held in the inventory. The weapon it replaces goes back
 * into the slot that was just freed. Returns null if the item is not a
 * weapon or is not held.
 */
export function equipWeapon(
  inventory: Inventory,
  equipment: Equipment,
  item: ItemDefinition,
  lookup: ItemLookup,
): { inventory: Inventory; equipment: Equipment } | null {
  if (item.kind !== "weapon") return null;
  let next = removeItem(inventory, item.id);
  if (!next) return null;
  if (equipment.weapon) {
    next = addItem(next, lookup(equipment.weapon)).inventory;
  }
  return { inventory: next, equipment: { ...equipment, weapon: item.id } };
}

/** Put the equipped weapon back in the inventory. Null if none, or no room. */
export function unequipWeapon(
  inventory: Inventory,
  equipment: Equipment,
  lookup: ItemLookup,
): { inventory: Inventory; equipment: Equipment } | null {
  if (!equipment.weapon) return null;
  const result = addItem(inventory, lookup(equipment.weapon));
  if (result.added === 0) return null;
  return { inventory: result.inventory, equipment: { ...equipment, weapon: null } };
}

/** Character stats with equipment bonuses applied. */
export function withEquipment(
  stats: CharacterStats,
  equipment: Equipment,
  lookup: ItemLookup,
): CharacterStats {
  if (!equipment.weapon) return stats;
  const weapon = lookup(equipment.weapon);
  if (weapon.kind !== "weapon") return stats;
  return { ...stats, attackPower: stats.attackPower + weapon.attackPower };
}

/**
 * Roll an enemy's item drops. Each entry is rolled independently; `rng`
 * returns a number in [0, 1).
 */
export function rollDrops(
  drops: readonly ItemDrop[],
  rng: () => number,
): ItemId[] {
  return drops.filter((drop) => rng() < drop.chance).map((drop) => drop.itemId);
}
