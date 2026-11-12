# Architecture

## Applications
- `apps/web`: Next.js browser client; React UI and PixiJS combat rendering.
- `apps/mobile`: Expo / React Native client; shared game logic and mobile-native UI.
  Evaluate Skia for specific rendering needs after a prototype.

### 3D prototype layout (current direction)
The web client is a third-person 3D game on Babylon.js (`@babylonjs/core`), replacing the
earlier PixiJS plan. Collision uses Babylon's built-in ellipsoid collision system; no
physics engine is installed.

- `packages/game-core`: rules as pure functions (e.g. `movement.ts`: walking, sprint and
  stamina, jump, gravity; `combat.ts`: attack timing, dodge, block, cooldowns, damage,
  hit arcs; `enemyAi.ts`: idle/patrol/chase/attack state machine; `rewards.ts`; `progression.ts`: levels, XP, derived stats; `inventory.ts`: items, equipment, drops; `quest.ts`: accept, track, turn in;
  `world.ts`: regions, safe zones, spawn placement; `dialogue.ts`: what an NPC says;
  `save.ts`: the save format and its validation). No Babylon
  or React imports; covered by Vitest.
- `packages/game-data`: enemy, item and quest definitions; the world layout (`WORLD`:
  village, spawn zones, roads, map markers); and NPC definitions with their dialogue.
  The 3D scene and the 2D map are both drawn from this one layout.
- `apps/web/game/`: the 3D runtime. Imports Babylon and `game-core`, never React.
  - `engine/createGame.ts`: engine and scene lifecycle, frame loop, dispose.
  - `world/createEnvironment.ts`: ground, lights, player-following shadows, and fog and
    ambient light blended between village and forest.
  - `world/WorldKit.ts`: places static props as frozen instances of shared templates.
  - `assets/AssetLibrary.ts`: loads GLB/glTF models from the asset manifest and places
    instances with LOD and collision proxies. See `ASSET_PIPELINE.md`.
  - `rendering/createRenderPipeline.ts`: HDR, tone mapping, bloom, anti-aliasing.
  - `world/groundDetail.ts`, `world/buildGrass.ts`: procedural stand-ins for ground
    textures and foliage, to be replaced by sourced art.
  - `world/buildVillage.ts`, `world/buildForest.ts`: the scenery itself.
  - `npcs/NpcManager.ts`: villager figures, quest markers, who is in talking range.
  - `audio/AmbientAudio.ts`: procedural wind and forest ambience (Web Audio, no files).
  - `save/SaveStorage.ts`: guarded access to the browser's localStorage.
  - `input/InputManager.ts`: keyboard and mouse to per-frame intent.
  - `player/PlayerController.ts`: applies movement rules to the mesh, resolves collisions.
  - `camera/ThirdPersonCamera.ts`: orbit camera following the player.
  - `combat/TrainingDummy.ts`: stationary practice target with a telegraphed attack.
  - `enemies/Enemy.ts`: interface every strikeable target implements.
  - `enemies/WolfEnemy.ts`: placeholder wolf driven by the game-core AI.
  - `items/PickupManager.ts`: collectable items lying in the world.
  - `state/GameStore.ts`: snapshot store the HUD subscribes to.
- `apps/web/components/game/`: React canvas host, HUD, inventory panel, dialogue panel
  and world map. Reads `GameStore` and calls `GameActions`; contains no game rules.

Saving: progress is stored in the browser's localStorage under one versioned key.
It is written every few seconds when something changed, when the page is hidden or
closed, and on demand. Only durable state is saved (level, XP, gold, health,
inventory, equipment, quest, collected world pickups), never position, stamina,
cooldowns or enemies. A save is the player's to edit, so `parseSave` treats it as
untrusted: unknown items, impossible numbers, or a quest state that does not match
its kill count all cause the save to be rejected and a new game to start. This is
local single-player persistence only; the server-authoritative rules in `CLAUDE.md`
still apply once accounts and Supabase exist.

Rendering budget: the world is about 1,200 props drawn as instances of roughly 50
templates. Only four dynamic lights exist (StandardMaterial's per-mesh limit); lanterns
and windows are self-lit materials. The shadow map covers a fixed area around the
player and only draws scenery near it. Stationary enemies skip collision checks.
Shadows use two cascades; a third cost about 4 ms per frame. Grass is drawn as one
thin-instanced mesh per 22 m patch, culled by view and by distance. Measured at
1280x720 on a GeForce MX350 with the GPU included: 9-16 ms per frame. The shadow pass
is bound by draw calls, so distant characters, tiny parts and far-off small props do not
cast shadows; see `ASSET_PIPELINE.md`.

## Services
- `services/game-server`: Node.js + Colyseus authoritative battle rooms.
- Supabase: authentication and PostgreSQL persistence.

## Shared packages
- `packages/game-core`: pure TypeScript game calculations and rules.
- `packages/game-types`: shared domain types.
- `packages/game-data`: static definitions for classes, skills, monsters, items, locations.
- Add more packages only when a real boundary is needed.

## Authority and trust
The server owns combat state, damage, enemy AI, cooldown validation, random outcomes,
XP, currency, inventory grants, and battle completion. Clients render state and send intents.
Never accept client-supplied reward or damage totals.

## Persistence
Persist account and character state, inventory/equipment, quest progress, and completed
battle outcomes. Do not persist every simulation tick. Use transactions and idempotency
for reward commits.

## Secrets
Public client configuration may include Supabase URL and anon key. Service-role keys,
database passwords, and server secrets belong only in server-side environment variables.
