import { WORLD } from "@valoria/game-data";
import type { WorldKit } from "./WorldKit";

interface HouseSpec {
  x: number;
  z: number;
  /** Size along the house's local X (the wall the door is in). */
  width: number;
  /** Size along the house's local Z. */
  depth: number;
  height: number;
  /** Direction the door faces, in radians (0 = north). */
  facing: number;
  roof?: "roof" | "thatch";
  roofHeight?: number;
}

const QUARTER = Math.PI / 2;

/** Where the training construct stands, inside the fenced yard. */
export const TRAINING_YARD = { x: 19.5, z: -54.5 };

const HOUSES: readonly HouseSpec[] = [
  // Elder's hall, at the south end of the main street, facing up it.
  { x: 0, z: -68.5, width: 11, depth: 6.5, height: 4.4, facing: 0, roofHeight: 3 },
  // West side of the street.
  { x: -11, z: -40, width: 6, depth: 6, height: 3.2, facing: QUARTER, roof: "thatch" },
  { x: -13, z: -61, width: 6, depth: 6.5, height: 3.4, facing: QUARTER },
  // East side of the street.
  { x: 11, z: -39, width: 6, depth: 6.5, height: 3.2, facing: -QUARTER },
  { x: 19, z: -41, width: 5.5, depth: 5.5, height: 3, facing: -QUARTER, roof: "thatch" },
  // Smithy.
  { x: 14.5, z: -61.5, width: 6.5, depth: 6, height: 3.2, facing: -QUARTER },
  // Herbalist's hut, at the west end of the cross street.
  { x: -21.5, z: -50, width: 5, depth: 5, height: 2.9, facing: QUARTER, roof: "thatch" },
];

/**
 * Ashen Village: a walled settlement of timber-framed houses around a well,
 * with a gate facing the forest. Built entirely from instanced primitives.
 */
export function buildVillage(kit: WorldKit): void {
  const { village, villageWallRadius: wallRadius, northGate } = WORLD;
  const cx = village.center.x;
  const cz = village.center.z;

  kit.disc("packedEarth", wallRadius + 1, cx, cz);

  for (const house of HOUSES) buildHouse(kit, house);
  buildPalisade(kit, cx, cz, wallRadius);
  buildGate(kit, northGate.x, northGate.z);
  buildWell(kit, cx, cz);
  buildSmithyYard(kit);
  buildTrainingYard(kit);
  buildHerbGarden(kit);

  // Market stalls on the square.
  buildStall(kit, -5.5, -45.5, 0.3, "crimsonCloth");
  buildStall(kit, 6, -54.5, -2.9, "goldCloth");

  // Lanterns along the streets. Self-lit, so they cost no dynamic lights.
  for (const [x, z] of [
    [-2.9, -30],
    [2.9, -37],
    [-2.9, -44],
    [2.9, -56],
    [-2.9, -62],
    [-9, -47.6],
    [9, -52.4],
    [16, -47.6],
  ] as const) {
    buildLantern(kit, x, z);
  }

  // Clutter: barrels, crates and hay near the buildings.
  for (const [x, z] of [
    [-7.2, -43.5],
    [-7.6, -42.6],
    [7.4, -42.2],
    [-9, -63.8],
    [15.8, -44.6],
    [4.6, -65.2],
    [-18, -53.4],
    [10.6, -65.2],
  ] as const) {
    kit.cylinder("wood", 0.75, 0.95, [x, 0.48, z], { collide: true, shadow: true });
  }
  for (const [x, z, size, turn] of [
    [-6.6, -37.2, 0.9, 0.3],
    [7.6, -35.8, 0.8, 0.7],
    [8.4, -36.2, 0.6, 0.1],
    [-4.6, -65.6, 0.9, 0.5],
    [-17.2, -46.8, 0.7, 0.2],
    [5.4, -46.4, 0.8, 0.9],
  ] as const) {
    kit.box("wood", [size, size, size], [x, size / 2, z], {
      rotY: turn,
      collide: true,
      shadow: true,
    });
  }
  // Benches by the well.
  kit.box("wood", [2, 0.14, 0.5], [-3.4, 0.5, -52.4], { rotY: 0.4 });
  kit.box("wood", [2, 0.14, 0.5], [3.2, 0.5, -47.4], { rotY: 0.5 });
  for (const [x, z] of [
    [-4.2, -52.75],
    [-2.6, -52.05],
    [2.4, -47.8],
    [4, -47],
  ] as const) {
    kit.box("timber", [0.14, 0.5, 0.4], [x, 0.25, z], { rotY: 0.45 });
  }
}

/** Convert a point in a building's local frame to world coordinates. */
function localToWorld(
  x: number,
  z: number,
  facing: number,
  lx: number,
  lz: number,
): [number, number] {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  return [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
}

function buildHouse(kit: WorldKit, house: HouseSpec): void {
  const { x, z, width, depth, height, facing } = house;
  const roofKey = house.roof ?? "roof";
  const roofHeight = house.roofHeight ?? 2.3;
  const at = (lx: number, lz: number) => localToWorld(x, z, facing, lx, lz);

  kit.box("plaster", [width, height, depth], [x, height / 2, z], {
    rotY: facing,
    collide: true,
    shadow: true,
  });
  // Stone footing and timber framing.
  kit.box("stone", [width + 0.2, 0.5, depth + 0.2], [x, 0.25, z], { rotY: facing });
  kit.box("timber", [width + 0.16, 0.26, depth + 0.16], [x, height - 0.13, z], {
    rotY: facing,
  });
  for (const lx of [-width / 2, width / 2]) {
    for (const lz of [-depth / 2, depth / 2]) {
      const [px, pz] = at(lx, lz);
      kit.box("timber", [0.32, height, 0.32], [px, height / 2, pz], { rotY: facing });
    }
  }

  kit.roof(roofKey, [width + 1, roofHeight, depth + 1], [x, height, z], {
    rotY: facing,
    shadow: true,
  });

  // Door and lit windows on the front; a window on each side wall.
  const front = depth / 2 + 0.04;
  const [doorX, doorZ] = at(0, front);
  kit.box("wood", [1.15, 2.05, 0.14], [doorX, 1.03, doorZ], { rotY: facing });
  for (const lx of [-(width / 2 - 1.25), width / 2 - 1.25]) {
    const [wx, wz] = at(lx, front);
    kit.box("glow", [0.8, 0.8, 0.1], [wx, 1.75, wz], { rotY: facing });
    kit.box("timber", [1, 0.12, 0.16], [wx, 1.28, wz], { rotY: facing });
  }
  for (const lx of [-(width / 2 + 0.04), width / 2 + 0.04]) {
    const [wx, wz] = at(lx, 0);
    kit.box("glow", [0.1, 0.75, 0.9], [wx, 1.75, wz], { rotY: facing });
  }

  const [chimneyX, chimneyZ] = at(width / 4, -depth / 4);
  kit.box("stone", [0.75, roofHeight + 0.5, 0.75], [chimneyX, height + roofHeight / 2, chimneyZ], {
    rotY: facing,
    shadow: true,
  });
}

/** A ring of wall segments with a gap for the north gate. */
function buildPalisade(kit: WorldKit, cx: number, cz: number, radius: number): void {
  const segments = 46;
  const length = (2 * Math.PI * radius) / segments;
  for (let i = 0; i < segments; i++) {
    const angle = ((i + 0.5) / segments) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;
    // Leave the gateway open.
    if (z > cz && Math.abs(x - cx) < 4.6) continue;

    const turn = Math.atan2(-Math.cos(angle), -Math.sin(angle));
    kit.box("timber", [length + 0.25, 3.2, 0.4], [x, 1.6, z], {
      rotY: turn,
      collide: true,
      shadow: true,
    });
    // A taller sharpened post where each segment meets the next.
    const postAngle = (i / segments) * Math.PI * 2;
    const px = cx + Math.cos(postAngle) * radius;
    const pz = cz + Math.sin(postAngle) * radius;
    if (pz > cz && Math.abs(px - cx) < 4.2) continue;
    kit.cylinder("wood", 0.42, 3.6, [px, 1.8, pz]);
    kit.cone("wood", 0.42, 0.6, [px, 3.9, pz]);
  }
}

function buildGate(kit: WorldKit, x: number, z: number): void {
  for (const side of [-1, 1]) {
    const tx = x + side * 4.4;
    kit.box("stone", [2.8, 6.4, 2.8], [tx, 3.2, z - 0.4], { collide: true, shadow: true });
    kit.box("darkStone", [3.1, 0.4, 3.1], [tx, 6.6, z - 0.4]);
    kit.cone("roof", 4.2, 2.2, [tx, 7.9, z - 0.4], { rotY: Math.PI / 4, shadow: true });
    kit.box("glow", [0.34, 0.42, 0.34], [tx - side * 1.6, 3.1, z + 0.2]);
    kit.box("iron", [0.5, 0.1, 0.5], [tx - side * 1.6, 3.38, z + 0.2]);
  }
  // Lintel and a banner hanging over the road.
  kit.box("timber", [6.2, 0.55, 0.6], [x, 5.2, z - 0.4], { shadow: true });
  kit.box("crimsonCloth", [1.5, 2, 0.06], [x, 3.95, z - 0.4]);
  kit.box("goldCloth", [1.5, 0.16, 0.08], [x, 3.05, z - 0.4]);

  // Signpost just outside, pointing up the forest road.
  kit.cylinder("wood", 0.16, 2.4, [x + 3.4, 1.2, z + 4.2], { collide: true });
  kit.box("wood", [1.5, 0.34, 0.08], [x + 3.4, 2.1, z + 4.2], { rotY: QUARTER });
}

function buildWell(kit: WorldKit, x: number, z: number): void {
  kit.cylinder("stone", 2.3, 0.9, [x, 0.45, z], { collide: true, shadow: true });
  kit.cylinder("darkStone", 1.7, 0.06, [x, 0.9, z]);
  for (const side of [-1, 1]) {
    kit.box("timber", [0.2, 2.5, 0.2], [x + side * 1.05, 1.25, z], { shadow: true });
  }
  kit.box("timber", [2.5, 0.16, 0.16], [x, 2.4, z]);
  kit.roof("thatch", [1.6, 0.8, 3], [x, 2.5, z], { rotY: QUARTER, shadow: true });
}

function buildSmithyYard(kit: WorldKit): void {
  // Open-sided forge shelter in front of the smithy.
  for (const [x, z] of [
    [8.2, -64],
    [10.8, -64],
    [8.2, -60.6],
    [10.8, -60.6],
  ] as const) {
    kit.box("timber", [0.22, 2.6, 0.22], [x, 1.3, z], { shadow: true });
  }
  kit.roof("roof", [3.4, 0.9, 4.2], [9.5, 2.6, -62.3], { shadow: true });
  // Forge with glowing coals, anvil on a stump, quench barrel.
  kit.box("stone", [1.7, 1, 1.5], [9.5, 0.5, -63.1], { collide: true, shadow: true });
  kit.box("ember", [1.2, 0.12, 1], [9.5, 1.04, -63.1]);
  kit.box("stone", [0.6, 1.9, 0.6], [10.1, 1.95, -63.5]);
  kit.cylinder("wood", 0.6, 0.55, [9.3, 0.28, -60.9], { collide: true });
  kit.box("iron", [0.75, 0.24, 0.3], [9.3, 0.67, -60.9], { rotY: 0.3 });
  kit.box("iron", [0.26, 0.14, 0.24], [9.3, 0.86, -60.9], { rotY: 0.3 });
  kit.cylinder("wood", 0.7, 0.85, [10.9, 0.43, -59.6], { collide: true });
  // Rack of finished blades.
  kit.box("wood", [1.8, 1.3, 0.12], [7.6, 0.65, -65.4], { rotY: 0.2 });
  for (const offset of [-0.55, 0, 0.55]) {
    kit.box("iron", [0.08, 1.05, 0.05], [7.6 + offset, 0.75, -65.3], {
      rotY: 0.2,
      rotZ: 0.08,
    });
  }
}

function buildTrainingYard(kit: WorldKit): void {
  const { x, z } = TRAINING_YARD;
  // Low rail fence on three sides; open toward the street.
  for (const [fx, fz, length, turn] of [
    [x, z - 3.5, 7, 0],
    [x + 3.5, z, 7, QUARTER],
    [x, z + 3.5, 7, 0],
  ] as const) {
    kit.box("wood", [length, 0.12, 0.12], [fx, 0.95, fz], { rotY: turn });
    kit.box("wood", [length, 0.12, 0.12], [fx, 0.5, fz], { rotY: turn, collide: true });
  }
  for (const [px, pz] of [
    [x - 3.5, z - 3.5],
    [x, z - 3.5],
    [x + 3.5, z - 3.5],
    [x + 3.5, z],
    [x + 3.5, z + 3.5],
    [x, z + 3.5],
    [x - 3.5, z + 3.5],
  ] as const) {
    kit.cylinder("timber", 0.22, 1.25, [px, 0.63, pz]);
  }
  // Hay bales and an archery butt.
  kit.cylinder("hay", 1.1, 0.9, [x + 2.4, 0.55, z - 2.5], { rotZ: QUARTER, shadow: true });
  kit.cylinder("hay", 1.1, 0.9, [x + 2.5, 0.55, z + 2.4], { rotZ: QUARTER, rotY: 0.5, shadow: true });
  kit.cylinder("hay", 1.3, 0.3, [x + 3, 1.3, z], { rotZ: QUARTER, shadow: true });
  kit.cylinder("crimsonCloth", 0.5, 0.32, [x + 2.98, 1.3, z], { rotZ: QUARTER });
  kit.box("timber", [0.14, 1.3, 0.14], [x + 3.2, 0.65, z]);
}

function buildHerbGarden(kit: WorldKit): void {
  // Drying rack and planters beside the herbalist's hut.
  kit.box("timber", [0.12, 1.9, 0.12], [-18.2, 0.95, -53.2]);
  kit.box("timber", [0.12, 1.9, 0.12], [-18.2, 0.95, -55.4]);
  kit.box("timber", [0.1, 0.1, 2.4], [-18.2, 1.85, -54.3]);
  for (const offset of [-0.7, 0, 0.7]) {
    kit.cone("pine", 0.28, 0.6, [-18.2, 1.5, -54.3 + offset], { rotX: Math.PI });
  }
  for (const [x, z] of [
    [-17.4, -45.6],
    [-19.2, -45.2],
  ] as const) {
    kit.box("wood", [1.4, 0.4, 0.8], [x, 0.2, z]);
    kit.box("pine", [1.2, 0.3, 0.6], [x, 0.5, z]);
    kit.box("spore", [0.16, 0.16, 0.16], [x + 0.3, 0.72, z]);
  }
}

function buildStall(
  kit: WorldKit,
  x: number,
  z: number,
  facing: number,
  cloth: "crimsonCloth" | "goldCloth",
): void {
  const at = (lx: number, lz: number) => localToWorld(x, z, facing, lx, lz);
  kit.box("wood", [2.8, 0.9, 1.2], [x, 0.45, z], { rotY: facing, collide: true, shadow: true });
  for (const lx of [-1.3, 1.3]) {
    for (const lz of [-0.6, 0.6]) {
      const [px, pz] = at(lx, lz);
      kit.box("timber", [0.12, 2.4, 0.12], [px, 1.2, pz], { rotY: facing });
    }
  }
  kit.box(cloth, [3.2, 0.08, 1.9], [x, 2.42, z], { rotY: facing, rotX: 0.12, shadow: true });
  // Wares.
  const [ax, az] = at(-0.7, 0);
  const [bx, bz] = at(0.5, 0.1);
  kit.box("goldCloth", [0.5, 0.2, 0.5], [ax, 1, az], { rotY: facing + 0.3 });
  kit.cylinder("stone", 0.34, 0.3, [bx, 1.05, bz]);
}

function buildLantern(kit: WorldKit, x: number, z: number): void {
  kit.cylinder("iron", 0.14, 3, [x, 1.5, z], { collide: true });
  kit.box("iron", [0.5, 0.08, 0.5], [x, 3.26, z]);
  kit.box("glow", [0.32, 0.4, 0.32], [x, 3, z]);
}
