// World rules: which region a point is in, safe zones, and spawn placement.

import type { SpawnZone, WorldPoint, WorldRegion } from "@valoria/game-types";

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * The region containing a point, or null if it is in none. When regions
 * overlap, the smallest one wins, so a landmark inside a larger area is
 * reported in preference to the area around it.
 */
export function findRegion<T extends WorldRegion>(
  regions: readonly T[],
  point: WorldPoint,
): T | null {
  let best: T | null = null;
  for (const region of regions) {
    if (distance(region.center, point) > region.radius) continue;
    if (!best || region.radius < best.radius) best = region;
  }
  return best;
}

/** True if the point lies inside any region marked safe. */
export function isInSafeZone(
  regions: readonly WorldRegion[],
  point: WorldPoint,
): boolean {
  return regions.some(
    (region) => region.safe && distance(region.center, point) <= region.radius,
  );
}

/**
 * Home positions for a spawn zone's enemies: evenly spread around the centre
 * with a random rotation and distance, kept inside `spread` of the radius so
 * enemies do not start at the zone's edge. `rng` returns a number in [0, 1).
 */
export function distributeSpawnPoints(
  zone: Pick<SpawnZone, "center" | "radius" | "enemyCount">,
  rng: () => number,
  spread = 0.55,
): WorldPoint[] {
  const count = Math.max(0, Math.floor(zone.enemyCount));
  const offset = rng() * Math.PI * 2;
  const points: WorldPoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = offset + (i / count) * Math.PI * 2;
    const reach = zone.radius * spread * (0.6 + 0.4 * rng());
    points.push({
      x: zone.center.x + Math.cos(angle) * reach,
      z: zone.center.z + Math.sin(angle) * reach,
    });
  }
  return points;
}
