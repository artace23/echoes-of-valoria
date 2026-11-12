import type { Inventory, QuestStatus } from "@valoria/game-core";
import type { ItemId } from "@valoria/game-types";

/** The conversation currently open, if any. Immutable. */
export interface DialogueSnapshot {
  npcName: string;
  npcTitle: string;
  lines: readonly string[];
  /** Label of the action offered after the last line, if there is one. */
  actionLabel: string | null;
}

/**
 * Game state the HUD renders. Every field is a primitive or an immutable
 * object, and the snapshot is replaced rather than mutated, so changes can
 * be detected field by field with a reference comparison.
 */
export interface HudSnapshot {
  health: number;
  healthMax: number;
  stamina: number;
  staminaMax: number;
  sprinting: boolean;
  blocking: boolean;
  dead: boolean;
  /** Whole seconds until respawn while dead, otherwise 0. */
  respawnIn: number;
  /** Seconds of cooldown remaining, to one decimal place. */
  cooldownLight: number;
  cooldownHeavy: number;
  cooldownDodge: number;
  level: number;
  /** XP earned toward the next level. */
  xp: number;
  /** XP needed for the next level; 0 at the level cap. */
  xpToNext: number;
  gold: number;
  attackPower: number;
  defense: number;
  /** Immutable: replaced whenever its contents change. */
  inventory: Inventory;
  /** The equipped weapon, if any. */
  weaponId: ItemId | null;
  potionCount: number;
  questStatus: QuestStatus;
  /** Progress toward the quest's objective. */
  questCount: number;
  /** Name of the region the player is in. */
  locationName: string;
  /** True inside a safe zone, where enemies will not follow. */
  inSafeZone: boolean;
  /** What the interact key would do right now, or null. */
  interactPrompt: string | null;
  dialogue: DialogueSnapshot | null;
  /** Player position in whole metres, and heading in radians (0 = north). */
  playerX: number;
  playerZ: number;
  playerHeading: number;
  soundOn: boolean;
  /** Local time of the last successful save, or null if none yet. */
  savedAt: string | null;
  /** False when the browser will not let the game store anything. */
  saveAvailable: boolean;
  /** Short-lived message such as a reward, or null. */
  notice: string | null;
  /** The enemy currently targeted, if any. */
  targetName: string | null;
  targetHealth: number;
  targetHealthMax: number;
  pointerLocked: boolean;
}

/**
 * Bridge from the game loop to React (via useSyncExternalStore).
 * The game pushes snapshots; listeners fire only when a value changed.
 */
export class GameStore {
  private snapshot: HudSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(initial: HudSnapshot) {
    this.snapshot = initial;
  }

  readonly getSnapshot = (): HudSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(next: HudSnapshot): void {
    const current = this.snapshot;
    const changed = (Object.keys(next) as (keyof HudSnapshot)[]).some(
      (key) => current[key] !== next[key],
    );
    if (!changed) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
