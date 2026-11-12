import "@babylonjs/core/Collisions/collisionCoordinator";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import {
  addItem,
  countItem,
  createCharacterProgress,
  createInventory,
  createQuestProgress,
  deriveStats,
  equipWeapon,
  grantReward,
  isWithinArc,
  recordEnemyDefeated,
  rollDrops,
  unequipWeapon,
  useConsumable,
  withEquipment,
  xpToNextLevel,
  type Equipment,
} from "@valoria/game-core";
import { CORRUPTED_WOLF, CULL_THE_PACK, getItem } from "@valoria/game-data";
import type { ItemId } from "@valoria/game-types";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";
import { TrainingDummy } from "../combat/TrainingDummy";
import type { Enemy } from "../enemies/Enemy";
import { WolfEnemy } from "../enemies/WolfEnemy";
import { InputManager } from "../input/InputManager";
import { PickupManager } from "../items/PickupManager";
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
/** Seconds a notice stays on screen. Queued notices show one after another. */
const NOTICE_SECONDS = 3;
/** A notice is cut short to this when others are waiting behind it. */
const NOTICE_SECONDS_WHEN_QUEUED = 1.6;
const POTION: ItemId = "health-potion";

/** Things the HUD can ask the game to do. */
export interface GameActions {
  /** Use a consumable from the inventory. */
  useItem(itemId: ItemId): void;
  /** Equip a weapon from the inventory. */
  equipItem(itemId: ItemId): void;
  unequipWeapon(): void;
}

export interface GameHandle {
  /** Live game state for the HUD. */
  store: GameStore;
  actions: GameActions;
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

  // Character state. Rules live in game-core; this module only holds the
  // current values and applies their effects to the player.
  let progress = createCharacterProgress();
  let inventory = addItem(createInventory(), getItem(POTION), 2).inventory;
  let equipment: Equipment = { weapon: "rusty-sword" };
  let quest = createQuestProgress(CULL_THE_PACK);
  let notice: string | null = null;
  let noticeAge = 0;
  const pendingNotices: string[] = [];

  /** Show a message; if one is already showing, it waits its turn. */
  const showNotice = (message: string) => {
    if (notice === null) {
      notice = message;
      noticeAge = 0;
    } else if (notice !== message && !pendingNotices.includes(message)) {
      pendingNotices.push(message);
    }
  };

  /** Add XP and gold; levelling up raises stats and restores the Warrior. */
  const receiveReward = (reward: { xp: number; gold: number }) => {
    const result = grantReward(progress, reward);
    progress = result.progress;
    if (result.levelsGained > 0) {
      refreshStats(true);
      showNotice(`Level up! You are now level ${progress.level}`);
    }
  };

  /** Recompute stats from level and equipment and apply them to the player. */
  const refreshStats = (restore: boolean) => {
    player.applyStats(
      withEquipment(deriveStats(progress.level), equipment, getItem),
      restore,
    );
    const weapon = equipment.weapon ? getItem(equipment.weapon) : null;
    player.setWeaponVisual(weapon?.kind === "weapon" ? weapon : null);
  };
  refreshStats(true);

  const pickups = new PickupManager(scene);
  // Starting-area potion, and a better sword on the way to the wolves.
  pickups.spawn(
    getItem(POTION),
    environment.spawnPoint.x + 3.5,
    environment.spawnPoint.z,
  );
  pickups.spawn(
    getItem("iron-sword"),
    environment.spawnPoint.x,
    (environment.spawnPoint.z + environment.encounterArea.z) / 2,
  );

  const actions: GameActions = {
    useItem(itemId) {
      const item = getItem(itemId);
      const result = useConsumable(
        inventory,
        item,
        player.health,
        player.healthMax,
      );
      if (!result) {
        if (item.kind === "consumable" && countItem(inventory, itemId) > 0) {
          showNotice(
            player.dead ? "You cannot do that now" : "Already at full health",
          );
        }
        return;
      }
      inventory = result.inventory;
      player.heal(result.healed);
      showNotice(`${item.name}: +${result.healed} health`);
    },
    equipItem(itemId) {
      const item = getItem(itemId);
      const result = equipWeapon(inventory, equipment, item, getItem);
      if (!result) return;
      inventory = result.inventory;
      equipment = result.equipment;
      refreshStats(false);
      showNotice(`Equipped ${item.name}`);
    },
    unequipWeapon() {
      const result = unequipWeapon(inventory, equipment, getItem);
      if (!result) {
        if (equipment.weapon) showNotice("Inventory is full");
        return;
      }
      inventory = result.inventory;
      equipment = result.equipment;
      refreshStats(false);
      showNotice("Weapon unequipped");
    },
  };

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
        showNotice(`${wolf.name} slain: +${reward.xp} XP, +${reward.gold} gold`);
        receiveReward(reward);

        const update = recordEnemyDefeated(
          quest,
          CULL_THE_PACK,
          CORRUPTED_WOLF.id,
        );
        quest = update.progress;
        if (update.justCompleted) {
          const questReward = CULL_THE_PACK.reward;
          showNotice(
            `Quest complete: ${CULL_THE_PACK.name}. +${questReward.xp} XP, +${questReward.gold} gold`,
          );
          receiveReward(questReward);
        }

        // Item drops land where the wolf fell, slightly spread out.
        const drops = rollDrops(CORRUPTED_WOLF.drops, Math.random);
        drops.forEach((itemId, dropIndex) => {
          pickups.spawn(
            getItem(itemId),
            wolf.position.x + dropIndex * 0.6,
            wolf.position.z,
          );
        });
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

  /** Try to put a world pickup into the inventory. */
  const collect = (itemId: ItemId): boolean => {
    if (player.dead) return false;
    const item = getItem(itemId);
    const result = addItem(inventory, item);
    if (result.added === 0) return false;
    inventory = result.inventory;
    showNotice(`Picked up ${item.name}`);
    return true;
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
      level: progress.level,
      xp: progress.xp,
      xpToNext: xpToNextLevel(progress.level),
      gold: progress.gold,
      attackPower: player.stats.attackPower,
      defense: player.stats.defense,
      inventory,
      weaponId: equipment.weapon,
      potionCount: countItem(inventory, POTION),
      questCount: quest.count,
      questCompleted: quest.status === "completed",
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

    if (input.consumeUsePotion()) actions.useItem(POTION);

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
    pickups.update(dt, player.position, collect);

    if (notice !== null) {
      noticeAge += dt;
      const lifetime =
        pendingNotices.length > 0 ? NOTICE_SECONDS_WHEN_QUEUED : NOTICE_SECONDS;
      if (noticeAge >= lifetime) {
        notice = pendingNotices.shift() ?? null;
        noticeAge = 0;
      }
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
      pickups,
      actions,
      get progress() {
        return progress;
      },
      get inventory() {
        return inventory;
      },
      get equipment() {
        return equipment;
      },
      get quest() {
        return quest;
      },
    };
  }

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);
  engine.runRenderLoop(() => scene.render());

  return {
    store,
    actions,
    dispose() {
      window.removeEventListener("resize", onResize);
      input.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
