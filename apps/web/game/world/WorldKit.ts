import "@babylonjs/core/Meshes/instancedMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

/** [diffuse r, g, b] and optional [emissive r, g, b]. */
const PALETTE = {
  earth: [[0.16, 0.19, 0.14]],
  packedEarth: [[0.25, 0.22, 0.19]],
  dirt: [[0.27, 0.22, 0.16]],
  corruptedEarth: [[0.26, 0.13, 0.13]],
  plaster: [[0.44, 0.4, 0.35]],
  timber: [[0.19, 0.13, 0.09]],
  wood: [[0.34, 0.25, 0.16]],
  roof: [[0.25, 0.13, 0.11]],
  thatch: [[0.36, 0.3, 0.17]],
  stone: [[0.38, 0.38, 0.4]],
  darkStone: [[0.2, 0.19, 0.22]],
  iron: [[0.2, 0.2, 0.23]],
  crimsonCloth: [[0.5, 0.15, 0.17]],
  goldCloth: [[0.62, 0.5, 0.27]],
  hay: [[0.58, 0.48, 0.24]],
  bark: [[0.2, 0.14, 0.1]],
  pine: [[0.1, 0.2, 0.14]],
  deadPine: [[0.17, 0.2, 0.17]],
  rock: [[0.3, 0.3, 0.33]],
  // Self-lit surfaces: they read as light sources without costing a light.
  glow: [[0.3, 0.2, 0.1], [1, 0.72, 0.36]],
  ember: [[0.3, 0.1, 0.05], [1, 0.42, 0.1]],
  spore: [[0.05, 0.2, 0.18], [0.25, 0.85, 0.75]],
} as const satisfies Record<string, readonly (readonly number[])[]>;

export type MaterialKey = keyof typeof PALETTE;

type Shape = "box" | "cylinder" | "cone" | "rock" | "roof";

export interface PlaceOptions {
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  /** Blocks movement. Default false. */
  collide?: boolean;
  /** Casts a shadow. Default false. */
  shadow?: boolean;
}

type Vec3 = readonly [number, number, number];

/**
 * Builds static scenery cheaply. Every prop is an instance of one hidden
 * template per (shape, material), so the whole world renders in a few dozen
 * draw calls, and each instance's transform is frozen once placed.
 */
export class WorldKit {
  private readonly materials = new Map<MaterialKey, StandardMaterial>();
  private readonly templates = new Map<string, Mesh>();
  private count = 0;
  /**
   * Props that should cast shadows. The environment decides which of them
   * are near enough to the player to be worth drawing into the shadow map.
   */
  readonly shadowCasters: InstancedMesh[] = [];

  constructor(readonly scene: Scene) {}

  /** Number of props placed so far. */
  get placed(): number {
    return this.count;
  }

  material(key: MaterialKey): StandardMaterial {
    let material = this.materials.get(key);
    if (!material) {
      const [diffuse, emissive] = PALETTE[key] as readonly (readonly number[])[];
      material = new StandardMaterial(`mat-${key}`, this.scene);
      material.diffuseColor = new Color3(diffuse![0], diffuse![1], diffuse![2]);
      material.specularColor = Color3.Black();
      if (emissive) {
        material.emissiveColor = new Color3(
          emissive[0]!,
          emissive[1]!,
          emissive[2]!,
        );
      }
      if (key === "roof" || key === "thatch") {
        // Roof prisms are open underneath and seen from both sides.
        material.backFaceCulling = false;
        material.twoSidedLighting = true;
      }
      this.materials.set(key, material);
    }
    return material;
  }

  /** A box of the given [width, height, depth] centred at `position`. */
  box(
    key: MaterialKey,
    size: Vec3,
    position: Vec3,
    options?: PlaceOptions,
  ): InstancedMesh {
    return this.place("box", key, size, position, options);
  }

  /** An upright cylinder centred at `position`. */
  cylinder(
    key: MaterialKey,
    diameter: number,
    height: number,
    position: Vec3,
    options?: PlaceOptions,
  ): InstancedMesh {
    return this.place(
      "cylinder",
      key,
      [diameter, height, diameter],
      position,
      options,
    );
  }

  /** A cone with its base at the bottom, centred at `position`. */
  cone(
    key: MaterialKey,
    diameter: number,
    height: number,
    position: Vec3,
    options?: PlaceOptions,
  ): InstancedMesh {
    return this.place(
      "cone",
      key,
      [diameter, height, diameter],
      position,
      options,
    );
  }

  /** A faceted boulder with the given radii. */
  rock(
    key: MaterialKey,
    radii: Vec3,
    position: Vec3,
    options?: PlaceOptions,
  ): InstancedMesh {
    return this.place("rock", key, radii, position, options);
  }

  /**
   * A pitched roof of [width, height, length]. `position` is the centre of
   * its base; the ridge runs along local Z.
   */
  roof(
    key: MaterialKey,
    size: Vec3,
    position: Vec3,
    options?: PlaceOptions,
  ): InstancedMesh {
    return this.place("roof", key, size, position, options);
  }

  /** A flat disc on the ground. Not instanced: there are only a handful. */
  disc(key: MaterialKey, radius: number, x: number, z: number, y = 0.02): Mesh {
    const mesh = CreateCylinder(
      `disc-${this.count++}`,
      { diameter: radius * 2, height: 0.04, tessellation: 56 },
      this.scene,
    );
    mesh.position.set(x, y, z);
    mesh.material = this.material(key);
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
  }

  private place(
    shape: Shape,
    key: MaterialKey,
    scale: Vec3,
    position: Vec3,
    options: PlaceOptions = {},
  ): InstancedMesh {
    const instance = this.template(shape, key).createInstance(
      `${shape}-${key}-${this.count++}`,
    );
    instance.position.set(position[0], position[1], position[2]);
    instance.scaling.set(scale[0], scale[1], scale[2]);
    instance.rotation.set(
      options.rotX ?? 0,
      options.rotY ?? 0,
      options.rotZ ?? 0,
    );
    instance.isPickable = false;
    if (options.collide) instance.checkCollisions = true;
    if (options.shadow) this.shadowCasters.push(instance);
    // Static scenery: compute the world matrix once, never again.
    instance.freezeWorldMatrix();
    return instance;
  }

  private template(shape: Shape, key: MaterialKey): Mesh {
    const id = `${shape}:${key}`;
    let mesh = this.templates.get(id);
    if (!mesh) {
      mesh = this.createTemplate(shape, `template-${id}`);
      mesh.material = this.material(key);
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      this.templates.set(id, mesh);
    }
    return mesh;
  }

  private createTemplate(shape: Shape, name: string): Mesh {
    switch (shape) {
      case "box":
        return CreateBox(name, { size: 1 }, this.scene);
      case "cylinder":
        return CreateCylinder(
          name,
          { diameter: 1, height: 1, tessellation: 10 },
          this.scene,
        );
      case "cone":
        return CreateCylinder(
          name,
          { diameterTop: 0, diameterBottom: 1, height: 1, tessellation: 8 },
          this.scene,
        );
      case "rock":
        return CreateIcoSphere(
          name,
          { radius: 1, subdivisions: 1, flat: true },
          this.scene,
        );
      case "roof":
        return createRoofPrism(name, this.scene);
    }
  }
}

/** A unit triangular prism: base 1 x 1 on the ground, ridge at height 1. */
function createRoofPrism(name: string, scene: Scene): Mesh {
  // prettier-ignore
  const positions = [
    // West slope
    -0.5, 0, -0.5,  -0.5, 0, 0.5,   0, 1, 0.5,   0, 1, -0.5,
    // East slope
     0.5, 0, 0.5,    0.5, 0, -0.5,  0, 1, -0.5,  0, 1, 0.5,
    // North gable
    -0.5, 0, 0.5,    0.5, 0, 0.5,   0, 1, 0.5,
    // South gable
     0.5, 0, -0.5,  -0.5, 0, -0.5,  0, 1, -0.5,
  ];
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13];
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}
