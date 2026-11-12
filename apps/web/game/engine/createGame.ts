import "@babylonjs/core/Collisions/collisionCoordinator";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import {
  DEFAULT_INVENTORY_CAPACITY,
  SAVE_VERSION,
  acceptQuest,
  addItem,
  countItem,
  createCharacterProgress,
  createInventory,
  createQuestProgress,
  deriveStats,
  distributeSpawnPoints,
  equipWeapon,
  findRegion,
  getNpcDialogue,
  grantReward,
  isInSafeZone,
  isWithinArc,
  parseSave,
  recordEnemyDefeated,
  rollDrops,
  serializeSave,
  turnInQuest,
  unequipWeapon,
  useConsumable,
  withEquipment,
  xpToNextLevel,
  type CombatIntent,
  type DialogueView,
  type Equipment,
  type MoveIntent,
  type SaveData,
} from "@valoria/game-core";
import {
  CORRUPTED_WOLF,
  CULL_THE_PACK,
  ITEMS,
  NPCS,
  WORLD,
  getItem,
} from "@valoria/game-data";
import type { ItemId, NpcDefinition } from "@valoria/game-types";
import { AssetLibrary } from "../assets/AssetLibrary";
import { AmbientAudio } from "../audio/AmbientAudio";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";
import { TrainingDummy } from "../combat/TrainingDummy";
import type { Enemy } from "../enemies/Enemy";
import { WolfEnemy } from "../enemies/WolfEnemy";
import { InputManager } from "../input/InputManager";
import { PickupManager } from "../items/PickupManager";
import { NpcManager } from "../npcs/NpcManager";
import { PlayerController } from "../player/PlayerController";
import { createRenderPipeline } from "../rendering/createRenderPipeline";
import { SaveStorage } from "../save/SaveStorage";
import {
  GameStore,
  type DialogueSnapshot,
  type HudSnapshot,
} from "../state/GameStore";
import { TRAINING_YARD } from "../world/buildVillage";
import { createEnvironment } from "../world/createEnvironment";

/**
 * Parts too small for their shadow to be noticed. Each shadow-casting mesh
 * is a draw call per cascade, so these are left out.
 */
const TINY_PART = /ear|eye|snout|tail|nose|belt|visor/;
const castsShadow = (mesh: { name: string }) => !TINY_PART.test(mesh.name);

/** Longest simulated step, so a stalled tab cannot tunnel through collisions. */
const MAX_FRAME_SECONDS = 0.05;
/** An enemy this close is shown as the current target in the HUD. */
const TARGET_RANGE = 12;
/** Seconds a notice stays on screen. Queued notices show one after another. */
const NOTICE_SECONDS = 3;
/** A notice is cut short to this when others are waiting behind it. */
const NOTICE_SECONDS_WHEN_QUEUED = 1.6;
/**
 * After a conversation ends, the interact key is ignored for this long, so
 * the key press that closed it cannot immediately start it again.
 */
const INTERACT_LOCKOUT_SECONDS = 0.35;
/** How often progress is written to storage, if anything changed. */
const AUTOSAVE_SECONDS = 3;
const POTION: ItemId = "health-potion";

const IDLE_MOVE: MoveIntent = {
  forward: 0,
  right: 0,
  sprint: false,
  jump: false,
};
const IDLE_COMBAT: CombatIntent = {
  light: false,
  heavy: false,
  dodge: false,
  block: false,
};

/** Things the HUD can ask the game to do. */
export interface GameActions {
  /** Use a consumable from the inventory. */
  useItem(itemId: ItemId): void;
  /** Equip a weapon from the inventory. */
  equipItem(itemId: ItemId): void;
  unequipWeapon(): void;
  /** Take the action the current conversation offers, if any. */
  dialogueAction(): void;
  closeDialogue(): void;
  toggleSound(): void;
  /** Write progress to storage now. */
  saveGame(): void;
  /** Erase saved progress and start over. Reloads the page. */
  resetProgress(): void;
}

export interface GameHandle {
  /** Live game state for the HUD. */
  store: GameStore;
  actions: GameActions;
  dispose(): void;
}

const tenths = (seconds: number) => Math.ceil(seconds * 10) / 10;

/** Small seeded generator, so spawn placement is the same on every load. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Creates the engine, scene and game systems on the given canvas and starts
 * the render loop. Call `dispose()` to stop and release everything.
 *
 * Asynchronous because sourced 3D models are loaded before the world is
 * built. With no models sourced this resolves almost immediately.
 */
export async function createGame(
  canvas: HTMLCanvasElement,
): Promise<GameHandle> {
  const engine = new Engine(canvas, true, { stencil: false });
  const scene = new Scene(engine);

  const assets = await AssetLibrary.load(scene);

  // The camera exists before the world so cascaded shadows can follow it.
  const camera = new ThirdPersonCamera(
    scene,
    new Vector3(WORLD.spawnPoint.x, 1.5, WORLD.spawnPoint.z),
  );
  const renderPipeline = createRenderPipeline(scene, camera.camera);
  const environment = createEnvironment(scene, assets, camera.camera);
  const input = new InputManager(canvas);
  const audio = new AmbientAudio();
  const player = new PlayerController(scene, {
    spawnPoint: environment.spawnPoint,
    worldHalfExtent: environment.worldHalfExtent,
  });
  for (const mesh of player.meshes.filter(castsShadow)) {
    environment.addShadowCaster(mesh);
  }

  // Character state. Rules live in game-core; this module only holds the
  // current values and applies their effects to the world.
  //
  // A stored save is validated by game-core before anything is taken from
  // it; an unreadable or tampered save is ignored and a new game begins.
  const storage = new SaveStorage();
  const storedText = storage.read();
  const loaded = storedText
    ? parseSave(storedText, {
        items: ITEMS,
        quest: CULL_THE_PACK,
        inventoryCapacity: DEFAULT_INVENTORY_CAPACITY,
      })
    : null;

  let progress = loaded?.progress ?? createCharacterProgress();
  let inventory =
    loaded?.inventory ??
    addItem(createInventory(), getItem(POTION), 2).inventory;
  let equipment: Equipment = loaded?.equipment ?? { weapon: "rusty-sword" };
  let quest = loaded?.quest ?? createQuestProgress(CULL_THE_PACK);
  /** One-off world pickups already taken; they are not placed again. */
  const collectedPickups = new Set<string>(loaded?.collectedPickups ?? []);
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
  if (loaded) {
    player.setHealth(loaded.health);
    showNotice("Welcome back. Your progress was restored.");
  } else if (storedText) {
    showNotice("Your saved progress could not be read. Starting anew.");
  }

  // --- Saving --------------------------------------------------------------
  let lastSavedText = loaded ? storedText : null;
  let savedAt: string | null = null;
  let saveTimer = 0;
  let savingEnabled = true;

  const buildSave = (): SaveData => ({
    version: SAVE_VERSION,
    progress,
    // A fallen Warrior respawns at full health, so save that instead of 0.
    health: player.dead ? player.healthMax : player.health,
    inventory,
    equipment,
    quest,
    collectedPickups: [...collectedPickups],
  });

  /** Write progress if it changed (or always, with `force`). */
  const saveNow = (force = false): boolean => {
    if (!savingEnabled) return false;
    const text = serializeSave(buildSave());
    if (!force && text === lastSavedText) return true;
    if (!storage.write(text)) return false;
    lastSavedText = text;
    savedAt = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return true;
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

  // --- Villagers and conversation -----------------------------------------
  const npcs = new NpcManager(scene, NPCS);
  for (const mesh of npcs.meshes.filter(castsShadow)) {
    environment.addShadowCaster(mesh);
  }

  /** Show a quest marker over whoever the quest currently points to. */
  const syncQuestMarkers = () => {
    for (const npc of NPCS) {
      if (npc.quest?.questId !== quest.questId) continue;
      npcs.setMarker(
        npc.id,
        quest.status === "available"
          ? "available"
          : quest.status === "ready"
            ? "ready"
            : "none",
      );
    }
  };
  syncQuestMarkers();

  let talkingTo: NpcDefinition | null = null;
  let dialogue: DialogueSnapshot | null = null;
  let interactLockout = 0;

  const openDialogue = (npc: NpcDefinition) => {
    const view: DialogueView = getNpcDialogue(npc, quest);
    talkingTo = npc;
    dialogue = {
      npcName: npc.name,
      npcTitle: npc.title,
      lines: view.lines,
      actionLabel: view.action?.label ?? null,
    };
    // Dialogue buttons need a free cursor.
    if (input.pointerLocked) document.exitPointerLock();
  };

  const closeDialogue = () => {
    talkingTo = null;
    dialogue = null;
    interactLockout = INTERACT_LOCKOUT_SECONDS;
  };

  const pickups = new PickupManager(scene);
  // A potion left out by the herbalist, and a better sword at the cart
  // abandoned on the forest road.
  const placeWorldPickup = (id: string, itemId: ItemId, x: number, z: number) => {
    if (!collectedPickups.has(id)) pickups.spawn(getItem(itemId), x, z, id);
  };
  placeWorldPickup("village-potion", POTION, -18.8, -47.4);
  const cart = WORLD.markers.find((marker) => marker.id === "abandoned-cart");
  if (cart) {
    placeWorldPickup(
      "cart-iron-sword",
      "iron-sword",
      cart.position.x - 1.8,
      cart.position.z + 1.4,
    );
  }

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
    dialogueAction() {
      if (!talkingTo) return;
      const action = getNpcDialogue(talkingTo, quest).action;
      if (!action) return;
      if (action.kind === "accept-quest") {
        quest = acceptQuest(quest);
        showNotice(`Quest accepted: ${CULL_THE_PACK.name}`);
      } else {
        const result = turnInQuest(quest, CULL_THE_PACK);
        quest = result.progress;
        if (result.reward) {
          showNotice(
            `Quest complete: ${CULL_THE_PACK.name}. +${result.reward.xp} XP, +${result.reward.gold} gold`,
          );
          receiveReward(result.reward);
        }
      }
      syncQuestMarkers();
      // Carry on the conversation with what the NPC says next.
      openDialogue(talkingTo);
    },
    closeDialogue,
    toggleSound() {
      audio.unlock();
      audio.setMuted(!audio.isMuted);
    },
    saveGame() {
      showNotice(
        saveNow(true)
          ? "Progress saved"
          : "Could not save: browser storage is unavailable",
      );
    },
    resetProgress() {
      // Stop saving first, or the autosave would write the old game back.
      savingEnabled = false;
      storage.clear();
      window.location.reload();
    },
  };

  // --- Enemies ------------------------------------------------------------
  const dummy = new TrainingDummy(scene, TRAINING_YARD.x, TRAINING_YARD.z);

  const onWolfDeath = (
    reward: { xp: number; gold: number },
    wolf: WolfEnemy,
  ) => {
    showNotice(`${wolf.name} slain: +${reward.xp} XP, +${reward.gold} gold`);
    receiveReward(reward);

    const update = recordEnemyDefeated(quest, CULL_THE_PACK, CORRUPTED_WOLF.id);
    quest = update.progress;
    if (update.objectiveMet) {
      const giver = NPCS.find(
        (npc) => npc.quest?.questId === CULL_THE_PACK.id,
      );
      showNotice(
        `Objective complete: return to ${giver?.name ?? "the village"}`,
      );
      syncQuestMarkers();
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
  };

  // Each spawn zone is home to its own pack.
  const spawnRandom = seededRandom(4242);
  const wolves = WORLD.spawnZones.flatMap((zone) =>
    distributeSpawnPoints(zone, spawnRandom).map(
      (home) =>
        new WolfEnemy(scene, {
          definition: CORRUPTED_WOLF,
          home,
          onDeath: onWolfDeath,
        }),
    ),
  );

  const enemies: Enemy[] = [dummy, ...wolves];
  for (const enemy of enemies) {
    for (const mesh of enemy.meshes.filter(castsShadow)) {
      environment.addShadowCaster(mesh);
    }
  }

  /** The nearest living enemy within targeting range, if any. */
  const findTarget = (): Enemy | null => {
    let best: Enemy | null = null;
    let bestDistance = TARGET_RANGE;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const position = enemy.position;
      const distance = Math.hypot(
        position.x - player.position.x,
        position.z - player.position.z,
      );
      if (distance <= bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    return best;
  };

  /** Try to put a world pickup into the inventory. */
  const collect = (itemId: ItemId, pickupId: string | null): boolean => {
    if (player.dead) return false;
    const item = getItem(itemId);
    const result = addItem(inventory, item);
    if (result.added === 0) return false;
    inventory = result.inventory;
    if (pickupId) collectedPickups.add(pickupId);
    showNotice(`Picked up ${item.name}`);
    return true;
  };

  const readSnapshot = (): HudSnapshot => {
    const target = findTarget();
    const region = findRegion(WORLD.regions, player.position);
    const nearby =
      talkingTo || player.dead ? null : npcs.nearest(player.position);
    const facing = player.facing;
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
      questStatus: quest.status,
      questCount: quest.count,
      locationName: region?.name ?? WORLD.wildernessName,
      inSafeZone: player.sheltered,
      interactPrompt: nearby ? `Talk to ${nearby.name}` : null,
      dialogue,
      // Coarse on purpose: the map does not need more, and finer values
      // would re-render the HUD on every step.
      playerX: Math.round(player.position.x),
      playerZ: Math.round(player.position.z),
      playerHeading: Math.round(Math.atan2(facing.x, facing.z) * 8) / 8,
      soundOn: !audio.isMuted,
      savedAt,
      saveAvailable: storage.available,
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

    player.sheltered = isInSafeZone(WORLD.regions, player.position);

    // Read input every frame so presses made during a conversation are
    // consumed rather than acted on when it ends.
    const wantsInteract = input.consumeInteract();
    const wantsPotion = input.consumeUsePotion();
    let moveIntent = input.readIntent();
    let combatIntent = input.readCombatIntent();

    if (talkingTo) {
      // The Warrior stands still while talking.
      moveIntent = IDLE_MOVE;
      combatIntent = IDLE_COMBAT;
      if (player.dead) closeDialogue();
    } else if (!player.dead) {
      interactLockout = Math.max(0, interactLockout - dt);
      if (wantsInteract && interactLockout === 0) {
        const npc = npcs.nearest(player.position);
        if (npc) openDialogue(npc);
      }
      if (wantsPotion) actions.useItem(POTION);
    }

    const strike = player.update(moveIntent, combatIntent, camera.forward, dt);
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
    npcs.update(dt, player.position);
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

    saveTimer += dt;
    if (saveTimer >= AUTOSAVE_SECONDS) {
      saveTimer = 0;
      saveNow();
    }

    camera.update(player.position, input.consumeLook(), dt);
    const wild = environment.update(player.position);
    audio.update(dt, wild);
    store.update(readSnapshot());
  });

  // Browsers only start audio from a user gesture.
  const unlockAudio = () => {
    audio.unlock();
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  };
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);

  // Save when the page is hidden or closed, so nothing recent is lost.
  const saveOnLeave = () => {
    if (document.visibilityState !== "visible") saveNow();
  };
  const saveOnPageHide = () => saveNow();
  document.addEventListener("visibilitychange", saveOnLeave);
  window.addEventListener("pagehide", saveOnPageHide);

  if (process.env.NODE_ENV !== "production") {
    // Development-only handle for inspecting the running game from the console.
    (window as unknown as Record<string, unknown>).__valoriaDebug = {
      scene,
      player,
      camera,
      dummy,
      wolves,
      npcs,
      pickups,
      actions,
      audio,
      environment,
      assets,
      renderPipeline,
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
      get dialogue() {
        return dialogue;
      },
      get collectedPickups() {
        return [...collectedPickups];
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
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      document.removeEventListener("visibilitychange", saveOnLeave);
      window.removeEventListener("pagehide", saveOnPageHide);
      saveNow();
      input.dispose();
      audio.dispose();
      renderPipeline.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
