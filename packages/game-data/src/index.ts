// Static game definitions. Data only: rules live in @valoria/game-core.

import type {
  CharacterClassDefinition,
  EnemyDefinition,
  ItemDefinition,
  ItemId,
  LocationDefinition,
  QuestDefinition,
} from "@valoria/game-types";

export const CHARACTER_CLASSES: readonly CharacterClassDefinition[] = [
  {
    id: "warrior",
    name: "Warrior",
    description:
      "A frontline fighter who endures punishment and answers with steel.",
  },
];

export const LOCATIONS: readonly LocationDefinition[] = [
  {
    id: "ashen-village",
    name: "Ashen Village",
    kind: "settlement",
    description:
      "A soot-stained hamlet clinging to the edge of the old kingdom.",
    requiredLevel: 1,
  },
  {
    id: "whispering-forest",
    name: "Whispering Forest",
    kind: "wilderness",
    description: "Ancient woods where something moves between the trees.",
    // Provisional tuning value; revisit when progression rules are designed.
    requiredLevel: 2,
  },
];

// Provisional tuning values for the prototype.
export const CORRUPTED_WOLF: EnemyDefinition = {
  id: "corrupted-wolf",
  name: "Corrupted Wolf",
  healthMax: 45,
  defense: 0,
  attackDamage: 9,
  reward: { xp: 20, goldMin: 4, goldMax: 9 },
  drops: [{ itemId: "health-potion", chance: 0.5 }],
};

export const ITEMS: Readonly<Record<ItemId, ItemDefinition>> = {
  "health-potion": {
    id: "health-potion",
    name: "Health Potion",
    description: "Restores 40 health.",
    kind: "consumable",
    stackable: true,
    healAmount: 40,
  },
  "rusty-sword": {
    id: "rusty-sword",
    name: "Rusty Sword",
    description: "A pitted blade that has seen better days.",
    kind: "weapon",
    stackable: false,
    attackPower: 2,
  },
  "iron-sword": {
    id: "iron-sword",
    name: "Iron Sword",
    description: "A well-balanced soldier's blade.",
    kind: "weapon",
    stackable: false,
    attackPower: 7,
  },
};

export function getItem(id: ItemId): ItemDefinition {
  return ITEMS[id];
}

export const CULL_THE_PACK: QuestDefinition = {
  id: "cull-the-pack",
  name: "Cull the Pack",
  description: "Corrupted wolves have claimed the forest clearing. Thin their numbers.",
  objective: { kind: "defeat", enemyId: "corrupted-wolf", count: 3 },
  reward: { xp: 80, gold: 40 },
};
