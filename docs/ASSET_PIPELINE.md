# Asset Pipeline

How 3D art gets into the game, what is in it now, and what is still missing.

## Overview

```
tools/fetch-assets.mjs      downloads the approved sources into asset-sources/   (git-ignored)
tools/process-assets.mjs    reduces, splits and packs them into apps/web/public/assets/
                            and regenerates apps/web/public/assets/manifest.json
apps/web/game/assets/AssetLibrary.ts    loads the manifest at start-up and places instances
```

To rebuild everything from scratch:

```bash
node tools/fetch-assets.mjs --download
```

```bash
node tools/process-assets.mjs
```

`manifest.json` is generated. Change `tools/process-assets.mjs`, not the manifest.

## What is in the game

All sources are CC0 (no attribution required, commercial use allowed).

| In game | Source | Notes |
|---|---|---|
| 13 mossy rocks | Poly Haven `rock_moss_set_01`, `rock_moss_set_02` | Scanned. About 2,000–2,400 triangles each, 400–450 at distance. |
| Tree stump | Poly Haven `tree_stump_01` | Scanned. 4,000 triangles, 700 at distance. |
| 2 fallen logs | Poly Haven `dead_tree_trunk`, `dead_tree_trunk_02` | Scanned. 5,000 triangles, 900 at distance. |
| 3 fallen branches | Poly Haven `dry_branches_medium_01` | Scanned. 1,400 triangles each. |
| 4 ferns | Poly Haven `fern_02` | Scanned. 800–2,400 triangles. |
| 3 conifers | **Authored** in `tools/build-conifer.mjs` | Trunk with Poly Haven `pine_bark`; branch cards with the twig texture from Poly Haven `fir_tree_01`. About 680 triangles, 130 at distance. |
| Forest floor | Poly Haven `forest_ground_04` | Colour and normal maps. |
| Roads and village ground | Poly Haven `rocky_trail` | Colour and normal maps. |
| Wolf clearings | Poly Haven `mud_forest` | Colour and normal maps. |
| Grass | ambientCG `Foliage001` | Blade atlas on crossed cards. |

The conifers are not scans. Poly Haven's scanned fir is 7.9 million triangles and 465 MB,
which a browser cannot use, so the trees are built the way most real-time games build
them: a trunk plus flat cards showing photographed branches.

Licences: <https://polyhaven.com/license> and <https://docs.ambientcg.com/license/>.

## How models are placed

- `buildForest.ts` asks the library for a model by **role** (`tree-conifer`, `rock`, `log`,
  `stump`, `debris`, `undergrowth`, `standing-stone`, `fungus`, `tree-dead`). Slots that
  share a role are variants, picked at random.
- If no model fills a role, the primitive placeholder is used, or nothing is placed for
  roles that have no sensible placeholder (ferns, stumps, branches).
- A file holding several objects is loaded once; each manifest slot names the object it
  stands for with `node`. The objects share one copy of the file's textures.
- Every placement is a set of GPU instances, with frozen world matrices.
- Lower-detail files and a cull distance are LOD levels on the source mesh.
- Collision uses one invisible cylinder per placement, sized from the object's bounds.

### Things the loader does that are easy to undo by accident

- **Source meshes are added to the scene, hidden.** Instances are lit through their
  source mesh, and a mesh only receives lights while it is in the scene. Without this,
  every model renders black.
- **Materials are converted to standard shading.** glTF materials load as physically
  based materials, which need image-based lighting from an environment map. The game has
  none yet. Roughness and occlusion maps are therefore unused for now.
- **Colour maps stay in gamma space** (`useSRGBBuffers: false`), matching every other
  texture in the scene. With the loader's default they render several times too dark.
- **Two-sided lighting is off** on loaded materials. Files are mirrored into Babylon's
  left-handed space, which reverses the winding order that mode relies on.
- **Each collision proxy is hidden individually.** Hiding a template does not hide its
  instances.

## Adding or replacing a model

1. Add its source to `tools/fetch-assets.mjs` (or drop the files into `asset-sources/<id>/`).
2. Add an entry to `MODELS` in `tools/process-assets.mjs` with its role and triangle budgets.
3. Run the two commands above and reload.

Models should have their base at the origin, Y up, in metres. A LOD file must contain the
same objects as the main file, in the same order.

## Known gaps

| Missing | Effect today |
|---|---|
| A night-sky HDR environment | No image-based lighting or visible sky; PBR materials cannot be used. |
| A dead tree model | Bare trees fall back to conifers. |
| Glowing mushrooms | Still a primitive stalk and cap. |
| A standing stone | The Old Shrine is ringed with large mossy rocks instead. |
| Village buildings and props | Still primitives. |
| The Warrior, villagers and wolf | Still primitives; these need skeletons and animations. |

Poly Haven's `boulder_01` was tried and dropped: the scan would not reduce below 54,000
triangles.

## Performance

Measured at 1280x720 on a GeForce MX350 with the GPU included:

| Location | Frame time |
|---|---|
| Village square | 14 ms |
| North gate | 9 ms |
| Forest road | 16 ms |
| Deep forest | 10 ms |
| Old Shrine, wolves nearby | 11 ms |

What the shadow pass costs is draw calls, not triangles: every shadow-casting mesh is
drawn once per cascade. Profiling showed tree foliage was cheap (under 2 ms) while 110
separate character and enemy meshes, always in the list, cost about 12 ms, and 22 nearby
scanned props about 10 ms. So the caster list is kept short:

- Characters and enemies cast only within 26 m of the player.
- Tiny parts (ears, eyes, tails, belts) never cast.
- Small props (bounding radius under 3 m) cast only within 15 m.
- Tall scenery casts within the shadow distance.

Building enemies from fewer meshes would cut this further.

## Verifying the pipeline

`apps/web/public/assets/_fixtures/` holds two tiny glTF boxes used only to test loading,
instancing, LOD switching and collision proxies. They are not game art and no manifest
slot points to them. In a development build, from the browser console:

```js
const { assets } = window.__valoriaDebug;
await assets.loadModel({
  id: "fixture", role: "fixture", description: "",
  file: "_fixtures/pipeline-test.gltf",
  lods: [{ file: "_fixtures/pipeline-test-lod.gltf", distance: 25 }],
  cullDistance: 60, collider: { radius: 0.5, height: 2 },
});
assets.place("fixture", { x: 0, z: -40 });
assets.report();
```
