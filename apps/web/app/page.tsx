import { isLocationUnlocked } from "@valoria/game-core";
import { CHARACTER_CLASSES, LOCATIONS } from "@valoria/game-data";
import type { LocationDefinition } from "@valoria/game-types";

// Foundation screen: proves the web app renders with the project palette and
// consumes the shared packages. The real main menu replaces it next milestone.
const NEW_CHARACTER_LEVEL = 1;

function LocationRow({ location }: { location: LocationDefinition }) {
  const unlocked = isLocationUnlocked(location, NEW_CHARACTER_LEVEL);
  return (
    <li className="flex items-baseline justify-between gap-6 border-t border-gold-muted/25 py-3">
      <div>
        <p className="font-display text-lg text-ink">{location.name}</p>
        <p className="text-sm text-ink-muted">{location.description}</p>
      </div>
      <span
        className={`shrink-0 text-xs uppercase tracking-[0.2em] ${
          unlocked ? "text-gold" : "text-blood"
        }`}
      >
        {unlocked ? "Open" : `Level ${location.requiredLevel}`}
      </span>
    </li>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <p className="text-xs uppercase tracking-[0.4em] text-gold-muted">
        Foundation build
      </p>
      <h1 className="mt-4 text-center font-display text-4xl tracking-wide text-gold sm:text-6xl">
        Echoes of Valoria
      </h1>

      <section className="mt-12 w-full max-w-xl border border-gold-muted/40 bg-surface p-6 sm:p-8">
        <h2 className="font-display text-sm uppercase tracking-[0.3em] text-gold-muted">
          Classes
        </h2>
        <ul className="mt-2">
          {CHARACTER_CLASSES.map((characterClass) => (
            <li
              key={characterClass.id}
              className="border-t border-gold-muted/25 py-3"
            >
              <p className="font-display text-lg text-ink">
                {characterClass.name}
              </p>
              <p className="text-sm text-ink-muted">
                {characterClass.description}
              </p>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 font-display text-sm uppercase tracking-[0.3em] text-gold-muted">
          Locations
        </h2>
        <ul className="mt-2">
          {LOCATIONS.map((location) => (
            <LocationRow key={location.id} location={location} />
          ))}
        </ul>
      </section>
    </main>
  );
}
