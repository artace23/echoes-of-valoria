# Development Roadmap

## Current priority: web first
Development focuses exclusively on the web client until a playable web prototype exists.
The Expo app (the mobile part of Milestone 1, and Milestone 7) is postponed. Shared
packages stay platform-independent so mobile can be added later without rework.

Status: Milestone 1 is done for web (workspace, Turborepo, TypeScript, Next.js +
Tailwind app, shared package skeletons, scripts, environment example).

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
