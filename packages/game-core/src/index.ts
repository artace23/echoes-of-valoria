// Pure game rules. Must not import React, Next.js, Expo, PixiJS, Supabase, or Colyseus.

import type { LocationDefinition } from "@valoria/game-types";

/** Whether a character of the given level may enter the location. */
export function isLocationUnlocked(
  location: Pick<LocationDefinition, "requiredLevel">,
  characterLevel: number,
): boolean {
  return characterLevel >= location.requiredLevel;
}
