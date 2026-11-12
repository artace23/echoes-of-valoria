// Dialogue rules: what an NPC says, and what the player can do in reply,
// given the state of the quest that NPC is involved in.

import type { NpcDefinition } from "@valoria/game-types";
import type { QuestProgress } from "./quest";

export type DialogueActionKind = "accept-quest" | "turn-in-quest";

export interface DialogueAction {
  kind: DialogueActionKind;
  label: string;
}

export interface DialogueView {
  /** Lines the NPC speaks, in order. Always at least one. */
  lines: readonly string[];
  /** Offered after the last line, if the conversation can change anything. */
  action: DialogueAction | null;
}

/**
 * The conversation an NPC offers right now. An NPC with a quest speaks about
 * it according to the quest's status; otherwise, or if the given progress is
 * for a different quest, they give their greeting.
 */
export function getNpcDialogue(
  npc: NpcDefinition,
  quest: QuestProgress | null,
): DialogueView {
  const lines = (candidate: readonly string[]): readonly string[] =>
    candidate.length > 0 ? candidate : ["…"];

  const offer = npc.quest;
  if (!offer || !quest || quest.questId !== offer.questId) {
    return { lines: lines(npc.greeting), action: null };
  }

  switch (quest.status) {
    case "available":
      return {
        lines: lines(offer.offer),
        action: { kind: "accept-quest", label: "Accept quest" },
      };
    case "active":
      return { lines: lines(offer.active), action: null };
    case "ready":
      return {
        lines: lines(offer.ready),
        action: { kind: "turn-in-quest", label: "Claim reward" },
      };
    case "completed":
      return { lines: lines(offer.completed), action: null };
  }
}
