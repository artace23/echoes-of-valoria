"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_COMBAT_CONFIG } from "@valoria/game-core";
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

/** One action slot: key, name, and a cooldown shade that drains as it recovers. */
function Skill({
  hotkey,
  name,
  remaining,
  total,
  active = false,
}: {
  hotkey: string;
  name: string;
  remaining: number;
  total: number;
  active?: boolean;
}) {
  const cooling = remaining > 0;
  const shade = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
  return (
    <li
      className={`relative flex h-14 w-16 flex-col items-center justify-center overflow-hidden border bg-surface/85 ${
        active ? "border-gold" : "border-gold-muted/50"
      }`}
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-void/85"
        style={{ height: `${shade}%` }}
      />
      <span
        className={`relative font-display text-base ${
          cooling ? "text-ink-muted" : "text-gold"
        }`}
      >
        {cooling ? remaining.toFixed(1) : hotkey}
      </span>
      <span className="relative text-[10px] uppercase tracking-wider text-ink-muted">
        {name}
      </span>
    </li>
  );
}

const CONTROLS: [string, string][] = [
  ["WASD", "Move"],
  ["Drag / Arrows", "Look"],
  ["Shift", "Sprint"],
  ["Space", "Jump"],
  ["Scroll", "Zoom"],
];

export function GameHud({ store }: { store: GameStore }) {
  const hud = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const combat = DEFAULT_COMBAT_CONFIG;

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

      <div className="absolute left-1/2 top-4 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-2">
        <p className="border border-gold-muted/30 bg-surface/70 px-4 py-1.5 text-center text-xs tracking-wide text-ink-muted">
          {hud.pointerLocked
            ? "Move mouse to look around | WASD to move | Esc to release"
            : "Drag to look around | WASD to move"}
        </p>
        {hud.targetName && (
          <div className="w-64 border border-blood/50 bg-surface/80 p-2">
            <Bar
              label={hud.targetName}
              value={hud.targetHealth}
              max={hud.targetHealthMax}
              fillClass="bg-blood"
            />
          </div>
        )}
      </div>

      {hud.dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-void/60">
          <p className="font-display text-3xl tracking-[0.3em] text-blood">
            You have fallen
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Returning to the starting circle in {hud.respawnIn}…
          </p>
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-2">
        <ul className="flex gap-2">
          <Skill
            hotkey="F"
            name="Attack"
            remaining={hud.cooldownLight}
            total={combat.light.cooldown}
          />
          <Skill
            hotkey="R"
            name="Heavy"
            remaining={hud.cooldownHeavy}
            total={combat.heavy.cooldown}
          />
          <Skill
            hotkey="E"
            name="Dodge"
            remaining={hud.cooldownDodge}
            total={combat.dodge.cooldown}
          />
          <Skill
            hotkey="Q"
            name="Block"
            remaining={0}
            total={0}
            active={hud.blocking}
          />
        </ul>
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 border border-gold-muted/30 bg-surface/70 px-4 py-2 text-xs text-ink-muted">
          {CONTROLS.map(([key, action]) => (
            <li key={key}>
              <span className="text-gold">{key}</span> {action}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
