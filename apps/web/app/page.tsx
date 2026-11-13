import { CHARACTER_CLASSES, CULL_THE_PACK, LOCATIONS } from "@valoria/game-data";
import { PlayLink } from "@/components/home/PlayLink";

/** What a player can do in the current build. Keep this list truthful. */
const FEATURES: { title: string; body: string }[] = [
  {
    title: "Steel and timing",
    body: "Light and heavy sword strikes, a block that costs stamina, and a dodge that slips a bite if you time it. Every action has a cooldown; none of them is free.",
  },
  {
    title: "Wolves that hunt",
    body: "Corrupted wolves patrol their ground, notice you, give chase and lunge. Their eyes flare before they bite. Three at once will kill you.",
  },
  {
    title: "A Warrior who grows",
    body: "Kills bring experience and gold. Levels raise your health, stamina and strength; a better blade does more than any of them.",
  },
];

const CONTROLS: [string, string][] = [
  ["WASD", "Move"],
  ["Drag or arrow keys", "Look around"],
  ["Shift / Space", "Sprint / jump"],
  ["F / R", "Attack / heavy attack"],
  ["Q / E", "Block / dodge"],
  ["H", "Drink a potion"],
  ["T", "Talk to a villager"],
  ["I / M", "Inventory / world map"],
];

function Ornament() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 text-gold-muted">
      <span className="h-px w-16 bg-gold-muted/50 sm:w-24" />
      <span className="h-1.5 w-1.5 rotate-45 bg-gold-muted" />
      <span className="h-px w-16 bg-gold-muted/50 sm:w-24" />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-sm uppercase tracking-[0.3em] text-gold-muted">
      {children}
    </h2>
  );
}

export default function Home() {
  const warrior = CHARACTER_CLASSES[0];

  return (
    <main className="flex flex-1 flex-col items-center px-4">
      {/* Title */}
      <section className="flex min-h-[78vh] w-full max-w-3xl flex-col items-center justify-center py-20 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-gold-muted">
          A dark fantasy RPG
        </p>
        <h1 className="mt-5 font-display text-5xl leading-tight tracking-wide text-gold sm:text-7xl">
          Echoes of Valoria
        </h1>
        <div className="mt-6">
          <Ornament />
        </div>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink">
          The ash settles a little more each year. Now wolves have come down
          out of the Whispering Forest, and they are not as wolves should be.
        </p>
        <div className="mt-10">
          <PlayLink />
        </div>
        <p className="mt-5 text-xs text-ink-muted">
          Plays in your browser with a keyboard and mouse. An early prototype:
          progress is saved on this device.
        </p>
      </section>

      <div className="w-full max-w-4xl space-y-16 pb-20">
        {/* The task */}
        <section className="border border-gold-muted/40 bg-surface p-6 sm:p-8">
          <SectionHeading>Your first task</SectionHeading>
          <p className="mt-3 font-display text-2xl text-ink">
            {CULL_THE_PACK.name}
          </p>
          <p className="mt-2 max-w-2xl text-ink-muted">
            You arrive in Ashen Village as a {warrior?.name ?? "Warrior"} with
            a rusty sword and two draughts. The village elder has work for
            anyone who carries a blade: follow the road through the north gate
            and cut down {CULL_THE_PACK.objective.count} corrupted wolves.
          </p>
        </section>

        {/* What you do */}
        <section>
          <SectionHeading>In this build</SectionHeading>
          <ul className="mt-4 grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="border border-gold-muted/30 bg-surface p-5"
              >
                <h3 className="font-display text-lg text-gold">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {feature.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Where */}
        <section>
          <SectionHeading>The land</SectionHeading>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {LOCATIONS.map((location) => (
              <li
                key={location.id}
                className="border border-gold-muted/30 bg-surface p-5"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-gold-muted">
                  {location.kind === "settlement" ? "Safe haven" : "Wilderness"}
                </p>
                <h3 className="mt-1 font-display text-lg text-ink">
                  {location.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {location.description}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Controls */}
        <section className="border border-gold-muted/40 bg-surface p-6 sm:p-8">
          <SectionHeading>Controls</SectionHeading>
          <dl className="mt-4 grid gap-x-10 gap-y-2 text-sm sm:grid-cols-2">
            {CONTROLS.map(([keys, action]) => (
              <div
                key={keys}
                className="flex items-baseline justify-between gap-4 border-b border-gold-muted/15 pb-2"
              >
                <dt className="text-gold">{keys}</dt>
                <dd className="text-ink-muted">{action}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 text-center">
            <PlayLink />
          </div>
        </section>

        <footer className="border-t border-gold-muted/20 pt-6 text-center text-xs leading-relaxed text-ink-muted">
          <p>
            Forest rocks, plants, ground and sky are public-domain (CC0) scans
            from Poly Haven and ambientCG. Characters, wolves and the village
            are still placeholder shapes.
          </p>
        </footer>
      </div>
    </main>
  );
}
