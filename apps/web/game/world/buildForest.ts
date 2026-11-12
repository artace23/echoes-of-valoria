import { WORLD } from "@valoria/game-data";
import type { RoadSegment, WorldPoint } from "@valoria/game-types";
import type { WorldKit } from "./WorldKit";

const TREE_COUNT = 300;
const ROCK_COUNT = 70;
const LOG_COUNT = 16;
const MUSHROOM_COUNT = 60;

/** Deterministic PRNG so the forest is the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distanceToSegment(point: WorldPoint, road: RoadSegment): number {
  const dx = road.to.x - road.from.x;
  const dz = road.to.z - road.from.z;
  const lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - road.from.x) * dx + (point.z - road.from.z) * dz) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    point.x - (road.from.x + dx * t),
    point.z - (road.from.z + dz * t),
  );
}

/** True where scenery must stay clear: the village, roads and clearings. */
function isReserved(point: WorldPoint, margin: number): boolean {
  const { village, villageWallRadius, roads, spawnZones } = WORLD;
  if (
    Math.hypot(point.x - village.center.x, point.z - village.center.z) <
    villageWallRadius + 3 + margin
  ) {
    return true;
  }
  if (
    roads.some(
      (road) => distanceToSegment(point, road) < road.width / 2 + 1 + margin,
    )
  ) {
    return true;
  }
  return spawnZones.some(
    (zone) =>
      Math.hypot(point.x - zone.center.x, point.z - zone.center.z) <
      zone.radius + 0.5 + margin,
  );
}

/**
 * The Whispering Forest: roads and trails, wolf clearings, and scattered
 * trees, rocks, fallen logs and glowing fungi around the whole map.
 */
export function buildForest(kit: WorldKit): void {
  const random = mulberry32(90210);
  const range = (min: number, max: number) => min + random() * (max - min);
  const limit = WORLD.halfExtent - 2;

  /** A random free spot, or null if none was found. */
  const freeSpot = (margin: number): WorldPoint | null => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const point = { x: range(-limit, limit), z: range(-limit, limit) };
      if (!isReserved(point, margin)) return point;
    }
    return null;
  };

  // Roads and trails, as flat strips just above the ground.
  WORLD.roads.forEach((road, index) => {
    const dx = road.to.x - road.from.x;
    const dz = road.to.z - road.from.z;
    kit.box(
      "dirt",
      [Math.hypot(dx, dz), 0.02, road.width],
      [
        (road.from.x + road.to.x) / 2,
        0.05 + index * 0.004,
        (road.from.z + road.to.z) / 2,
      ],
      { rotY: Math.atan2(-dz, dx) },
    );
  });

  // Wolf clearings: blighted ground, each with its own landmark.
  for (const zone of WORLD.spawnZones) {
    kit.disc("corruptedEarth", zone.radius, zone.center.x, zone.center.z);
  }
  const [shrine, hollow, glade] = WORLD.spawnZones;
  if (shrine) buildShrine(kit, shrine.center, shrine.radius, range);
  if (hollow) buildHollow(kit, hollow.center, range);
  if (glade) buildGlade(kit, glade.center, range);

  buildAbandonedCart(kit);

  // Trees. Most are pines; some are bare, more so the deeper in you go.
  for (let i = 0; i < TREE_COUNT; i++) {
    const spot = freeSpot(1);
    if (!spot) continue;
    const scale = range(0.8, 1.6);
    const bare = random() < 0.12 + Math.max(0, spot.z) / 400;
    kit.cylinder("bark", 0.5 * scale, 3 * scale, [spot.x, 1.5 * scale, spot.z], {
      collide: true,
      shadow: true,
    });
    kit.cone(
      bare ? "deadPine" : "pine",
      (bare ? 2.2 : 3.4) * scale,
      (bare ? 3.6 : 5) * scale,
      [spot.x, (2.4 + (bare ? 1.8 : 2.5)) * scale, spot.z],
      { rotY: range(0, Math.PI), shadow: true },
    );
  }

  for (let i = 0; i < ROCK_COUNT; i++) {
    const spot = freeSpot(0.6);
    if (!spot) continue;
    const size = range(0.5, 1.8);
    kit.rock(
      "rock",
      [size * range(0.8, 1.3), size * 0.7, size * range(0.8, 1.3)],
      [spot.x, size * 0.35, spot.z],
      { rotY: range(0, Math.PI * 2), collide: true, shadow: true },
    );
  }

  for (let i = 0; i < LOG_COUNT; i++) {
    const spot = freeSpot(2.5);
    if (!spot) continue;
    kit.cylinder("bark", range(0.5, 0.8), range(3.5, 6), [spot.x, 0.32, spot.z], {
      rotZ: Math.PI / 2,
      rotY: range(0, Math.PI),
      collide: true,
      shadow: true,
    });
  }

  // Faintly glowing fungi, mostly off the beaten path.
  for (let i = 0; i < MUSHROOM_COUNT; i++) {
    const spot = freeSpot(0.3);
    if (!spot) continue;
    const size = range(0.1, 0.2);
    kit.cylinder("bark", size * 0.5, size * 2, [spot.x, size, spot.z]);
    kit.cone("spore", size * 3, size * 1.4, [spot.x, size * 2.5, spot.z]);
  }
}

/** A ring of standing stones around a toppled altar. Open to the south. */
function buildShrine(
  kit: WorldKit,
  center: WorldPoint,
  radius: number,
  range: (min: number, max: number) => number,
): void {
  const stones = 11;
  for (let i = 0; i < stones; i++) {
    const angle = -Math.PI / 2 + ((i + 0.5) / stones) * Math.PI * 2;
    // Leave a gap where the road comes in from the south.
    if (Math.abs(Math.cos(angle)) < 0.35 && Math.sin(angle) < 0) continue;
    const height = range(2.6, 4.4);
    kit.box(
      "darkStone",
      [1.4, height, 0.85],
      [
        center.x + Math.cos(angle) * radius,
        height / 2,
        center.z + Math.sin(angle) * radius,
      ],
      {
        rotY: -angle + Math.PI / 2 + range(-0.2, 0.2),
        rotZ: range(-0.06, 0.06),
        collide: true,
        shadow: true,
      },
    );
  }
  kit.box("darkStone", [2.6, 0.5, 1.4], [center.x, 0.45, center.z + 6.5], {
    rotY: 0.2,
    rotZ: 0.12,
    collide: true,
    shadow: true,
  });
  kit.box("ember", [0.5, 0.06, 0.5], [center.x + 0.2, 0.78, center.z + 6.5], { rotY: 0.2 });
}

/** A hollow ringed by dead, leaning trunks. */
function buildHollow(
  kit: WorldKit,
  center: WorldPoint,
  range: (min: number, max: number) => number,
): void {
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.4;
    const height = range(4, 6.5);
    kit.cylinder(
      "bark",
      0.55,
      height,
      [center.x + Math.cos(angle) * 9.6, height / 2 - 0.2, center.z + Math.sin(angle) * 9.6],
      { rotZ: range(-0.25, 0.25), rotX: range(-0.2, 0.2), collide: true, shadow: true },
    );
  }
  kit.rock("darkStone", [2.2, 1.2, 1.7], [center.x - 1, 0.5, center.z + 1.5], {
    rotY: 0.7,
    collide: true,
    shadow: true,
  });
}

/** A burnt glade: charred stumps and a cold fire pit. */
function buildGlade(
  kit: WorldKit,
  center: WorldPoint,
  range: (min: number, max: number) => number,
): void {
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const reach = range(6.5, 8.6);
    kit.cylinder(
      "timber",
      range(0.6, 1),
      range(0.5, 1.3),
      [center.x + Math.cos(angle) * reach, 0.4, center.z + Math.sin(angle) * reach],
      { collide: true, shadow: true },
    );
  }
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    kit.rock("rock", [0.4, 0.3, 0.4], [
      center.x + Math.cos(angle) * 1.3,
      0.18,
      center.z + Math.sin(angle) * 1.3,
    ]);
  }
  kit.cylinder("timber", 0.3, 1.6, [center.x, 0.25, center.z], { rotZ: 1.3, rotY: 0.6 });
  kit.cylinder("timber", 0.3, 1.5, [center.x, 0.25, center.z], { rotZ: 1.3, rotY: 2.4 });
}

/** A trader's cart left on the forest road, where the Iron Sword lies. */
function buildAbandonedCart(kit: WorldKit): void {
  const cart = WORLD.markers.find((marker) => marker.id === "abandoned-cart");
  if (!cart) return;
  const { x, z } = cart.position;
  kit.box("wood", [1.7, 0.2, 2.8], [x, 0.75, z], {
    rotY: 0.5,
    rotZ: 0.16,
    collide: true,
    shadow: true,
  });
  kit.box("wood", [1.7, 0.6, 0.12], [x - 0.65, 1.05, z - 1.15], { rotY: 0.5, rotZ: 0.16 });
  for (const [dx, dz] of [
    [-1, -0.2],
    [0.75, 0.75],
  ] as const) {
    kit.cylinder("timber", 1.1, 0.14, [x + dx, 0.55, z + dz], {
      rotZ: Math.PI / 2,
      rotY: 0.5,
      shadow: true,
    });
  }
  kit.box("wood", [0.7, 0.7, 0.7], [x + 1.5, 0.35, z - 1.3], { rotY: 0.9, collide: true, shadow: true });
  kit.cylinder("wood", 0.7, 0.9, [x + 1.9, 0.36, z + 0.4], { rotZ: Math.PI / 2, rotY: 1.2 });
}
