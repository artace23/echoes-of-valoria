// Downloads the approved CC0 source assets into asset-sources/.
//
//   node tools/fetch-assets.mjs           list what would be downloaded
//   node tools/fetch-assets.mjs --download  download anything not present
//
// Sources are raw and large, so asset-sources/ is git-ignored. Run
// tools/process-assets.mjs afterwards to produce the files the game loads.
//
// Every asset here is CC0: https://polyhaven.com/license and
// https://docs.ambientcg.com/license/

import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "asset-sources");
const HEADERS = { "User-Agent": "asset-fetch-script" };

/** Poly Haven models: the glTF package at the given texture resolution. */
const POLYHAVEN_MODELS = [
  ["rock_moss_set_01", "1k"],
  ["rock_moss_set_02", "1k"],
  ["fern_02", "1k"],
  ["tree_stump_01", "1k"],
  ["dead_tree_trunk", "1k"],
  ["dead_tree_trunk_02", "1k"],
  ["dry_branches_medium_01", "1k"],
];

/** Poly Haven texture sets: individual maps as JPG. */
const POLYHAVEN_TEXTURES = [
  ["forest_ground_04", "1k", ["Diffuse", "nor_gl", "arm"]],
  ["rocky_trail", "1k", ["Diffuse", "nor_gl", "arm"]],
  ["mud_forest", "1k", ["Diffuse", "nor_gl", "arm"]],
  ["pine_bark", "1k", ["Diffuse", "nor_gl", "arm"]],
];

/**
 * Individual maps taken from a Poly Haven model, without its geometry.
 * The fir tree itself is 465 MB of mesh; only its scanned twig texture is
 * used, for the branch cards of the conifers built in tools/build-conifer.mjs.
 */
const POLYHAVEN_MODEL_MAPS = [
  ["fir_tree_01", "1k", ["twig_diff", "twig_alpha", "twig_nor_gl"]],
  // The fern's glTF ships a JPG colour map, which cannot carry transparency;
  // its cut-out mask is a separate map, merged in during processing.
  ["fern_02", "1k", ["Alpha"]],
];

/** ambientCG assets: one zip each. */
const AMBIENTCG = [
  ["Foliage001", "1K-JPG"],
  // Night sky for image-based lighting and the visible sky.
  ["NightSkyHDRI003", "1K"],
];

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

async function getJson(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.json();
}

async function exists(path, size) {
  try {
    return (await stat(path)).size === size;
  } catch {
    return false;
  }
}

/** Build the list of files to fetch: { url, path, size, label }. */
async function plan() {
  const files = [];

  for (const [id, resolution] of POLYHAVEN_MODELS) {
    const listing = await getJson(`https://api.polyhaven.com/files/${id}`);
    const entry = listing.gltf?.[resolution]?.gltf;
    if (!entry) throw new Error(`No ${resolution} glTF for ${id}`);
    files.push({
      url: entry.url,
      size: entry.size,
      path: join(OUT, id, `${id}.gltf`),
      label: id,
    });
    for (const [relative, include] of Object.entries(entry.include ?? {})) {
      files.push({
        url: include.url,
        size: include.size,
        path: join(OUT, id, relative),
        label: id,
      });
    }
  }

  for (const [id, resolution, maps] of [
    ...POLYHAVEN_TEXTURES,
    ...POLYHAVEN_MODEL_MAPS,
  ]) {
    const listing = await getJson(`https://api.polyhaven.com/files/${id}`);
    for (const map of maps) {
      const formats = listing[map]?.[resolution];
      // Alpha masks are only published as PNG; everything else as JPG.
      const [extension, entry] = formats?.jpg
        ? ["jpg", formats.jpg]
        : ["png", formats?.png];
      if (!entry) throw new Error(`No ${resolution} ${map} for ${id}`);
      files.push({
        url: entry.url,
        size: entry.size,
        path: join(OUT, id, `${id}_${map}_${resolution}.${extension}`),
        label: id,
      });
    }
  }

  for (const [id, attribute] of AMBIENTCG) {
    const result = await getJson(
      `https://ambientcg.com/api/v2/full_json?id=${id}&include=downloadData`,
    );
    const downloads =
      result.foundAssets?.[0]?.downloadFolders?.default
        ?.downloadFiletypeCategories?.zip?.downloads ?? [];
    const entry = downloads.find((d) => d.attribute === attribute);
    if (!entry) throw new Error(`No ${attribute} download for ${id}`);
    files.push({
      url: entry.downloadLink,
      size: entry.size,
      path: join(OUT, id, entry.fileName),
      label: id,
    });
  }

  return files;
}

async function download(file) {
  await mkdir(dirname(file.path), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(file.url, { headers: HEADERS });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(file.path),
      );
      if (await exists(file.path, file.size)) return;
      throw new Error("size mismatch");
    } catch (cause) {
      if (attempt === 4) throw cause;
      console.log(`  retrying ${file.path} (${cause.message})`);
    }
  }
}

const files = await plan();
const totals = new Map();
for (const file of files) {
  totals.set(file.label, (totals.get(file.label) ?? 0) + file.size);
}
for (const [label, size] of totals) {
  console.log(`${label.padEnd(26)} ${megabytes(size)}`);
}
console.log(
  `${"TOTAL".padEnd(26)} ${megabytes(files.reduce((sum, f) => sum + f.size, 0))} in ${files.length} files`,
);

if (process.argv.includes("--download")) {
  for (const file of files) {
    if (await exists(file.path, file.size)) continue;
    console.log(`downloading ${file.path.slice(OUT.length + 1)}`);
    await download(file);
  }
  console.log("done");
} else {
  console.log("\nDry run. Pass --download to fetch.");
}
