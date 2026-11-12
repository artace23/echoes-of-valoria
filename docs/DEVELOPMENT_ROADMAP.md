# Development Roadmap

## Current priority: web first
Development focuses exclusively on the web client until a playable web prototype exists.
The Expo app (the mobile part of Milestone 1, and Milestone 7) is postponed. Shared
packages stay platform-independent so mobile can be added later without rework.

Status: Milestone 1 is done for web (workspace, Turborepo, TypeScript, Next.js +
Tailwind app, shared package skeletons, scripts, environment example).

## Direction change: 3D prototype (supersedes the 2D plan below)
The game is now a browser-based third-person 3D RPG built on Babylon.js with primitive
placeholder models. Multiplayer, Supabase and custom artwork are out of scope for the
prototype; progress is saved locally. Milestones 2–5 below describe the earlier
2D/PixiJS plan and are kept only for reference.

3D prototype milestones:
1. **Done** — 3D scene, player controller, third-person camera, movement, collision.
2. **Done** — Combat: sword attack, heavy attack, dodge, block, cooldowns, damage,
   death/respawn. Practised against a stationary training construct until the wolf exists.
3. **Done** — Enemy: placeholder wolf with idle, patrol, chase and attack states, and
   XP/gold reward drops. Three wolves live in the encounter clearing.
4. **Done** — Progression: level, XP, gold, and stats derived from level (health, stamina,
   attack power, defense). Levelling up restores the Warrior.
5. **Done** — Inventory and equipment: world pickups and wolf drops, a 12-slot
   inventory, health potions, and an equippable weapon that changes attack power.
6. **Done** — Quest: "Cull the Pack", defeat three corrupted wolves, tracked in the HUD,
   with XP and gold granted once on completion.
7. **Done** — World and environment: Ashen Village (houses, roads, props, lighting, safe
   zone), a reusable NPC system with dialogue, the quest accepted from and turned in to
   the village elder, an expanded Whispering Forest with three wolf spawn zones, a world
   map with markers, location-based fog and lighting, and procedural ambient sound.
8. **Done** — Local save/load: level, XP, gold, health, inventory, equipment, quest
   progress and collected world pickups persist in the browser, with autosave, a
   validated load, and a New game reset.

All eight prototype milestones are complete.

## Visual quality upgrade
Goal: a detailed, realistic dark-fantasy look in place of the primitive prototype.

Phase 1 (forest), done so far:
- GLB/glTF asset pipeline with a manifest, instancing, LOD, cull distance and collision
  proxies, wired into the forest with placeholder fallbacks. See `ASSET_PIPELINE.md`.
- Cinematic rendering: HDR, ACES tone mapping, bloom, MSAA + FXAA, vignette, and
  two-cascade shadows with a stronger key light.
- Procedural ground detail and grass, kept only as fallbacks when art is missing.

- CC0 art sourced from Poly Haven and ambientCG and wired into the forest: scanned
  rocks, ferns, a stump, logs and branches; scanned ground textures; a photographed
  grass atlas; and conifers built from scanned bark and twig textures.

Still to do for the forest: an HDR sky (and with it physically based materials), a
dead tree, glowing mushrooms, and making the shadow pass cheaper. The village,
characters and wolves are still primitives. See `ASSET_PIPELINE.md`.

## Milestone 0 — Repository inspection and plan
Inspect existing files and tooling. Do not overwrite an existing project blindly.

## Milestone 1 — Foundation
Create or verify pnpm workspace, Turborepo, TypeScript configuration, Next.js app,
Expo app, shared package skeletons, lint/test scripts, and environment example.
Both apps must start.

## Milestone 2 — Visual shell
Implement responsive dark-fantasy navigation, character profile shell, location screen,
inventory shell, and asset manifest. Use clearly labelled placeholders only until approved
art assets are available.

## Milestone 3 — Web combat prototype
Build one PixiJS encounter with one player, one enemy, HP bars, four actions, animation
state handling, and mock battle state. Keep mock mode clearly separated from production server.

## Milestone 4 — Shared combat rules
Implement pure TypeScript combat types, stat derivation, damage, cooldown, and progression
functions with unit tests.

## Milestone 5 — Server-authoritative combat
Add authenticated Colyseus room, message validation, action queue, enemy behavior,
authoritative state updates, and idempotent battle rewards.

## Milestone 6 — Persistence
Integrate Supabase Auth and PostgreSQL migrations, RLS, ownership checks, and transactional
reward persistence.

## Milestone 7 — Mobile adaptation
Build Expo screens and connect shared game services. Decide on Skia only after validating
the mobile rendering requirements.

## Working rule
Complete and verify one milestone before beginning the next. Do not claim a milestone is
complete when required tests or manual checks have not been performed.
