import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Meshes/instancedMesh";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Scene } from "@babylonjs/core/scene";

const WORLD_SIZE = 80;
const START = { x: 0, z: -24, radius: 6 };
const ENCOUNTER = { x: 0, z: 18, radius: 11 };
const PATH_HALF_WIDTH = 2.5;

export interface Environment {
  /** Where the player starts and respawns. */
  spawnPoint: Vector3;
  /** Half-size of the square play area the player may walk in. */
  worldHalfExtent: number;
  /** Centre and radius of the enemy encounter clearing. */
  encounterArea: { x: number; z: number; radius: number };
  addShadowCaster(mesh: AbstractMesh): void;
}

/** Deterministic PRNG so the test area looks the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function matte(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = Color3.Black();
  return material;
}

/** True where scenery must stay clear: both clearings and the path between. */
function isReserved(x: number, z: number, margin: number): boolean {
  const inStart = Math.hypot(x - START.x, z - START.z) < START.radius + margin;
  const inEncounter =
    Math.hypot(x - ENCOUNTER.x, z - ENCOUNTER.z) < ENCOUNTER.radius + margin;
  const onPath =
    Math.abs(x) < PATH_HALF_WIDTH + margin && z > START.z && z < ENCOUNTER.z;
  return inStart || inEncounter || onPath;
}

/**
 * Small primitive-geometry test area: flat ground, a starting circle, a path
 * to an encounter clearing, trees, rocks, moonlight with shadows, and fog.
 */
export function createEnvironment(scene: Scene): Environment {
  const sky = new Color3(0.05, 0.06, 0.09);
  scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
  scene.ambientColor = new Color3(0.1, 0.1, 0.12);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = sky;
  scene.fogDensity = 0.022;
  scene.collisionsEnabled = true;

  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.55;
  ambient.diffuse = new Color3(0.55, 0.62, 0.8);
  ambient.groundColor = new Color3(0.12, 0.1, 0.1);

  const moon = new DirectionalLight(
    "moon",
    new Vector3(-0.45, -1, 0.35).normalize(),
    scene,
  );
  moon.position = new Vector3(30, 60, -25);
  moon.intensity = 1.25;
  moon.diffuse = new Color3(0.78, 0.84, 1);

  const shadows = new ShadowGenerator(2048, moon);
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.002;
  shadows.normalBias = 0.02;
  shadows.setDarkness(0.35);

  const random = mulberry32(1337);
  const range = (min: number, max: number) => min + random() * (max - min);

  // Ground
  const ground = CreateGround(
    "ground",
    { width: WORLD_SIZE, height: WORLD_SIZE },
    scene,
  );
  ground.material = matte(scene, "ground-earth", new Color3(0.16, 0.19, 0.14));
  ground.checkCollisions = true;
  ground.receiveShadows = true;

  // Flat markers sit just above the ground and are not collidable.
  const stone = matte(scene, "stone", new Color3(0.36, 0.36, 0.38));
  const startDisc = CreateCylinder(
    "start-disc",
    { diameter: START.radius * 2, height: 0.04, tessellation: 48 },
    scene,
  );
  startDisc.position.set(START.x, 0.02, START.z);
  startDisc.material = stone;
  startDisc.receiveShadows = true;

  const path = CreateBox(
    "path",
    {
      width: PATH_HALF_WIDTH * 1.4,
      height: 0.02,
      depth: ENCOUNTER.z - ENCOUNTER.radius - (START.z + START.radius),
    },
    scene,
  );
  path.position.set(
    0,
    0.01,
    (START.z + START.radius + ENCOUNTER.z - ENCOUNTER.radius) / 2,
  );
  path.material = matte(scene, "path-dirt", new Color3(0.24, 0.2, 0.15));
  path.receiveShadows = true;

  const encounterDisc = CreateCylinder(
    "encounter-disc",
    { diameter: ENCOUNTER.radius * 2, height: 0.04, tessellation: 64 },
    scene,
  );
  encounterDisc.position.set(ENCOUNTER.x, 0.02, ENCOUNTER.z);
  encounterDisc.material = matte(
    scene,
    "encounter-earth",
    new Color3(0.26, 0.13, 0.13),
  );
  encounterDisc.receiveShadows = true;

  // Starting area: four pillars and a warm light.
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const pillar = CreateCylinder(
      `start-pillar-${i}`,
      { diameter: 0.8, height: 3.2, tessellation: 12 },
      scene,
    );
    pillar.position.set(
      START.x + Math.cos(angle) * (START.radius - 0.8),
      1.6,
      START.z + Math.sin(angle) * (START.radius - 0.8),
    );
    pillar.material = stone;
    pillar.checkCollisions = true;
    pillar.receiveShadows = true;
    shadows.addShadowCaster(pillar);
  }
  const torch = new PointLight(
    "start-torch",
    new Vector3(START.x, 3, START.z),
    scene,
  );
  torch.diffuse = new Color3(1, 0.72, 0.4);
  torch.intensity = 0.9;
  torch.range = 16;

  // Encounter area: a ring of standing stones with a gap facing the path.
  const darkStone = matte(scene, "dark-stone", new Color3(0.2, 0.19, 0.22));
  const stoneCount = 9;
  for (let i = 0; i < stoneCount; i++) {
    const angle = -Math.PI / 2 + ((i + 0.5) / stoneCount) * Math.PI * 2;
    if (Math.abs(Math.cos(angle)) < 0.4 && Math.sin(angle) < 0) continue;
    const height = range(2.4, 4);
    const monolith = CreateBox(
      `standing-stone-${i}`,
      { width: 1.3, height, depth: 0.8 },
      scene,
    );
    monolith.position.set(
      ENCOUNTER.x + Math.cos(angle) * ENCOUNTER.radius,
      height / 2,
      ENCOUNTER.z + Math.sin(angle) * ENCOUNTER.radius,
    );
    monolith.rotation.y = -angle + Math.PI / 2 + range(-0.2, 0.2);
    monolith.material = darkStone;
    monolith.checkCollisions = true;
    monolith.receiveShadows = true;
    shadows.addShadowCaster(monolith);
  }

  // Trees: trunk (collidable) + cone canopy, instanced from hidden templates.
  const trunkTemplate = CreateCylinder(
    "tree-trunk",
    { diameterTop: 0.35, diameterBottom: 0.6, height: 3, tessellation: 8 },
    scene,
  );
  trunkTemplate.material = matte(scene, "bark", new Color3(0.2, 0.14, 0.1));
  trunkTemplate.isVisible = false;

  const canopyTemplate = CreateCylinder(
    "tree-canopy",
    { diameterTop: 0, diameterBottom: 3.4, height: 5, tessellation: 8 },
    scene,
  );
  canopyTemplate.material = matte(scene, "pine", new Color3(0.1, 0.2, 0.14));
  canopyTemplate.isVisible = false;

  const scatterLimit = WORLD_SIZE / 2 - 2;
  let treeCount = 0;
  for (let attempt = 0; attempt < 400 && treeCount < 70; attempt++) {
    const x = range(-scatterLimit, scatterLimit);
    const z = range(-scatterLimit, scatterLimit);
    if (isReserved(x, z, 1.5)) continue;
    const scale = range(0.8, 1.5);
    const index = treeCount++;

    const trunk = trunkTemplate.createInstance(`tree-trunk-${index}`);
    trunk.position.set(x, 1.5 * scale, z);
    trunk.scaling.setAll(scale);
    trunk.checkCollisions = true;
    shadows.addShadowCaster(trunk);

    const canopy = canopyTemplate.createInstance(`tree-canopy-${index}`);
    canopy.position.set(x, (2.4 + 2.5) * scale, z);
    canopy.scaling.setAll(scale);
    canopy.rotation.y = range(0, Math.PI);
    shadows.addShadowCaster(canopy);
  }

  // Rocks
  const rockTemplate = CreateIcoSphere(
    "rock",
    { radius: 1, subdivisions: 1, flat: true },
    scene,
  );
  rockTemplate.material = matte(scene, "rock", new Color3(0.3, 0.3, 0.33));
  rockTemplate.isVisible = false;

  let rockCount = 0;
  for (let attempt = 0; attempt < 200 && rockCount < 26; attempt++) {
    const x = range(-scatterLimit, scatterLimit);
    const z = range(-scatterLimit, scatterLimit);
    if (isReserved(x, z, 0.5)) continue;
    const size = range(0.5, 1.6);
    const rock = rockTemplate.createInstance(`rock-${rockCount++}`);
    rock.position.set(x, size * 0.35, z);
    rock.scaling.set(size * range(0.8, 1.3), size * 0.7, size * range(0.8, 1.3));
    rock.rotation.y = range(0, Math.PI * 2);
    rock.checkCollisions = true;
    rock.receiveShadows = true;
    shadows.addShadowCaster(rock);
  }

  return {
    spawnPoint: new Vector3(START.x, 1.5, START.z),
    worldHalfExtent: WORLD_SIZE / 2 - 1,
    encounterArea: { ...ENCOUNTER },
    addShadowCaster: (mesh) => shadows.addShadowCaster(mesh),
  };
}
