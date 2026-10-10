/** Where things sit in the overworld. Units are metres; the player starts in the south and walks north. */
export const BOUNDS = 19;
export const PLAYER_START = { x: 0, z: 15 };

export const NPC_SPOTS: Record<string, { x: number; z: number; color: string; platform?: boolean }> = {
  tim: { x: -4, z: 8, color: "#7cc46a" },
  rosa: { x: 5, z: 2, color: "#c49a5a" },
  twins: { x: -5, z: -4, color: "#4aa3e0" },
  morva: { x: 6, z: -9, color: "#9a6ae0" },
  vex: { x: 0, z: -15, color: "#e05a5a", platform: true },
};

/** Centre line of the dirt path, from the start to the champion. */
export const PATH: [number, number][] = [[0, 34], [0, 12], [-3, 9], [1, 5], [4, 2], [0, -1], [-4, -4], [0, -7], [5, -9], [2, -12], [0, -15]];

export function distToPath(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}
