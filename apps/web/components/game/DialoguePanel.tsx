"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameActions } from "@/game/engine/createGame";
import type { DialogueSnapshot } from "@/game/state/GameStore";

const buttonClass =
  "border px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold";

/**
 * A conversation with a villager. Lines are paged one at a time; after the
 * last, the player can take the action on offer (accept a quest, claim a
 * reward) or leave. T, Enter or Space advance; Esc leaves.
 *
 * Mount with a `key` that changes when the conversation does, so paging
 * restarts from the first line.
 */
export function DialoguePanel({
  dialogue,
  actions,
}: {
  dialogue: DialogueSnapshot;
  actions: GameActions;
}) {
  const [index, setIndex] = useState(0);
  const last = index >= dialogue.lines.length - 1;

  const advance = useCallback(() => {
    if (!last) setIndex((current) => current + 1);
    else if (dialogue.actionLabel) actions.dialogueAction();
    else actions.closeDialogue();
  }, [last, dialogue.actionLabel, actions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (
        event.code === "KeyT" ||
        event.code === "Enter" ||
        event.code === "Space"
      ) {
        event.preventDefault();
        advance();
      } else if (event.code === "Escape") {
        actions.closeDialogue();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advance, actions]);

  return (
    <section
      aria-label={`Conversation with ${dialogue.npcName}`}
      className="pointer-events-auto absolute bottom-36 left-1/2 z-10 w-[min(38rem,calc(100%-2rem))] -translate-x-1/2 border border-gold-muted/60 bg-surface/95 p-4"
    >
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-base tracking-wide text-gold">
          {dialogue.npcName}
        </h2>
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink-muted">
          {dialogue.npcTitle}
        </p>
      </header>

      <p aria-live="polite" className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-ink">
        {dialogue.lines[index]}
      </p>

      <footer className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] tabular-nums text-ink-muted">
          {index + 1} / {dialogue.lines.length}
        </p>
        <div className="flex gap-2">
          {last && dialogue.actionLabel ? (
            <>
              <button
                type="button"
                onClick={actions.closeDialogue}
                className={`${buttonClass} border-gold-muted/40 text-ink-muted hover:text-ink`}
              >
                Not now
              </button>
              <button
                type="button"
                onClick={actions.dialogueAction}
                className={`${buttonClass} border-gold bg-gold text-void hover:bg-gold-muted`}
              >
                {dialogue.actionLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={advance}
              className={`${buttonClass} border-gold-muted/60 text-gold hover:bg-gold hover:text-void`}
            >
              {last ? "Farewell" : "Next"}
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
