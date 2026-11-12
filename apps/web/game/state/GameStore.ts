/**
 * Game state the HUD renders. Flat primitives only, and replaced rather than
 * mutated, so changes can be detected field by field.
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
