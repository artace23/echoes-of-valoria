// Static game definitions. Data only: rules live in @valoria/game-core.

import type {
  CharacterClassDefinition,
  EnemyDefinition,
  LocationDefinition,
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
};
