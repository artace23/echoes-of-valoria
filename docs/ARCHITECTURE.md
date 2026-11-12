# Architecture

## Applications
- `apps/web`: Next.js browser client; React UI and PixiJS combat rendering.
- `apps/mobile`: Expo / React Native client; shared game logic and mobile-native UI.
  Evaluate Skia for specific rendering needs after a prototype.

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
