// Builds the conifer trees used in the forest.
//
// These are AUTHORED, not scanned: Poly Haven's scanned fir is 7.9 million
// triangles and unusable in a browser. Instead each tree is a tapered trunk
// wrapped in Poly Haven's scanned pine bark, with branches made of flat cards
// showing Poly Haven's scanned fir twigs. That is the standard way real-time
// games build conifers, and it keeps a tree under a thousand triangles.

/** Deterministic PRNG so the trees are identical on every build. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Branch sprays in the fir twig atlas, as UV rectangles. `v0` is the tip of
 * the spray and `v1` its base (glTF's V axis runs downward).
 */
const SPRAYS = [
  { u0: 0.3, u1: 0.655, v0: 0.395, v1: 0.785 },
  { u0: 0.63, u1: 0.965, v0: 0.45, v1: 0.835 },
  { u0: 0.65, u1: 0.945, v0: 0.035, v1: 0.372 },
  { u0: 0.185, u1: 0.435, v0: 0.04, v1: 0.315 },
];

class Geometry {
  positions = [];
  normals = [];
  uvs = [];
  indices = [];

  vertex(position, normal, uv) {
    this.positions.push(...position);
    this.normals.push(...normal);
    this.uvs.push(...uv);
    return this.positions.length / 3 - 1;
  }

  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }
}

const normalize = ([x, y, z]) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * @param {object} shape
 * @param {number} shape.seed
 * @param {number} shape.height       Metres from base to tip.
 * @param {number} shape.baseRadius   Trunk radius at the ground.
 * @param {number} shape.reach        Length of the longest (lowest) branches.
 * @param {number} shape.firstBranch  Height of the lowest branches, 0..1.
 * @param {boolean} lowDetail         Fewer rings, whorls and cards.
 */
export function buildConiferGeometry(shape, lowDetail) {
  const random = mulberry32(shape.seed);
  const range = (min, max) => min + random() * (max - min);
  const { height, baseRadius, reach, firstBranch } = shape;

  // A slight lean and bend so trunks are not perfectly straight.
  const leanAngle = range(0, Math.PI * 2);
  const leanAmount = range(0.1, 0.35);
  const trunkCenter = (t) => [
    Math.cos(leanAngle) * leanAmount * t * t,
    height * t,
    Math.sin(leanAngle) * leanAmount * t * t,
  ];
  const trunkRadius = (t) =>
    baseRadius * (1 - t) ** 0.85 + 0.02 + 0.1 * baseRadius * Math.exp(-t * 16) * 4;

  // --- Trunk ---------------------------------------------------------------
  const trunk = new Geometry();
  const rings = lowDetail ? 5 : 10;
  const sides = lowDetail ? 5 : 9;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const center = trunkCenter(t);
    const radius = trunkRadius(t);
    for (let side = 0; side <= sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      const outward = [Math.cos(angle), 0, Math.sin(angle)];
      trunk.vertex(
        add(center, scale(outward, radius)),
        normalize([outward[0], 0.12, outward[2]]),
        // Bark tiles every 2 m up the trunk and twice around it.
        [(side / sides) * 2, (height * t) / 2],
      );
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * (sides + 1) + side;
      const b = a + 1;
      const c = a + sides + 2;
      const d = a + sides + 1;
      trunk.quad(a, d, c, b);
    }
  }

  // --- Branches ------------------------------------------------------------
  const foliage = new Geometry();
  const up = [0, 1, 0];

  /** One flat card showing a spray, from `base` along `along`, `width` across `across`. */
  const card = (base, along, across, length, width, spray, normal) => {
    const tip = add(base, scale(along, length));
    const half = scale(across, width / 2);
    const a = foliage.vertex(add(base, scale(half, -1)), normal, [spray.u0, spray.v1]);
    const b = foliage.vertex(add(base, half), normal, [spray.u1, spray.v1]);
    const c = foliage.vertex(add(tip, half), normal, [spray.u1, spray.v0]);
    const d = foliage.vertex(add(tip, scale(half, -1)), normal, [spray.u0, spray.v0]);
    foliage.quad(a, b, c, d);
  };

  const spacing = lowDetail ? 0.85 : 0.36;
  let whorl = 0;
  for (let y = height * firstBranch; y < height * 0.965; y += spacing) {
    const t = y / height;
    const taper = (1 - t) ** 0.72;
    const count = lowDetail ? 4 : t > 0.8 ? 4 : 6;
    const twist = whorl++ * 0.9 + range(0, 0.6);
    const center = trunkCenter(t);

    for (let i = 0; i < count; i++) {
      const angle = twist + (i / count) * Math.PI * 2 + range(-0.25, 0.25);
      const outward = [Math.cos(angle), 0, Math.sin(angle)];
      // Lower branches are longer and hang further down.
      const droop = 0.12 + 0.42 * (1 - t) + range(-0.08, 0.08);
      const along = normalize(
        add(scale(outward, Math.cos(droop)), scale(up, -Math.sin(droop))),
      );
      const sideways = normalize(cross(up, outward));
      const upright = normalize(cross(along, sideways));
      const length = Math.max(0.4, reach * taper * range(0.8, 1.15));
      const base = add(center, scale(outward, trunkRadius(t) * 0.4));
      const spray = SPRAYS[Math.floor(random() * 2)];
      // Soft, mostly-upward normals so a tree is lit as one rounded mass.
      const normal = normalize([outward[0] * 0.55, 0.85, outward[2] * 0.55]);

      card(base, along, sideways, length, length * 0.95, spray, normal);
      if (!lowDetail) {
        // A second card at right angles gives the branch depth from the side.
        card(base, along, upright, length, length * 0.55, spray, normal);
      }
    }
  }

  // The leader: crossed upright cards at the very top.
  const top = trunkCenter(0.9);
  const topLength = height * 0.14;
  for (const angle of lowDetail ? [0] : [0, Math.PI / 2]) {
    card(
      top,
      up,
      [Math.cos(angle), 0, Math.sin(angle)],
      topLength,
      topLength * 0.8,
      SPRAYS[2],
      up,
    );
  }

  return { trunk, foliage };
}

export const CONIFERS = [
  { name: "conifer_a", seed: 17, height: 10.5, baseRadius: 0.24, reach: 2.6, firstBranch: 0.2 },
  { name: "conifer_b", seed: 53, height: 13, baseRadius: 0.27, reach: 2.2, firstBranch: 0.3 },
  { name: "conifer_c", seed: 91, height: 8, baseRadius: 0.19, reach: 2.3, firstBranch: 0.14 },
];
