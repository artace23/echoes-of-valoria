import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESSION_CONFIG as config,
  createCharacterProgress,
  deriveStats,
  grantReward,
  xpToNextLevel,
} from "./progression";

describe("xpToNextLevel", () => {
  it("starts at the base amount and grows with level", () => {
    expect(xpToNextLevel(1)).toBe(config.baseXp);
    expect(xpToNextLevel(2)).toBe(170);
    expect(xpToNextLevel(3)).toBeGreaterThan(xpToNextLevel(2));
  });

  it("is 0 at the level cap", () => {
    expect(xpToNextLevel(config.maxLevel)).toBe(0);
    expect(xpToNextLevel(config.maxLevel + 5)).toBe(0);
  });
});

describe("grantReward", () => {
  const start = createCharacterProgress();

  it("starts a character at level 1 with nothing", () => {
    expect(start).toEqual({ level: 1, xp: 0, gold: 0 });
  });

  it("adds XP and gold without levelling when below the threshold", () => {
    const result = grantReward(start, { xp: 20, gold: 7 });
    expect(result.progress).toEqual({ level: 1, xp: 20, gold: 7 });
    expect(result.levelsGained).toBe(0);
  });

  it("levels up exactly at the threshold and carries surplus XP over", () => {
    const exact = grantReward(start, { xp: 60, gold: 0 });
    expect(exact.progress).toMatchObject({ level: 2, xp: 0 });
    expect(exact.levelsGained).toBe(1);

    const surplus = grantReward(start, { xp: 75, gold: 0 });
    expect(surplus.progress).toMatchObject({ level: 2, xp: 15 });
  });

  it("accumulates across several rewards", () => {
    let progress = start;
    for (let i = 0; i < 3; i++) {
      progress = grantReward(progress, { xp: 20, gold: 5 }).progress;
    }
    expect(progress).toEqual({ level: 2, xp: 0, gold: 15 });
  });

  it("can grant several levels from one reward", () => {
    const result = grantReward(start, { xp: 60 + 170 + 10, gold: 0 });
    expect(result.progress).toMatchObject({ level: 3, xp: 10 });
    expect(result.levelsGained).toBe(2);
  });

  it("stops at the level cap, discarding XP but keeping gold", () => {
    const capped = { level: config.maxLevel, xp: 0, gold: 10 };
    const result = grantReward(capped, { xp: 5000, gold: 3 });
    expect(result.progress).toEqual({ level: config.maxLevel, xp: 0, gold: 13 });
    expect(result.levelsGained).toBe(0);

    const huge = grantReward(start, { xp: 10_000_000, gold: 0 });
    expect(huge.progress.level).toBe(config.maxLevel);
    expect(huge.progress.xp).toBe(0);
    expect(huge.levelsGained).toBe(config.maxLevel - 1);
  });

  it("ignores negative amounts", () => {
    const result = grantReward({ level: 2, xp: 30, gold: 12 }, { xp: -50, gold: -99 });
    expect(result.progress).toEqual({ level: 2, xp: 30, gold: 12 });
  });

  it("does not mutate its input", () => {
    const before = { level: 1, xp: 50, gold: 1 };
    grantReward(before, { xp: 100, gold: 100 });
    expect(before).toEqual({ level: 1, xp: 50, gold: 1 });
  });
});

describe("deriveStats", () => {
  it("gives base stats at level 1", () => {
    expect(deriveStats(1)).toEqual({
      healthMax: config.baseHealth,
      staminaMax: config.baseStamina,
      attackPower: 0,
      defense: 0,
    });
  });

  it("grows every stat with each level", () => {
    expect(deriveStats(4)).toEqual({
      healthMax: config.baseHealth + 3 * config.healthPerLevel,
      staminaMax: config.baseStamina + 3 * config.staminaPerLevel,
      attackPower: 3 * config.attackPowerPerLevel,
      defense: 3 * config.defensePerLevel,
    });
  });

  it("clamps levels outside the valid range", () => {
    expect(deriveStats(0)).toEqual(deriveStats(1));
    expect(deriveStats(config.maxLevel + 10)).toEqual(deriveStats(config.maxLevel));
  });
});
