import "@babylonjs/core/Meshes/thinInstanceMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

/** Side of one square patch of grass, in metres. Each patch is one draw call. */
const CELL = 22;
/** Patches further than this from the camera are not drawn. */
const DRAW_DISTANCE = 55;
/** Tufts per square metre, before reserved areas are removed. */
const DENSITY_CARDS = 1.5;
const DENSITY_PROCEDURAL = 2.4;
const BLADES_PER_TUFT = 7;

/**
 * The part of the grass atlas that holds the row of blades, in UV space
 * (V = 0 is the bottom of the image). The curled blade at the far right and
 * the empty margins are left out.
 */
const ATLAS = { u0: 0.03, u1: 0.87, vRoot: 0.085, vTip: 0.95 };

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A tuft made of three upright cards crossed at 60 degrees, each showing the
 * row of photographed blades from the atlas.
 */
function createCardTuft(scene: Scene, name: string, seed: number): Mesh {
  const random = mulberry32(seed);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let card = 0; card < 3; card++) {
    const angle = (card / 3) * Math.PI + random() * 0.4;
    const halfWidth = 0.38 + random() * 0.12;
    const height = 0.42 + random() * 0.16;
    const dx = Math.cos(angle) * halfWidth;
    const dz = Math.sin(angle) * halfWidth;
    // Tips lean a little, so cards do not read as flat panels.
    const leanX = (random() - 0.5) * 0.18;
    const leanZ = (random() - 0.5) * 0.18;

    const base = positions.length / 3;
    positions.push(
      -dx, 0, -dz,
      dx, 0, dz,
      dx + leanX, height, dz + leanZ,
      -dx + leanX, height, -dz + leanZ,
    );
    uvs.push(
      ATLAS.u0, ATLAS.vRoot,
      ATLAS.u1, ATLAS.vRoot,
      ATLAS.u1, ATLAS.vTip,
      ATLAS.u0, ATLAS.vTip,
    );
    // Upward normals: grass is lit like the ground it grows from.
    for (let i = 0; i < 4; i++) normals.push(0, 1, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}

/**
 * Fallback tuft with no texture: a few tapering blades fanned out from a
 * point, each a two-segment strip, darker at the root than at the tip.
 */
function createProceduralTuft(
  scene: Scene,
  name: string,
  seed: number,
  tint: Color3,
): Mesh {
  const random = mulberry32(seed);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];

  for (let blade = 0; blade < BLADES_PER_TUFT; blade++) {
    const angle = (blade / BLADES_PER_TUFT) * Math.PI * 2 + random() * 0.8;
    const height = 0.16 + random() * 0.2;
    const lean = 0.05 + random() * 0.12;
    const half = 0.016 + random() * 0.012;
    const rootOffset = random() * 0.06;

    const outX = Math.cos(angle);
    const outZ = Math.sin(angle);
    // Blade width runs across the direction it leans in.
    const sideX = -outZ;
    const sideZ = outX;
    const rootX = outX * rootOffset;
    const rootZ = outZ * rootOffset;

    const base = positions.length / 3;
    const ring = (t: number, width: number) => {
      const reach = lean * t * t;
      const cx = rootX + outX * reach;
      const cz = rootZ + outZ * reach;
      const y = height * t;
      positions.push(cx - sideX * width, y, cz - sideZ * width);
      positions.push(cx + sideX * width, y, cz + sideZ * width);
      const shade = 0.55 + 0.45 * t;
      for (let i = 0; i < 2; i++) {
        colors.push(tint.r * shade, tint.g * shade, tint.b * shade, 1);
        normals.push(outX * 0.25, 0.95, outZ * 0.25);
      }
    };
    ring(0, half);
    ring(0.55, half * 0.72);
    positions.push(rootX + outX * lean, height, rootZ + outZ * lean);
    colors.push(tint.r, tint.g, tint.b, 1);
    normals.push(outX * 0.25, 0.95, outZ * 0.25);

    indices.push(
      base, base + 1, base + 3,
      base, base + 3, base + 2,
      base + 2, base + 3, base + 4,
    );
  }

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.colors = colors;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}

/**
 * Grass across the forest floor.
 *
 * With a grass atlas (the "grass-card" slot in the asset manifest), tufts
 * are crossed cards showing photographed blades. Without one, they fall
 * back to untextured blade geometry generated in code, which is a stand-in
 * rather than art.
 *
 * Either way it is built for cost: the map is divided into square patches,
 * each a single mesh drawn with GPU thin instances, so a patch is one draw
 * call however many tufts it holds. Patches outside the view are culled, and
 * patches beyond the draw distance are skipped entirely.
 *
 * Returns the number of tufts placed.
 */
export function buildGrass(
  scene: Scene,
  halfExtent: number,
  isReserved: (point: { x: number; z: number }) => boolean,
  atlas: Texture | null,
): number {
  const material = new StandardMaterial(
    atlas ? "grass-cards" : "grass-procedural",
    scene,
  );
  material.specularColor = Color3.Black();
  // Seen from both sides. Two-sided lighting stays off: it would flip the
  // upward normals on back faces and leave half the grass unlit.
  material.backFaceCulling = false;

  let templates: Mesh[];
  if (atlas) {
    atlas.hasAlpha = true;
    material.diffuseTexture = atlas;
    material.alphaCutOff = 0.35;
    // The atlas is a bright lawn green; pull it toward a darker forest floor.
    material.diffuseColor = new Color3(0.62, 0.7, 0.55);
    templates = [
      createCardTuft(scene, "grass-tuft-a", 11),
      createCardTuft(scene, "grass-tuft-b", 29),
    ];
  } else {
    material.diffuseColor = Color3.White();
    templates = [
      createProceduralTuft(scene, "grass-tuft-a", 11, new Color3(0.25, 0.34, 0.19)),
      createProceduralTuft(scene, "grass-tuft-b", 29, new Color3(0.31, 0.33, 0.19)),
    ];
  }
  for (const template of templates) {
    template.material = material;
    template.isVisible = false;
    template.isPickable = false;
  }

  const random = mulberry32(7331);
  const density = atlas ? DENSITY_CARDS : DENSITY_PROCEDURAL;
  const perCell = Math.round(CELL * CELL * density);
  let total = 0;
  let patch = 0;

  for (let cellZ = -halfExtent; cellZ < halfExtent; cellZ += CELL) {
    for (let cellX = -halfExtent; cellX < halfExtent; cellX += CELL) {
      const matrices: number[] = [];
      for (let i = 0; i < perCell; i++) {
        const x = cellX + random() * CELL;
        const z = cellZ + random() * CELL;
        const turn = random() * Math.PI * 2;
        const scale = 0.7 + random() * 0.7;
        const tall = 0.8 + random() * 0.5;
        if (Math.abs(x) > halfExtent || Math.abs(z) > halfExtent) continue;
        if (isReserved({ x, z })) continue;

        // Column-major matrix: scale, rotation about Y, translation.
        const cos = Math.cos(turn) * scale;
        const sin = Math.sin(turn) * scale;
        matrices.push(
          cos, 0, -sin, 0,
          0, scale * tall, 0, 0,
          sin, 0, cos, 0,
          x, 0, z, 1,
        );
      }
      if (matrices.length === 0) continue;

      const template = templates[patch % templates.length];
      if (!template) continue;
      const mesh = template.clone(`grass-patch-${patch++}`);
      mesh.makeGeometryUnique();
      mesh.isVisible = true;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.thinInstanceSetBuffer("matrix", new Float32Array(matrices), 16, true);
      // Thin instances are culled as a group; give the group real bounds.
      mesh.thinInstanceRefreshBoundingInfo(true);
      mesh.addLODLevel(DRAW_DISTANCE, null);
      mesh.freezeWorldMatrix();
      total += matrices.length / 16;
    }
  }
  return total;
}
