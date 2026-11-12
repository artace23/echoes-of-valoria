import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Scene } from "@babylonjs/core/scene";
import { WORLD } from "@valoria/game-data";
import { buildForest } from "./buildForest";
import { buildVillage } from "./buildVillage";
import { WorldKit } from "./WorldKit";

/** Half-size of the square the shadow map covers, centred on the player. */
const SHADOW_RANGE = 36;
/** The shadow area moves in steps, which keeps shadow edges from crawling. */
const SHADOW_SNAP = 4;
const MOON_DISTANCE = 90;
/** Scenery this far outside the shadow area can still cast into it. */
const SHADOW_CASTER_MARGIN = 8;

/** How the air looks in each kind of place. Blended by distance from the village. */
const VILLAGE_AIR = {
  fog: new Color3(0.075, 0.066, 0.07),
  density: 0.011,
  ambient: 0.68,
};
const FOREST_AIR = {
  fog: new Color3(0.035, 0.055, 0.07),
  density: 0.027,
  ambient: 0.46,
};

export interface Environment {
  /** Where the player starts and respawns. */
  spawnPoint: Vector3;
  /** Half-size of the square play area the player may walk in. */
  worldHalfExtent: number;
  /** Number of scenery props placed, for diagnostics. */
  propCount: number;
  addShadowCaster(mesh: AbstractMesh): void;
  /**
   * Per-frame update: keeps shadows around the player and blends fog and
   * ambient light between the village and the forest. Returns how deep into
   * the forest the player is, from 0 (village) to 1.
   */
  update(playerPosition: Vector3): number;
}

/**
 * Builds the world: ground, Ashen Village, the Whispering Forest, lighting,
 * shadows and fog. All scenery is primitive geometry.
 */
export function createEnvironment(scene: Scene): Environment {
  scene.ambientColor = new Color3(0.1, 0.1, 0.12);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = VILLAGE_AIR.fog.clone();
  scene.fogDensity = VILLAGE_AIR.density;
  scene.clearColor = new Color4(0, 0, 0, 1);
  scene.collisionsEnabled = true;
  // Nothing in the world is picked with the pointer.
  scene.skipPointerMovePicking = true;

  // Four lights in total: StandardMaterial's per-mesh limit. Lanterns and
  // windows are self-lit materials instead of extra lights.
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = VILLAGE_AIR.ambient;
  ambient.diffuse = new Color3(0.55, 0.62, 0.8);
  ambient.groundColor = new Color3(0.12, 0.1, 0.1);

  const moonDirection = new Vector3(-0.45, -1, 0.35).normalize();
  const moon = new DirectionalLight("moon", moonDirection, scene);
  moon.intensity = 1.2;
  moon.diffuse = new Color3(0.78, 0.84, 1);
  // A fixed-size shadow area that follows the player, instead of one
  // stretched over the whole map.
  moon.autoUpdateExtends = false;
  moon.autoCalcShadowZBounds = false;
  moon.orthoLeft = -SHADOW_RANGE;
  moon.orthoRight = SHADOW_RANGE;
  moon.orthoBottom = -SHADOW_RANGE;
  moon.orthoTop = SHADOW_RANGE;
  moon.shadowMinZ = 1;
  moon.shadowMaxZ = MOON_DISTANCE * 2;

  const shadows = new ShadowGenerator(2048, moon);
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.002;
  shadows.normalBias = 0.02;
  shadows.setDarkness(0.35);

  const { village, northGate } = WORLD;
  const squareLight = new PointLight(
    "village-square-light",
    new Vector3(village.center.x, 4, village.center.z),
    scene,
  );
  squareLight.diffuse = new Color3(1, 0.72, 0.4);
  squareLight.intensity = 1.1;
  squareLight.range = 30;

  const gateLight = new PointLight(
    "gate-light",
    new Vector3(northGate.x, 3.6, northGate.z + 1),
    scene,
  );
  gateLight.diffuse = new Color3(1, 0.7, 0.38);
  gateLight.intensity = 0.8;
  gateLight.range = 16;

  const kit = new WorldKit(scene);

  const groundSize = (WORLD.halfExtent + 12) * 2;
  const ground = CreateGround(
    "ground",
    { width: groundSize, height: groundSize },
    scene,
  );
  ground.material = kit.material("earth");
  ground.checkCollisions = true;
  ground.receiveShadows = true;
  ground.isPickable = false;
  ground.freezeWorldMatrix();

  buildVillage(kit);
  buildForest(kit);

  // Only scenery near the player is drawn into the shadow map. The list is
  // rebuilt when the shadow area steps to a new position, not every frame.
  const shadowMap = shadows.getShadowMap();
  const dynamicCasters: AbstractMesh[] = [];
  let castersAtX = Number.NaN;
  let castersAtZ = Number.NaN;
  const refreshCasters = (centerX: number, centerZ: number) => {
    if (!shadowMap) return;
    const reach = SHADOW_RANGE + SHADOW_CASTER_MARGIN;
    shadowMap.renderList = [
      ...dynamicCasters,
      ...kit.shadowCasters.filter(
        (mesh) =>
          Math.abs(mesh.position.x - centerX) <= reach &&
          Math.abs(mesh.position.z - centerZ) <= reach,
      ),
    ];
    castersAtX = centerX;
    castersAtZ = centerZ;
  };

  const fadeStart = WORLD.villageWallRadius - 4;
  const fadeEnd = WORLD.villageWallRadius + 16;

  return {
    spawnPoint: new Vector3(WORLD.spawnPoint.x, 1.5, WORLD.spawnPoint.z),
    worldHalfExtent: WORLD.halfExtent - 1,
    propCount: kit.placed,
    addShadowCaster: (mesh) => {
      // Moving things (the player, enemies, villagers) always cast.
      dynamicCasters.push(mesh);
      castersAtX = Number.NaN;
    },
    update(playerPosition) {
      const snappedX = Math.round(playerPosition.x / SHADOW_SNAP) * SHADOW_SNAP;
      const snappedZ = Math.round(playerPosition.z / SHADOW_SNAP) * SHADOW_SNAP;
      moon.position.set(
        snappedX - moonDirection.x * MOON_DISTANCE,
        -moonDirection.y * MOON_DISTANCE,
        snappedZ - moonDirection.z * MOON_DISTANCE,
      );

      if (snappedX !== castersAtX || snappedZ !== castersAtZ) {
        refreshCasters(snappedX, snappedZ);
      }

      const fromVillage = Math.hypot(
        playerPosition.x - village.center.x,
        playerPosition.z - village.center.z,
      );
      const t = Math.min(
        1,
        Math.max(0, (fromVillage - fadeStart) / (fadeEnd - fadeStart)),
      );
      const wild = t * t * (3 - 2 * t);

      Color3.LerpToRef(VILLAGE_AIR.fog, FOREST_AIR.fog, wild, scene.fogColor);
      scene.clearColor.set(
        scene.fogColor.r,
        scene.fogColor.g,
        scene.fogColor.b,
        1,
      );
      scene.fogDensity =
        VILLAGE_AIR.density + (FOREST_AIR.density - VILLAGE_AIR.density) * wild;
      ambient.intensity =
        VILLAGE_AIR.ambient + (FOREST_AIR.ambient - VILLAGE_AIR.ambient) * wild;
      return wild;
    },
  };
}
