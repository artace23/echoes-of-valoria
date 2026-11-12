import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Scene } from "@babylonjs/core/scene";
import { WORLD } from "@valoria/game-data";
import type { AssetLibrary } from "../assets/AssetLibrary";
import { buildForest, isReserved, type ForestReport } from "./buildForest";
import { buildGrass } from "./buildGrass";
import { buildVillage } from "./buildVillage";
import { createGroundDetail } from "./groundDetail";
import { WorldKit, type MaterialKey } from "./WorldKit";

/** Shadows are drawn out to this distance from the camera. */
const SHADOW_DISTANCE = 28;
/** Scenery this far beyond the shadow distance can still cast into it. */
const SHADOW_CASTER_MARGIN = 6;
/** The caster list is rebuilt when the player has moved this far. */
const CASTER_REFRESH_STEP = 6;
/**
 * It is also rebuilt this often, in frames, because characters and enemies
 * move in and out of range on their own.
 */
const CASTER_REFRESH_FRAMES = 20;
/**
 * Small props (rocks, logs, stumps, barrels) throw short shadows, so they
 * only cast when this close. Each caster is a draw call per cascade, and
 * those draw calls, not the triangles, are what the shadow pass costs.
 */
const SMALL_PROP_SHADOW_REACH = 15;
/** Props whose bounding sphere is smaller than this count as small. */
const SMALL_PROP_RADIUS = 3;
/** Moving things further than this from the player do not cast shadows. */
const DYNAMIC_SHADOW_REACH = 26;
/** One repeat of the ground detail textures covers this many metres. */
const GROUND_TILE_METRES = 9;

/** How the air looks in each kind of place. Blended by distance from the village. */
const VILLAGE_AIR = {
  fog: new Color3(0.07, 0.062, 0.068),
  density: 0.011,
  ambient: 0.5,
};
const FOREST_AIR = {
  fog: new Color3(0.03, 0.05, 0.066),
  density: 0.022,
  ambient: 0.52,
};

export interface Environment {
  /** Where the player starts and respawns. */
  spawnPoint: Vector3;
  /** Half-size of the square play area the player may walk in. */
  worldHalfExtent: number;
  /** Number of scenery props placed, for diagnostics. */
  propCount: number;
  /** How many forest props are sourced models versus placeholders. */
  forest: ForestReport;
  /** Number of procedural grass tufts placed. */
  grassTufts: number;
  addShadowCaster(mesh: AbstractMesh): void;
  /**
   * Per-frame update: keeps the shadow caster list near the player and
   * blends fog and ambient light between the village and the forest.
   * Returns how deep into the forest the player is, from 0 (village) to 1.
   */
  update(playerPosition: Vector3): number;
}

/**
 * Builds the world: ground, Ashen Village, the Whispering Forest, lighting,
 * shadows and fog. Forest props come from the asset library where a model has
 * been sourced and are primitive placeholders otherwise.
 */
export function createEnvironment(
  scene: Scene,
  assets: AssetLibrary,
  camera: Camera,
): Environment {
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
  //
  // The balance is a strong, cool key light against a low fill: deep
  // shadows and bright moonlit edges, which the tone mapping then shapes.
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = VILLAGE_AIR.ambient;
  ambient.diffuse = new Color3(0.5, 0.58, 0.8);
  ambient.groundColor = new Color3(0.1, 0.085, 0.08);
  ambient.specular = Color3.Black();

  const moon = new DirectionalLight(
    "moon",
    new Vector3(-0.5, -0.82, 0.38).normalize(),
    scene,
  );
  moon.intensity = 1.7;
  moon.diffuse = new Color3(0.74, 0.83, 1);
  moon.specular = new Color3(0.5, 0.56, 0.7);

  // Cascaded shadows: two maps, one tight around the camera and one
  // reaching further, so shadows are crisp underfoot and still present
  // further off. Each cascade redraws every nearby caster, so the count is
  // kept at two: a third cost about 4 ms per frame for little visible gain.
  const shadows = new CascadedShadowGenerator(1024, moon, undefined, camera);
  shadows.numCascades = 2;
  shadows.lambda = 0.7;
  shadows.shadowMaxZ = SHADOW_DISTANCE;
  shadows.cascadeBlendPercentage = 0.08;
  shadows.stabilizeCascades = true;
  shadows.autoCalcDepthBounds = false;
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.003;
  shadows.normalBias = 0.03;
  shadows.setDarkness(0.38);

  const { village, northGate } = WORLD;
  const squareLight = new PointLight(
    "village-square-light",
    new Vector3(village.center.x, 4, village.center.z),
    scene,
  );
  squareLight.diffuse = new Color3(1, 0.7, 0.38);
  squareLight.specular = new Color3(0.4, 0.28, 0.15);
  squareLight.intensity = 1.5;
  squareLight.range = 30;

  const gateLight = new PointLight(
    "gate-light",
    new Vector3(northGate.x, 3.6, northGate.z + 1),
    scene,
  );
  gateLight.diffuse = new Color3(1, 0.68, 0.36);
  gateLight.specular = new Color3(0.4, 0.27, 0.14);
  gateLight.intensity = 1.1;
  gateLight.range = 16;

  const kit = new WorldKit(scene);

  const groundSize = (WORLD.halfExtent + 12) * 2;

  // Ground surfaces use sourced texture sets where the manifest has them.
  const applySurface = (key: MaterialKey, slot: string): boolean => {
    const set = assets.textureSet(slot);
    const color = set?.maps.color;
    if (!set || !color) return false;
    kit.setSurface(key, {
      color,
      normal: set.maps.normal,
      metres: set.metres ?? 3,
    });
    return true;
  };
  const forestFloorSourced = applySurface("earth", "ground-forest");
  applySurface("dirt", "ground-path");
  applySurface("packedEarth", "ground-path");
  applySurface("corruptedEarth", "ground-corrupted");

  // Anything still without a texture set gets procedural tint variation and
  // relief: a stand-in, not art. See groundDetail.ts.
  const proceduralKeys = (
    ["earth", "packedEarth", "corruptedEarth"] as const
  ).filter((key) => !kit.hasSurface(key));
  if (proceduralKeys.length > 0) {
    const detail = createGroundDetail(scene);
    const sizes = {
      earth: groundSize,
      packedEarth: (WORLD.villageWallRadius + 1) * 2,
      corruptedEarth: 20,
    };
    for (const key of proceduralKeys) {
      const material = kit.material(key);
      const repeats = sizes[key] / GROUND_TILE_METRES;
      const variation = detail.variation.clone();
      const normal = detail.normal.clone();
      for (const texture of [variation, normal]) {
        texture.uScale = repeats;
        texture.vScale = repeats;
      }
      // The variation texture darkens, so lift the base colour to compensate.
      material.diffuseColor.scaleInPlace(1.35);
      material.diffuseTexture = variation;
      material.bumpTexture = normal;
      material.specularColor = new Color3(0.07, 0.08, 0.1);
      material.specularPower = 20;
    }
  }

  const ground = CreateGround(
    "ground",
    { width: groundSize, height: groundSize },
    scene,
  );
  ground.material = forestFloorSourced
    ? kit.groundMaterial("earth", groundSize, groundSize)
    : kit.material("earth");
  ground.checkCollisions = true;
  ground.receiveShadows = true;
  ground.isPickable = false;
  ground.freezeWorldMatrix();

  buildVillage(kit);
  const forest = buildForest(kit, assets);
  const grassTufts = buildGrass(
    scene,
    WORLD.halfExtent,
    (point) => isReserved(point, -0.7),
    assets.textureSet("grass-card")?.maps.color ?? null,
  );

  // Only casters near the player are drawn into the shadow maps. Every
  // caster is a draw call in each cascade, so the list is kept short: tall
  // scenery within the shadow distance, small props only when close, and
  // moving things only when near. It is rebuilt when the player has moved a
  // few metres or a fraction of a second has passed, not every frame.
  const shadowMap = shadows.getShadowMap();
  const dynamicCasters: AbstractMesh[] = [];
  const staticCasters = kit.shadowCasters.map((mesh) => {
    const position = mesh.getAbsolutePosition();
    const small =
      mesh.getBoundingInfo().boundingSphere.radiusWorld < SMALL_PROP_RADIUS;
    return {
      mesh,
      x: position.x,
      z: position.z,
      reach: small
        ? SMALL_PROP_SHADOW_REACH
        : SHADOW_DISTANCE + SHADOW_CASTER_MARGIN,
    };
  });
  let castersAtX = Number.NaN;
  let castersAtZ = Number.NaN;
  let framesSinceRefresh = 0;
  const refreshCasters = (
    playerX: number,
    playerZ: number,
    centerX: number,
    centerZ: number,
  ) => {
    if (!shadowMap) return;
    const nearby: AbstractMesh[] = [];
    for (const mesh of dynamicCasters) {
      const position = mesh.getAbsolutePosition();
      if (
        Math.abs(position.x - playerX) <= DYNAMIC_SHADOW_REACH &&
        Math.abs(position.z - playerZ) <= DYNAMIC_SHADOW_REACH
      ) {
        nearby.push(mesh);
      }
    }
    for (const caster of staticCasters) {
      if (
        Math.abs(caster.x - centerX) <= caster.reach &&
        Math.abs(caster.z - centerZ) <= caster.reach
      ) {
        nearby.push(caster.mesh);
      }
    }
    shadowMap.renderList = nearby;
    castersAtX = centerX;
    castersAtZ = centerZ;
    framesSinceRefresh = 0;
  };

  const fadeStart = WORLD.villageWallRadius - 4;
  const fadeEnd = WORLD.villageWallRadius + 16;

  return {
    spawnPoint: new Vector3(WORLD.spawnPoint.x, 1.5, WORLD.spawnPoint.z),
    worldHalfExtent: WORLD.halfExtent - 1,
    propCount: kit.placed,
    forest,
    grassTufts,
    addShadowCaster: (mesh) => {
      // Moving things (the player, enemies, villagers) cast when nearby.
      dynamicCasters.push(mesh);
      castersAtX = Number.NaN;
    },
    update(playerPosition) {
      const steppedX =
        Math.round(playerPosition.x / CASTER_REFRESH_STEP) * CASTER_REFRESH_STEP;
      const steppedZ =
        Math.round(playerPosition.z / CASTER_REFRESH_STEP) * CASTER_REFRESH_STEP;
      if (
        steppedX !== castersAtX ||
        steppedZ !== castersAtZ ||
        ++framesSinceRefresh >= CASTER_REFRESH_FRAMES
      ) {
        refreshCasters(playerPosition.x, playerPosition.z, steppedX, steppedZ);
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
