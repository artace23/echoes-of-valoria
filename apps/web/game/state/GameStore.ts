/** Game state the HUD renders. Replaced, never mutated, so React can compare by identity. */
export interface HudSnapshot {
  health: number;
  healthMax: number;
  stamina: number;
  staminaMax: number;
  sprinting: boolean;
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
