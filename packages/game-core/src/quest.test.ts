import { describe, expect, it } from "vitest";
import type { EnemyId, QuestDefinition } from "@valoria/game-types";
import {
  acceptQuest,
  createQuestProgress,
  recordEnemyDefeated,
  turnInQuest,
  type QuestProgress,
} from "./quest";

const quest: QuestDefinition = {
  id: "cull-the-pack",
  name: "Cull the Pack",
  description: "",
  objective: { kind: "defeat", enemyId: "corrupted-wolf", count: 3 },
  reward: { xp: 80, gold: 40 },
};

const accepted = acceptQuest(createQuestProgress(quest));

function defeat(progress: QuestProgress, times: number) {
  let current = progress;
  const met: boolean[] = [];
  for (let i = 0; i < times; i++) {
    const update = recordEnemyDefeated(current, quest, "corrupted-wolf");
    current = update.progress;
    met.push(update.objectiveMet);
  }
  return { progress: current, met };
}

describe("accepting", () => {
  it("starts available with no progress", () => {
    expect(createQuestProgress(quest)).toEqual({
      questId: "cull-the-pack",
      status: "available",
      count: 0,
    });
  });

  it("becomes active when accepted", () => {
    expect(accepted.status).toBe("active");
  });

  it("can only be accepted from available", () => {
    const ready = defeat(accepted, 3).progress;
    expect(acceptQuest(accepted)).toBe(accepted);
    expect(acceptQuest(ready)).toBe(ready);
  });

  it("does not count kills made before accepting", () => {
    const start = createQuestProgress(quest);
    const { progress, met } = defeat(start, 3);
    expect(progress).toBe(start);
    expect(met).toEqual([false, false, false]);
  });
});

describe("objective", () => {
  it("counts each matching kill", () => {
    const { progress, met } = defeat(accepted, 2);
    expect(progress).toMatchObject({ status: "active", count: 2 });
    expect(met).toEqual([false, false]);
  });

  it("becomes ready on the final kill, and reports it exactly once", () => {
    const { progress, met } = defeat(accepted, 5);
    expect(progress).toMatchObject({ status: "ready", count: 3 });
    expect(met).toEqual([false, false, true, false, false]);
  });

  it("ignores kills of other enemies", () => {
    const update = recordEnemyDefeated(accepted, quest, "something-else" as EnemyId);
    expect(update.progress).toBe(accepted);
    expect(update.objectiveMet).toBe(false);
  });

  it("ignores progress that belongs to a different quest", () => {
    const other = { ...accepted, questId: "other" as never };
    expect(recordEnemyDefeated(other, quest, "corrupted-wolf").progress).toBe(other);
  });

  it("does not mutate its input", () => {
    recordEnemyDefeated(accepted, quest, "corrupted-wolf");
    expect(accepted.count).toBe(0);
  });
});

describe("turning in", () => {
  const ready = defeat(accepted, 3).progress;

  it("grants the reward and completes the quest", () => {
    const result = turnInQuest(ready, quest);
    expect(result.reward).toEqual({ xp: 80, gold: 40 });
    expect(result.progress).toMatchObject({ status: "completed", count: 3 });
  });

  it("cannot be claimed twice", () => {
    const completed = turnInQuest(ready, quest).progress;
    const again = turnInQuest(completed, quest);
    expect(again.reward).toBeNull();
    expect(again.progress).toBe(completed);
  });

  it("cannot be turned in before the objective is met", () => {
    expect(turnInQuest(createQuestProgress(quest), quest).reward).toBeNull();
    expect(turnInQuest(accepted, quest).reward).toBeNull();
    expect(turnInQuest(defeat(accepted, 2).progress, quest).reward).toBeNull();
  });

  it("stays completed when more enemies are defeated", () => {
    const completed = turnInQuest(ready, quest).progress;
    const update = recordEnemyDefeated(completed, quest, "corrupted-wolf");
    expect(update.progress).toBe(completed);
    expect(update.objectiveMet).toBe(false);
  });
});
