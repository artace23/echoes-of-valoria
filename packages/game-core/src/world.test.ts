import { describe, expect, it } from "vitest";
import type { NpcDefinition, WorldRegion } from "@valoria/game-types";
import { getNpcDialogue } from "./dialogue";
import type { QuestProgress } from "./quest";
import { distributeSpawnPoints, findRegion, isInSafeZone } from "./world";

const village: WorldRegion = {
  id: "village",
  name: "Village",
  kind: "village",
  center: { x: 0, z: -50 },
  radius: 28,
  safe: true,
};
const den: WorldRegion = {
  id: "den",
  name: "Den",
  kind: "spawn-zone",
  center: { x: 0, z: 34 },
  radius: 11,
  safe: false,
};
const shrine: WorldRegion = {
  id: "shrine",
  name: "Shrine",
  kind: "spawn-zone",
  center: { x: 0, z: 34 },
  radius: 3,
  safe: false,
};
const regions = [village, den];

describe("findRegion", () => {
  it("finds the region containing a point", () => {
    expect(findRegion(regions, { x: 5, z: -40 })).toBe(village);
    expect(findRegion(regions, { x: 0, z: 30 })).toBe(den);
  });

  it("includes the boundary and excludes points just outside", () => {
    expect(findRegion(regions, { x: 28, z: -50 })).toBe(village);
    expect(findRegion(regions, { x: 28.1, z: -50 })).toBeNull();
  });

  it("returns null in open country", () => {
    expect(findRegion(regions, { x: 60, z: 0 })).toBeNull();
    expect(findRegion([], { x: 0, z: 0 })).toBeNull();
  });

  it("prefers the smallest of overlapping regions, whatever the order", () => {
    expect(findRegion([den, shrine], { x: 1, z: 34 })).toBe(shrine);
    expect(findRegion([shrine, den], { x: 1, z: 34 })).toBe(shrine);
    expect(findRegion([den, shrine], { x: 8, z: 34 })).toBe(den);
  });
});

describe("isInSafeZone", () => {
  it("is true only inside a region marked safe", () => {
    expect(isInSafeZone(regions, { x: 0, z: -50 })).toBe(true);
    expect(isInSafeZone(regions, { x: 0, z: 34 })).toBe(false);
    expect(isInSafeZone(regions, { x: 70, z: 70 })).toBe(false);
  });
});

describe("distributeSpawnPoints", () => {
  const zone = { center: { x: 10, z: 20 }, radius: 10, enemyCount: 3 };

  it("creates one point per enemy, all inside the zone", () => {
    const points = distributeSpawnPoints(zone, () => 0.5);
    expect(points).toHaveLength(3);
    for (const point of points) {
      const distance = Math.hypot(point.x - 10, point.z - 20);
      expect(distance).toBeLessThanOrEqual(zone.radius * 0.55 + 1e-9);
      expect(distance).toBeGreaterThan(0);
    }
  });

  it("spreads the points apart", () => {
    const [a, b, c] = distributeSpawnPoints(zone, () => 0.5);
    expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeGreaterThan(3);
    expect(Math.hypot(b!.x - c!.x, b!.z - c!.z)).toBeGreaterThan(3);
  });

  it("is deterministic for a given random source", () => {
    expect(distributeSpawnPoints(zone, () => 0.25)).toEqual(
      distributeSpawnPoints(zone, () => 0.25),
    );
  });

  it("handles a zone with no enemies", () => {
    expect(distributeSpawnPoints({ ...zone, enemyCount: 0 }, () => 0.5)).toEqual([]);
  });
});

describe("getNpcDialogue", () => {
  const elder: NpcDefinition = {
    id: "elder-maren",
    name: "Elder Maren",
    title: "Village Elder",
    position: { x: 0, z: 0 },
    facing: 0,
    robeColor: [0.3, 0.2, 0.3],
    greeting: ["Hello."],
    quest: {
      questId: "cull-the-pack",
      offer: ["Wolves trouble us.", "Will you help?"],
      active: ["Keep at it."],
      ready: ["You did it!"],
      completed: ["Thank you again."],
    },
  };
  const villager: NpcDefinition = { ...elder, quest: undefined, greeting: ["Fine night."] };
  const quest = (status: QuestProgress["status"]): QuestProgress => ({
    questId: "cull-the-pack",
    status,
    count: 0,
  });

  it("gives the greeting when the NPC has no quest", () => {
    expect(getNpcDialogue(villager, quest("available"))).toEqual({
      lines: ["Fine night."],
      action: null,
    });
  });

  it("offers the quest while it is available", () => {
    const view = getNpcDialogue(elder, quest("available"));
    expect(view.lines).toEqual(["Wolves trouble us.", "Will you help?"]);
    expect(view.action).toEqual({ kind: "accept-quest", label: "Accept quest" });
  });

  it("encourages the player while the quest is active, with no action", () => {
    expect(getNpcDialogue(elder, quest("active"))).toEqual({
      lines: ["Keep at it."],
      action: null,
    });
  });

  it("offers the reward when the objective is met", () => {
    const view = getNpcDialogue(elder, quest("ready"));
    expect(view.lines).toEqual(["You did it!"]);
    expect(view.action?.kind).toBe("turn-in-quest");
  });

  it("thanks the player once the quest is completed", () => {
    expect(getNpcDialogue(elder, quest("completed"))).toEqual({
      lines: ["Thank you again."],
      action: null,
    });
  });

  it("falls back to the greeting without matching quest progress", () => {
    expect(getNpcDialogue(elder, null).lines).toEqual(["Hello."]);
    const other = { ...quest("ready"), questId: "other" as never };
    expect(getNpcDialogue(elder, other).action).toBeNull();
  });

  it("never returns an empty conversation", () => {
    expect(getNpcDialogue({ ...villager, greeting: [] }, null).lines).toHaveLength(1);
  });
});
