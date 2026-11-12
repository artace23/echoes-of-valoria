// Character progression: levels, experience, gold, and stats derived from level.

import type { Reward } from "@valoria/game-types";

export interface ProgressionConfig {
  maxLevel: number;
  /** XP needed to go from level 1 to level 2. */
  baseXp: number;
  /** Exponent of the level curve: need = baseXp * level ^ exponent. */
  xpExponent: number;
  /** Stats at level 1. */
  baseHealth: number;
  baseStamina: number;
  /** Stat gained per level above 1. */
  healthPerLevel: number;
  staminaPerLevel: number;
  attackPowerPerLevel: number;
  defensePerLevel: number;
}

export const DEFAULT_PROGRESSION_CONFIG: ProgressionConfig = {
  maxLevel: 20,
  baseXp: 60,
  xpExponent: 1.5,
  baseHealth: 100,
  baseStamina: 100,
  healthPerLevel: 12,
  staminaPerLevel: 5,
  attackPowerPerLevel: 2,
  defensePerLevel: 2,
};

/** Persistent character progress. `xp` counts toward the next level only. */
export interface CharacterProgress {
  level: number;
  xp: number;
  gold: number;
}

export interface CharacterStats {
  healthMax: number;
  staminaMax: number;
  /** Added to the base damage of every attack. */
  attackPower: number;
  /** Reduces incoming damage; see calculateDamage. */
  defense: number;
}

export function createCharacterProgress(): CharacterProgress {
  return { level: 1, xp: 0, gold: 0 };
}

/** XP needed to advance from `level` to the next. 0 at the level cap. */
export function xpToNextLevel(
  level: number,
  config: ProgressionConfig = DEFAULT_PROGRESSION_CONFIG,
): number {
  if (level >= config.maxLevel) return 0;
  return Math.round(config.baseXp * Math.max(1, level) ** config.xpExponent);
}

export interface RewardResult {
  progress: CharacterProgress;
  levelsGained: number;
}

/**
 * Add a reward to a character. Surplus XP carries over, so one reward can
 * grant several levels. At the level cap, XP is discarded; gold still counts.
 * Negative amounts are ignored.
 */
export function grantReward(
  progress: CharacterProgress,
  reward: Reward,
  config: ProgressionConfig = DEFAULT_PROGRESSION_CONFIG,
): RewardResult {
  let level = progress.level;
  let xp = progress.xp + Math.max(0, reward.xp);
  const gold = progress.gold + Math.max(0, reward.gold);

  let levelsGained = 0;
  while (level < config.maxLevel && xp >= xpToNextLevel(level, config)) {
    xp -= xpToNextLevel(level, config);
    level += 1;
    levelsGained += 1;
  }
  if (level >= config.maxLevel) xp = 0;

  return { progress: { level, xp, gold }, levelsGained };
}

/** Stats for a character of the given level. */
export function deriveStats(
  level: number,
  config: ProgressionConfig = DEFAULT_PROGRESSION_CONFIG,
): CharacterStats {
  const gained = Math.min(config.maxLevel, Math.max(1, level)) - 1;
  return {
    healthMax: config.baseHealth + config.healthPerLevel * gained,
    staminaMax: config.baseStamina + config.staminaPerLevel * gained,
    attackPower: config.attackPowerPerLevel * gained,
    defense: config.defensePerLevel * gained,
  };
}
