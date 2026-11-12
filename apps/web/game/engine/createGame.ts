import "@babylonjs/core/Collisions/collisionCoordinator";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { isWithinArc } from "@valoria/game-core";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";
import { TrainingDummy } from "../combat/TrainingDummy";
import { InputManager } from "../input/InputManager";
import { PlayerController } from "../player/PlayerController";
import { GameStore, type HudSnapshot } from "../state/GameStore";
import { createEnvironment } from "../world/createEnvironment";

/** Longest simulated step, so a stalled tab cannot tunnel through collisions. */
const MAX_FRAME_SECONDS = 0.05;
/** An enemy this close is shown as the current target in the HUD. */
const TARGET_RANGE = 12;

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

  const dummy = new TrainingDummy(
    scene,
    environment.encounterArea.x,
    environment.encounterArea.z,
  );
  for (const mesh of dummy.meshes) environment.addShadowCaster(mesh);

  const readSnapshot = (): HudSnapshot => {
    const dummyPosition = dummy.position;
    const targeted =
      !dummy.destroyed &&
      Math.hypot(
        dummyPosition.x - player.position.x,
        dummyPosition.z - player.position.z,
      ) <= TARGET_RANGE;
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
      targetName: targeted ? dummy.name : null,
      targetHealth: targeted ? dummy.health : 0,
      targetHealthMax: targeted ? dummy.healthMax : 0,
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
    if (
      strike &&
      !dummy.destroyed &&
      isWithinArc(
        strike.origin,
        strike.facing,
        dummy.position,
        dummy.radius,
        strike.range,
        strike.arcDegrees,
      )
    ) {
      dummy.receiveStrike(strike.damage);
    }
    dummy.update(dt, player);

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
