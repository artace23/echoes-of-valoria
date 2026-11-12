// Shared domain types. No runtime code and no platform imports.

export type CharacterClassId = "warrior";

export interface CharacterClassDefinition {
  id: CharacterClassId;
  name: string;
  description: string;
}

export type LocationId = "ashen-village" | "whispering-forest";

export type LocationKind = "settlement" | "wilderness";

export interface LocationDefinition {
  id: LocationId;
  name: string;
  kind: LocationKind;
  description: string;
  /** Minimum character level needed to enter. */
  requiredLevel: number;
}

export type EnemyId = "corrupted-wolf";

/** What defeating an enemy can yield. Gold is rolled between the bounds. */
export interface RewardTable {
  xp: number;
  goldMin: number;
  goldMax: number;
}

/** A concrete reward, after rolling a RewardTable. */
export interface Reward {
  xp: number;
  gold: number;
}

export interface EnemyDefinition {
  id: EnemyId;
  name: string;
  healthMax: number;
  /** Reduces incoming damage; see calculateDamage in game-core. */
  defense: number;
  attackDamage: number;
  reward: RewardTable;
  /** Items that may be left behind on death, each rolled independently. */
  drops: readonly ItemDrop[];
}

export type ItemId = "health-potion" | "rusty-sword" | "iron-sword";

interface ItemBase {
  id: ItemId;
  name: string;
  description: string;
  /** Stackable items share one inventory slot. */
  stackable: boolean;
}

export interface ConsumableItem extends ItemBase {
  kind: "consumable";
  /** Health restored when used. */
  healAmount: number;
}

export interface WeaponItem extends ItemBase {
  kind: "weapon";
  /** Added to the wielder's attack power while equipped. */
  attackPower: number;
}

export type ItemDefinition = ConsumableItem | WeaponItem;

export interface ItemDrop {
  itemId: ItemId;
  /** Probability from 0 to 1. */
  chance: number;
}
