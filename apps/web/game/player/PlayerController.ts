import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  DEFAULT_MOVEMENT_CONFIG,
  createMovementState,
  stepMovement,
  type MoveIntent,
  type MovementState,
  type PlanarVector,
} from "@valoria/game-core";

const HEIGHT = 1.8;
const RADIUS = 0.4;
const TURN_SHARPNESS = 14;
/** Fell out of the world: put the player back at the spawn point. */
const KILL_PLANE_Y = -20;

export interface PlayerOptions {
  spawnPoint: Vector3;
  /** Half-size of the square play area; the player is kept inside it. */
  worldHalfExtent: number;
}

/**
 * Placeholder Warrior: a capsule body with a visor and sword so facing is
 * readable. Movement rules come from game-core; this class applies them to
 * the mesh and resolves collisions with Babylon's ellipsoid collision system.
 */
export class PlayerController {
  readonly body: Mesh;
  readonly healthMax = 100;
  readonly health = 100;
  private movement: MovementState = createMovementState();
  private readonly displacement = new Vector3();

  constructor(
    scene: Scene,
    private readonly options: PlayerOptions,
  ) {
    const armor = new StandardMaterial("warrior-armor", scene);
    armor.diffuseColor = new Color3(0.42, 0.44, 0.5);
    armor.specularColor = new Color3(0.25, 0.25, 0.25);

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

    const sword = CreateBox(
      "warrior-sword",
      { width: 0.07, height: 1.1, depth: 0.14 },
      scene,
    );
    sword.material = steel;
    sword.parent = this.body;
    sword.position.set(RADIUS + 0.12, -0.05, 0.2);
    sword.rotation.x = 0.5;
  }

  get position(): Vector3 {
    return this.body.position;
  }

  get stamina(): number {
    return this.movement.stamina;
  }

  get staminaMax(): number {
    return DEFAULT_MOVEMENT_CONFIG.staminaMax;
  }

  get sprinting(): boolean {
    return this.movement.sprinting;
  }

  get meshes(): Mesh[] {
    return [this.body, ...(this.body.getChildMeshes() as Mesh[])];
  }

  update(intent: MoveIntent, viewForward: PlanarVector, dt: number): void {
    const step = stepMovement(this.movement, intent, viewForward, dt);
    const wanted = step.displacement;
    const body = this.body;

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

    if (step.moving) {
      const targetYaw = Math.atan2(wanted.x, wanted.z);
      const turn = shortestAngle(body.rotation.y, targetYaw);
      body.rotation.y += turn * (1 - Math.exp(-TURN_SHARPNESS * dt));
    }
  }

  private respawn(): void {
    this.body.position.copyFrom(this.options.spawnPoint);
    this.movement = { ...this.movement, verticalVelocity: 0, grounded: false };
  }
}

function shortestAngle(from: number, to: number): number {
  const full = Math.PI * 2;
  return ((((to - from + Math.PI) % full) + full) % full) - Math.PI;
}
