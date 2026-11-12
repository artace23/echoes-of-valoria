// Combat rules: attacks, dodge, block, cooldowns, and damage resolution.
// Pure functions. The renderer decides who is in range and plays animations.

import type { PlanarVector } from "./movement";

export type AttackKind = "light" | "heavy";
export type CombatActionKind = AttackKind | "dodge";

export interface AttackConfig {
  /** Damage before the target's defense is applied. */
  damage: number;
  staminaCost: number;
  /** Seconds from the start of the action until the strike lands. */
  windup: number;
  /** Total seconds the action locks the character. */
  duration: number;
  /** Seconds, counted from the start of the action, before it can be reused. */
  cooldown: number;
  /** Reach in metres from the attacker's centre. */
  range: number;
  /** Width of the swing, centred on the attacker's facing. */
  arcDegrees: number;
  /** Movement speed multiplier while the action is running. */
  moveFactor: number;
}

export interface CombatConfig {
  light: AttackConfig;
  heavy: AttackConfig;
  dodge: {
    staminaCost: number;
    duration: number;
    /** Seconds at the start of the dodge during which hits miss. */
    invulnerableFor: number;
    cooldown: number;
    /** Metres travelled over the whole dodge. */
    distance: number;
  };
  block: {
    /** Fraction of damage removed by a successful block (0..1). */
    damageReduction: number;
    /** Stamina spent per point of incoming damage blocked. */
    staminaPerDamage: number;
    moveFactor: number;
    /** Attacks from outside this frontal arc cannot be blocked. */
    arcDegrees: number;
  };
}

export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  light: {
    damage: 12,
    staminaCost: 8,
    windup: 0.15,
    duration: 0.4,
    cooldown: 0.55,
    range: 2.3,
    arcDegrees: 110,
    moveFactor: 0.4,
  },
  heavy: {
    damage: 30,
    staminaCost: 25,
    windup: 0.5,
    duration: 0.9,
    cooldown: 2.5,
    range: 2.7,
    arcDegrees: 130,
    moveFactor: 0.15,
  },
  dodge: {
    staminaCost: 20,
    duration: 0.4,
    invulnerableFor: 0.3,
    cooldown: 1,
    distance: 4.2,
  },
  block: {
    damageReduction: 0.75,
    staminaPerDamage: 0.6,
    moveFactor: 0.45,
    arcDegrees: 180,
  },
};

/** What the player is asking for this frame. */
export interface CombatIntent {
  light: boolean;
  heavy: boolean;
  dodge: boolean;
  block: boolean;
}

export interface ActiveAction {
  kind: CombatActionKind;
  elapsed: number;
  /** True once an attack's strike has been emitted. */
  struck: boolean;
}

export interface CombatState {
  action: ActiveAction | null;
  /** Seconds remaining before each action can be used again. */
  cooldowns: Record<CombatActionKind, number>;
  blocking: boolean;
}

export interface Strike {
  kind: AttackKind;
  damage: number;
  range: number;
  arcDegrees: number;
}

export interface CombatStep {
  state: CombatState;
  /** Stamina consumed by an action started this step. */
  staminaSpent: number;
  /** The action that began this step, if any. */
  started: CombatActionKind | null;
  /** Emitted on the single step in which an attack lands. */
  strike: Strike | null;
}

export function createCombatState(): CombatState {
  return {
    action: null,
    cooldowns: { light: 0, heavy: 0, dodge: 0 },
    blocking: false,
  };
}

function actionDuration(kind: CombatActionKind, config: CombatConfig): number {
  return config[kind].duration;
}

/**
 * Advance combat by `dt` seconds. Starting an action needs it off cooldown,
 * no other action running, and enough stamina. Dodge takes priority over
 * heavy, heavy over light. Blocking is only possible while no action runs.
 */
export function stepCombat(
  state: CombatState,
  intent: CombatIntent,
  stamina: number,
  dt: number,
  config: CombatConfig = DEFAULT_COMBAT_CONFIG,
): CombatStep {
  const cooldowns = {
    light: Math.max(0, state.cooldowns.light - dt),
    heavy: Math.max(0, state.cooldowns.heavy - dt),
    dodge: Math.max(0, state.cooldowns.dodge - dt),
  };

  let action = state.action;
  let strike: Strike | null = null;
  let started: CombatActionKind | null = null;
  let staminaSpent = 0;

  if (action) {
    const elapsed = action.elapsed + dt;
    let struck = action.struck;
    if (action.kind !== "dodge" && !struck) {
      const attack = config[action.kind];
      if (elapsed >= attack.windup) {
        struck = true;
        strike = {
          kind: action.kind,
          damage: attack.damage,
          range: attack.range,
          arcDegrees: attack.arcDegrees,
        };
      }
    }
    action =
      elapsed >= actionDuration(action.kind, config)
        ? null
        : { kind: action.kind, elapsed, struck };
  } else {
    const wanted: CombatActionKind[] = [];
    if (intent.dodge) wanted.push("dodge");
    if (intent.heavy) wanted.push("heavy");
    if (intent.light) wanted.push("light");
    for (const kind of wanted) {
      const cost = config[kind].staminaCost;
      if (cooldowns[kind] > 0 || stamina < cost) continue;
      action = { kind, elapsed: 0, struck: false };
      cooldowns[kind] = config[kind].cooldown;
      staminaSpent = cost;
      started = kind;
      break;
    }
  }

  return {
    state: { action, cooldowns, blocking: intent.block && action === null },
    staminaSpent,
    started,
    strike,
  };
}

/** True during the protected opening of a dodge. */
export function isInvulnerable(
  state: CombatState,
  config: CombatConfig = DEFAULT_COMBAT_CONFIG,
): boolean {
  return (
    state.action?.kind === "dodge" &&
    state.action.elapsed < config.dodge.invulnerableFor
  );
}

/** Movement speed multiplier implied by the current combat state. */
export function combatMoveFactor(
  state: CombatState,
  config: CombatConfig = DEFAULT_COMBAT_CONFIG,
): number {
  if (state.action) {
    return state.action.kind === "dodge" ? 0 : config[state.action.kind].moveFactor;
  }
  return state.blocking ? config.block.moveFactor : 1;
}

/** Damage after the target's defense. A landed hit always deals at least 1. */
export function calculateDamage(baseDamage: number, defense: number): number {
  const mitigated = baseDamage * (100 / (100 + Math.max(0, defense)));
  return Math.max(1, Math.round(mitigated));
}

export type DamageOutcome = "hit" | "blocked" | "dodged";

export interface IncomingDamageResult {
  outcome: DamageOutcome;
  damage: number;
  staminaCost: number;
}

/**
 * Resolve an attack against a defender. Dodging avoids it entirely. Blocking
 * needs the attacker in front and enough stamina to absorb the blow;
 * otherwise the guard fails and the hit lands in full.
 */
export function resolveIncomingDamage(
  damage: number,
  defender: {
    blocking: boolean;
    invulnerable: boolean;
    /** Whether the attacker is inside the defender's block arc. */
    facingAttacker: boolean;
    stamina: number;
  },
  config: CombatConfig = DEFAULT_COMBAT_CONFIG,
): IncomingDamageResult {
  if (defender.invulnerable) {
    return { outcome: "dodged", damage: 0, staminaCost: 0 };
  }
  if (defender.blocking && defender.facingAttacker) {
    const staminaCost = damage * config.block.staminaPerDamage;
    if (defender.stamina >= staminaCost) {
      const reduced = Math.round(damage * (1 - config.block.damageReduction));
      return { outcome: "blocked", damage: reduced, staminaCost };
    }
  }
  return { outcome: "hit", damage, staminaCost: 0 };
}

/** Health after taking damage, never below zero. */
export function applyDamage(health: number, damage: number): number {
  return Math.max(0, health - Math.max(0, damage));
}

/**
 * Whether a target is inside a frontal arc: within `range` of the origin
 * (measured to the target's edge) and within `arcDegrees` centred on `facing`.
 */
export function isWithinArc(
  origin: PlanarVector,
  facing: PlanarVector,
  target: PlanarVector,
  targetRadius: number,
  range: number,
  arcDegrees: number,
): boolean {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dz);
  if (distance - targetRadius > range) return false;
  if (distance <= targetRadius) return true;

  const facingLength = Math.hypot(facing.x, facing.z);
  if (facingLength === 0) return false;
  const cosAngle =
    (dx * facing.x + dz * facing.z) / (distance * facingLength);
  return cosAngle >= Math.cos((arcDegrees / 2) * (Math.PI / 180));
}
