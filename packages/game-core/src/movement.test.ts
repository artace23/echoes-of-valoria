import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOVEMENT_CONFIG as config,
  createMovementState,
  stepMovement,
  type MoveIntent,
  type MovementState,
} from "./movement";

const idle: MoveIntent = { forward: 0, right: 0, sprint: false, jump: false };
const north = { x: 0, z: 1 };
const grounded: MovementState = { ...createMovementState(), grounded: true };

describe("stepMovement", () => {
  it("does not move horizontally without input", () => {
    const step = stepMovement(grounded, idle, north, 0.1);
    expect(step.moving).toBe(false);
    expect(step.displacement.x).toBe(0);
    expect(step.displacement.z).toBe(0);
  });

  it("walks forward along the view direction", () => {
    const step = stepMovement(grounded, { ...idle, forward: 1 }, north, 0.5);
    expect(step.displacement.x).toBeCloseTo(0);
    expect(step.displacement.z).toBeCloseTo(config.walkSpeed * 0.5);
  });

  it("strafes right relative to the view direction", () => {
    const facingNorth = stepMovement(grounded, { ...idle, right: 1 }, north, 1);
    expect(facingNorth.displacement.x).toBeCloseTo(config.walkSpeed);
    expect(facingNorth.displacement.z).toBeCloseTo(0);

    const facingEast = stepMovement(
      grounded,
      { ...idle, right: 1 },
      { x: 1, z: 0 },
      1,
    );
    expect(facingEast.displacement.x).toBeCloseTo(0);
    expect(facingEast.displacement.z).toBeCloseTo(-config.walkSpeed);
  });

  it("does not move faster diagonally", () => {
    const step = stepMovement(
      grounded,
      { ...idle, forward: 1, right: 1 },
      north,
      1,
    );
    const distance = Math.hypot(step.displacement.x, step.displacement.z);
    expect(distance).toBeCloseTo(config.walkSpeed);
  });

  it("sprints faster and drains stamina", () => {
    const step = stepMovement(
      grounded,
      { ...idle, forward: 1, sprint: true },
      north,
      1,
    );
    expect(step.state.sprinting).toBe(true);
    expect(step.displacement.z).toBeCloseTo(config.sprintSpeed);
    expect(step.state.stamina).toBeCloseTo(
      config.staminaMax - config.sprintStaminaPerSecond,
    );
  });

  it("does not sprint while standing still", () => {
    const step = stepMovement(grounded, { ...idle, sprint: true }, north, 1);
    expect(step.state.sprinting).toBe(false);
    expect(step.state.stamina).toBe(config.staminaMax);
  });

  it("cannot start sprinting below the minimum stamina", () => {
    const tired = { ...grounded, stamina: config.sprintMinStamina - 1 };
    const step = stepMovement(
      tired,
      { ...idle, forward: 1, sprint: true },
      north,
      0.1,
    );
    expect(step.state.sprinting).toBe(false);
    expect(step.state.stamina).toBeGreaterThan(tired.stamina);
  });

  it("keeps an ongoing sprint going until stamina is empty", () => {
    const sprintIntent = { ...idle, forward: 1, sprint: true };
    const low = { ...grounded, stamina: 1, sprinting: true };
    const draining = stepMovement(low, sprintIntent, north, 1);
    expect(draining.state.sprinting).toBe(true);
    expect(draining.state.stamina).toBe(0);

    const exhausted = stepMovement(draining.state, sprintIntent, north, 0.1);
    expect(exhausted.state.sprinting).toBe(false);
  });

  it("regenerates stamina up to the maximum", () => {
    const step = stepMovement({ ...grounded, stamina: 95 }, idle, north, 10);
    expect(step.state.stamina).toBe(config.staminaMax);
  });

  it("jumps only from the ground", () => {
    const jump = stepMovement(grounded, { ...idle, jump: true }, north, 0.1);
    expect(jump.state.verticalVelocity).toBe(config.jumpSpeed);
    expect(jump.state.grounded).toBe(false);
    expect(jump.displacement.y).toBeGreaterThan(0);

    const airborne = stepMovement(
      jump.state,
      { ...idle, jump: true },
      north,
      0.1,
    );
    expect(airborne.state.verticalVelocity).toBeLessThan(config.jumpSpeed);
  });

  it("accelerates downward in the air up to the fall-speed limit", () => {
    const falling = { ...createMovementState(), grounded: false };
    const step = stepMovement(falling, idle, north, 0.5);
    expect(step.state.verticalVelocity).toBeCloseTo(-config.gravity * 0.5);

    const longFall = stepMovement(falling, idle, north, 100);
    expect(longFall.state.verticalVelocity).toBe(-config.maxFallSpeed);
  });

  it("presses gently into the ground while grounded", () => {
    const step = stepMovement(grounded, idle, north, 0.1);
    expect(step.state.verticalVelocity).toBe(-config.groundStickSpeed);
    expect(step.state.grounded).toBe(true);
  });
});
