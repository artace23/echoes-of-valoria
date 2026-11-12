import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { PlanarVector } from "@valoria/game-core";
import type { LookDelta } from "../input/InputManager";

const LOOK_SENSITIVITY = 0.0028;
const MIN_BETA = 0.35;
const MAX_BETA = 1.5;
const MIN_RADIUS = 3;
const MAX_RADIUS = 12;
const FOLLOW_SHARPNESS = 14;
const TARGET_HEIGHT = 0.7;

/** Orbit camera that follows a target position and is driven by look input. */
export class ThirdPersonCamera {
  readonly camera: ArcRotateCamera;
  private readonly desiredTarget = new Vector3();

  constructor(scene: Scene, initialTarget: Vector3) {
    this.desiredTarget.copyFrom(initialTarget);
    this.desiredTarget.y += TARGET_HEIGHT;
    this.camera = new ArcRotateCamera(
      "third-person-camera",
      -Math.PI / 2,
      1.2,
      7,
      this.desiredTarget.clone(),
      scene,
    );
    this.camera.minZ = 0.1;
    this.camera.maxZ = 200;
    scene.activeCamera = this.camera;
  }

  /** Horizontal direction the camera is looking along. */
  get forward(): PlanarVector {
    return {
      x: -Math.cos(this.camera.alpha),
      z: -Math.sin(this.camera.alpha),
    };
  }

  update(followPosition: Vector3, look: LookDelta, dt: number): void {
    const camera = this.camera;
    camera.alpha -= look.x * LOOK_SENSITIVITY;
    camera.beta = clamp(
      camera.beta - look.y * LOOK_SENSITIVITY,
      MIN_BETA,
      MAX_BETA,
    );
    camera.radius = clamp(camera.radius + look.zoom, MIN_RADIUS, MAX_RADIUS);

    this.desiredTarget.copyFrom(followPosition);
    this.desiredTarget.y += TARGET_HEIGHT;
    // Mutate in place: setTarget() would recompute the orbit angles.
    const t = 1 - Math.exp(-FOLLOW_SHARPNESS * dt);
    Vector3.LerpToRef(camera.target, this.desiredTarget, t, camera.target);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
