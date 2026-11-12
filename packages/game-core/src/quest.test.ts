import { describe, expect, it } from "vitest";
import type { EnemyId, QuestDefinition } from "@valoria/game-types";
import {
  createQuestProgress,
  recordEnemyDefeated,
  type QuestProgress,
} from "./quest";

const quest: QuestDefinition = {
  id: "cull-the-pack",
  name: "Cull the Pack",
  description: "",
  objective: { kind: "defeat", enemyId: "corrupted-wolf", count: 3 },
  reward: { xp: 80, gold: 40 },
};

function defeat(progress: QuestProgress, times: number) {
  let current = progress;
  const completions: boolean[] = [];
  for (let i = 0; i < times; i++) {
    const update = recordEnemyDefeated(current, quest, "corrupted-wolf");
    current = update.progress;
    completions.push(update.justCompleted);
  }
  return { progress: current, completions };
}

describe("quest progress", () => {
  it("starts active with no progress", () => {
    expect(createQuestProgress(quest)).toEqual({
      questId: "cull-the-pack",
      status: "active",
      count: 0,
    });
  });

  it("counts each matching kill", () => {
    const { progress, completions } = defeat(createQuestProgress(quest), 2);
    expect(progress).toMatchObject({ status: "active", count: 2 });
    expect(completions).toEqual([false, false]);
  });

  it("completes on the final kill, and reports it exactly once", () => {
    const { progress, completions } = defeat(createQuestProgress(quest), 5);
    expect(progress).toMatchObject({ status: "completed", count: 3 });
    expect(completions).toEqual([false, false, true, false, false]);
  });

  it("does not change once completed", () => {
    const done = defeat(createQuestProgress(quest), 3).progress;
    const after = recordEnemyDefeated(done, quest, "corrupted-wolf");
    expect(after.progress).toBe(done);
    expect(after.justCompleted).toBe(false);
  });

  it("ignores kills of other enemies", () => {
    const start = createQuestProgress(quest);
    const update = recordEnemyDefeated(start, quest, "something-else" as EnemyId);
    expect(update.progress).toBe(start);
    expect(update.justCompleted).toBe(false);
  });

  it("ignores progress that belongs to a different quest", () => {
    const other = { ...createQuestProgress(quest), questId: "other" as never };
    const update = recordEnemyDefeated(other, quest, "corrupted-wolf");
    expect(update.progress).toBe(other);
  });

  it("does not mutate its input", () => {
    const start = createQuestProgress(quest);
    recordEnemyDefeated(start, quest, "corrupted-wolf");
    expect(start.count).toBe(0);
  });

  it("completes immediately when only one kill is needed", () => {
    const single: QuestDefinition = {
      ...quest,
      objective: { kind: "defeat", enemyId: "corrupted-wolf", count: 1 },
    };
    const update = recordEnemyDefeated(createQuestProgress(single), single, "corrupted-wolf");
    expect(update.progress.status).toBe("completed");
    expect(update.justCompleted).toBe(true);
  });
});
