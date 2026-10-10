import { audioCtx, buses, whenUnlocked } from "./engine.js";

/**
 * Music loops live in public/audio/music/. Each file holds one second of lead-in, the loop, then one second
 * of run-out, and the loop end is crossfaded into the lead-in, so looping between start and end is seamless.
 * Any MP3 encoder delay shifts both points equally. Tracks are decoded into memory and looped by Web Audio,
 * which loops without the gap an <audio> element leaves.
 */
export type Track = "world" | "battle";
const FILES: Record<Track, { url: string; start: number; end: number }> = {
  world: { url: "/audio/music/world.mp3", start: 1, end: 80.103875 },
  battle: { url: "/audio/music/battle.mp3", start: 1, end: 47.839458 },
};

const FADE_S = 0.8;
const DUCK_LEVEL = 0.35;

const decoded = new Map<Track, Promise<AudioBuffer | null>>();
let want: Track | null = null;
let playing: { track: Track; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let ducked = false;

function load(ctx: AudioContext, t: Track) {
  let p = decoded.get(t);
  if (!p) {
    p = fetch(FILES[t].url).then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).catch(() => null);
    decoded.set(t, p);
  }
  return p;
}

/** Fades to the given track, or to silence with null. Calling it with the track already playing does nothing. */
export function music(t: Track | null) {
  want = t;
  whenUnlocked(() => void apply());
}

async function apply() {
  const ctx = audioCtx();
  if (!ctx || playing?.track === want) return;
  if (playing) fadeOut(ctx, playing);
  playing = null;
  const t = want;
  if (!t) return;
  const buf = await load(ctx, t);
  if (!buf || want !== t || playing) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = FILES[t].start;
  src.loopEnd = FILES[t].end;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(ducked ? DUCK_LEVEL : 1, ctx.currentTime + FADE_S);
  src.connect(gain).connect(buses().music);
  src.start();
  playing = { track: t, src, gain };
}

function fadeOut(ctx: AudioContext, p: NonNullable<typeof playing>) {
  p.gain.gain.cancelScheduledValues(ctx.currentTime);
  p.gain.gain.setValueAtTime(p.gain.gain.value, ctx.currentTime);
  p.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_S);
  p.src.stop(ctx.currentTime + FADE_S + 0.05);
}

/** Lowers the music while a menu covers the world. */
export function duckMusic(on: boolean) {
  ducked = on;
  const ctx = audioCtx();
  if (ctx && playing) playing.gain.gain.setTargetAtTime(on ? DUCK_LEVEL : 1, ctx.currentTime, 0.2);
}
