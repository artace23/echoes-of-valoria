import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

const SIZE = 256;

export interface GroundDetail {
  /** Tileable tint variation (clumps and patches), multiplied over the base colour. */
  variation: Texture;
  /** Tileable normal map giving the surface small-scale relief. */
  normal: Texture;
}

/** Deterministic lattice value in [0, 1) that repeats every `period` cells. */
function lattice(x: number, y: number, period: number, seed: number): number {
  const wx = ((x % period) + period) % period;
  const wy = ((y % period) + period) % period;
  let h = (wx * 374761393 + wy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Tileable value noise in [0, 1]. */
function noise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const top =
    lattice(x0, y0, period, seed) * (1 - tx) +
    lattice(x0 + 1, y0, period, seed) * tx;
  const bottom =
    lattice(x0, y0 + 1, period, seed) * (1 - tx) +
    lattice(x0 + 1, y0 + 1, period, seed) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Several octaves of tileable noise, normalised to [0, 1]. */
function fractal(u: number, v: number, seed: number): number {
  let total = 0;
  let amplitude = 1;
  let range = 0;
  for (let octave = 0; octave < 5; octave++) {
    total += noise(u, v, 4 << octave, seed + octave * 17) * amplitude;
    range += amplitude;
    amplitude *= 0.55;
  }
  return total / range;
}

/**
 * Procedurally generated ground detail.
 *
 * This is a STAND-IN, not art: it is tileable noise computed at start-up so
 * the forest floor is not a single flat colour while no ground textures have
 * been sourced. It adds patchy tint variation and fine relief, nothing more.
 * Replace it with a real PBR set (see the "ground-forest" slot in the asset
 * manifest) when one is available.
 */
export function createGroundDetail(scene: Scene): GroundDetail {
  const heights = new Float32Array(SIZE * SIZE);
  const tint = new Uint8Array(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const coarse = fractal(u, v, 3);
      const fine = fractal(u, v, 41);
      heights[y * SIZE + x] = coarse * 0.6 + fine * 0.4;

      // Patches lean either mossy-green or bare-brown; fine grain adds speckle.
      const moss = smooth(Math.min(1, Math.max(0, (coarse - 0.38) / 0.3)));
      const grain = 0.82 + fine * 0.36;
      const i = (y * SIZE + x) * 4;
      tint[i] = Math.min(255, (150 + (1 - moss) * 55) * grain);
      tint[i + 1] = Math.min(255, (152 + moss * 40) * grain);
      tint[i + 2] = Math.min(255, (122 + (1 - moss) * 18) * grain);
      tint[i + 3] = 255;
    }
  }

  // Normal map from the height field, wrapping at the edges so it tiles.
  const normals = new Uint8Array(SIZE * SIZE * 4);
  const at = (x: number, y: number) =>
    heights[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)] ?? 0;
  const strength = 5;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      normals[i] = ((-dx / length) * 0.5 + 0.5) * 255;
      normals[i + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
      normals[i + 2] = (1 / length) * 0.5 * 255 + 127.5;
      normals[i + 3] = 255;
    }
  }

  const make = (data: Uint8Array, name: string) => {
    const texture = RawTexture.CreateRGBATexture(
      data,
      SIZE,
      SIZE,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = name;
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 8;
    return texture;
  };

  return {
    variation: make(tint, "ground-variation-procedural"),
    normal: make(normals, "ground-normal-procedural"),
  };
}
