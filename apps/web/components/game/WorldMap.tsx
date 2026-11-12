"use client";

import { WORLD } from "@valoria/game-data";
import type { MapMarkerKind } from "@valoria/game-types";

const HALF = WORLD.halfExtent;

/** Marker colours, by kind. Matched in the legend below. */
const MARKER_STYLE: Record<MapMarkerKind, { fill: string; label: string }> = {
  settlement: { fill: "var(--color-gold)", label: "Settlement" },
  gate: { fill: "var(--color-ink)", label: "Gate" },
  danger: { fill: "var(--color-blood)", label: "Wolf territory" },
  landmark: { fill: "var(--color-ink-muted)", label: "Landmark" },
};

/**
 * Schematic map of the world, drawn from the same layout data the 3D scene
 * is built from. North is up; the gold arrow is the player.
 */
export function WorldMap({
  playerX,
  playerZ,
  playerHeading,
  locationName,
  onClose,
}: {
  playerX: number;
  playerZ: number;
  /** Radians, 0 = north, positive toward east. */
  playerHeading: number;
  locationName: string;
  onClose: () => void;
}) {
  const kinds = Array.from(new Set(WORLD.markers.map((marker) => marker.kind)));

  return (
    <section
      aria-label="World map"
      className="pointer-events-auto absolute left-1/2 top-1/2 z-20 flex max-h-[calc(100%-2rem)] w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col border border-gold-muted/60 bg-surface/95"
    >
      <header className="flex items-center justify-between border-b border-gold-muted/30 px-3 py-2">
        <h2 className="font-display text-sm tracking-[0.2em] text-gold">
          World Map
        </h2>
        <p className="text-xs text-ink-muted">
          You are in <span className="text-ink">{locationName}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close map"
          className="px-1 text-lg leading-none text-ink-muted hover:text-gold"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 overflow-y-auto p-3">
        {/* World +Z (north) is up, so every Z is negated into SVG's Y. */}
        <svg
          viewBox={`${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}`}
          role="img"
          aria-label={`Map of the region. You are in ${locationName}.`}
          className="aspect-square w-full border border-gold-muted/30"
        >
          <rect
            x={-HALF}
            y={-HALF}
            width={HALF * 2}
            height={HALF * 2}
            fill="#10171a"
          />

          {WORLD.roads.map((road, index) => (
            <line
              key={index}
              x1={road.from.x}
              y1={-road.from.z}
              x2={road.to.x}
              y2={-road.to.z}
              stroke="#6b5a42"
              strokeWidth={Math.max(1.6, road.width * 0.7)}
              strokeLinecap="round"
            />
          ))}

          <circle
            cx={WORLD.village.center.x}
            cy={-WORLD.village.center.z}
            r={WORLD.villageWallRadius}
            fill="#2a2420"
            fillOpacity={0.85}
            stroke="var(--color-gold-muted)"
            strokeWidth={1}
          />

          {WORLD.spawnZones.map((zone) => (
            <circle
              key={zone.id}
              cx={zone.center.x}
              cy={-zone.center.z}
              r={zone.radius}
              fill="var(--color-blood)"
              fillOpacity={0.22}
              stroke="var(--color-blood)"
              strokeWidth={0.6}
              strokeDasharray="2 2"
            />
          ))}

          {WORLD.markers.map((marker) => (
            <g
              key={marker.id}
              transform={`translate(${marker.position.x} ${-marker.position.z})`}
            >
              <rect
                x={-1.8}
                y={-1.8}
                width={3.6}
                height={3.6}
                transform="rotate(45)"
                fill={MARKER_STYLE[marker.kind].fill}
                stroke="#090a0d"
                strokeWidth={0.5}
              />
              <text
                y={-4.5}
                textAnchor="middle"
                fontSize={5}
                fill="var(--color-ink)"
                stroke="#090a0d"
                strokeWidth={1.4}
                paintOrder="stroke"
              >
                {marker.label}
              </text>
            </g>
          ))}

          <g
            transform={`translate(${playerX} ${-playerZ}) rotate(${(playerHeading * 180) / Math.PI})`}
          >
            <path
              d="M 0 -5 L 3.4 3.6 L 0 1.6 L -3.4 3.6 Z"
              fill="var(--color-gold)"
              stroke="#090a0d"
              strokeWidth={0.7}
            />
          </g>

          <text
            x={HALF - 6}
            y={-HALF + 10}
            textAnchor="middle"
            fontSize={7}
            fill="var(--color-ink-muted)"
          >
            N
          </text>
          <path
            d={`M ${HALF - 6} ${-HALF + 13} v 9 m -2.5 -6.5 l 2.5 -2.5 l 2.5 2.5`}
            fill="none"
            stroke="var(--color-ink-muted)"
            strokeWidth={0.8}
          />
        </svg>

        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          <li className="flex items-center gap-1.5">
            <svg viewBox="-5 -5 10 10" className="h-3 w-3" aria-hidden="true">
              <path
                d="M 0 -5 L 3.4 3.6 L 0 1.6 L -3.4 3.6 Z"
                fill="var(--color-gold)"
              />
            </svg>
            You
          </li>
          {kinds.map((kind) => (
            <li key={kind} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rotate-45"
                style={{ background: MARKER_STYLE[kind].fill }}
              />
              {MARKER_STYLE[kind].label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
