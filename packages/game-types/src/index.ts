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
}
