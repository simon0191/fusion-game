import type { Palette } from "./props.js";

export interface Theme {
  /** Background gradient, top of screen to bottom. Only seen where nothing is drawn. */
  sky: string[];
  fog: [color: string, near: number, far: number];
  hemi: [sky: string, ground: string, intensity: number];
  sun: [color: string, intensity: number, dir: [number, number, number]];
  ground: { base: string; light: string; dark: string; path: string; edge: string; bank: string; hill: string };
  water: [deep: string, light: string];
  /** How strongly crystals, runes and glowing gills emit their own colour. */
  glow: number;
  halo: number;
  P: Palette;
  /** Relative weights of tree, mushroom and big plant in the dense ring around the play area. */
  ring: [number, number, number];
  motes?: { color: string; count: number; size: number; blink: boolean };
}

/** Sunlit Ruins: golden-hour valley with mossy arches, spotted mushrooms and a stream. */
export const THEME: Theme = {
  sky: ["#7ec8ea", "#bfe3ef", "#ffe2b8"],
  fog: ["#f2dcb2", 30, 82],
  hemi: ["#fff1d0", "#6c8f4a", 1.25],
  sun: ["#ffd59a", 2.5, [-0.6, 1, 0.45]],
  ground: { base: "#7fbc4e", light: "#a8d364", dark: "#5e9c43", path: "#e3c48e", edge: "#c4a06a", bank: "#d8c68e", hill: "#9cc95a" },
  water: ["#36bcc6", "#d4fbff"],
  glow: 0.55, halo: 0.5,
  ring: [5, 3, 2],
  motes: { color: "#fff0b8", count: 140, size: 0.12, blink: false },
  P: {
    trunk: "#8a5a3b", leaves: ["#4f9a3c", "#5fae45", "#93d35c"], stone: ["#cfc4aa", "#a99f8c"], moss: "#7cb547", vine: "#4f8a3a",
    caps: [["#e8513f", "#fff4e0"], ["#f08a3c", "#fff1d6"], ["#d9475e", "#ffe8ef"]], stem: "#f3e6cc", gill: "#f0d9b0",
    crystal: ["#4fe0d4", "#7fd0ff", "#b08cff"], flowers: ["#ff8fb1", "#ffd34d", "#ffffff", "#b48cff"], tuft: "#5da040",
    plant: ["#3f8f3f", "#56b04a", "#6cc35a"], wood: "#b7834f", magic: "lit",
  },
};
