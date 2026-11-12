"use client";

import { useSyncExternalStore } from "react";
import type { GameStore } from "@/game/state/GameStore";

function Bar({
  label,
  value,
  max,
  fillClass,
}: {
  label: string;
  value: number;
  max: number;
  fillClass: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.2em] text-ink-muted">
        <span>{label}</span>
        <span className="tabular-nums text-ink">
          {value} / {max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="mt-1 h-2.5 border border-gold-muted/50 bg-void/80"
      >
        <div className={`h-full ${fillClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const CONTROLS: [string, string][] = [
  ["WASD", "Move"],
  ["Mouse", "Look"],
  ["Shift", "Sprint"],
  ["Space", "Jump"],
  ["Wheel", "Zoom"],
  ["Esc", "Release mouse"],
];

export function GameHud({ store }: { store: GameStore }) {
  const hud = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute left-4 top-4 w-56 space-y-3 border border-gold-muted/40 bg-surface/80 p-3 sm:w-64">
        <p className="font-display text-sm tracking-wide text-gold">Warrior</p>
        <Bar
          label="Health"
          value={hud.health}
          max={hud.healthMax}
          fillClass="bg-blood"
        />
        <Bar
          label="Stamina"
          value={hud.stamina}
          max={hud.staminaMax}
          fillClass={hud.sprinting ? "bg-gold" : "bg-gold-muted"}
        />
      </div>

      {!hud.pointerLocked && (
        <p className="absolute left-1/2 top-1/3 -translate-x-1/2 border border-gold-muted/40 bg-surface/85 px-5 py-3 text-center font-display text-sm tracking-[0.2em] text-gold">
          Click to take control
        </p>
      )}

      <ul className="absolute bottom-4 left-1/2 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap justify-center gap-x-5 gap-y-1 border border-gold-muted/30 bg-surface/70 px-4 py-2 text-xs text-ink-muted">
        {CONTROLS.map(([key, action]) => (
          <li key={key}>
            <span className="text-gold">{key}</span> {action}
          </li>
        ))}
      </ul>
    </div>
  );
}
