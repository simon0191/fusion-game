import { ZZFX } from "zzfx";
import type { Card, Element, FusionOutcome, TimingGrade } from "../../shared/types.js";
import { audioCtx, buses } from "./engine.js";
import { S } from "../state/store.js";

/*
 * Sound effects are ZzFX parameter lists, synthesised once and cached. Paste a list into
 * https://killedbyapixel.github.io/ZzFX/ to hear and tweak it. Parameter order:
 * volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
 * pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter
 * Shapes: 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square. Filter: positive is high-pass, negative is low-pass.
 * Randomness here is applied as a pitch wobble at play time, so each list is built only once.
 */
type Params = (number | undefined)[];

ZZFX.volume = 1;
void ZZFX.audioContext.close?.();

export const SOUNDS = {
  // Menus and world
  tap: [.25, .05, 900, 0, .01, .03, 1],
  select: [.4, .05, 700, 0, .02, .08, 1, , , , 300, .03],
  deselect: [.35, .05, 700, 0, .02, .08, 1, , , , -200, .03],
  near: [.35, 0, 880, .01, .05, .25, 0, , , , 440, .06],
  step: [.22, .3, 90, 0, .005, .05, 4, 1, , , , , , , , , , , , , -1500],

  // Battle flow
  enter: [.35, .1, 1200, .05, .05, .2, 4, 1, -6, , , , , , , , , , , , 1200],
  ring: [.25, 0, 1400, 0, .01, .06, 0],
  tapPerfect: [.5, 0, 1046, 0, .04, .25, 1, , , , 523, .05, , , , , .05],
  tapGood: [.4, 0, 784, 0, .03, .15, 1, , , , 262, .04],
  blockPerfect: [.3, 0, 900, 0, .01, .35, 3, 1, , , , , , , , , .03, , , , 800],
  blockGood: [.25, 0, 650, 0, .01, .2, 3, 1, , , , , , , , , , , , , 600],
  miss: [.35, 0, 220, 0, .05, .15, 2, , -2, , , , , , , , , , , , -1000],

  // Attacks: one launch sound per element, then a shared thud plus an element accent on impact
  castFire: [.4, .1, 200, .03, .1, .2, 4, 1, 2, , , , , , , , , , , , -3000],
  castWater: [.4, .1, 300, .01, .15, .1, 0, , 8, , , , .05],
  castLeaf: [.3, .2, 2000, .05, .1, .2, 4, , , , , , , , , , , , , , 2000],
  castRock: [.5, .1, 60, .02, .15, .2, 4, , , , , , , 2, , , , , , , -600],
  castSpark: [.3, .1, 1500, 0, .15, .1, 5, .5, -20, , , , .03, , , .2],
  castShadow: [.4, .1, 500, .05, .15, .2, 1, , -3, , , , , , 8],
  impact: [.45, .1, 150, 0, .02, .25, 4, 1, -2, , , , , 1, , , , , , , -2000],
  hitFire: [.45, .2, 300, 0, .05, .3, 4, , , , , , , 3, , .1, , , , , -4000],
  hitWater: [.45, .2, 800, 0, .03, .3, 4, , -2, , , , , , , , , , , , 1500],
  hitLeaf: [.35, .2, 1200, 0, .02, .15, 4, , , , , , , , , , , , , , 2500],
  hitRock: [.6, .1, 80, 0, .05, .3, 4, , , , , , , 4, , .2, , , , , -800],
  hitSpark: [.4, .2, 2000, 0, .02, .2, 5, .3, , , , , .02, , , .3],
  hitShadow: [.45, .1, 200, 0, .05, .4, 2, , -1, , , , , , 4, , .1, , , , -1500],
  crit: [.5, 0, 1200, 0, .05, .3, 1, , , , 600, .05, , , , , .05],
  weak: [.35, 0, 200, 0, .05, .2, 1, , -1],
  blocked: [.5, 0, 120, 0, .02, .2, 1, , , , , , , , , , , , , , -500],
  bonk: [.5, 0, 300, 0, .1, .3, 0, , -1, , , , , , 15],
  heal: [.35, 0, 600, .02, .2, .3, 0, , 3, , , , .06],
  drain: [.35, 0, 300, .02, .2, .3, 1, , 2, , , , .06, , , , , , , , -2000],
  thorns: [.4, .1, 2500, 0, .01, .08, 2, , -10],
  ko: [.5, 0, 500, 0, .1, .6, 2, , -1.5, , , , , , , , , , , , -2000],

  // Fusion
  botch: [.45, 0, 400, 0, .2, .5, 2, , -1, , , , , , 6, , , , , , -1800],
} satisfies Record<string, Params>;

export type SoundName = keyof typeof SOUNDS;

const cache = new Map<string, AudioBuffer>();
const lastPlayed = new Map<string, number>();

function buffer(ctx: AudioContext, key: string, params: Params) {
  let b = cache.get(key);
  if (!b) {
    const p = [...params];
    p[1] = 0;
    const samples = ZZFX.buildSamples(...p);
    b = ctx.createBuffer(1, Math.max(1, samples.length), ZZFX.sampleRate);
    b.getChannelData(0).set(samples);
    cache.set(key, b);
  }
  return b;
}

interface PlayOpts { vol?: number; rate?: number; delay?: number }

function playParams(key: string, params: Params, { vol = 1, rate = 1, delay = 0 }: PlayOpts = {}) {
  const ctx = audioCtx();
  if (!ctx) return;
  // The same sound twice within 30 ms just sounds louder, so drop the second one.
  const now = ctx.currentTime + delay;
  if (now - (lastPlayed.get(key) ?? -1) < 0.03) return;
  lastPlayed.set(key, now);
  const src = ctx.createBufferSource();
  src.buffer = buffer(ctx, key, params);
  const wobble = params[1] ?? 0.05;
  src.playbackRate.value = rate * (1 + wobble * (Math.random() * 2 - 1));
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(buses().sfx);
  src.start(now);
}

export const sfx = (name: SoundName, opts?: PlayOpts) => playParams(name, SOUNDS[name], opts);

/* ---------- Recorded sounds from public/audio/sfx/, decoded once on first use ---------- */
const SAMPLES = { fusion: "/audio/sfx/fusion.mp3" };
export type SampleName = keyof typeof SAMPLES;
const decodedSamples = new Map<SampleName, Promise<AudioBuffer | null>>();

function loadSample(ctx: AudioContext, name: SampleName) {
  let p = decodedSamples.get(name);
  if (!p) {
    p = fetch(SAMPLES[name]).then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).catch(() => null);
    decodedSamples.set(name, p);
  }
  return p;
}

/** Fetches recorded sounds as soon as audio starts, so the first play is not late. */
export const preloadSamples = () => { const ctx = audioCtx(); if (ctx) for (const n of Object.keys(SAMPLES) as SampleName[]) void loadSample(ctx, n); };

export async function sample(name: SampleName, { vol = 1 } = {}) {
  const ctx = audioCtx();
  if (!ctx) return;
  const buf = await loadSample(ctx, name);
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(buses().sfx);
  src.start();
}

/* ---------- Jingles: short note sequences built from one tone ---------- */
const C5 = 523.25;
const note = (semi: number) => C5 * 2 ** (semi / 12);
const VOICES = {
  bell: (f: number, len: number): Params => [.35, 0, f, .01, len * .3, len * .7, 1, , , , , , , , , , .04],
  brass: (f: number, len: number): Params => [.3, 0, f, .02, len * .5, len * .5, 2, 1, , , , , , , , , , .8, .05, , -3000],
  sad: (f: number, len: number): Params => [.3, 0, f, .03, len * .5, len * .5, 2, 1, -.05, , , , , , 5, , , , , , -1500],
};

/** Plays notes as [semitones from C5, start time in seconds, length in seconds]. */
function seq(voice: keyof typeof VOICES, notes: [number, number, number][], vol = 1) {
  for (const [semi, t, len] of notes) {
    const f = note(semi);
    playParams(`${voice}:${f.toFixed(1)}:${len}`, VOICES[voice](f, len), { delay: t, vol });
  }
}

export const jingles = {
  challenge: () => seq("brass", [[-12, 0, .1], [-9, .1, .1], [-5, .2, .1], [0, .3, .45]]),
  victory: () => seq("bell", [[0, 0, .12], [4, .12, .12], [7, .24, .12], [12, .36, .5], [7, .36, .5], [16, .36, .5]]),
  defeat: () => seq("sad", [[7, 0, .3], [6, .3, .3], [5, .6, .3], [-5, .9, .9]]),
  super: () => seq("bell", [[7, 0, .07], [12, .06, .07], [19, .12, .15]], .8),
  reveal: () => seq("bell", [[0, 0, .1], [4, .08, .1], [7, .16, .1], [12, .24, .4]]),
  revealCrit: () => {
    seq("bell", [[0, 0, .08], [4, .07, .08], [7, .14, .08], [12, .21, .08], [16, .28, .08], [19, .35, .6], [24, .35, .6]]);
    sfx("crit", { delay: .35 });
  },
  revealBotch: () => { sfx("botch"); seq("sad", [[0, .35, .25], [-1, .6, .25], [-2, .85, .5]], .8); },
};

/* ---------- Battle helpers ---------- */
const CAST: Record<Element, SoundName> = { fire: "castFire", water: "castWater", leaf: "castLeaf", rock: "castRock", spark: "castSpark", shadow: "castShadow" };
const HIT: Record<Element, SoundName> = { fire: "hitFire", water: "hitWater", leaf: "hitLeaf", rock: "hitRock", spark: "hitSpark", shadow: "hitShadow" };

export const castSound = (el: Element) => sfx(CAST[el]);

export function hitSound(el: Element, h: { dmg: number; crit: boolean; effect: "super" | "weak" | null; selfHit: boolean; shielded: boolean }) {
  if (h.selfHit) { sfx("bonk"); return; }
  if (!h.dmg) { sfx("blocked"); return; }
  const weak = h.effect === "weak";
  sfx("impact", { vol: weak ? .6 : 1, rate: weak ? .8 : 1 });
  sfx(HIT[el], { vol: weak ? .6 : 1 });
  if (h.shielded) sfx("blocked", { vol: .7 });
  if (h.crit) sfx("crit", { delay: .05 });
  if (h.effect === "super") jingles.super();
  if (weak) sfx("weak", { delay: .05 });
}

export const gradeSound = (mode: "attack" | "defend", g: TimingGrade) =>
  sfx(g === "miss" ? "miss" : mode === "attack" ? (g === "perfect" ? "tapPerfect" : "tapGood") : g === "perfect" ? "blockPerfect" : "blockGood");

export function fusionReveal(outcome: FusionOutcome, card: Card) {
  if (outcome === "crit") jingles.revealCrit();
  else if (outcome === "botch") jingles.revealBotch();
  else jingles.reveal();
  cry(card, { delay: .7 });
}

/* ---------- Monster cries ---------- */
const CRY_BASE: Record<Element, { f: number; shape: number }> = {
  fire: { f: 420, shape: 2 }, water: { f: 330, shape: 0 }, leaf: { f: 520, shape: 1 },
  rock: { f: 160, shape: 2 }, spark: { f: 700, shape: 5 }, shadow: { f: 260, shape: 3 },
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Each monster gets its own short call, worked out from its name and elements, so the
 * same monster always sounds the same. A fused monster's second element adds a wobble.
 */
export function cryParams(card: Pick<Card, "name" | "els">): Params {
  const h = hash(card.name + card.els.join());
  const bits = (shift: number, n: number) => ((h >>> shift) % n) / (n - 1);
  const base = CRY_BASE[card.els[0]];
  const f = base.f * (0.75 + bits(0, 16) * 0.6);
  const len = 0.18 + bits(4, 8) * 0.22;
  const slide = (bits(7, 8) - 0.5) * 6;
  const jump = (bits(10, 5) - 0.5) * f * 0.8;
  const wobble = card.els[1] ? 4 + bits(13, 6) * 10 : 0;
  const grit = card.els[0] === "rock" ? 2 : 0;
  return [.4, .03, f, .02, len * 0.4, len * 0.6, base.shape, 1, slide, , jump, len * 0.4, , grit, wobble, , , , , , -3500];
}

export function cry(card: Pick<Card, "name" | "els">, opts?: PlayOpts) {
  if (!S.audio.cries) return;
  playParams(`cry:${card.name}:${card.els.join()}`, cryParams(card), opts);
}

/** Every named sound, for the sound test panel. */
export const allSounds = Object.keys(SOUNDS) as SoundName[];
export const allSamples = Object.keys(SAMPLES) as SampleName[];
