// Static game definitions. Data only: rules live in @valoria/game-core.

import type {
  CharacterClassDefinition,
  EnemyDefinition,
  ItemDefinition,
  ItemId,
  LocationDefinition,
  MapMarker,
  NpcDefinition,
  QuestDefinition,
  RoadSegment,
  SpawnZone,
  WorldPoint,
  WorldRegion,
} from "@valoria/game-types";

export const CHARACTER_CLASSES: readonly CharacterClassDefinition[] = [
  {
    id: "warrior",
    name: "Warrior",
    description:
      "A frontline fighter who endures punishment and answers with steel.",
  },
];

export const LOCATIONS: readonly LocationDefinition[] = [
  {
    id: "ashen-village",
    name: "Ashen Village",
    kind: "settlement",
    description:
      "A soot-stained hamlet clinging to the edge of the old kingdom.",
    requiredLevel: 1,
  },
  {
    id: "whispering-forest",
    name: "Whispering Forest",
    kind: "wilderness",
    description: "Ancient woods where something moves between the trees.",
    // Provisional tuning value; revisit when progression rules are designed.
    requiredLevel: 2,
  },
];

// Provisional tuning values for the prototype.
export const CORRUPTED_WOLF: EnemyDefinition = {
  id: "corrupted-wolf",
  name: "Corrupted Wolf",
  healthMax: 45,
  defense: 0,
  attackDamage: 9,
  reward: { xp: 20, goldMin: 4, goldMax: 9 },
  drops: [{ itemId: "health-potion", chance: 0.5 }],
};

export const ITEMS: Readonly<Record<ItemId, ItemDefinition>> = {
  "health-potion": {
    id: "health-potion",
    name: "Health Potion",
    description: "Restores 40 health.",
    kind: "consumable",
    stackable: true,
    healAmount: 40,
  },
  "rusty-sword": {
    id: "rusty-sword",
    name: "Rusty Sword",
    description: "A pitted blade that has seen better days.",
    kind: "weapon",
    stackable: false,
    attackPower: 2,
  },
  "iron-sword": {
    id: "iron-sword",
    name: "Iron Sword",
    description: "A well-balanced soldier's blade.",
    kind: "weapon",
    stackable: false,
    attackPower: 7,
  },
};

export function getItem(id: ItemId): ItemDefinition {
  return ITEMS[id];
}

export const CULL_THE_PACK: QuestDefinition = {
  id: "cull-the-pack",
  name: "Cull the Pack",
  description: "Corrupted wolves prowl the Whispering Forest. Thin their numbers.",
  objective: { kind: "defeat", enemyId: "corrupted-wolf", count: 3 },
  reward: { xp: 80, gold: 40 },
};

// ---------------------------------------------------------------------------
// World layout. +Z is north, +X is east; distances are in metres.
// ---------------------------------------------------------------------------

const VILLAGE_CENTER: WorldPoint = { x: 0, z: -50 };

export const ASHEN_VILLAGE: WorldRegion = {
  id: "ashen-village",
  name: "Ashen Village",
  kind: "village",
  center: VILLAGE_CENTER,
  radius: 28,
  safe: true,
};

export const SPAWN_ZONES: readonly SpawnZone[] = [
  {
    id: "wolf-den",
    name: "Old Shrine",
    kind: "spawn-zone",
    center: { x: 0, z: 34 },
    radius: 11,
    safe: false,
    enemyId: "corrupted-wolf",
    enemyCount: 3,
  },
  {
    id: "thornwood-hollow",
    name: "Thornwood Hollow",
    kind: "spawn-zone",
    center: { x: -40, z: 52 },
    radius: 9,
    safe: false,
    enemyId: "corrupted-wolf",
    enemyCount: 2,
  },
  {
    id: "ashfall-glade",
    name: "Ashfall Glade",
    kind: "spawn-zone",
    center: { x: 42, z: 60 },
    radius: 9,
    safe: false,
    enemyId: "corrupted-wolf",
    enemyCount: 2,
  },
];

export const WORLD = {
  /** The playable area is a square from -halfExtent to +halfExtent. */
  halfExtent: 90,
  /** Where the player starts and respawns: the village square. */
  spawnPoint: { x: 0, z: -44 } as WorldPoint,
  village: ASHEN_VILLAGE,
  /** Radius of the palisade wall around the village. */
  villageWallRadius: 26,
  /** The opening in the palisade, facing the forest. */
  northGate: { x: 0, z: -24 } as WorldPoint,
  spawnZones: SPAWN_ZONES,
  /** Every named region, for location lookups. */
  regions: [ASHEN_VILLAGE, ...SPAWN_ZONES] as readonly WorldRegion[],
  /** Name shown when the player is in no named region. */
  wildernessName: "Whispering Forest",
  roads: [
    // Forest road: village square, through the north gate, to the Old Shrine.
    { from: { x: 0, z: -66 }, to: { x: 0, z: 23 }, width: 4 },
    // Village cross street.
    { from: { x: -18, z: -50 }, to: { x: 15, z: -50 }, width: 3.4 },
    // Trails from the shrine to the outlying wolf grounds.
    { from: { x: -9, z: 39 }, to: { x: -33, z: 49 }, width: 2 },
    { from: { x: 9, z: 40 }, to: { x: 35, z: 56 }, width: 2 },
  ] as readonly RoadSegment[],
  markers: [
    { id: "ashen-village", label: "Ashen Village", kind: "settlement", position: VILLAGE_CENTER },
    { id: "north-gate", label: "North Gate", kind: "gate", position: { x: 0, z: -24 } },
    { id: "wolf-den", label: "Old Shrine", kind: "danger", position: { x: 0, z: 34 } },
    { id: "thornwood-hollow", label: "Thornwood Hollow", kind: "danger", position: { x: -40, z: 52 } },
    { id: "ashfall-glade", label: "Ashfall Glade", kind: "danger", position: { x: 42, z: 60 } },
    { id: "abandoned-cart", label: "Abandoned Cart", kind: "landmark", position: { x: 3, z: -6 } },
  ] as readonly MapMarker[],
} as const;

export const NPCS: readonly NpcDefinition[] = [
  {
    id: "elder-maren",
    name: "Elder Maren",
    title: "Village Elder",
    position: { x: 0, z: -62 },
    facing: 0,
    robeColor: [0.36, 0.2, 0.36],
    greeting: ["The ash settles a little more each year. Still, we endure."],
    quest: {
      questId: "cull-the-pack",
      offer: [
        "You carry a blade. Good. We have need of one.",
        "Wolves have come down out of the Whispering Forest, and they are not as wolves should be. Their eyes burn.",
        "Follow the road through the north gate and cut down three of them. The village will pay what it can.",
      ],
      active: [
        "The corrupted wolves gather at the Old Shrine, north along the road. Three of them, no fewer.",
        "Raise your guard when their eyes flare. That is when they bite.",
      ],
      ready: [
        "Three of them dead? Then the road is a little safer tonight.",
        "Take this, with the thanks of Ashen Village.",
      ],
      completed: [
        "You have done us a kindness, Warrior. The forest is quieter for it.",
      ],
    },
  },
  {
    id: "smith-brannoc",
    name: "Brannoc",
    title: "Blacksmith",
    position: { x: 9, z: -58.5 },
    facing: -Math.PI / 2,
    robeColor: [0.3, 0.22, 0.16],
    greeting: [
      "That rusty thing on your hip will not hold an edge for long.",
      "A trader's cart was abandoned on the forest road, a little way past the gate. There was good iron in it, if the wolves left it be.",
    ],
  },
  {
    id: "guard-tolan",
    name: "Tolan",
    title: "Gate Guard",
    position: { x: 3.2, z: -27 },
    facing: Math.PI,
    robeColor: [0.24, 0.27, 0.32],
    greeting: [
      "Past this gate the village cannot protect you. Inside the walls, nothing will follow you.",
      "If a fight turns against you, run for the gate. You will mend in time once you are behind it.",
    ],
  },
  {
    id: "herbalist-ysolde",
    name: "Ysolde",
    title: "Herbalist",
    position: { x: -16.5, z: -50 },
    facing: Math.PI / 2,
    robeColor: [0.2, 0.32, 0.24],
    greeting: [
      "Red draughts for torn flesh. I leave one out by the hut for travellers.",
      "The wolves sometimes carry what they have taken from the dead. Look where they fall.",
    ],
  },
];
