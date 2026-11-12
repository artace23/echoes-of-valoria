"use client";

import type { Inventory } from "@valoria/game-core";
import { getItem } from "@valoria/game-data";
import type { ItemId } from "@valoria/game-types";
import type { GameActions } from "@/game/engine/createGame";

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 border border-gold-muted/60 px-2.5 py-1 text-[11px] uppercase tracking-wider text-gold transition-colors hover:bg-gold hover:text-void focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
    >
      {children}
    </button>
  );
}

/** What an item does, in a few words. */
function effect(itemId: ItemId): string {
  const item = getItem(itemId);
  return item.kind === "weapon"
    ? `+${item.attackPower} attack`
    : `+${item.healAmount} health`;
}

export function InventoryPanel({
  inventory,
  weaponId,
  actions,
  onClose,
}: {
  inventory: Inventory;
  weaponId: ItemId | null;
  actions: GameActions;
  onClose: () => void;
}) {
  const weapon = weaponId ? getItem(weaponId) : null;

  return (
    <section
      aria-label="Inventory"
      className="pointer-events-auto absolute right-4 top-16 flex max-h-[calc(100%-9rem)] w-72 max-w-[calc(100%-2rem)] flex-col border border-gold-muted/50 bg-surface/95"
    >
      <header className="flex items-center justify-between border-b border-gold-muted/30 px-3 py-2">
        <h2 className="font-display text-sm tracking-[0.2em] text-gold">
          Inventory
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inventory"
          className="px-1 text-lg leading-none text-ink-muted hover:text-gold"
        >
          ×
        </button>
      </header>

      <div className="space-y-4 overflow-y-auto p-3">
        <div>
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-ink-muted">
            Equipped weapon
          </h3>
          <div className="mt-1.5 flex items-center justify-between gap-3 border border-gold-muted/40 bg-raised/60 px-2.5 py-2">
            {weapon ? (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{weapon.name}</p>
                  <p className="text-xs text-gold">{effect(weapon.id)}</p>
                </div>
                <ActionButton onClick={actions.unequipWeapon}>
                  Unequip
                </ActionButton>
              </>
            ) : (
              <p className="text-sm text-ink-muted">Unarmed</p>
            )}
          </div>
        </div>

        <div>
          <h3 className="flex justify-between text-[11px] uppercase tracking-[0.2em] text-ink-muted">
            <span>Items</span>
            <span className="tabular-nums">
              {inventory.stacks.length} / {inventory.capacity} slots
            </span>
          </h3>
          {inventory.stacks.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink-muted">
              Nothing carried. Walk over glowing items to pick them up.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {inventory.stacks.map((stack, index) => {
                const item = getItem(stack.itemId);
                return (
                  <li
                    key={`${stack.itemId}-${index}`}
                    className="flex items-center justify-between gap-3 border border-gold-muted/25 bg-raised/40 px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">
                        {item.name}
                        {stack.quantity > 1 && (
                          <span className="ml-1.5 tabular-nums text-ink-muted">
                            ×{stack.quantity}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gold">{effect(item.id)}</p>
                      <p className="text-xs text-ink-muted">
                        {item.description}
                      </p>
                    </div>
                    {item.kind === "weapon" ? (
                      <ActionButton onClick={() => actions.equipItem(item.id)}>
                        Equip
                      </ActionButton>
                    ) : (
                      <ActionButton onClick={() => actions.useItem(item.id)}>
                        Use
                      </ActionButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
