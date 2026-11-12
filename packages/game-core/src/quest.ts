// Quest rules: accepting a quest, tracking its objective, and turning it in
// for a reward exactly once.

import type {
  EnemyId,
  QuestDefinition,
  QuestId,
  Reward,
} from "@valoria/game-types";

/**
 * available: offered but not yet accepted.
 * active:    accepted; the objective is being tracked.
 * ready:     objective met; waiting to be turned in.
 * completed: turned in and rewarded. Never changes again.
 */
export type QuestStatus = "available" | "active" | "ready" | "completed";

export interface QuestProgress {
  readonly questId: QuestId;
  readonly status: QuestStatus;
  /** Progress toward the objective's count. Never exceeds it. */
  readonly count: number;
}

export function createQuestProgress(quest: QuestDefinition): QuestProgress {
  return { questId: quest.id, status: "available", count: 0 };
}

/** Accept an available quest. Any other state is returned unchanged. */
export function acceptQuest(progress: QuestProgress): QuestProgress {
  if (progress.status !== "available") return progress;
  return { ...progress, status: "active" };
}

export interface QuestUpdate {
  progress: QuestProgress;
  /** True only on the update in which the objective is met. */
  objectiveMet: boolean;
}

/**
 * Record that an enemy was defeated. Only kills matching the objective of an
 * accepted quest count; kills before accepting, or after the objective is
 * met, change nothing.
 */
export function recordEnemyDefeated(
  progress: QuestProgress,
  quest: QuestDefinition,
  enemyId: EnemyId,
): QuestUpdate {
  const unchanged: QuestUpdate = { progress, objectiveMet: false };
  if (progress.questId !== quest.id || progress.status !== "active") {
    return unchanged;
  }
  if (quest.objective.kind !== "defeat" || quest.objective.enemyId !== enemyId) {
    return unchanged;
  }

  const count = Math.min(quest.objective.count, progress.count + 1);
  const met = count >= quest.objective.count;
  return {
    progress: {
      questId: progress.questId,
      status: met ? "ready" : "active",
      count,
    },
    objectiveMet: met,
  };
}

export interface QuestTurnIn {
  progress: QuestProgress;
  /** The reward to grant, or null if the quest could not be turned in. */
  reward: Reward | null;
}

/**
 * Turn in a quest whose objective is met. The reward is returned only on
 * this one transition, so it cannot be claimed twice.
 */
export function turnInQuest(
  progress: QuestProgress,
  quest: QuestDefinition,
): QuestTurnIn {
  if (progress.questId !== quest.id || progress.status !== "ready") {
    return { progress, reward: null };
  }
  return {
    progress: { ...progress, status: "completed" },
    reward: quest.reward,
  };
}
