// Quest rules: tracking an objective and completing it exactly once.

import type { EnemyId, QuestDefinition, QuestId } from "@valoria/game-types";

export type QuestStatus = "active" | "completed";

export interface QuestProgress {
  readonly questId: QuestId;
  readonly status: QuestStatus;
  /** Progress toward the objective's count. Never exceeds it. */
  readonly count: number;
}

export function createQuestProgress(quest: QuestDefinition): QuestProgress {
  return { questId: quest.id, status: "active", count: 0 };
}

export interface QuestUpdate {
  progress: QuestProgress;
  /**
   * True only on the update that completes the quest, so the reward can be
   * granted exactly once.
   */
  justCompleted: boolean;
}

/**
 * Record that an enemy was defeated. Only kills matching the quest's
 * objective count, and a completed quest never changes again.
 */
export function recordEnemyDefeated(
  progress: QuestProgress,
  quest: QuestDefinition,
  enemyId: EnemyId,
): QuestUpdate {
  const unchanged: QuestUpdate = { progress, justCompleted: false };
  if (progress.questId !== quest.id || progress.status !== "active") {
    return unchanged;
  }
  if (quest.objective.kind !== "defeat" || quest.objective.enemyId !== enemyId) {
    return unchanged;
  }

  const count = Math.min(quest.objective.count, progress.count + 1);
  const completed = count >= quest.objective.count;
  return {
    progress: {
      questId: progress.questId,
      status: completed ? "completed" : "active",
      count,
    },
    justCompleted: completed,
  };
}
