import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  applyDamage,
  calculateDamage,
  type PlanarVector,
} from "@valoria/game-core";
import type { Enemy, Opponent } from "../enemies/Enemy";

const HEALTH_MAX = 120;
const DEFENSE = 10;
const BODY_RADIUS = 0.6;
const BODY_HEIGHT = 2.2;
/** The construct starts a swing when the player's centre is this close. */
const AGGRO_RANGE = 3.2;
/** Reach of the swing when it lands. Slightly longer than the aggro range. */
const ATTACK_RANGE = 3.6;
const ATTACK_DAMAGE = 18;
const WINDUP_SECONDS = 0.9;
const RECOVER_SECONDS = 1.4;
const REBUILD_SECONDS = 6;
const HIT_FLASH_SECONDS = 0.12;

type Phase = "idle" | "windup" | "recover" | "destroyed";

/**
 * Stationary practice target in the village training yard. It takes sword hits,
 * and swings back with a slow, telegraphed attack (it glows red while winding
 * up) so blocking and dodging can be practised safely. It rebuilds itself a
 * few seconds after being destroyed and gives no reward. It has no movement
 * or decision-making; real enemies use the game-core AI.
 */
export class TrainingDummy implements Enemy {
  readonly name = "Training Construct";
  readonly healthMax = HEALTH_MAX;
  readonly radius = BODY_RADIUS;
  readonly body: Mesh;
  private currentHealth = HEALTH_MAX;
  private phase: Phase = "idle";
  private timer = 0;
  private hitFlash = 0;
  private readonly arm: Mesh;
  private readonly material: StandardMaterial;

  constructor(scene: Scene, x: number, z: number) {
    this.material = new StandardMaterial("construct-iron", scene);
    this.material.diffuseColor = new Color3(0.3, 0.27, 0.25);
    this.material.specularColor = new Color3(0.2, 0.2, 0.2);

    this.body = CreateCylinder(
      "training-construct",
      { diameter: BODY_RADIUS * 2, height: BODY_HEIGHT, tessellation: 10 },
      scene,
    );
    this.body.position.set(x, BODY_HEIGHT / 2, z);
    this.body.material = this.material;
    this.body.checkCollisions = true;
    this.body.receiveShadows = true;

    const head = CreateBox(
      "training-construct-head",
      { width: 0.7, height: 0.45, depth: 0.7 },
      scene,
    );
    head.parent = this.body;
    head.position.y = BODY_HEIGHT / 2 + 0.25;
    head.material = this.material;

    this.arm = CreateBox(
      "training-construct-arm",
      { width: 3, height: 0.18, depth: 0.18 },
      scene,
    );
    this.arm.parent = this.body;
    this.arm.position.y = 0.45;
    this.arm.material = this.material;
  }

  get position(): PlanarVector {
    return { x: this.body.position.x, z: this.body.position.z };
  }

  get health(): number {
    return this.currentHealth;
  }

  get destroyed(): boolean {
    return this.phase === "destroyed";
  }

  get alive(): boolean {
    return !this.destroyed;
  }

  get meshes(): Mesh[] {
    return [this.body, ...(this.body.getChildMeshes() as Mesh[])];
  }

  /** Apply a sword hit. Returns the damage dealt after the construct's armor. */
  receiveStrike(baseDamage: number): number {
    if (this.destroyed) return 0;
    const damage = calculateDamage(baseDamage, DEFENSE);
    this.currentHealth = applyDamage(this.currentHealth, damage);
    this.hitFlash = HIT_FLASH_SECONDS;
    if (this.currentHealth <= 0) {
      this.phase = "destroyed";
      this.timer = REBUILD_SECONDS;
      this.body.setEnabled(false);
    }
    return damage;
  }

  update(dt: number, opponent: Opponent): void {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.timer = Math.max(0, this.timer - dt);

    const distance = Math.hypot(
      opponent.position.x - this.body.position.x,
      opponent.position.z - this.body.position.z,
    );

    switch (this.phase) {
      case "destroyed":
        if (this.timer === 0) {
          this.currentHealth = HEALTH_MAX;
          this.phase = "idle";
          this.body.setEnabled(true);
        }
        break;
      case "idle":
        if (!opponent.dead && distance <= AGGRO_RANGE) {
          this.phase = "windup";
          this.timer = WINDUP_SECONDS;
        }
        break;
      case "windup":
        if (this.timer === 0) {
          if (!opponent.dead && distance <= ATTACK_RANGE) {
            opponent.receiveAttack(ATTACK_DAMAGE, this.position);
          }
          this.phase = "recover";
          this.timer = RECOVER_SECONDS;
        }
        break;
      case "recover":
        if (this.timer === 0) this.phase = "idle";
        break;
    }

    this.animate(dt);
  }

  /** Placeholder animation: glow while winding up, spin the arm on the swing. */
  private animate(dt: number): void {
    const windup =
      this.phase === "windup" ? 1 - this.timer / WINDUP_SECONDS : 0;
    const flash = this.hitFlash > 0 ? 0.7 : 0;
    this.material.emissiveColor.set(
      Math.max(flash, windup * 0.65),
      flash,
      flash,
    );

    const swinging =
      this.phase === "recover" && this.timer > RECOVER_SECONDS - 0.35;
    if (swinging) this.arm.rotation.y += dt * 18;
  }
}
