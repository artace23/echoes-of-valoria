"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULT_COMBAT_CONFIG } from "@valoria/game-core";
import { CULL_THE_PACK, NPCS } from "@valoria/game-data";
import type { GameActions } from "@/game/engine/createGame";
import type { GameStore } from "@/game/state/GameStore";
import { DialoguePanel } from "./DialoguePanel";
import { InventoryPanel } from "./InventoryPanel";
import { WorldMap } from "./WorldMap";

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
  ["T", "Talk"],
];

const QUEST_GIVER =
  NPCS.find((npc) => npc.quest?.questId === CULL_THE_PACK.id)?.name ??
  "the village";

const topButtonClass =
  "pointer-events-auto border border-gold-muted/50 bg-surface/80 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-void";

export function GameHud({
  store,
  actions,
}: {
  store: GameStore;
  actions: GameActions;
}) {
  const hud = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const combat = DEFAULT_COMBAT_CONFIG;
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "KeyI") {
        // The panel needs a free cursor, so give the mouse back first.
        if (document.pointerLockElement) document.exitPointerLock();
        setInventoryOpen((open) => !open);
      } else if (event.code === "KeyM") {
        if (document.pointerLockElement) document.exitPointerLock();
        setMapOpen((open) => !open);
      } else if (event.code === "Escape") {
        setInventoryOpen(false);
        setMapOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute left-4 top-4 w-56 space-y-3 border border-gold-muted/40 bg-surface/80 p-3 sm:w-64">
        <p className="flex items-baseline justify-between font-display text-sm tracking-wide text-gold">
          <span>Warrior</span>
          <span>Level {hud.level}</span>
        </p>
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
        {hud.xpToNext > 0 ? (
          <Bar
            label="Experience"
            value={hud.xp}
            max={hud.xpToNext}
            fillClass="bg-ink-muted"
          />
        ) : (
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink-muted">
            Experience <span className="text-gold">Max level</span>
          </p>
        )}
        <dl className="flex justify-between border-t border-gold-muted/25 pt-2 text-[11px] uppercase tracking-[0.15em] text-ink-muted">
          <div className="flex gap-1.5">
            <dt>Atk</dt>
            <dd className="tabular-nums text-ink">+{hud.attackPower}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Def</dt>
            <dd className="tabular-nums text-ink">{hud.defense}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Gold</dt>
            <dd className="tabular-nums text-gold">{hud.gold}</dd>
          </div>
        </dl>
      </div>

      <div className="absolute left-1/2 top-4 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-2">
        <p className="border border-gold-muted/30 bg-surface/70 px-4 py-1.5 text-center text-xs tracking-wide text-ink-muted">
          {hud.pointerLocked
            ? "Move mouse to look around | WASD to move | Esc to release"
            : "Drag to look around | WASD to move"}
        </p>
        <p className="text-center font-display text-sm tracking-[0.2em] text-ink">
          {hud.locationName}
          {hud.inSafeZone && (
            <span className="ml-2 font-sans text-[11px] uppercase tracking-[0.2em] text-gold">
              Safe zone
            </span>
          )}
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
        {hud.notice && (
          <p
            role="status"
            className="border border-gold/60 bg-surface/85 px-4 py-1.5 text-center text-sm text-gold"
          >
            {hud.notice}
          </p>
        )}
      </div>

      <div className="absolute right-4 top-4 flex gap-2">
        <button
          type="button"
          onClick={actions.toggleSound}
          aria-pressed={hud.soundOn}
          className={topButtonClass}
        >
          Sound <span className="text-ink-muted">{hud.soundOn ? "on" : "off"}</span>
        </button>
        <button
          type="button"
          onClick={() => setMapOpen((open) => !open)}
          aria-expanded={mapOpen}
          className={topButtonClass}
        >
          Map <span className="text-ink-muted">(M)</span>
        </button>
        <button
          type="button"
          onClick={() => setInventoryOpen((open) => !open)}
          aria-expanded={inventoryOpen}
          className={topButtonClass}
        >
          Inventory <span className="text-ink-muted">(I)</span>
        </button>
      </div>
      {!inventoryOpen && (
        <section
          aria-label="Quest"
          className="absolute right-4 top-16 w-64 max-w-[calc(100%-2rem)] border border-gold-muted/40 bg-surface/80 p-3"
        >
          <p className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.2em] text-ink-muted">
            <span>Quest</span>
            {hud.questStatus === "completed" && (
              <span className="text-gold">Completed</span>
            )}
            {hud.questStatus === "available" && (
              <span className="text-gold">Available</span>
            )}
          </p>
          <h2 className="mt-1 font-display text-sm tracking-wide text-gold">
            {CULL_THE_PACK.name}
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            {CULL_THE_PACK.description}
          </p>
          {hud.questStatus === "available" ? (
            <p className="mt-2 text-xs text-ink">
              Speak with {QUEST_GIVER} in Ashen Village.
            </p>
          ) : (
            <div className="mt-2">
              <Bar
                label="Wolves defeated"
                value={hud.questCount}
                max={CULL_THE_PACK.objective.count}
                fillClass="bg-gold"
              />
            </div>
          )}
          {hud.questStatus === "ready" && (
            <p className="mt-2 text-xs text-gold">
              Return to {QUEST_GIVER} to claim your reward.
            </p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            {hud.questStatus === "completed" ? "Reward received" : "Reward"}:{" "}
            <span className="text-ink">{CULL_THE_PACK.reward.xp} XP</span>,{" "}
            <span className="text-gold">{CULL_THE_PACK.reward.gold} gold</span>
          </p>
        </section>
      )}
      {inventoryOpen && (
        <InventoryPanel
          inventory={hud.inventory}
          weaponId={hud.weaponId}
          actions={actions}
          onClose={() => setInventoryOpen(false)}
        />
      )}

      <div className="pointer-events-auto absolute bottom-4 right-4 w-56 border border-gold-muted/40 bg-surface/85 p-2.5 text-xs">
        {confirmingReset ? (
          <>
            <p className="text-ink">
              Start a new game? This erases your saved progress.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={actions.resetProgress}
                className="flex-1 border border-blood bg-blood/80 px-2 py-1 uppercase tracking-wider text-ink hover:bg-blood"
              >
                Erase
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="flex-1 border border-gold-muted/50 px-2 py-1 uppercase tracking-wider text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-ink-muted">
              {!hud.saveAvailable
                ? "Saving is unavailable in this browser."
                : hud.savedAt
                  ? `Progress saved at ${hud.savedAt}`
                  : "Progress saves automatically."}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={actions.saveGame}
                className="flex-1 border border-gold-muted/50 px-2 py-1 uppercase tracking-wider text-gold hover:bg-gold hover:text-void"
              >
                Save now
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                className="flex-1 border border-gold-muted/50 px-2 py-1 uppercase tracking-wider text-ink-muted hover:text-ink"
              >
                New game
              </button>
            </div>
          </>
        )}
      </div>

      {mapOpen && (
        <WorldMap
          playerX={hud.playerX}
          playerZ={hud.playerZ}
          playerHeading={hud.playerHeading}
          locationName={hud.locationName}
          onClose={() => setMapOpen(false)}
        />
      )}

      {hud.dialogue && (
        <DialoguePanel
          key={`${hud.dialogue.npcName}:${hud.dialogue.lines[0]}`}
          dialogue={hud.dialogue}
          actions={actions}
        />
      )}

      {hud.dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-void/60">
          <p className="font-display text-3xl tracking-[0.3em] text-blood">
            You have fallen
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Returning to Ashen Village in {hud.respawnIn}…
          </p>
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-2">
        {hud.interactPrompt && (
          <p className="border border-gold/60 bg-surface/90 px-4 py-1.5 text-sm text-ink">
            <span className="mr-2 font-display text-gold">T</span>
            {hud.interactPrompt}
          </p>
        )}
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
          <Skill
            hotkey="H"
            name={`Potion ${hud.potionCount}`}
            remaining={0}
            total={0}
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
