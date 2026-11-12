import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { PlanarVector } from "@valoria/game-core";
import type { LookDelta } from "../input/InputManager";

/** Radians per pixel of pointer movement. */
const LOOK_SENSITIVITY = 0.004;
/** Radians per second while a look key is held. */
const KEY_YAW_SPEED = 2.2;
const KEY_PITCH_SPEED = 1.3;
/** Pitch limits keep the camera above the ground and short of straight down. */
const MIN_BETA = 0.35;
const MAX_BETA = 1.5;
const MIN_RADIUS = 3;
const MAX_RADIUS = 12;
/** Higher is snappier. Applied as exponential smoothing per second. */
const ROTATION_SHARPNESS = 22;
const ZOOM_SHARPNESS = 12;
const FOLLOW_SHARPNESS = 14;
const TARGET_HEIGHT = 0.7;

/**
 * Orbit camera that follows a target position. Look input moves goal angles;
 * the camera eases toward them, so rotation is smooth and never flips.
 */
export class ThirdPersonCamera {
  readonly camera: ArcRotateCamera;
  private readonly desiredTarget = new Vector3();
  private goalAlpha = -Math.PI / 2;
  private goalBeta = 1.2;
  private goalRadius = 7;

  constructor(scene: Scene, initialTarget: Vector3) {
    this.desiredTarget.copyFrom(initialTarget);
    this.desiredTarget.y += TARGET_HEIGHT;
    this.camera = new ArcRotateCamera(
      "third-person-camera",
      this.goalAlpha,
      this.goalBeta,
      this.goalRadius,
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

    this.goalAlpha -=
      look.x * LOOK_SENSITIVITY + look.keyYaw * KEY_YAW_SPEED * dt;
    this.goalBeta = clamp(
      this.goalBeta -
        look.y * LOOK_SENSITIVITY +
        look.keyPitch * KEY_PITCH_SPEED * dt,
      MIN_BETA,
      MAX_BETA,
    );
    this.goalRadius = clamp(
      this.goalRadius + look.zoom,
      MIN_RADIUS,
      MAX_RADIUS,
    );

    const turn = 1 - Math.exp(-ROTATION_SHARPNESS * dt);
    camera.alpha += (this.goalAlpha - camera.alpha) * turn;
    camera.beta += (this.goalBeta - camera.beta) * turn;
    camera.radius +=
      (this.goalRadius - camera.radius) * (1 - Math.exp(-ZOOM_SHARPNESS * dt));

    this.desiredTarget.copyFrom(followPosition);
    this.desiredTarget.y += TARGET_HEIGHT;
    // Mutate in place: setTarget() would recompute the orbit angles.
    const follow = 1 - Math.exp(-FOLLOW_SHARPNESS * dt);
    Vector3.LerpToRef(camera.target, this.desiredTarget, follow, camera.target);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
