import "@babylonjs/core/Collisions/collisionCoordinator";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";
import { InputManager } from "../input/InputManager";
import { PlayerController } from "../player/PlayerController";
import { GameStore } from "../state/GameStore";
import { createEnvironment } from "../world/createEnvironment";

/** Longest simulated step, so a stalled tab cannot tunnel through collisions. */
const MAX_FRAME_SECONDS = 0.05;

export interface GameHandle {
  /** Live game state for the HUD. */
  store: GameStore;
  dispose(): void;
}

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

  const readSnapshot = () => ({
    health: player.health,
    healthMax: player.healthMax,
    stamina: Math.round(player.stamina),
    staminaMax: player.staminaMax,
    sprinting: player.sprinting,
    pointerLocked: input.pointerLocked,
  });
  const store = new GameStore(readSnapshot());

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, MAX_FRAME_SECONDS);
    player.update(input.readIntent(), camera.forward, dt);
    camera.update(player.position, input.consumeLook(), dt);
    store.update(readSnapshot());
  });

  if (process.env.NODE_ENV !== "production") {
    // Development-only handle for inspecting the running game from the console.
    (window as unknown as Record<string, unknown>).__valoriaDebug = {
      scene,
      player,
      camera,
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
