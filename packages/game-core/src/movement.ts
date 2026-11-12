// Character movement rules: walking, sprinting with stamina, jumping, gravity.
// Pure functions. The renderer resolves collisions and reports back `grounded`.

export interface MovementConfig {
  /** Metres per second. */
  walkSpeed: number;
  sprintSpeed: number;
  /** Initial upward speed of a jump, metres per second. */
  jumpSpeed: number;
  /** Downward acceleration, metres per second squared. */
  gravity: number;
  /** Fastest allowed fall, metres per second. */
  maxFallSpeed: number;
  /** Small downward speed applied on the ground so collisions keep contact. */
  groundStickSpeed: number;
  staminaMax: number;
  sprintStaminaPerSecond: number;
  staminaRegenPerSecond: number;
  /** Stamina needed to start sprinting (not to keep sprinting). */
  sprintMinStamina: number;
}

export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  walkSpeed: 4.5,
  sprintSpeed: 7.5,
  jumpSpeed: 7,
  gravity: 20,
  maxFallSpeed: 40,
  groundStickSpeed: 2,
  staminaMax: 100,
  sprintStaminaPerSecond: 18,
  staminaRegenPerSecond: 12,
  sprintMinStamina: 10,
};

/** What the player is asking for this frame. Axes are in the range -1..1. */
export interface MoveIntent {
  forward: number;
  right: number;
  sprint: boolean;
  jump: boolean;
}

/** Horizontal direction on the ground plane (Y is up). */
export interface PlanarVector {
  x: number;
  z: number;
}

export interface MovementState {
  verticalVelocity: number;
  grounded: boolean;
  stamina: number;
  sprinting: boolean;
}

export interface MovementStep {
  state: MovementState;
  /** Desired displacement this frame, before collision resolution. */
  displacement: { x: number; y: number; z: number };
  moving: boolean;
}

export function createMovementState(
  config: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
): MovementState {
  return {
    verticalVelocity: 0,
    grounded: false,
    stamina: config.staminaMax,
    sprinting: false,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Advance movement by `dt` seconds.
 *
 * `viewForward` is the horizontal direction "forward" maps to (normally the
 * camera's facing). "Right" is derived for a left-handed, Y-up world.
 */
export function stepMovement(
  state: MovementState,
  intent: MoveIntent,
  viewForward: PlanarVector,
  dt: number,
  config: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
): MovementStep {
  const forwardLength = Math.hypot(viewForward.x, viewForward.z);
  const fx = forwardLength > 0 ? viewForward.x / forwardLength : 0;
  const fz = forwardLength > 0 ? viewForward.z / forwardLength : 1;
  const rx = fz;
  const rz = -fx;

  const forward = clamp(intent.forward, -1, 1);
  const right = clamp(intent.right, -1, 1);
  let dirX = fx * forward + rx * right;
  let dirZ = fz * forward + rz * right;
  const dirLength = Math.hypot(dirX, dirZ);
  const moving = dirLength > 1e-6;
  if (dirLength > 1) {
    dirX /= dirLength;
    dirZ /= dirLength;
  }

  // Starting a sprint needs a reserve; an ongoing sprint runs until empty.
  const hasStamina = state.sprinting
    ? state.stamina > 0
    : state.stamina >= config.sprintMinStamina;
  const sprinting = intent.sprint && moving && hasStamina;
  const stamina = sprinting
    ? Math.max(0, state.stamina - config.sprintStaminaPerSecond * dt)
    : Math.min(
        config.staminaMax,
        state.stamina + config.staminaRegenPerSecond * dt,
      );

  const speed = sprinting ? config.sprintSpeed : config.walkSpeed;

  let verticalVelocity: number;
  let grounded = state.grounded;
  if (state.grounded) {
    if (intent.jump) {
      verticalVelocity = config.jumpSpeed;
      grounded = false;
    } else {
      verticalVelocity = -config.groundStickSpeed;
    }
  } else {
    verticalVelocity = Math.max(
      -config.maxFallSpeed,
      state.verticalVelocity - config.gravity * dt,
    );
  }

  return {
    state: { verticalVelocity, grounded, stamina, sprinting },
    displacement: {
      x: dirX * speed * dt,
      y: verticalVelocity * dt,
      z: dirZ * speed * dt,
    },
    moving,
  };
}
