import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { ItemDefinition, ItemId } from "@valoria/game-types";

/** The player collects a pickup by coming within this distance of it. */
const COLLECT_RADIUS = 1.3;
const HOVER_HEIGHT = 0.75;

interface Pickup {
  itemId: ItemId;
  mesh: Mesh;
  /** Offsets the bobbing so pickups do not move in unison. */
  phase: number;
}

/**
 * Items lying in the world. Placeholder visuals: a glowing red orb for
 * consumables and a glowing blade for weapons, bobbing and turning so they
 * read as collectable. Collection is decided by the caller, so an item the
 * player has no room for stays where it is.
 */
export class PickupManager {
  private readonly pickups: Pickup[] = [];
  private readonly potionMaterial: StandardMaterial;
  private readonly weaponMaterial: StandardMaterial;
  private time = 0;

  constructor(private readonly scene: Scene) {
    this.potionMaterial = new StandardMaterial("pickup-potion", scene);
    this.potionMaterial.diffuseColor = new Color3(0.64, 0.24, 0.27);
    this.potionMaterial.emissiveColor = new Color3(0.5, 0.1, 0.12);

    this.weaponMaterial = new StandardMaterial("pickup-weapon", scene);
    this.weaponMaterial.diffuseColor = new Color3(0.8, 0.8, 0.85);
    this.weaponMaterial.emissiveColor = new Color3(0.45, 0.37, 0.2);
  }

  get count(): number {
    return this.pickups.length;
  }

  spawn(item: ItemDefinition, x: number, z: number): void {
    const name = `pickup-${item.id}-${this.pickups.length}`;
    let mesh: Mesh;
    if (item.kind === "weapon") {
      mesh = CreateBox(
        name,
        { width: 0.1, height: 1.1, depth: 0.16 },
        this.scene,
      );
      mesh.material = this.weaponMaterial;
      mesh.rotation.z = 0.5;
    } else {
      mesh = CreateIcoSphere(
        name,
        { radius: 0.22, subdivisions: 2 },
        this.scene,
      );
      mesh.material = this.potionMaterial;
    }
    mesh.position.set(x, HOVER_HEIGHT, z);
    mesh.isPickable = false;
    this.pickups.push({ itemId: item.id, mesh, phase: x * 1.7 + z * 0.9 });
  }

  /**
   * Animate the pickups and offer each one in reach to `tryCollect`. A pickup
   * is removed from the world only when `tryCollect` returns true.
   */
  update(
    dt: number,
    collector: { x: number; z: number },
    tryCollect: (itemId: ItemId) => boolean,
  ): void {
    this.time += dt;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      if (!pickup) continue;
      const { mesh } = pickup;
      mesh.position.y =
        HOVER_HEIGHT + Math.sin(this.time * 2.2 + pickup.phase) * 0.12;
      mesh.rotation.y += dt * 1.6;

      const distance = Math.hypot(
        mesh.position.x - collector.x,
        mesh.position.z - collector.z,
      );
      if (distance <= COLLECT_RADIUS && tryCollect(pickup.itemId)) {
        mesh.dispose();
        this.pickups.splice(i, 1);
      }
    }
  }
}
