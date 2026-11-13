"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

/** Must match the key in `game/save/SaveStorage.ts`. */
const SAVE_KEY = "echoes-of-valoria:save:v1";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function hasSave(): boolean {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    // Storage blocked: treat as a first visit.
    return false;
  }
}

/**
 * The call to action on the landing page. Returning players, who have a
 * save in this browser, are invited to continue rather than begin.
 */
export function PlayLink() {
  // The server cannot see browser storage, so it renders the first-visit
  // label and the browser corrects it after loading.
  const returning = useSyncExternalStore(subscribe, hasSave, () => false);

  return (
    <Link
      href="/play"
      className="inline-block border border-gold bg-gold px-10 py-3.5 font-display text-sm uppercase tracking-[0.3em] text-void transition-colors hover:bg-transparent hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
    >
      {returning ? "Continue your journey" : "Enter Valoria"}
    </Link>
  );
}
