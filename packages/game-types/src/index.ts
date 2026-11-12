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

export type QuestId = "cull-the-pack";

/** What a quest asks for. Only "defeat N of an enemy" exists so far. */
export interface DefeatObjective {
  kind: "defeat";
  enemyId: EnemyId;
  count: number;
}

export interface QuestDefinition {
  id: QuestId;
  name: string;
  description: string;
  objective: DefeatObjective;
  /** Granted once, when the objective is met. */
  reward: Reward;
}

/** A position on the ground plane. +Z is north, +X is east. */
export interface WorldPoint {
  x: number;
  z: number;
}

export type RegionKind = "village" | "spawn-zone";

/** A named circular area of the world. */
export interface WorldRegion {
  id: string;
  name: string;
  kind: RegionKind;
  center: WorldPoint;
  radius: number;
  /** Enemies do not pursue or attack the player inside a safe region. */
  safe: boolean;
}

/** A region that is home to a pack of enemies. */
export interface SpawnZone extends WorldRegion {
  kind: "spawn-zone";
  enemyId: EnemyId;
  enemyCount: number;
}

export type MapMarkerKind = "settlement" | "gate" | "danger" | "landmark";

export interface MapMarker {
  id: string;
  label: string;
  kind: MapMarkerKind;
  position: WorldPoint;
}

/** A straight stretch of road or trail. */
export interface RoadSegment {
  from: WorldPoint;
  to: WorldPoint;
  width: number;
}

export type NpcId =
  | "elder-maren"
  | "smith-brannoc"
  | "guard-tolan"
  | "herbalist-ysolde";

/** What an NPC says about a quest at each stage of it. */
export interface NpcQuestDialogue {
  questId: QuestId;
  /** Spoken while the quest has not been accepted. */
  offer: readonly string[];
  /** Spoken while the objective is in progress. */
  active: readonly string[];
  /** Spoken when the objective is met and the reward can be claimed. */
  ready: readonly string[];
  /** Spoken after the quest has been turned in. */
  completed: readonly string[];
}

export interface NpcDefinition {
  id: NpcId;
  name: string;
  title: string;
  position: WorldPoint;
  /** Direction the NPC faces when idle, in radians (0 = north). */
  facing: number;
  /** Robe colour as RGB in the range 0..1. */
  robeColor: readonly [number, number, number];
  /** Spoken when the NPC has nothing quest-related to say. */
  greeting: readonly string[];
  quest?: NpcQuestDialogue;
}
