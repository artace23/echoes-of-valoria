import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENEMY_AI_CONFIG as config,
  createEnemyAiState,
  stepEnemyAi,
  type EnemyAiInput,
  type EnemyAiState,
  type EnemyAiStep,
} from "./enemyAi";
import { rollReward } from "./rewards";

const half = () => 0.5;
const home = { x: 0, z: 0 };
const farAway = { x: 100, z: 100 };

function input(overrides: Partial<EnemyAiInput> = {}): EnemyAiInput {
  return {
    position: home,
    home,
    playerPosition: farAway,
    playerAlive: true,
    ...overrides,
  };
}

const chasing: EnemyAiState = {
  phase: "chase",
  timer: 0,
  destination: null,
  struck: false,
};

/** Step repeatedly with a fixed input, collecting every step. */
function run(
  state: EnemyAiState,
  fixed: EnemyAiInput,
  seconds: number,
  dt = 0.05,
): EnemyAiStep[] {
  const steps: EnemyAiStep[] = [];
  let current = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const step = stepEnemyAi(current, fixed, dt, half);
    steps.push(step);
    current = step.state;
  }
  return steps;
}

describe("idle and patrol", () => {
  it("stays idle until its timer runs out, then picks a patrol destination", () => {
    const waiting = stepEnemyAi(createEnemyAiState(1), input(), 0.5, half);
    expect(waiting.state.phase).toBe("idle");
    expect(waiting.velocity).toEqual({ x: 0, z: 0 });

    const leaving = stepEnemyAi(waiting.state, input(), 0.6, half);
    expect(leaving.state.phase).toBe("patrol");
    const destination = leaving.state.destination!;
    expect(Math.hypot(destination.x, destination.z)).toBeLessThanOrEqual(
      config.patrolRadius,
    );
  });

  it("walks toward its patrol destination at patrol speed", () => {
    const patrolling: EnemyAiState = {
      phase: "patrol",
      timer: 5,
      destination: { x: 3, z: 0 },
      struck: false,
    };
    const step = stepEnemyAi(patrolling, input(), 0.1, half);
    expect(step.velocity.x).toBeCloseTo(config.patrolSpeed);
    expect(step.velocity.z).toBeCloseTo(0);
    expect(step.facing).toEqual({ x: 1, z: 0 });
  });

  it("goes idle on arrival, and when a patrol leg times out", () => {
    const arriving: EnemyAiState = {
      phase: "patrol",
      timer: 5,
      destination: { x: 0.2, z: 0 },
      struck: false,
    };
    expect(stepEnemyAi(arriving, input(), 0.1, half).state.phase).toBe("idle");

    const stuck: EnemyAiState = { ...arriving, timer: 0.05, destination: { x: 3, z: 0 } };
    const step = stepEnemyAi(stuck, input(), 0.1, half);
    expect(step.state.phase).toBe("idle");
    expect(step.state.timer).toBeCloseTo((config.idleMin + config.idleMax) / 2);
  });
});

describe("detection and chase", () => {
  it("notices a nearby living player from idle and from patrol", () => {
    const near = input({ playerPosition: { x: config.detectRange - 1, z: 0 } });
    expect(stepEnemyAi(createEnemyAiState(), near, 0.1, half).state.phase).toBe("chase");

    const patrolling: EnemyAiState = {
      phase: "patrol",
      timer: 5,
      destination: { x: -3, z: 0 },
      struck: false,
    };
    expect(stepEnemyAi(patrolling, near, 0.1, half).state.phase).toBe("chase");
  });

  it("ignores a player outside detection range, and a dead one", () => {
    const outside = input({ playerPosition: { x: config.detectRange + 1, z: 0 } });
    expect(stepEnemyAi(createEnemyAiState(), outside, 0.1, half).state.phase).toBe("idle");

    const dead = input({ playerPosition: { x: 2, z: 0 }, playerAlive: false });
    expect(stepEnemyAi(createEnemyAiState(), dead, 0.1, half).state.phase).toBe("idle");
  });

  it("runs at the player at chase speed", () => {
    const step = stepEnemyAi(chasing, input({ playerPosition: { x: 0, z: 6 } }), 0.1, half);
    expect(step.state.phase).toBe("chase");
    expect(step.velocity.x).toBeCloseTo(0);
    expect(step.velocity.z).toBeCloseTo(config.chaseSpeed);
  });

  it("gives up and heads home when the player escapes, dies, or it is leashed", () => {
    const escaped = stepEnemyAi(
      chasing,
      input({ playerPosition: { x: config.loseRange + 1, z: 0 } }),
      0.1,
      half,
    );
    expect(escaped.state.phase).toBe("patrol");
    expect(escaped.state.destination).toEqual(home);

    const playerDied = stepEnemyAi(
      chasing,
      input({ playerPosition: { x: 3, z: 0 }, playerAlive: false }),
      0.1,
      half,
    );
    expect(playerDied.state.phase).toBe("patrol");

    const leashed = stepEnemyAi(
      chasing,
      input({
        position: { x: config.leashRange + 1, z: 0 },
        playerPosition: { x: config.leashRange + 3, z: 0 },
      }),
      0.1,
      half,
    );
    expect(leashed.state.phase).toBe("patrol");
    expect(leashed.state.destination).toEqual(home);
  });

  it("does not re-notice the player while outside its leash", () => {
    const returning: EnemyAiState = {
      phase: "patrol",
      timer: 5,
      destination: home,
      struck: false,
    };
    const step = stepEnemyAi(
      returning,
      input({
        position: { x: config.leashRange + 1, z: 0 },
        playerPosition: { x: config.leashRange + 2, z: 0 },
      }),
      0.1,
      half,
    );
    expect(step.state.phase).toBe("patrol");
  });
});

describe("attack", () => {
  const inRange = input({ playerPosition: { x: config.attackRange - 0.2, z: 0 } });

  it("stops and starts an attack when the player is in range", () => {
    const step = stepEnemyAi(chasing, inRange, 0.05, half);
    expect(step.state.phase).toBe("attack");
    expect(step.velocity).toEqual({ x: 0, z: 0 });
    expect(step.attack).toBeNull();
  });

  it("lands exactly one bite after the windup, then resumes the chase", () => {
    const start = stepEnemyAi(chasing, inRange, 0.05, half).state;
    const total = config.attackWindup + config.attackRecover;
    const steps = run(start, inRange, total + 0.1);

    const bites = steps.filter((step) => step.attack !== null);
    expect(bites).toHaveLength(1);
    expect(bites[0]?.attack).toEqual({
      damage: config.attackDamage,
      reach: config.attackReach,
    });
    const biteIndex = steps.findIndex((step) => step.attack !== null);
    expect((biteIndex + 1) * 0.05).toBeGreaterThanOrEqual(config.attackWindup);

    // Back to chasing, and in range again, so a new attack begins.
    expect(["chase", "attack"]).toContain(steps.at(-1)?.state.phase);
    expect(steps.some((step, i) => i > biteIndex && step.state.phase !== "attack")).toBe(true);
  });

  it("stays put for the whole attack even if the player backs away", () => {
    const start = stepEnemyAi(chasing, inRange, 0.05, half).state;
    const steps = run(start, input({ playerPosition: { x: 6, z: 0 } }), config.attackWindup);
    expect(steps.every((step) => step.velocity.x === 0 && step.velocity.z === 0)).toBe(true);
  });
});

describe("dead", () => {
  it("does nothing", () => {
    const dead: EnemyAiState = { phase: "dead", timer: 0, destination: null, struck: false };
    const step = stepEnemyAi(dead, input({ playerPosition: { x: 1, z: 0 } }), 0.1, half);
    expect(step.state).toBe(dead);
    expect(step.velocity).toEqual({ x: 0, z: 0 });
    expect(step.attack).toBeNull();
  });
});

describe("rollReward", () => {
  const table = { xp: 20, goldMin: 4, goldMax: 9 };

  it("always grants the table's XP", () => {
    expect(rollReward(table, half).xp).toBe(20);
  });

  it("rolls gold within the inclusive bounds", () => {
    expect(rollReward(table, () => 0).gold).toBe(4);
    expect(rollReward(table, () => 0.999999).gold).toBe(9);
    expect(rollReward(table, () => 1).gold).toBe(9);
    expect(rollReward(table, half).gold).toBe(7);
  });

  it("handles a fixed amount", () => {
    expect(rollReward({ xp: 5, goldMin: 3, goldMax: 3 }, half).gold).toBe(3);
  });
});
