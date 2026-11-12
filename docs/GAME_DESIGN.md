# Echoes of Valoria — Game Design

## High concept
A persistent online dark-fantasy RPG with illustrated locations, character progression,
equipment, quests, and instanced real-time cooldown-based combat.

## Player experience
Players create a character, explore a location through interactive menus, accept quests,
encounter enemies, fight in a dedicated battle scene, and earn progression rewards.

## Initial playable slice
- Starting location: Ashen Village.
- First unlockable combat location: Whispering Forest.
- First playable class: Warrior.
- First enemy: one forest creature selected during implementation.
- Four actions: basic attack, two skills, and defend or dodge.
- Character profile, HP/mana, inventory, equipment, XP, and gold.
- One battle outcome persisted to the account.

## Combat
- Instanced real-time combat with cooldowns, not physics-based action movement.
- Client sends player intent; server validates and resolves actions.
- Enemy behavior and random outcomes are controlled by the server.
- UI displays combat state, cooldowns, effects, and combat log feedback.

## Visual direction
- Dark fantasy illustrated 2D presentation.
- Near-black/charcoal surfaces, antique gold highlights, restrained crimson danger states.
- Detailed original character and monster artwork.
- Atmospheric painted environments.
- Clear typography and readable controls at desktop and mobile sizes.

## Explicitly out of scope for the first slice
- Open-world 3D movement.
- Real-time PvP.
- Guild wars, player trading, auction house.
- Crafting, housing, mounts, multiple continents.
- Large-scale MMO concurrency guarantees.
