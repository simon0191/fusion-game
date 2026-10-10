/** Renders every sound effect offline and prints its length and loudness, to catch silent, clipping or broken sounds. */
Object.assign(globalThis, { AudioContext: class { close() {} }, addEventListener() {} });
const { ZZFX } = await import("zzfx");
const { SOUNDS, cryParams } = await import("../client/audio/sfx.js");
const { MONSTERS } = await import("../shared/data/cards.js");

function report(name: string, params: (number | undefined)[]) {
  const p = [...params];
  p[1] = 0;
  const s = ZZFX.buildSamples(...p);
  let peak = 0, sum = 0, bad = 0;
  for (const v of s) {
    if (!Number.isFinite(v)) { bad++; continue; }
    peak = Math.max(peak, Math.abs(v)); sum += v * v;
  }
  const rms = Math.sqrt(sum / s.length);
  const flag = bad ? "BROKEN" : peak > 1 ? "CLIPS" : rms < 0.005 ? "QUIET" : "";
  console.log(`${name.padEnd(24)} ${(s.length / ZZFX.sampleRate).toFixed(2)}s  peak ${peak.toFixed(2)}  rms ${rms.toFixed(3)}  ${flag}`);
}

for (const [name, params] of Object.entries(SOUNDS)) report(name, params);
for (const t of Object.values(MONSTERS)) report(`cry ${t.name}`, cryParams({ name: t.name, els: [t.el] }));
report("cry fused fire/water", cryParams({ name: "Steamwolf", els: ["fire", "water"] }));

export {};
