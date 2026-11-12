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
  hit arcs). No Babylon or React imports; covered by Vitest.
- `apps/web/game/`: the 3D runtime. Imports Babylon and `game-core`, never React.
  - `engine/createGame.ts`: engine and scene lifecycle, frame loop, dispose.
  - `world/createEnvironment.ts`: ground, scenery, lights, shadows, fog.
  - `input/InputManager.ts`: keyboard and mouse to per-frame intent.
  - `player/PlayerController.ts`: applies movement rules to the mesh, resolves collisions.
  - `camera/ThirdPersonCamera.ts`: orbit camera following the player.
  - `combat/TrainingDummy.ts`: stationary practice target with a telegraphed attack.
  - `state/GameStore.ts`: snapshot store the HUD subscribes to.
- `apps/web/components/game/`: React canvas host and HUD. Reads `GameStore`; contains no
  game rules.

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
