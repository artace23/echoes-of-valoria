import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { NpcDefinition, NpcId } from "@valoria/game-types";

/** The player can talk to an NPC from within this distance. */
const INTERACT_RANGE = 3.2;
/** NPCs turn to face a player who comes this close. */
const NOTICE_RANGE = 6;
const TURN_SHARPNESS = 5;
const BODY_HEIGHT = 1.45;

/**
 * What floats above an NPC's head.
 * - available: they have a quest to offer.
 * - ready: a quest can be turned in to them.
 */
export type NpcMarker = "none" | "available" | "ready";

interface Npc {
  definition: NpcDefinition;
  body: Mesh;
  marker: Mesh;
  markerState: NpcMarker;
}

/**
 * Reusable NPC system: builds a placeholder figure for every definition it
 * is given, makes them face the player, shows quest markers, and answers
 * "who can the player talk to right now?". It knows nothing about dialogue
 * or quests; the game loop decides what a conversation contains.
 */
export class NpcManager {
  private readonly npcs: Npc[] = [];
  private readonly markerMaterial: StandardMaterial;
  private time = 0;

  constructor(
    private readonly scene: Scene,
    definitions: readonly NpcDefinition[],
  ) {
    const skin = new StandardMaterial("npc-skin", scene);
    skin.diffuseColor = new Color3(0.72, 0.56, 0.45);
    skin.specularColor = Color3.Black();

    this.markerMaterial = new StandardMaterial("npc-marker", scene);
    this.markerMaterial.diffuseColor = Color3.Black();
    this.markerMaterial.emissiveColor = new Color3(0.95, 0.76, 0.36);

    for (const definition of definitions) {
      this.npcs.push(this.build(definition, skin));
    }
  }

  get meshes(): Mesh[] {
    return this.npcs.flatMap((npc) => [
      npc.body,
      ...(npc.body
        .getChildMeshes()
        .filter((mesh) => mesh !== npc.marker) as Mesh[]),
    ]);
  }

  /** The closest NPC within talking distance, if any. */
  nearest(position: { x: number; z: number }): NpcDefinition | null {
    let best: Npc | null = null;
    let bestDistance = INTERACT_RANGE;
    for (const npc of this.npcs) {
      const distance = Math.hypot(
        npc.body.position.x - position.x,
        npc.body.position.z - position.z,
      );
      if (distance <= bestDistance) {
        best = npc;
        bestDistance = distance;
      }
    }
    return best?.definition ?? null;
  }

  setMarker(id: NpcId, marker: NpcMarker): void {
    const npc = this.npcs.find((candidate) => candidate.definition.id === id);
    if (!npc) return;
    npc.markerState = marker;
    npc.marker.setEnabled(marker !== "none");
  }

  update(dt: number, player: { x: number; z: number }): void {
    this.time += dt;
    for (const npc of this.npcs) {
      const dx = player.x - npc.body.position.x;
      const dz = player.z - npc.body.position.z;
      const noticed = Math.hypot(dx, dz) <= NOTICE_RANGE;
      const targetYaw = noticed ? Math.atan2(dx, dz) : npc.definition.facing;
      npc.body.rotation.y +=
        shortestAngle(npc.body.rotation.y, targetYaw) *
        (1 - Math.exp(-TURN_SHARPNESS * dt));

      if (npc.markerState !== "none") {
        // A waiting reward spins faster and pulses, to draw the eye.
        const ready = npc.markerState === "ready";
        npc.marker.rotation.y = this.time * (ready ? 3.2 : 1.4);
        npc.marker.position.y =
          BODY_HEIGHT / 2 + 1.05 + Math.sin(this.time * 2.4) * 0.07;
        const pulse = ready ? 1.15 + Math.sin(this.time * 6) * 0.2 : 1;
        npc.marker.scaling.setAll(pulse);
      }
    }
  }

  /** A robed figure: tapered body, head and hood. Local +Z is forward. */
  private build(definition: NpcDefinition, skin: StandardMaterial): Npc {
    const { scene } = this;
    const [r, g, b] = definition.robeColor;
    const robe = new StandardMaterial(`npc-robe-${definition.id}`, scene);
    robe.diffuseColor = new Color3(r, g, b);
    robe.specularColor = Color3.Black();

    const body = CreateCylinder(
      `npc-${definition.id}`,
      {
        diameterTop: 0.5,
        diameterBottom: 0.95,
        height: BODY_HEIGHT,
        tessellation: 10,
      },
      scene,
    );
    body.material = robe;
    body.position.set(
      definition.position.x,
      BODY_HEIGHT / 2,
      definition.position.z,
    );
    body.rotation.y = definition.facing;
    body.checkCollisions = true;
    body.isPickable = false;

    const head = CreateIcoSphere(
      `npc-${definition.id}-head`,
      { radius: 0.25, subdivisions: 2 },
      scene,
    );
    head.material = skin;
    head.parent = body;
    head.position.y = BODY_HEIGHT / 2 + 0.22;

    const hood = CreateCylinder(
      `npc-${definition.id}-hood`,
      { diameterTop: 0, diameterBottom: 0.72, height: 0.5, tessellation: 8 },
      scene,
    );
    hood.material = robe;
    hood.parent = body;
    hood.position.set(0, BODY_HEIGHT / 2 + 0.5, -0.06);

    // A belt and a nose, so the figure has a readable front.
    const belt = CreateBox(
      `npc-${definition.id}-belt`,
      { width: 0.78, height: 0.1, depth: 0.78 },
      scene,
    );
    belt.material = this.markerMaterial;
    belt.parent = body;
    belt.position.y = 0.05;
    belt.scaling.set(1, 1, 1);

    const nose = CreateBox(
      `npc-${definition.id}-nose`,
      { width: 0.08, height: 0.1, depth: 0.1 },
      scene,
    );
    nose.material = skin;
    nose.parent = body;
    nose.position.set(0, BODY_HEIGHT / 2 + 0.2, 0.25);

    // Quest marker: a gold diamond floating overhead.
    const marker = CreateBox(
      `npc-${definition.id}-marker`,
      { size: 0.3 },
      scene,
    );
    marker.material = this.markerMaterial;
    marker.parent = body;
    marker.position.y = BODY_HEIGHT / 2 + 1.05;
    marker.rotation.set(Math.PI / 4, 0, Math.PI / 4);
    marker.isPickable = false;
    marker.setEnabled(false);

    return { definition, body, marker, markerState: "none" };
  }
}

function shortestAngle(from: number, to: number): number {
  const full = Math.PI * 2;
  return ((((to - from + Math.PI) % full) + full) % full) - Math.PI;
}
