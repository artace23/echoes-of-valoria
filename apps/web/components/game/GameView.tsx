"use client";

import { useEffect, useRef, useState } from "react";
import type { GameHandle } from "@/game/engine/createGame";
import { GameHud } from "./GameHud";

/** Mounts the 3D game on a canvas and overlays the HUD. */
export function GameView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<GameHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let handle: GameHandle | null = null;

    // Loaded on demand so the 3D engine stays out of the server render
    // and out of every other page's bundle.
    import("@/game/engine/createGame")
      .then(({ createGame }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        handle = createGame(canvas);
        setGame(handle);
      })
      .catch((cause: unknown) => {
        console.error(cause);
        if (!cancelled) {
          setError(
            "The game could not start. Your browser may not support WebGL.",
          );
        }
      });

    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Echoes of Valoria game view"
        className="block h-full w-full touch-none outline-none"
      />
      {game && <GameHud store={game.store} />}
      {!game && !error && (
        <p className="absolute inset-0 flex items-center justify-center font-display tracking-[0.3em] text-gold-muted">
          Loading…
        </p>
      )}
      {error && (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-blood">
          {error}
        </p>
      )}
    </div>
  );
}
