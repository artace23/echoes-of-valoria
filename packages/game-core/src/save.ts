// Save data: what persists between sessions, and how it is validated when
// read back. A save comes from storage the player can edit, so nothing in it
// is trusted: anything malformed or out of range makes the whole save invalid.

import type { ItemDefinition, ItemId, QuestDefinition } from "@valoria/game-types";
import type { Equipment, Inventory, InventoryStack } from "./inventory";
import {
  DEFAULT_PROGRESSION_CONFIG,
  xpToNextLevel,
  type CharacterProgress,
  type ProgressionConfig,
} from "./progression";
import type { QuestProgress, QuestStatus } from "./quest";

export const SAVE_VERSION = 1;

/**
 * Everything that persists. Transient state (position, stamina, cooldowns,
 * combat in progress, enemies) is deliberately absent.
 */
export interface SaveData {
  version: typeof SAVE_VERSION;
  progress: CharacterProgress;
  /** Current health. Capped to the character's maximum when loaded. */
  health: number;
  inventory: Inventory;
  equipment: Equipment;
  quest: QuestProgress;
  /** Ids of one-off world pickups already taken, so they do not reappear. */
  collectedPickups: readonly string[];
}

/** What a save is checked against. */
export interface SaveContext {
  items: Readonly<Record<string, ItemDefinition>>;
  quest: QuestDefinition;
  inventoryCapacity: number;
  progression?: ProgressionConfig;
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

const QUEST_STATUSES: readonly QuestStatus[] = [
  "available",
  "active",
  "ready",
  "completed",
];
const MAX_STACK = 9999;
const MAX_GOLD = 1_000_000_000;
const MAX_PICKUP_IDS = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function parseProgress(
  value: unknown,
  config: ProgressionConfig,
): CharacterProgress | null {
  if (!isRecord(value)) return null;
  const { level, xp, gold } = value;
  if (!isIntegerInRange(level, 1, config.maxLevel)) return null;
  if (!isIntegerInRange(gold, 0, MAX_GOLD)) return null;
  // XP is progress toward the next level, so it must be below that threshold.
  const needed = xpToNextLevel(level, config);
  const xpLimit = needed === 0 ? 0 : needed - 1;
  if (!isIntegerInRange(xp, 0, xpLimit)) return null;
  return { level, xp, gold };
}

function parseInventory(value: unknown, context: SaveContext): Inventory | null {
  if (!isRecord(value) || !Array.isArray(value.stacks)) return null;
  if (value.stacks.length > context.inventoryCapacity) return null;

  const stacks: InventoryStack[] = [];
  const stackableSeen = new Set<string>();
  for (const entry of value.stacks) {
    if (!isRecord(entry) || typeof entry.itemId !== "string") return null;
    const item = context.items[entry.itemId];
    if (!item) return null;
    if (!isIntegerInRange(entry.quantity, 1, item.stackable ? MAX_STACK : 1)) {
      return null;
    }
    if (item.stackable) {
      // A stackable item occupies a single slot.
      if (stackableSeen.has(item.id)) return null;
      stackableSeen.add(item.id);
    }
    stacks.push({ itemId: item.id, quantity: entry.quantity });
  }
  // The capacity comes from the game, not the save.
  return { capacity: context.inventoryCapacity, stacks };
}

function parseEquipment(value: unknown, context: SaveContext): Equipment | null {
  if (!isRecord(value)) return null;
  if (value.weapon === null) return { weapon: null };
  if (typeof value.weapon !== "string") return null;
  const item = context.items[value.weapon];
  if (!item || item.kind !== "weapon") return null;
  return { weapon: item.id as ItemId };
}

function parseQuest(value: unknown, quest: QuestDefinition): QuestProgress | null {
  if (!isRecord(value) || value.questId !== quest.id) return null;
  const status = QUEST_STATUSES.find((candidate) => candidate === value.status);
  if (!status) return null;
  const target = quest.objective.count;
  if (!isIntegerInRange(value.count, 0, target)) return null;

  // The count must agree with the status, or a reward could be claimed early.
  const count = value.count;
  const consistent =
    status === "available"
      ? count === 0
      : status === "active"
        ? count < target
        : count === target;
  return consistent ? { questId: quest.id, status, count } : null;
}

/**
 * Read a save. Returns null if the text is not valid JSON, is from another
 * version, or contains anything the game would not have produced itself.
 */
export function parseSave(raw: string, context: SaveContext): SaveData | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== SAVE_VERSION) return null;

  const config = context.progression ?? DEFAULT_PROGRESSION_CONFIG;
  const progress = parseProgress(value.progress, config);
  const inventory = parseInventory(value.inventory, context);
  const equipment = parseEquipment(value.equipment, context);
  const quest = parseQuest(value.quest, context.quest);
  if (!progress || !inventory || !equipment || !quest) return null;

  const { health, collectedPickups } = value;
  if (typeof health !== "number" || !Number.isFinite(health) || health <= 0) {
    return null;
  }
  if (
    !Array.isArray(collectedPickups) ||
    collectedPickups.length > MAX_PICKUP_IDS ||
    !collectedPickups.every(
      (id): id is string => typeof id === "string" && id.length <= 64,
    )
  ) {
    return null;
  }

  return {
    version: SAVE_VERSION,
    progress,
    health,
    inventory,
    equipment,
    quest,
    collectedPickups: Array.from(new Set(collectedPickups)),
  };
}
