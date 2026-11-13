// Turns the raw sources in asset-sources/ into the files the game loads,
// under apps/web/public/assets/, and regenerates manifest.json from what was
// actually produced.
//
//   node tools/fetch-assets.mjs --download
//   node tools/process-assets.mjs
//
// For each model: every object in the file is moved to the origin with its
// base on the ground, reduced to a triangle budget, and written to a .glb.
// A second, lower-detail .glb is written with no textures (it borrows the
// full model's material at load time). Sets of objects stay in one file so
// they share one copy of their textures.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import {
  dedup,
  getBounds,
  prune,
  simplifyPrimitive,
  weld,
} from "@gltf-transform/functions";
import jpeg from "jpeg-js";
import { MeshoptSimplifier } from "meshoptimizer";
import { PNG } from "pngjs";
import { CONIFERS, buildConiferGeometry } from "./build-conifer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "asset-sources");
const OUT = join(ROOT, "apps", "web", "public", "assets");

/**
 * Models to process. Triangle budgets are per object. `collide` adds an
 * invisible cylinder collider sized from the object's bounds.
 */
const MODELS = [
  { source: "rock_moss_set_01", role: "rock", triangles: 2400, lodTriangles: 450, lodDistance: 32, cull: 110, collide: true, shadows: true },
  { source: "rock_moss_set_02", role: "rock", triangles: 2000, lodTriangles: 400, lodDistance: 32, cull: 110, collide: true, shadows: true },
  { source: "tree_stump_01", role: "stump", triangles: 4000, lodTriangles: 700, lodDistance: 30, cull: 100, collide: true, shadows: true },
  { source: "dead_tree_trunk", role: "log", triangles: 5000, lodTriangles: 900, lodDistance: 30, cull: 100, collide: false, shadows: true },
  { source: "dead_tree_trunk_02", role: "log", triangles: 5000, lodTriangles: 900, lodDistance: 30, cull: 100, collide: false, shadows: true },
  { source: "dry_branches_medium_01", role: "debris", triangles: 1400, lodTriangles: 0, lodDistance: 0, cull: 38, collide: false, shadows: false },
  // Ferns are already light. Their colour map needs its cut-out mask merged in.
  { source: "fern_02", role: "undergrowth", triangles: 2400, lodTriangles: 0, lodDistance: 0, cull: 42, collide: false, shadows: false, alphaMask: "fern_02_Alpha_1k.jpg" },
];

/** Ground texture sets: source id -> manifest slot. */
const GROUND_TEXTURES = [
  { source: "forest_ground_04", id: "ground-forest", metres: 3.2, description: "Forest floor: dry earth, stones and needles." },
  { source: "rocky_trail", id: "ground-path", metres: 2, description: "Worn, stony trail." },
  { source: "mud_forest", id: "ground-corrupted", metres: 2.3, description: "Dark forest mud for the wolf clearings." },
];

const io = new NodeIO();
await MeshoptSimplifier.ready;

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

/** Read a JPG's pixels as RGBA. */
async function readJpeg(path) {
  return jpeg.decode(await readFile(path), { useTArray: true });
}

/** Combine a colour JPG and a greyscale mask JPG into one RGBA PNG. */
async function mergeAlpha(colorPath, maskPath) {
  const color = await readJpeg(colorPath);
  const mask = await readJpeg(maskPath);
  if (color.width !== mask.width || color.height !== mask.height) {
    throw new Error(`Size mismatch: ${colorPath} and ${maskPath}`);
  }
  const png = new PNG({ width: color.width, height: color.height });
  for (let i = 0; i < color.data.length; i += 4) {
    png.data[i] = color.data[i];
    png.data[i + 1] = color.data[i + 1];
    png.data[i + 2] = color.data[i + 2];
    png.data[i + 3] = mask.data[i];
  }
  return PNG.sync.write(png, { colorType: 6 });
}

const triangleCount = (primitive) =>
  (primitive.getIndices()?.getCount() ?? 0) / 3;

/** Move every top-level object to the origin with its base at y = 0. */
function recenter(document) {
  const scene = document.getRoot().listScenes()[0];
  const objects = [];
  for (const node of scene.listChildren()) {
    const bounds = getBounds(node);
    const [x, y, z] = node.getTranslation();
    node.setTranslation([
      x - (bounds.min[0] + bounds.max[0]) / 2,
      y - bounds.min[1],
      z - (bounds.min[2] + bounds.max[2]) / 2,
    ]);
    objects.push({
      name: node.getName(),
      width: bounds.max[0] - bounds.min[0],
      height: bounds.max[1] - bounds.min[1],
      depth: bounds.max[2] - bounds.min[2],
    });
  }
  return objects;
}

/** Reduce every primitive to at most `budget` triangles. */
function reduce(document, budget, error) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const before = triangleCount(primitive);
      if (before > budget) {
        simplifyPrimitive(primitive, {
          simplifier: MeshoptSimplifier,
          ratio: budget / before,
          error,
        });
      }
      total += triangleCount(primitive);
    }
  }
  return Math.round(total);
}

async function processModel(config) {
  const sourcePath = join(SRC, config.source, `${config.source}.gltf`);
  const file = `models/${config.source}.glb`;
  const lodFile = `models/${config.source}.lod1.glb`;

  // Full detail.
  const document = await io.read(sourcePath);
  const objects = recenter(document);
  if (config.alphaMask) {
    const material = document.getRoot().listMaterials()[0];
    const texture = material.getBaseColorTexture();
    const colorPath = join(SRC, config.source, texture.getURI());
    texture
      .setImage(await mergeAlpha(colorPath, join(SRC, config.source, config.alphaMask)))
      .setMimeType("image/png")
      .setURI("");
    material.setAlphaMode("MASK").setAlphaCutoff(0.45).setDoubleSided(true);
  }
  await document.transform(weld());
  const triangles = reduce(document, config.triangles, 0.05);
  await document.transform(prune(), dedup());
  const bytes = await io.writeBinary(document);
  await writeFile(join(OUT, file), bytes);

  // Lower detail: same objects, far fewer triangles, no textures.
  let lodBytes = 0;
  let lodTriangles = 0;
  if (config.lodTriangles > 0) {
    const lod = await io.read(sourcePath);
    recenter(lod);
    await lod.transform(weld());
    lodTriangles = reduce(lod, config.lodTriangles, 0.25);
    for (const texture of lod.getRoot().listTextures()) texture.dispose();
    // Keep the UVs: the LOD borrows the full model's textured material.
    await lod.transform(prune({ keepAttributes: true }), dedup());
    const data = await io.writeBinary(lod);
    await writeFile(join(OUT, lodFile), data);
    lodBytes = data.byteLength;
  }

  console.log(
    `${config.source.padEnd(24)} ${objects.length} object(s)  ${String(triangles).padStart(6)} tris` +
      (lodTriangles ? `  lod ${String(lodTriangles).padStart(5)}` : "           ") +
      `  ${megabytes(bytes.byteLength + lodBytes)}`,
  );

  return objects.map((object) => ({
    id: object.name.replaceAll("_", "-"),
    role: config.role,
    description: `Poly Haven "${config.source}" (CC0), object ${object.name}.`,
    file,
    node: object.name,
    lods: config.lodTriangles > 0 ? [{ file: lodFile, distance: config.lodDistance }] : [],
    cullDistance: config.cull,
    collider: config.collide
      ? {
          // Slightly inside the bounds, so the player can brush past edges.
          radius: +(Math.max(object.width, object.depth) * 0.36).toFixed(2),
          height: +Math.max(1.2, object.height).toFixed(2),
        }
      : null,
    castShadows: config.shadows,
    size: {
      width: +object.width.toFixed(2),
      height: +object.height.toFixed(2),
      depth: +object.depth.toFixed(2),
    },
  }));
}

/** Write one conifer file (all variants) at the given detail level. */
async function buildConifers(lowDetail) {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene("conifers");

  const bark = document.createMaterial("conifer-bark").setRoughnessFactor(1).setMetallicFactor(0).setDoubleSided(true);
  const needles = document
    .createMaterial("conifer-needles")
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0)
    .setDoubleSided(true)
    .setAlphaMode("MASK")
    .setAlphaCutoff(0.4);

  if (!lowDetail) {
    const image = async (name, path, mime) =>
      document.createTexture(name).setImage(await readFile(path)).setMimeType(mime);
    const barkDir = join(SRC, "pine_bark");
    bark
      .setBaseColorTexture(await image("bark-color", join(barkDir, "pine_bark_Diffuse_1k.jpg"), "image/jpeg"))
      .setNormalTexture(await image("bark-normal", join(barkDir, "pine_bark_nor_gl_1k.jpg"), "image/jpeg"));
    const arm = await image("bark-arm", join(barkDir, "pine_bark_arm_1k.jpg"), "image/jpeg");
    bark.setOcclusionTexture(arm).setMetallicRoughnessTexture(arm);

    const twigDir = join(SRC, "fir_tree_01");
    const twigColor = await mergeAlpha(
      join(twigDir, "fir_tree_01_twig_diff_1k.jpg"),
      join(twigDir, "fir_tree_01_twig_alpha_1k.jpg"),
    );
    needles
      .setBaseColorTexture(document.createTexture("twig-color").setImage(twigColor).setMimeType("image/png"))
      .setNormalTexture(await image("twig-normal", join(twigDir, "fir_tree_01_twig_nor_gl_1k.jpg"), "image/jpeg"));
  }

  const primitive = (geometry, material) => {
    const accessor = (type, array) =>
      document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    return document
      .createPrimitive()
      .setAttribute("POSITION", accessor("VEC3", new Float32Array(geometry.positions)))
      .setAttribute("NORMAL", accessor("VEC3", new Float32Array(geometry.normals)))
      .setAttribute("TEXCOORD_0", accessor("VEC2", new Float32Array(geometry.uvs)))
      .setIndices(accessor("SCALAR", new Uint16Array(geometry.indices)))
      .setMaterial(material);
  };

  let triangles = 0;
  for (const shape of CONIFERS) {
    const { trunk, foliage } = buildConiferGeometry(shape, lowDetail);
    triangles += (trunk.indices.length + foliage.indices.length) / 3;
    const mesh = document
      .createMesh(shape.name)
      .addPrimitive(primitive(trunk, bark))
      .addPrimitive(primitive(foliage, needles));
    scene.addChild(document.createNode(shape.name).setMesh(mesh));
  }

  const file = lowDetail ? "models/conifers.lod1.glb" : "models/conifers.glb";
  const bytes = await io.writeBinary(document);
  await writeFile(join(OUT, file), bytes);
  return { file, triangles: Math.round(triangles / CONIFERS.length), bytes: bytes.byteLength };
}

// ---------------------------------------------------------------------------

await mkdir(join(OUT, "models"), { recursive: true });
const models = [];

for (const config of MODELS) models.push(...(await processModel(config)));

const conifers = await buildConifers(false);
const conifersLod = await buildConifers(true);
console.log(
  `${"conifers (authored)".padEnd(24)} ${CONIFERS.length} object(s)  ${String(conifers.triangles).padStart(6)} tris each` +
    `  lod ${String(conifersLod.triangles).padStart(5)}  ${megabytes(conifers.bytes + conifersLod.bytes)}`,
);
for (const shape of CONIFERS) {
  models.push({
    id: shape.name.replaceAll("_", "-"),
    role: "tree-conifer",
    description:
      "Authored conifer: trunk with Poly Haven pine bark, branch cards with Poly Haven fir twigs (both CC0). Not a scan.",
    file: conifers.file,
    node: shape.name,
    lods: [{ file: conifersLod.file, distance: 34 }],
    cullDistance: 150,
    collider: { radius: +(shape.baseRadius + 0.12).toFixed(2), height: 4 },
    castShadows: true,
    size: { width: shape.reach * 2, height: shape.height, depth: shape.reach * 2 },
  });
}

// Ground textures: colour and normal maps, copied as they are.
const textures = [];
for (const set of GROUND_TEXTURES) {
  const directory = join(OUT, "textures", set.id);
  await mkdir(directory, { recursive: true });
  await copyFile(join(SRC, set.source, `${set.source}_Diffuse_1k.jpg`), join(directory, "color.jpg"));
  await copyFile(join(SRC, set.source, `${set.source}_nor_gl_1k.jpg`), join(directory, "normal.jpg"));
  textures.push({
    id: set.id,
    description: `${set.description} Poly Haven "${set.source}" (CC0).`,
    files: { color: `textures/${set.id}/color.jpg`, normal: `textures/${set.id}/normal.jpg` },
    /** One repeat of the texture covers this many metres. */
    metres: set.metres,
  });
}

// Grass blade atlas, with its opacity merged into the alpha channel.
const grassDir = join(SRC, "Foliage001", "extracted");
await writeFile(
  join(OUT, "textures", "grass-blades.png"),
  await mergeAlpha(join(grassDir, "Foliage001_1K-JPG_Color.jpg"), join(grassDir, "Foliage001_1K-JPG_Opacity.jpg")),
);
textures.push({
  id: "grass-card",
  description: 'Grass blade atlas with transparency. ambientCG "Foliage001" (CC0).',
  files: { color: "textures/grass-blades.png" },
});

// Night sky: the HDR panorama, copied as it is.
await mkdir(join(OUT, "environments"), { recursive: true });
await copyFile(
  join(SRC, "NightSkyHDRI003", "extracted", "NightSkyHDRI003_1K_HDR.exr"),
  join(OUT, "environments", "night-sky.exr"),
);

const manifest = {
  version: 1,
  about:
    'Generated by tools/process-assets.mjs; edit that script, not this file. Single source of truth for 3D art. A slot with "file": null has NOT been sourced: the game shows its placeholder instead. See docs/ASSET_PIPELINE.md.',
  models: [
    ...models,
    {
      id: "tree-dead-a",
      role: "tree-dead",
      description: "Bare, twisted dead tree for the deeper forest. Not sourced; conifers are used instead.",
      file: null,
    },
    {
      id: "mushroom-cluster-a",
      role: "fungus",
      description: "Cluster of faintly glowing mushrooms. Not sourced; a primitive placeholder is shown.",
      file: null,
    },
  ],
  textures,
  environments: [
    {
      id: "night-sky",
      description:
        'Moonlit night sky, for image-based lighting and the visible sky. ambientCG "NightSkyHDRI003" (CC0), 1K EXR.',
      file: "environments/night-sky.exr",
    },
  ],
};
await writeFile(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nmanifest.json: ${models.length} model slots, ${textures.length} texture sets`);
