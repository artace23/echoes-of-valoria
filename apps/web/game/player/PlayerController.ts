import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  DEFAULT_COMBAT_CONFIG,
  DEFAULT_MOVEMENT_CONFIG,
  applyDamage,
  calculateDamage,
  combatMoveFactor,
  createCombatState,
  createMovementState,
  deriveStats,
  isInvulnerable,
  isWithinArc,
  resolveIncomingDamage,
  stepCombat,
  stepMovement,
  type CombatActionKind,
  type CombatIntent,
  type CharacterStats,
  type CombatState,
  type DamageOutcome,
  type MoveIntent,
  type MovementConfig,
  type MovementState,
  type PlanarVector,
  type Strike,
} from "@valoria/game-core";

const HEIGHT = 1.8;
const RADIUS = 0.4;
const TURN_SHARPNESS = 14;
/** Fell out of the world: put the player back at the spawn point. */
const KILL_PLANE_Y = -20;
const RESPAWN_SECONDS = 3;
const HIT_FLASH_SECONDS = 0.18;
const SWORD_LENGTH = 1.1;

export interface PlayerOptions {
  spawnPoint: Vector3;
  /** Half-size of the square play area; the player is kept inside it. */
  worldHalfExtent: number;
}

/** A sword swing landing this frame, for the game loop to apply to targets. */
export interface PlayerStrike extends Strike {
  origin: PlanarVector;
  facing: PlanarVector;
}

/**
 * Placeholder Warrior: a capsule body with a visor and sword so facing is
 * readable. Movement and combat rules come from game-core; this class applies
 * them to the mesh, resolves collisions with Babylon's ellipsoid collision
 * system, and poses the placeholder sword.
 */
export class PlayerController {
  readonly body: Mesh;
  private characterStats: CharacterStats = deriveStats(1);
  private movementConfig: MovementConfig = DEFAULT_MOVEMENT_CONFIG;
  private currentHealth = this.characterStats.healthMax;
  private movement: MovementState = createMovementState();
  private combat: CombatState = createCombatState();
  private readonly displacement = new Vector3();
  private readonly dodgeDirection = { x: 0, z: 1 };
  private respawnTimer = 0;
  private hitFlash = 0;
  private readonly sword: Mesh;
  private readonly armor: StandardMaterial;

  constructor(
    scene: Scene,
    private readonly options: PlayerOptions,
  ) {
    const armor = new StandardMaterial("warrior-armor", scene);
    armor.diffuseColor = new Color3(0.42, 0.44, 0.5);
    armor.specularColor = new Color3(0.25, 0.25, 0.25);
    this.armor = armor;

    const gold = new StandardMaterial("warrior-trim", scene);
    gold.diffuseColor = new Color3(0.77, 0.63, 0.36);
    gold.specularColor = new Color3(0.3, 0.25, 0.15);

    const steel = new StandardMaterial("warrior-steel", scene);
    steel.diffuseColor = new Color3(0.75, 0.77, 0.8);

    this.body = CreateCapsule(
      "warrior",
      { height: HEIGHT, radius: RADIUS },
      scene,
    );
    this.body.material = armor;
    this.body.ellipsoid = new Vector3(RADIUS, HEIGHT / 2, RADIUS);
    this.body.position.copyFrom(options.spawnPoint);

    // Local +Z is the facing direction.
    const visor = CreateBox(
      "warrior-visor",
      { width: 0.5, height: 0.14, depth: 0.2 },
      scene,
    );
    visor.material = gold;
    visor.parent = this.body;
    visor.position.set(0, 0.5, RADIUS - 0.04);

    this.sword = CreateBox(
      "warrior-sword",
      { width: 0.07, height: SWORD_LENGTH, depth: 0.14 },
      scene,
    );
    this.sword.material = steel;
    this.sword.parent = this.body;
    // Rotate around the hilt rather than the middle of the blade.
    this.sword.setPivotPoint(new Vector3(0, -SWORD_LENGTH / 2, 0));
    this.poseSword();
  }

  get position(): Vector3 {
    return this.body.position;
  }

  get health(): number {
    return this.currentHealth;
  }

  get healthMax(): number {
    return this.characterStats.healthMax;
  }

  get stats(): Readonly<CharacterStats> {
    return this.characterStats;
  }

  /**
   * Replace the Warrior's stats, e.g. after a level-up. `restore` refills
   * health and stamina; otherwise current values are only capped to the new
   * maximums.
   */
  applyStats(stats: CharacterStats, restore: boolean): void {
    this.characterStats = stats;
    this.movementConfig = {
      ...DEFAULT_MOVEMENT_CONFIG,
      staminaMax: stats.staminaMax,
    };
    if (this.dead) return;
    this.currentHealth = restore
      ? stats.healthMax
      : Math.min(this.currentHealth, stats.healthMax);
    this.movement = {
      ...this.movement,
      stamina: restore
        ? stats.staminaMax
        : Math.min(this.movement.stamina, stats.staminaMax),
    };
  }

  get dead(): boolean {
    return this.currentHealth <= 0;
  }

  /** Seconds until respawn while dead, otherwise 0. */
  get respawnIn(): number {
    return this.dead ? this.respawnTimer : 0;
  }

  get stamina(): number {
    return this.movement.stamina;
  }

  get staminaMax(): number {
    return this.movementConfig.staminaMax;
  }

  get sprinting(): boolean {
    return this.movement.sprinting;
  }

  get blocking(): boolean {
    return this.combat.blocking;
  }

  get action(): CombatActionKind | null {
    return this.combat.action?.kind ?? null;
  }

  get cooldowns(): Readonly<Record<CombatActionKind, number>> {
    return this.combat.cooldowns;
  }

  /** Horizontal direction the Warrior is facing. */
  get facing(): PlanarVector {
    return {
      x: Math.sin(this.body.rotation.y),
      z: Math.cos(this.body.rotation.y),
    };
  }

  get meshes(): Mesh[] {
    return [this.body, ...(this.body.getChildMeshes() as Mesh[])];
  }

  /**
   * Advance the player one frame. Returns a strike on the frame a sword
   * attack lands, so the caller can apply it to whatever is in reach.
   */
  update(
    intent: MoveIntent,
    combatIntent: CombatIntent,
    viewForward: PlanarVector,
    dt: number,
  ): PlayerStrike | null {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.armor.emissiveColor.set(this.hitFlash > 0 ? 0.6 : 0, 0, 0);

    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return null;
    }

    const body = this.body;
    const combatStep = stepCombat(
      this.combat,
      combatIntent,
      this.movement.stamina,
      dt,
    );
    this.combat = combatStep.state;
    if (combatStep.staminaSpent > 0) {
      this.movement = {
        ...this.movement,
        stamina: this.movement.stamina - combatStep.staminaSpent,
      };
    }

    const viewYaw = Math.atan2(viewForward.x, viewForward.z);
    if (combatStep.started === "dodge") {
      this.setDodgeDirection(intent, viewForward);
    } else if (combatStep.started) {
      // Attacks commit toward where the camera is looking.
      body.rotation.y = viewYaw;
    }

    // Combat slows or locks normal movement; sprint and jump need free hands.
    const factor = combatMoveFactor(this.combat);
    const free = factor === 1;
    const step = stepMovement(
      this.movement,
      {
        forward: intent.forward * factor,
        right: intent.right * factor,
        sprint: intent.sprint && free,
        jump: intent.jump && free,
      },
      viewForward,
      dt,
      this.movementConfig,
    );
    const wanted = step.displacement;
    if (this.combat.action?.kind === "dodge") {
      const speed =
        DEFAULT_COMBAT_CONFIG.dodge.distance /
        DEFAULT_COMBAT_CONFIG.dodge.duration;
      wanted.x += this.dodgeDirection.x * speed * dt;
      wanted.z += this.dodgeDirection.z * speed * dt;
    }

    const startY = body.position.y;
    this.displacement.set(wanted.x, wanted.y, wanted.z);
    body.moveWithCollisions(this.displacement);
    const movedY = body.position.y - startY;

    // Collision resolution tells us about the ground and ceilings.
    const next = step.state;
    if (wanted.y < 0) {
      next.grounded = movedY > wanted.y * 0.5;
    } else if (wanted.y > 0 && movedY < wanted.y * 0.5) {
      next.verticalVelocity = 0;
    }
    this.movement = next;

    const limit = this.options.worldHalfExtent;
    body.position.x = Math.min(limit, Math.max(-limit, body.position.x));
    body.position.z = Math.min(limit, Math.max(-limit, body.position.z));
    if (body.position.y < KILL_PLANE_Y) this.respawn();

    // Facing: guard toward the camera, otherwise turn toward movement.
    // Attacks and dodges keep the facing they started with.
    const turnRate = 1 - Math.exp(-TURN_SHARPNESS * dt);
    if (this.combat.blocking) {
      body.rotation.y += shortestAngle(body.rotation.y, viewYaw) * turnRate;
    } else if (!this.combat.action && step.moving) {
      const targetYaw = Math.atan2(wanted.x, wanted.z);
      body.rotation.y += shortestAngle(body.rotation.y, targetYaw) * turnRate;
    }

    this.poseSword();

    if (!combatStep.strike) return null;
    return {
      ...combatStep.strike,
      damage: combatStep.strike.damage + this.characterStats.attackPower,
      origin: { x: body.position.x, z: body.position.z },
      facing: this.facing,
    };
  }

  /**
   * Apply an incoming attack. The Warrior's dodge and block decide whether it
   * lands; returns what happened so the attacker can react.
   */
  receiveAttack(damage: number, attacker: PlanarVector): DamageOutcome {
    if (this.dead) return "dodged";
    const origin = { x: this.body.position.x, z: this.body.position.z };
    const mitigated = calculateDamage(damage, this.characterStats.defense);
    const result = resolveIncomingDamage(mitigated, {
      blocking: this.combat.blocking,
      invulnerable: isInvulnerable(this.combat),
      facingAttacker: isWithinArc(
        origin,
        this.facing,
        attacker,
        0,
        Number.POSITIVE_INFINITY,
        DEFAULT_COMBAT_CONFIG.block.arcDegrees,
      ),
      stamina: this.movement.stamina,
    });

    if (result.staminaCost > 0) {
      this.movement = {
        ...this.movement,
        stamina: Math.max(0, this.movement.stamina - result.staminaCost),
      };
    }
    if (result.damage > 0) {
      this.currentHealth = applyDamage(this.currentHealth, result.damage);
      this.hitFlash = HIT_FLASH_SECONDS;
      if (this.dead) this.die();
    }
    return result.outcome;
  }

  private setDodgeDirection(intent: MoveIntent, viewForward: PlanarVector) {
    const length = Math.hypot(viewForward.x, viewForward.z) || 1;
    const fx = viewForward.x / length;
    const fz = viewForward.z / length;
    let x = fx * intent.forward + fz * intent.right;
    let z = fz * intent.forward - fx * intent.right;
    const magnitude = Math.hypot(x, z);
    if (magnitude > 1e-6) {
      x /= magnitude;
      z /= magnitude;
    } else {
      // No direction held: hop backwards, away from where we are facing.
      const facing = this.facing;
      x = -facing.x;
      z = -facing.z;
    }
    this.dodgeDirection.x = x;
    this.dodgeDirection.z = z;
  }

  /** Placeholder animation: pose the sword from the current combat state. */
  private poseSword(): void {
    const sword = this.sword;
    const action = this.combat.action;
    if (action && action.kind !== "dodge") {
      const attack = DEFAULT_COMBAT_CONFIG[action.kind];
      const raised = action.kind === "heavy" ? -1.9 : -1.1;
      let angle: number;
      if (action.elapsed < attack.windup) {
        angle = lerp(0.5, raised, action.elapsed / attack.windup);
      } else {
        const swing = Math.min(1, (action.elapsed - attack.windup) / 0.12);
        angle = lerp(raised, 1.7, swing);
      }
      sword.position.set(RADIUS + 0.05, 0.1, 0.25);
      sword.rotation.set(angle, 0, 0);
    } else if (this.combat.blocking) {
      // Held across the body, in front.
      sword.position.set(-0.45, 0.15, RADIUS + 0.3);
      sword.rotation.set(0, 0, -Math.PI / 2);
    } else {
      sword.position.set(RADIUS + 0.12, -0.05, 0.2);
      sword.rotation.set(0.5, 0, 0);
    }
    this.body.scaling.y = this.dead ? 0.35 : action?.kind === "dodge" ? 0.8 : 1;
  }

  private die(): void {
    this.respawnTimer = RESPAWN_SECONDS;
    this.combat = createCombatState();
    this.movement = { ...this.movement, sprinting: false };
    // Collapse the placeholder body onto the ground.
    this.body.position.y -= (HEIGHT / 2) * 0.65;
    this.poseSword();
  }

  private respawn(): void {
    this.currentHealth = this.characterStats.healthMax;
    this.respawnTimer = 0;
    this.combat = createCombatState();
    this.movement = createMovementState(this.movementConfig);
    this.body.position.copyFrom(this.options.spawnPoint);
    this.poseSword();
  }
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, t));
}

function shortestAngle(from: number, to: number): number {
  const full = Math.PI * 2;
  return ((((to - from + Math.PI) % full) + full) % full) - Math.PI;
}
