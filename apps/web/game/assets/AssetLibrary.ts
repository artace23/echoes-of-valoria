import "@babylonjs/loaders/glTF/glTFFileLoader";
import "@babylonjs/loaders/glTF/2.0";
import "@babylonjs/core/Meshes/instancedMesh";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Material } from "@babylonjs/core/Materials/material";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";

const ASSET_ROOT = "/assets/";
/** Brightness multiplier applied to loaded models' colour maps. */
const SCAN_LIFT = 1.25;

/** One lower-detail version of a model, used beyond `distance` metres. */
export interface ModelLodSpec {
  file: string;
  distance: number;
}

/** A model slot in `public/assets/manifest.json`. */
export interface ModelSpec {
  id: string;
  /** What the model is used as, e.g. "tree-conifer". Slots sharing a role are variants. */
  role: string;
  description: string;
  /** Path under /assets/, or null if the model has not been sourced yet. */
  file: string | null;
  /**
   * Name of one object inside the file. Files holding a set of objects (for
   * example six rocks) are loaded once and share one copy of their textures;
   * each slot then names the object it stands for. Omit to use the whole file.
   */
  node?: string;
  lods?: ModelLodSpec[];
  /** Beyond this distance the model is not drawn at all. */
  cullDistance?: number;
  /** Upright cylinder used for collisions instead of the detailed mesh. */
  collider?: { radius: number; height: number } | null;
  castShadows?: boolean;
}

/** A texture set slot in the manifest. */
export interface TextureSpec {
  id: string;
  description: string;
  /** Paths under /assets/ by map name, or null if not sourced. */
  files: Record<string, string> | null;
  /** One repeat of the texture covers this many metres. */
  metres?: number;
}

export interface AssetManifest {
  version: number;
  models: ModelSpec[];
  textures?: TextureSpec[];
  environments?: { id: string; description: string; file: string | null }[];
}

export type ModelStatus = "loaded" | "not-sourced" | "failed";

export interface ModelReport {
  id: string;
  role: string;
  status: ModelStatus;
  /** Triangles in the full-detail model, when loaded. */
  triangles: number;
  lodLevels: number;
  /** Why loading failed, when it did. */
  error?: string;
}

export interface Placement {
  x: number;
  y?: number;
  z: number;
  /** Rotation about the vertical axis, in radians. */
  rotationY?: number;
  /** Uniform scale. Default 1. */
  scale?: number;
}

export interface LoadedTextureSet {
  /** Textures by map name, e.g. `color`, `normal`. */
  maps: Record<string, Texture>;
  /** One repeat covers this many metres, if the manifest says. */
  metres: number | null;
}

interface LoadedModel {
  spec: ModelSpec;
  container: AssetContainer;
  triangles: number;
  lodLevels: number;
  placed: number;
}

/**
 * Loads GLB/glTF models listed in the asset manifest and places instances of
 * them in the scene.
 *
 * - A slot whose `file` is null has not been sourced: nothing is requested,
 *   and `place()` returns null so the caller can show its placeholder.
 * - Each file is loaded once, however many slots use it. Every placement is
 *   a set of GPU instances of the model's meshes, so a forest of one tree
 *   costs one draw per material.
 * - Lower-detail files and a cull distance are applied as LOD levels on the
 *   source meshes, which all instances then share.
 * - Collisions use a simple invisible cylinder per placement rather than the
 *   detailed mesh.
 */
export class AssetLibrary {
  private readonly models = new Map<string, LoadedModel>();
  private readonly failures = new Map<string, string>();
  private readonly containers = new Map<string, Promise<AssetContainer>>();
  private readonly converted = new Map<Material, StandardMaterial>();
  private colliderTemplate: Mesh | null = null;

  private constructor(
    private readonly scene: Scene,
    private readonly manifest: AssetManifest,
    private readonly root: string,
  ) {}

  /**
   * Read the manifest and load every sourced model. Never throws: a missing
   * manifest or a broken file is recorded and the game carries on with
   * placeholders.
   */
  static async load(scene: Scene, root: string = ASSET_ROOT): Promise<AssetLibrary> {
    let manifest: AssetManifest = { version: 1, models: [] };
    try {
      const response = await fetch(`${root}manifest.json`, { cache: "no-cache" });
      if (response.ok) {
        const parsed: unknown = await response.json();
        if (isManifest(parsed)) manifest = parsed;
      }
    } catch {
      // No manifest: an empty library, and every prop falls back.
    }

    const library = new AssetLibrary(scene, manifest, root);
    await Promise.all(
      manifest.models
        .filter((spec) => spec.file !== null)
        .map((spec) => library.loadModel(spec)),
    );
    return library;
  }

  /** Ids of loaded models that fill the given role. */
  variants(role: string): string[] {
    const ids: string[] = [];
    for (const model of this.models.values()) {
      if (model.spec.role === role) ids.push(model.spec.id);
    }
    return ids;
  }

  has(id: string): boolean {
    return this.models.has(id);
  }

  /**
   * Textures for a slot in the manifest, or null if it has not been sourced.
   * Loading is asynchronous; the textures appear when ready.
   */
  textureSet(id: string): LoadedTextureSet | null {
    const spec = this.manifest.textures?.find((entry) => entry.id === id);
    if (!spec?.files) return null;
    const maps: Record<string, Texture> = {};
    for (const [name, file] of Object.entries(spec.files)) {
      maps[name] = new Texture(this.root + file, this.scene);
    }
    return { maps, metres: spec.metres ?? null };
  }

  /**
   * Load a model. Called for every sourced manifest slot at start-up; may
   * also be called directly, e.g. with a test fixture. Returns whether it
   * loaded.
   */
  async loadModel(spec: ModelSpec): Promise<boolean> {
    if (!spec.file) return false;
    try {
      const container = await this.container(spec.file);
      const sources = geometryMeshes(container, spec.node);
      if (sources.length === 0) {
        throw new Error(
          spec.node
            ? `the file has no object named "${spec.node}"`
            : "the file contains no meshes",
        );
      }

      let lodLevels = 0;
      for (const lod of spec.lods ?? []) {
        const lodContainer = await this.container(lod.file);
        const lodMeshes = geometryMeshes(lodContainer, spec.node);
        if (lodMeshes.length !== sources.length) {
          throw new Error(
            `LOD "${lod.file}" has ${lodMeshes.length} meshes; the model has ${sources.length}. They must match one to one.`,
          );
        }
        sources.forEach((source, index) => {
          const lodMesh = lodMeshes[index];
          if (!lodMesh) return;
          // LOD files carry no textures; they borrow the full model's
          // material, so the surface matches as the detail drops.
          lodMesh.material = this.standardMaterial(source.material);
          lodMesh.isPickable = false;
          lodMesh.receiveShadows = true;
          source.addLODLevel(lod.distance, lodMesh);
        });
        lodLevels++;
      }
      if (spec.cullDistance) {
        for (const source of sources) source.addLODLevel(spec.cullDistance, null);
        lodLevels++;
      }

      for (const source of sources) {
        source.isPickable = false;
        source.receiveShadows = true;
        source.material = this.standardMaterial(source.material);
      }
      this.models.set(spec.id, {
        spec,
        container,
        triangles: sources.reduce(
          (total, mesh) => total + mesh.getTotalIndices() / 3,
          0,
        ),
        lodLevels,
        placed: 0,
      });
      this.failures.delete(spec.id);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.failures.set(spec.id, message);
      console.warn(`[assets] Could not load "${spec.id}" (${spec.file}): ${message}`);
      return false;
    }
  }

  /**
   * Place an instance of a model. Returns the meshes created, or null if the
   * model is not available, in which case the caller should fall back.
   */
  place(
    id: string,
    placement: Placement,
    options: { freeze?: boolean } = {},
  ): { meshes: AbstractMesh[]; castShadows: boolean } | null {
    const model = this.models.get(id);
    if (!model) return null;

    const index = model.placed++;
    const wanted = model.spec.node;
    const entries = model.container.instantiateModelsToScene(
      (sourceName) => `${id}#${index}:${sourceName}`,
      false,
      {
        doNotInstantiate: false,
        // In a multi-object file, take only this slot's object (and the
        // file's root, which carries the glTF coordinate conversion).
        predicate: wanted
          ? (entity) => {
              const node = entity as Node;
              return !node.parent || isWithin(node, wanted);
            }
          : undefined,
      },
    );

    const meshes: AbstractMesh[] = [];
    for (const root of entries.rootNodes as TransformNode[]) {
      root.position.set(placement.x, placement.y ?? 0, placement.z);
      // glTF roots carry a quaternion; clear it so the Euler angles apply.
      root.rotationQuaternion = null;
      root.rotation.set(0, placement.rotationY ?? 0, 0);
      const scale = placement.scale ?? 1;
      // Keep the sign of the loader's handedness flip on each axis.
      root.scaling.set(
        Math.sign(root.scaling.x || 1) * scale,
        Math.sign(root.scaling.y || 1) * scale,
        Math.sign(root.scaling.z || 1) * scale,
      );
      root.computeWorldMatrix(true);
      for (const mesh of root.getChildMeshes(false)) {
        mesh.isPickable = false;
        mesh.computeWorldMatrix(true);
        if (options.freeze !== false) mesh.freezeWorldMatrix();
        meshes.push(mesh);
      }
    }

    const collider = model.spec.collider;
    if (collider) {
      const scale = placement.scale ?? 1;
      const proxy = this.colliderMesh().createInstance(`${id}#${index}:collider`);
      proxy.position.set(
        placement.x,
        (placement.y ?? 0) + (collider.height * scale) / 2,
        placement.z,
      );
      proxy.scaling.set(
        collider.radius * 2 * scale,
        collider.height * scale,
        collider.radius * 2 * scale,
      );
      proxy.checkCollisions = true;
      proxy.isPickable = false;
      // Hiding the template does not hide its instances; each must be hidden.
      proxy.isVisible = false;
      proxy.freezeWorldMatrix();
    }

    return { meshes, castShadows: model.spec.castShadows !== false };
  }

  /** Status of every slot, for diagnostics and the missing-asset report. */
  report(): ModelReport[] {
    const reports: ModelReport[] = this.manifest.models.map((spec) => {
      const model = this.models.get(spec.id);
      const error = this.failures.get(spec.id);
      return {
        id: spec.id,
        role: spec.role,
        status: model ? "loaded" : spec.file ? "failed" : "not-sourced",
        triangles: model ? Math.round(model.triangles) : 0,
        lodLevels: model?.lodLevels ?? 0,
        ...(error ? { error } : {}),
      };
    });
    // Models loaded directly (not from the manifest) are reported too.
    for (const model of this.models.values()) {
      if (reports.some((report) => report.id === model.spec.id)) continue;
      reports.push({
        id: model.spec.id,
        role: model.spec.role,
        status: "loaded",
        triangles: Math.round(model.triangles),
        lodLevels: model.lodLevels,
      });
    }
    return reports;
  }

  /**
   * The standard-shaded equivalent of a loaded glTF material.
   *
   * glTF materials load as physically based materials, which rely on
   * image-based lighting from an environment map. The game has none yet, and
   * without it they render almost black beside the rest of the world. So each
   * is converted once to the same standard shading everything else uses,
   * keeping its colour map, normal map and cut-out transparency. Roughness
   * and occlusion maps are not used until an environment is sourced.
   */
  private standardMaterial(material: Material | null): Material | null {
    if (!material || material.getClassName() !== "PBRMaterial") return material;
    const existing = this.converted.get(material);
    if (existing) return existing;

    const source = material as PBRMaterial;
    const standard = new StandardMaterial(`${source.name}-standard`, this.scene);
    // Scanned colour maps are calibrated for daylight and read as near-black
    // under moonlight, so they are lifted to sit with the rest of the scene.
    standard.diffuseColor = new Color3(SCAN_LIFT, SCAN_LIFT, SCAN_LIFT);
    standard.specularColor = new Color3(0.04, 0.04, 0.05);
    standard.specularPower = 16;
    standard.backFaceCulling = source.backFaceCulling;
    // Files are mirrored into Babylon's left-handed space, which reverses
    // the winding order two-sided lighting relies on. The models' own
    // normals are correct, so they are used as they are.
    standard.twoSidedLighting = false;

    const color = source.albedoTexture as BaseTexture | null;
    if (color) {
      standard.diffuseTexture = color;
      // Cut-out materials (ferns, needles) test against the colour's alpha.
      if (source.needAlphaTesting()) {
        color.hasAlpha = true;
        standard.alphaCutOff = source.alphaCutOff;
      }
    } else {
      standard.diffuseColor = source.albedoColor.clone();
    }
    if (source.bumpTexture) {
      standard.bumpTexture = source.bumpTexture;
      standard.invertNormalMapX = source.invertNormalMapX;
      standard.invertNormalMapY = source.invertNormalMapY;
    }

    this.converted.set(material, standard);
    return standard;
  }

  /** Load a file once, however many slots refer to it. */
  private container(file: string): Promise<AssetContainer> {
    let pending = this.containers.get(file);
    if (!pending) {
      pending = LoadAssetContainerAsync(this.root + file, this.scene, {
        pluginOptions: {
          // Keep colour maps in gamma space, like every other texture in the
          // scene. The loader's default decodes them to linear, which the
          // standard materials used here would then show several times too
          // dark.
          gltf: { useSRGBBuffers: false },
        },
      }).then(
        (container) => {
          // Instances are lit and shaded through their source mesh, and a
          // mesh only receives the scene's lights while it is in the scene.
          // So the sources join the scene, hidden; hiding a source does not
          // hide its instances.
          container.addAllToScene();
          for (const mesh of container.meshes) {
            mesh.isVisible = false;
            mesh.isPickable = false;
          }
          return container;
        },
      );
      this.containers.set(file, pending);
      // A failed load should be retried by the next caller, not cached.
      pending.catch(() => this.containers.delete(file));
    }
    return pending;
  }

  /** A unit cylinder that is collidable but never drawn. */
  private colliderMesh(): Mesh {
    if (!this.colliderTemplate) {
      const template = CreateCylinder(
        "asset-collider",
        { diameter: 1, height: 1, tessellation: 8 },
        this.scene,
      );
      template.isVisible = false;
      template.isPickable = false;
      this.colliderTemplate = template;
    }
    return this.colliderTemplate;
  }
}

/** True if the node is, or is inside, the object with the given name. */
function isWithin(node: Node, name: string): boolean {
  for (let current: Node | null = node; current; current = current.parent) {
    if (current.name === name) return true;
  }
  return false;
}

/** Meshes with geometry in a file, optionally only those of one object. */
function geometryMeshes(container: AssetContainer, node?: string): Mesh[] {
  return container.meshes.filter(
    (mesh): mesh is Mesh =>
      mesh.getClassName() === "Mesh" &&
      mesh.getTotalVertices() > 0 &&
      (!node || isWithin(mesh, node)),
  );
}

function isManifest(value: unknown): value is AssetManifest {
  if (typeof value !== "object" || value === null) return false;
  const models = (value as { models?: unknown }).models;
  return (
    Array.isArray(models) &&
    models.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as ModelSpec).id === "string" &&
        typeof (entry as ModelSpec).role === "string" &&
        ((entry as ModelSpec).file === null ||
          typeof (entry as ModelSpec).file === "string"),
    )
  );
}
