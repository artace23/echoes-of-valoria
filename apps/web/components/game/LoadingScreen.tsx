import type { LoadProgress } from "@/game/engine/createGame";

const CONTROLS: [string, string][] = [
  ["WASD", "Move"],
  ["Drag or arrow keys", "Look around"],
  ["Shift", "Sprint"],
  ["Space", "Jump"],
  ["F / R", "Attack / heavy attack"],
  ["Q / E", "Block / dodge"],
  ["T", "Talk"],
  ["I / M", "Inventory / map"],
];

/**
 * Shown over the game canvas while the 3D models download and the world is
 * built. The first visit downloads about 30 MB, so it shows real progress
 * and uses the wait to teach the controls.
 */
export function LoadingScreen({ progress }: { progress: LoadProgress }) {
  const percent = Math.round(Math.max(0, Math.min(1, progress.fraction)) * 100);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-void px-6">
      <h1 className="text-center font-display text-3xl tracking-wide text-gold sm:text-5xl">
        Echoes of Valoria
      </h1>

      <div className="mt-10 w-full max-w-md">
        <div className="flex items-baseline justify-between text-xs uppercase tracking-[0.2em] text-ink-muted">
          <span aria-live="polite">{progress.label}</span>
          <span className="tabular-nums text-ink">{percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Loading the game"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-2 h-2 border border-gold-muted/50 bg-surface"
        >
          <div
            className="h-full bg-gold transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <dl className="mt-10 grid w-full max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        {CONTROLS.map(([keys, action]) => (
          <div key={keys} className="contents">
            <dt className="text-gold">{keys}</dt>
            <dd className="text-ink-muted">{action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
