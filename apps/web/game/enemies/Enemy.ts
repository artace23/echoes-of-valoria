import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { DamageOutcome, PlanarVector } from "@valoria/game-core";

/** What an enemy needs to know about, and do to, the player. */
export interface Opponent {
  readonly position: { x: number; z: number };
  readonly dead: boolean;
  /** True inside a safe zone: enemies must not pursue or attack. */
  readonly sheltered: boolean;
  receiveAttack(damage: number, attacker: PlanarVector): DamageOutcome;
}

/** Anything the player can target and strike. */
export interface Enemy {
  readonly name: string;
  readonly health: number;
  readonly healthMax: number;
  /** Body radius used for hit detection. */
  readonly radius: number;
  readonly position: PlanarVector;
  /** False while dead or destroyed; such enemies cannot be hit or targeted. */
  readonly alive: boolean;
  readonly meshes: Mesh[];
  /** Apply a sword hit. Returns the damage dealt after defense. */
  receiveStrike(baseDamage: number): number;
  update(dt: number, opponent: Opponent): void;
}
