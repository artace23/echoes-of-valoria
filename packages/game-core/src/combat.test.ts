import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBAT_CONFIG as config,
  applyDamage,
  calculateDamage,
  combatMoveFactor,
  createCombatState,
  isInvulnerable,
  isWithinArc,
  resolveIncomingDamage,
  stepCombat,
  type CombatIntent,
  type CombatState,
  type CombatStep,
} from "./combat";

const none: CombatIntent = {
  light: false,
  heavy: false,
  dodge: false,
  block: false,
};

/** Run idle steps for `seconds`, collecting every step. */
function advance(state: CombatState, seconds: number, dt = 0.05): CombatStep[] {
  const steps: CombatStep[] = [];
  let current = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const step = stepCombat(current, none, 100, dt);
    steps.push(step);
    current = step.state;
  }
  return steps;
}

describe("stepCombat", () => {
  it("starts a light attack, spends stamina, and sets its cooldown", () => {
    const step = stepCombat(createCombatState(), { ...none, light: true }, 100, 0.016);
    expect(step.started).toBe("light");
    expect(step.staminaSpent).toBe(config.light.staminaCost);
    expect(step.state.action?.kind).toBe("light");
    expect(step.state.cooldowns.light).toBe(config.light.cooldown);
  });

  it("lands exactly one strike, after the windup", () => {
    const start = stepCombat(createCombatState(), { ...none, heavy: true }, 100, 0.016);
    expect(start.strike).toBeNull();

    const steps = advance(start.state, config.heavy.duration + 0.2);
    const strikes = steps.filter((step) => step.strike !== null);
    expect(strikes).toHaveLength(1);
    expect(strikes[0]?.strike).toMatchObject({
      kind: "heavy",
      damage: config.heavy.damage,
    });

    const firstStrikeIndex = steps.findIndex((step) => step.strike !== null);
    expect((firstStrikeIndex + 1) * 0.05).toBeGreaterThanOrEqual(config.heavy.windup);
    expect(steps.at(-1)?.state.action).toBeNull();
  });

  it("cannot start another action while one is running", () => {
    const start = stepCombat(createCombatState(), { ...none, light: true }, 100, 0.016);
    const during = stepCombat(start.state, { ...none, heavy: true, dodge: true }, 100, 0.05);
    expect(during.started).toBeNull();
    expect(during.state.action?.kind).toBe("light");
  });

  it("respects cooldowns", () => {
    const start = stepCombat(createCombatState(), { ...none, heavy: true }, 100, 0.016);
    const afterAction = advance(start.state, config.heavy.duration + 0.05).at(-1)!.state;
    expect(afterAction.action).toBeNull();
    expect(afterAction.cooldowns.heavy).toBeGreaterThan(0);

    const blocked = stepCombat(afterAction, { ...none, heavy: true }, 100, 0.016);
    expect(blocked.started).toBeNull();

    const ready = advance(afterAction, config.heavy.cooldown).at(-1)!.state;
    expect(ready.cooldowns.heavy).toBe(0);
    expect(stepCombat(ready, { ...none, heavy: true }, 100, 0.016).started).toBe("heavy");
  });

  it("refuses an action the character cannot afford", () => {
    const step = stepCombat(
      createCombatState(),
      { ...none, heavy: true },
      config.heavy.staminaCost - 1,
      0.016,
    );
    expect(step.started).toBeNull();
    expect(step.staminaSpent).toBe(0);
  });

  it("falls back to a cheaper action when the preferred one is unaffordable", () => {
    const step = stepCombat(
      createCombatState(),
      { ...none, heavy: true, light: true },
      config.light.staminaCost,
      0.016,
    );
    expect(step.started).toBe("light");
  });

  it("prefers dodge over attacks", () => {
    const step = stepCombat(
      createCombatState(),
      { light: true, heavy: true, dodge: true, block: false },
      100,
      0.016,
    );
    expect(step.started).toBe("dodge");
  });

  it("blocks only while no action is running", () => {
    const idle = stepCombat(createCombatState(), { ...none, block: true }, 100, 0.016);
    expect(idle.state.blocking).toBe(true);

    const attacking = stepCombat(
      createCombatState(),
      { ...none, light: true, block: true },
      100,
      0.016,
    );
    expect(attacking.state.blocking).toBe(false);
  });
});

describe("dodge", () => {
  it("is invulnerable only during the opening window", () => {
    const start = stepCombat(createCombatState(), { ...none, dodge: true }, 100, 0.016);
    expect(isInvulnerable(start.state)).toBe(true);
    expect(combatMoveFactor(start.state)).toBe(0);

    const late = advance(start.state, config.dodge.invulnerableFor + 0.05).at(-1)!.state;
    expect(late.action?.kind).toBe("dodge");
    expect(isInvulnerable(late)).toBe(false);
  });

  it("never emits a strike", () => {
    const start = stepCombat(createCombatState(), { ...none, dodge: true }, 100, 0.016);
    const steps = advance(start.state, config.dodge.duration + 0.1);
    expect(steps.every((step) => step.strike === null)).toBe(true);
  });
});

describe("combatMoveFactor", () => {
  it("slows the character while attacking or blocking", () => {
    expect(combatMoveFactor(createCombatState())).toBe(1);
    expect(combatMoveFactor({ ...createCombatState(), blocking: true })).toBe(
      config.block.moveFactor,
    );
    const heavy = stepCombat(createCombatState(), { ...none, heavy: true }, 100, 0.016);
    expect(combatMoveFactor(heavy.state)).toBe(config.heavy.moveFactor);
  });
});

describe("damage", () => {
  it("reduces damage by defense but never below 1", () => {
    expect(calculateDamage(30, 0)).toBe(30);
    expect(calculateDamage(30, 100)).toBe(15);
    expect(calculateDamage(1, 10_000)).toBe(1);
    expect(calculateDamage(30, -50)).toBe(30);
  });

  it("clamps health at zero", () => {
    expect(applyDamage(100, 30)).toBe(70);
    expect(applyDamage(10, 30)).toBe(0);
    expect(applyDamage(50, -5)).toBe(50);
  });

  const defender = {
    blocking: false,
    invulnerable: false,
    facingAttacker: true,
    stamina: 100,
  };

  it("lands in full on an unguarded defender", () => {
    expect(resolveIncomingDamage(20, defender)).toEqual({
      outcome: "hit",
      damage: 20,
      staminaCost: 0,
    });
  });

  it("misses an invulnerable defender, even one who is blocking", () => {
    const result = resolveIncomingDamage(20, {
      ...defender,
      invulnerable: true,
      blocking: true,
    });
    expect(result).toEqual({ outcome: "dodged", damage: 0, staminaCost: 0 });
  });

  it("is reduced by a block and costs stamina", () => {
    const result = resolveIncomingDamage(20, { ...defender, blocking: true });
    expect(result.outcome).toBe("blocked");
    expect(result.damage).toBe(5);
    expect(result.staminaCost).toBeCloseTo(12);
  });

  it("cannot be blocked from behind", () => {
    const result = resolveIncomingDamage(20, {
      ...defender,
      blocking: true,
      facingAttacker: false,
    });
    expect(result.outcome).toBe("hit");
    expect(result.damage).toBe(20);
  });

  it("breaks the guard when stamina is too low", () => {
    const result = resolveIncomingDamage(20, {
      ...defender,
      blocking: true,
      stamina: 5,
    });
    expect(result).toEqual({ outcome: "hit", damage: 20, staminaCost: 0 });
  });
});

describe("isWithinArc", () => {
  const origin = { x: 0, z: 0 };
  const north = { x: 0, z: 1 };

  it("hits a target in front and in range", () => {
    expect(isWithinArc(origin, north, { x: 0, z: 2 }, 0.5, 2.3, 110)).toBe(true);
  });

  it("measures range to the target's edge", () => {
    expect(isWithinArc(origin, north, { x: 0, z: 2.7 }, 0.5, 2.3, 110)).toBe(true);
    expect(isWithinArc(origin, north, { x: 0, z: 2.9 }, 0.5, 2.3, 110)).toBe(false);
  });

  it("misses a target behind or outside the arc", () => {
    expect(isWithinArc(origin, north, { x: 0, z: -2 }, 0.5, 2.3, 110)).toBe(false);
    expect(isWithinArc(origin, north, { x: 2, z: 0.2 }, 0.5, 2.3, 110)).toBe(false);
  });

  it("includes a target at the edge of the arc", () => {
    const angle = (50 * Math.PI) / 180;
    const target = { x: Math.sin(angle) * 2, z: Math.cos(angle) * 2 };
    expect(isWithinArc(origin, north, target, 0, 2.3, 110)).toBe(true);
  });

  it("always hits an overlapping target", () => {
    expect(isWithinArc(origin, north, { x: 0, z: -0.2 }, 0.5, 2.3, 110)).toBe(true);
  });
});
