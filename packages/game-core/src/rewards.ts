import type { Reward, RewardTable } from "@valoria/game-types";

/**
 * Roll a concrete reward from a table. `rng` returns a number in [0, 1), so
 * callers choose the randomness source and tests stay deterministic.
 */
export function rollReward(table: RewardTable, rng: () => number): Reward {
  const low = Math.min(table.goldMin, table.goldMax);
  const high = Math.max(table.goldMin, table.goldMax);
  const gold = low + Math.floor(rng() * (high - low + 1));
  return { xp: table.xp, gold: Math.min(high, gold) };
}
