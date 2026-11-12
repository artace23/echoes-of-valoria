// Enemy behaviour: idle, patrol, chase, attack. A pure state machine; the
// renderer moves the model, resolves collisions, and applies the attack.

import type { PlanarVector } from "./movement";

export type EnemyAiPhase = "idle" | "patrol" | "chase" | "attack" | "dead";

export interface EnemyAiConfig {
  /** The enemy notices a living player within this distance. */
  detectRange: number;
  /** A chase is abandoned when the player gets this far away. */
  loseRange: number;
  /** A chase is abandoned when the enemy is this far from its home. */
  leashRange: number;
  /** Distance to the player at which the enemy stops and attacks. */
  attackRange: number;
  /** The attack connects if the player is still within this distance. */
  attackReach: number;
  attackDamage: number;
  /** Seconds between starting an attack and it landing. */
  attackWindup: number;
  /** Seconds the enemy is committed after the attack lands. */
  attackRecover: number;
  /** Metres per second. */
  patrolSpeed: number;
  chaseSpeed: number;
  /** Patrol destinations are picked within this distance of home. */
  patrolRadius: number;
  /** Seconds spent idle between patrols. */
  idleMin: number;
  idleMax: number;
  /** Seconds before a patrol leg is given up (e.g. blocked by scenery). */
  patrolTimeout: number;
  /** A patrol destination counts as reached within this distance. */
  arriveDistance: number;
}

export const DEFAULT_ENEMY_AI_CONFIG: EnemyAiConfig = {
  detectRange: 9,
  loseRange: 15,
  leashRange: 20,
  attackRange: 1.9,
  attackReach: 2.5,
  attackDamage: 9,
  attackWindup: 0.45,
  attackRecover: 0.9,
  patrolSpeed: 1.6,
  chaseSpeed: 5.6,
  patrolRadius: 4,
  idleMin: 1.5,
  idleMax: 3.5,
  patrolTimeout: 6,
  arriveDistance: 0.4,
};

export interface EnemyAiState {
  phase: EnemyAiPhase;
  /** idle/patrol: seconds remaining. attack: seconds elapsed. */
  timer: number;
  /** Where a patrol is heading. */
  destination: PlanarVector | null;
  /** True once the current attack has landed. */
  struck: boolean;
}

export interface EnemyAiInput {
  position: PlanarVector;
  home: PlanarVector;
  playerPosition: PlanarVector;
  playerAlive: boolean;
}

export interface EnemyAiStep {
  state: EnemyAiState;
  /** Desired horizontal velocity in metres per second. */
  velocity: PlanarVector;
  /** Direction the enemy wants to face, if it has a preference. */
  facing: PlanarVector | null;
  /** Emitted on the single step in which an attack lands. */
  attack: { damage: number; reach: number } | null;
}

export function createEnemyAiState(initialIdle = 1): EnemyAiState {
  return { phase: "idle", timer: initialIdle, destination: null, struck: false };
}

const ZERO: PlanarVector = { x: 0, z: 0 };

function distance(a: PlanarVector, b: PlanarVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function directionTo(from: PlanarVector, to: PlanarVector): PlanarVector | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  return length > 1e-6 ? { x: dx / length, z: dz / length } : null;
}

function scale(direction: PlanarVector | null, speed: number): PlanarVector {
  return direction ? { x: direction.x * speed, z: direction.z * speed } : ZERO;
}

/**
 * Advance the enemy by `dt` seconds. `rng` returns a number in [0, 1) and is
 * used for idle durations and patrol destinations.
 */
export function stepEnemyAi(
  state: EnemyAiState,
  input: EnemyAiInput,
  dt: number,
  rng: () => number,
  config: EnemyAiConfig = DEFAULT_ENEMY_AI_CONFIG,
): EnemyAiStep {
  if (state.phase === "dead") {
    return { state, velocity: ZERO, facing: null, attack: null };
  }

  const toPlayer = distance(input.position, input.playerPosition);
  const fromHome = distance(input.position, input.home);
  const idle = (): EnemyAiState => ({
    phase: "idle",
    timer: config.idleMin + rng() * (config.idleMax - config.idleMin),
    destination: null,
    struck: false,
  });
  const chase = (): EnemyAiState => ({
    phase: "chase",
    timer: 0,
    destination: null,
    struck: false,
  });
  const walkTo = (destination: PlanarVector): EnemyAiState => ({
    phase: "patrol",
    timer: config.patrolTimeout,
    destination,
    struck: false,
  });

  // Noticing the player interrupts idling and patrolling. An enemy that has
  // wandered past its leash must come back before it can be provoked again.
  const canNotice =
    input.playerAlive &&
    toPlayer <= config.detectRange &&
    fromHome < config.leashRange;

  switch (state.phase) {
    case "idle": {
      if (canNotice) {
        return stepEnemyAi(chase(), input, dt, rng, config);
      }
      const timer = state.timer - dt;
      if (timer > 0) {
        return {
          state: { ...state, timer },
          velocity: ZERO,
          facing: null,
          attack: null,
        };
      }
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * config.patrolRadius;
      const next = walkTo({
        x: input.home.x + Math.cos(angle) * radius,
        z: input.home.z + Math.sin(angle) * radius,
      });
      return { state: next, velocity: ZERO, facing: null, attack: null };
    }

    case "patrol": {
      if (canNotice) {
        return stepEnemyAi(chase(), input, dt, rng, config);
      }
      const destination = state.destination ?? input.home;
      const timer = state.timer - dt;
      if (
        timer <= 0 ||
        distance(input.position, destination) <= config.arriveDistance
      ) {
        return { state: idle(), velocity: ZERO, facing: null, attack: null };
      }
      const heading = directionTo(input.position, destination);
      return {
        state: { ...state, timer },
        velocity: scale(heading, config.patrolSpeed),
        facing: heading,
        attack: null,
      };
    }

    case "chase": {
      const lost =
        !input.playerAlive ||
        toPlayer > config.loseRange ||
        fromHome > config.leashRange;
      if (lost) {
        return {
          state: walkTo(input.home),
          velocity: ZERO,
          facing: null,
          attack: null,
        };
      }
      const heading = directionTo(input.position, input.playerPosition);
      if (toPlayer <= config.attackRange) {
        return {
          state: { phase: "attack", timer: 0, destination: null, struck: false },
          velocity: ZERO,
          facing: heading,
          attack: null,
        };
      }
      return {
        state,
        velocity: scale(heading, config.chaseSpeed),
        facing: heading,
        attack: null,
      };
    }

    case "attack": {
      const elapsed = state.timer + dt;
      let struck = state.struck;
      let attack: EnemyAiStep["attack"] = null;
      if (!struck && elapsed >= config.attackWindup) {
        struck = true;
        attack = { damage: config.attackDamage, reach: config.attackReach };
      }
      const finished = elapsed >= config.attackWindup + config.attackRecover;
      return {
        state: finished ? chase() : { ...state, timer: elapsed, struck },
        velocity: ZERO,
        // Track the player only until the bite is committed.
        facing: struck ? null : directionTo(input.position, input.playerPosition),
        attack,
      };
    }
  }
}
