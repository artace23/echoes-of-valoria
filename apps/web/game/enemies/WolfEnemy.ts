import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  DEFAULT_ENEMY_AI_CONFIG,
  applyDamage,
  calculateDamage,
  createEnemyAiState,
  rollReward,
  stepEnemyAi,
  type EnemyAiConfig,
  type EnemyAiPhase,
  type EnemyAiState,
  type PlanarVector,
} from "@valoria/game-core";
import type { EnemyDefinition, Reward } from "@valoria/game-types";
import type { Enemy, Opponent } from "./Enemy";

const BODY_CENTER_Y = 0.56;
const HIT_RADIUS = 0.6;
const TURN_SHARPNESS = 10;
const HIT_FLASH_SECONDS = 0.12;
/** The body stays on the ground this long after death. */
const CORPSE_SECONDS = 4;
/** A new wolf appears at the home point this long after death. */
const RESPAWN_SECONDS = 25;
/** Health recovered per second once the wolf has given up the fight. */
const OUT_OF_COMBAT_REGEN = 8;

export interface WolfOptions {
  definition: EnemyDefinition;
  home: PlanarVector;
  /** Called once when the wolf dies, with the reward it dropped. */
  onDeath: (reward: Reward, wolf: WolfEnemy) => void;
  /** Random source in [0, 1). Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Placeholder wolf built from boxes. Behaviour comes from the game-core AI
 * state machine; this class moves the model with collisions, plays simple
 * placeholder animation, and exchanges damage with the player.
 */
export class WolfEnemy implements Enemy {
  readonly name: string;
  readonly healthMax: number;
  readonly radius = HIT_RADIUS;
  readonly body: Mesh;
  private currentHealth: number;
  private ai: EnemyAiState;
  private readonly aiConfig: EnemyAiConfig;
  private readonly rng: () => number;
  private readonly legs: Mesh[] = [];
  private readonly fur: StandardMaterial;
  private readonly displacement = new Vector3();
  private stride = 0;
  private hitFlash = 0;
  private deadFor = 0;

  constructor(
    scene: Scene,
    private readonly options: WolfOptions,
  ) {
    const { definition, home } = options;
    this.name = definition.name;
    this.healthMax = definition.healthMax;
    this.currentHealth = definition.healthMax;
    this.rng = options.rng ?? Math.random;
    this.aiConfig = {
      ...DEFAULT_ENEMY_AI_CONFIG,
      attackDamage: definition.attackDamage,
    };
    // Stagger the first patrol so a pack does not move in lockstep.
    this.ai = createEnemyAiState(0.5 + this.rng() * 2.5);

    this.fur = new StandardMaterial("wolf-fur", scene);
    this.fur.diffuseColor = new Color3(0.2, 0.17, 0.25);
    this.fur.specularColor = Color3.Black();

    const eyeGlow = new StandardMaterial("wolf-eyes", scene);
    eyeGlow.diffuseColor = Color3.Black();
    eyeGlow.emissiveColor = new Color3(0.9, 0.12, 0.15);

    // Local +Z is the facing direction. The torso is also the collider.
    this.body = CreateBox(
      "wolf",
      { width: 0.5, height: 0.45, depth: 1.3 },
      scene,
    );
    this.body.material = this.fur;
    this.body.ellipsoid = new Vector3(0.5, BODY_CENTER_Y, 0.5);
    this.body.position.set(home.x, BODY_CENTER_Y + 0.05, home.z);
    this.body.rotation.y = this.rng() * Math.PI * 2;
    this.body.checkCollisions = true;

    const part = (
      name: string,
      size: [number, number, number],
      at: [number, number, number],
      material: StandardMaterial = this.fur,
    ): Mesh => {
      const mesh = CreateBox(
        `wolf-${name}`,
        { width: size[0], height: size[1], depth: size[2] },
        scene,
      );
      mesh.material = material;
      mesh.parent = this.body;
      mesh.position.set(at[0], at[1], at[2]);
      return mesh;
    };

    part("head", [0.38, 0.36, 0.42], [0, 0.22, 0.8]);
    part("snout", [0.2, 0.16, 0.3], [0, 0.14, 1.1]);
    part("ear-left", [0.1, 0.16, 0.08], [-0.12, 0.46, 0.72]);
    part("ear-right", [0.1, 0.16, 0.08], [0.12, 0.46, 0.72]);
    part("tail", [0.1, 0.1, 0.5], [0, 0.15, -0.85]).rotation.x = 0.6;
    part("eye-left", [0.06, 0.05, 0.03], [-0.11, 0.28, 1.02], eyeGlow);
    part("eye-right", [0.06, 0.05, 0.03], [0.11, 0.28, 1.02], eyeGlow);

    for (const [x, z] of [
      [-0.18, 0.45],
      [0.18, 0.45],
      [-0.18, -0.45],
      [0.18, -0.45],
    ] as const) {
      const leg = part("leg", [0.12, 0.38, 0.12], [x, -0.38, z]);
      // Swing from the hip rather than the middle of the leg.
      leg.setPivotPoint(new Vector3(0, 0.19, 0));
      this.legs.push(leg);
    }
  }

  get position(): PlanarVector {
    return { x: this.body.position.x, z: this.body.position.z };
  }

  get health(): number {
    return Math.ceil(this.currentHealth);
  }

  get alive(): boolean {
    return this.ai.phase !== "dead";
  }

  /** Current behaviour state, for the HUD and debugging. */
  get phase(): EnemyAiPhase {
    return this.ai.phase;
  }

  get meshes(): Mesh[] {
    return [this.body, ...(this.body.getChildMeshes() as Mesh[])];
  }

  receiveStrike(baseDamage: number): number {
    if (!this.alive) return 0;
    const damage = calculateDamage(baseDamage, this.options.definition.defense);
    this.currentHealth = applyDamage(this.currentHealth, damage);
    this.hitFlash = HIT_FLASH_SECONDS;
    if (this.currentHealth <= 0) {
      this.die();
    } else if (this.ai.phase === "idle" || this.ai.phase === "patrol") {
      // Being hit always provokes it, even from outside its detection range.
      this.ai = { phase: "chase", timer: 0, destination: null, struck: false };
    }
    return damage;
  }

  update(dt: number, opponent: Opponent): void {
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    if (!this.alive) {
      this.deadFor += dt;
      if (this.deadFor >= RESPAWN_SECONDS) this.respawn();
      else if (this.deadFor >= CORPSE_SECONDS) this.body.setEnabled(false);
      this.tint();
      return;
    }

    const body = this.body;
    const step = stepEnemyAi(
      this.ai,
      {
        position: this.position,
        home: this.options.home,
        playerPosition: opponent.position,
        playerAlive: !opponent.dead,
      },
      dt,
      this.rng,
      this.aiConfig,
    );
    this.ai = step.state;

    if (this.ai.phase === "idle" || this.ai.phase === "patrol") {
      this.currentHealth = Math.min(
        this.healthMax,
        this.currentHealth + OUT_OF_COMBAT_REGEN * dt,
      );
    }

    // The small downward push keeps the collider in contact with the ground.
    this.displacement.set(step.velocity.x * dt, -2 * dt, step.velocity.z * dt);
    body.moveWithCollisions(this.displacement);

    if (step.facing) {
      const targetYaw = Math.atan2(step.facing.x, step.facing.z);
      body.rotation.y +=
        shortestAngle(body.rotation.y, targetYaw) *
        (1 - Math.exp(-TURN_SHARPNESS * dt));
    }

    if (step.attack && !opponent.dead) {
      const reach = Math.hypot(
        opponent.position.x - body.position.x,
        opponent.position.z - body.position.z,
      );
      if (reach <= step.attack.reach) {
        opponent.receiveAttack(step.attack.damage, this.position);
      }
    }

    this.animate(Math.hypot(step.velocity.x, step.velocity.z), dt);
    this.tint();
  }

  /** Placeholder animation: trot the legs, rear back and lunge on a bite. */
  private animate(speed: number, dt: number): void {
    this.stride += speed * dt * 3.2;
    const swing = speed > 0.1 ? Math.sin(this.stride) * 0.7 : 0;
    this.legs.forEach((leg, index) => {
      // Diagonal pairs move together.
      leg.rotation.x = index === 0 || index === 3 ? swing : -swing;
    });

    let pitch = 0;
    if (this.ai.phase === "attack") {
      const windup = this.aiConfig.attackWindup;
      pitch = this.ai.struck
        ? 0.3 * Math.max(0, 1 - (this.ai.timer - windup) / 0.25)
        : -0.35 * Math.min(1, this.ai.timer / windup);
    }
    this.body.rotation.x = pitch;
  }

  /** White flash when hit; red glow while winding up a bite. */
  private tint(): void {
    const flash = this.hitFlash > 0 ? 0.8 : 0;
    const telegraph =
      this.ai.phase === "attack" && !this.ai.struck
        ? 0.55 * Math.min(1, this.ai.timer / this.aiConfig.attackWindup)
        : 0;
    this.fur.emissiveColor.set(Math.max(flash, telegraph), flash, flash);
  }

  private die(): void {
    this.ai = { phase: "dead", timer: 0, destination: null, struck: false };
    this.deadFor = 0;
    // Tip the placeholder model onto its side and stop blocking movement.
    this.body.checkCollisions = false;
    this.body.rotation.x = 0;
    this.body.rotation.z = Math.PI / 2;
    this.body.position.y = 0.27;
    for (const leg of this.legs) leg.rotation.x = 0;
    this.options.onDeath(
      rollReward(this.options.definition.reward, this.rng),
      this,
    );
  }

  private respawn(): void {
    const { home } = this.options;
    this.currentHealth = this.healthMax;
    this.ai = createEnemyAiState(1 + this.rng() * 2);
    this.deadFor = 0;
    this.body.rotation.set(0, this.rng() * Math.PI * 2, 0);
    this.body.position.set(home.x, BODY_CENTER_Y + 0.05, home.z);
    this.body.checkCollisions = true;
    this.body.setEnabled(true);
  }
}

function shortestAngle(from: number, to: number): number {
  const full = Math.PI * 2;
  return ((((to - from + Math.PI) % full) + full) % full) - Math.PI;
}
