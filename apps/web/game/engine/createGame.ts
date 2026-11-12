import "@babylonjs/core/Collisions/collisionCoordinator";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { isWithinArc } from "@valoria/game-core";
import { CORRUPTED_WOLF } from "@valoria/game-data";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";
import { TrainingDummy } from "../combat/TrainingDummy";
import type { Enemy } from "../enemies/Enemy";
import { WolfEnemy } from "../enemies/WolfEnemy";
import { InputManager } from "../input/InputManager";
import { PlayerController } from "../player/PlayerController";
import { GameStore, type HudSnapshot } from "../state/GameStore";
import { createEnvironment } from "../world/createEnvironment";

/** Longest simulated step, so a stalled tab cannot tunnel through collisions. */
const MAX_FRAME_SECONDS = 0.05;
/** An enemy this close is shown as the current target in the HUD. */
const TARGET_RANGE = 12;
/** Wolves in the encounter clearing, and how far from its centre they live. */
const WOLF_COUNT = 3;
const WOLF_HOME_RADIUS = 5;
/** Seconds a reward notice stays on screen. */
const NOTICE_SECONDS = 3.5;

export interface GameHandle {
  /** Live game state for the HUD. */
  store: GameStore;
  dispose(): void;
}

const tenths = (seconds: number) => Math.ceil(seconds * 10) / 10;

/**
 * Creates the engine, scene and game systems on the given canvas and starts
 * the render loop. Call `dispose()` to stop and release everything.
 */
export function createGame(canvas: HTMLCanvasElement): GameHandle {
  const engine = new Engine(canvas, true, { stencil: false });
  const scene = new Scene(engine);

  const environment = createEnvironment(scene);
  const input = new InputManager(canvas);
  const player = new PlayerController(scene, {
    spawnPoint: environment.spawnPoint,
    worldHalfExtent: environment.worldHalfExtent,
  });
  for (const mesh of player.meshes) environment.addShadowCaster(mesh);
  const camera = new ThirdPersonCamera(scene, player.position);

  // Running totals from defeated enemies. Levels come with progression.
  const loot = { xp: 0, gold: 0 };
  let notice: string | null = null;
  let noticeTimer = 0;

  // Practice target on the west side of the starting circle.
  const dummy = new TrainingDummy(
    scene,
    environment.spawnPoint.x - 4.3,
    environment.spawnPoint.z,
  );
  const wolves = Array.from({ length: WOLF_COUNT }, (_, index) => {
    const angle = Math.PI / 2 + (index / WOLF_COUNT) * Math.PI * 2;
    return new WolfEnemy(scene, {
      definition: CORRUPTED_WOLF,
      home: {
        x: environment.encounterArea.x + Math.cos(angle) * WOLF_HOME_RADIUS,
        z: environment.encounterArea.z + Math.sin(angle) * WOLF_HOME_RADIUS,
      },
      onDeath: (reward, wolf) => {
        loot.xp += reward.xp;
        loot.gold += reward.gold;
        notice = `${wolf.name} slain: +${reward.xp} XP, +${reward.gold} gold`;
        noticeTimer = NOTICE_SECONDS;
      },
    });
  });
  const enemies: Enemy[] = [dummy, ...wolves];
  for (const enemy of enemies) {
    for (const mesh of enemy.meshes) environment.addShadowCaster(mesh);
  }

  const distanceToPlayer = (enemy: Enemy) => {
    const position = enemy.position;
    return Math.hypot(
      position.x - player.position.x,
      position.z - player.position.z,
    );
  };

  /** The nearest living enemy within targeting range, if any. */
  const findTarget = (): Enemy | null => {
    let best: Enemy | null = null;
    let bestDistance = TARGET_RANGE;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const distance = distanceToPlayer(enemy);
      if (distance <= bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    return best;
  };

  const readSnapshot = (): HudSnapshot => {
    const target = findTarget();
    return {
      health: player.health,
      healthMax: player.healthMax,
      stamina: Math.round(player.stamina),
      staminaMax: player.staminaMax,
      sprinting: player.sprinting,
      blocking: player.blocking,
      dead: player.dead,
      respawnIn: Math.ceil(player.respawnIn),
      cooldownLight: tenths(player.cooldowns.light),
      cooldownHeavy: tenths(player.cooldowns.heavy),
      cooldownDodge: tenths(player.cooldowns.dodge),
      xp: loot.xp,
      gold: loot.gold,
      notice,
      targetName: target?.name ?? null,
      targetHealth: target?.health ?? 0,
      targetHealthMax: target?.healthMax ?? 0,
      pointerLocked: input.pointerLocked,
    };
  };
  const store = new GameStore(readSnapshot());

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, MAX_FRAME_SECONDS);

    const strike = player.update(
      input.readIntent(),
      input.readCombatIntent(),
      camera.forward,
      dt,
    );
    // A swing hits every living enemy inside its arc.
    if (strike) {
      for (const enemy of enemies) {
        if (
          enemy.alive &&
          isWithinArc(
            strike.origin,
            strike.facing,
            enemy.position,
            enemy.radius,
            strike.range,
            strike.arcDegrees,
          )
        ) {
          enemy.receiveStrike(strike.damage);
        }
      }
    }
    for (const enemy of enemies) enemy.update(dt, player);

    if (noticeTimer > 0) {
      noticeTimer -= dt;
      if (noticeTimer <= 0) notice = null;
    }

    camera.update(player.position, input.consumeLook(), dt);
    store.update(readSnapshot());
  });

  if (process.env.NODE_ENV !== "production") {
    // Development-only handle for inspecting the running game from the console.
    (window as unknown as Record<string, unknown>).__valoriaDebug = {
      scene,
      player,
      camera,
      dummy,
      wolves,
      loot,
    };
  }

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);
  engine.runRenderLoop(() => scene.render());

  return {
    store,
    dispose() {
      window.removeEventListener("resize", onResize);
      input.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
