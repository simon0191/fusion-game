import { S, save } from "../state/store.js";

/**
 * One AudioContext for the whole game: sound effects and music each get a bus that feeds a master gain.
 * Phones only allow audio to start inside a tap or key press, so the context starts on the first one.
 */
let ctx: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode;
let unlocked = false;
const onUnlock: (() => void)[] = [];

/** Bus gains at 100% on the settings sliders. */
const SFX_FULL = 0.8;
const MUSIC_FULL = 0.45;

type AudioSessionNav = Navigator & { audioSession?: { type: string } };

/**
 * The listeners stay on for the whole session: iOS can suspend the context again
 * (after a phone call, or when the page comes back from the background) and only a tap resumes it.
 */
export function initAudio() {
  const unlock = () => {
    if (ctx?.state === "running" && unlocked) return;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = S.muted ? 0 : S.audio.master;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.ratio.value = 12;
      master.connect(limiter).connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_FULL * S.audio.sfx; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_FULL * S.audio.music; musicBus.connect(master);
    }
    setSessionType();
    if (!("audioSession" in navigator)) playSilentLoop();
    void ctx.resume().then(() => {
      if (unlocked || ctx?.state !== "running") return;
      unlocked = true;
      for (const f of onUnlock.splice(0)) f();
    }, () => { /* not allowed yet: the next tap tries again */ });
  };
  addEventListener("pointerdown", unlock, true);
  addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (unlocked) void ctx.resume();
  });
}

/**
 * On iPhone, Web Audio follows the ringer switch unless the page asks for the "playback" audio session.
 * "playback" also pauses the player's own music app, so muting switches back to "ambient", which mixes with it.
 */
function setSessionType() {
  const session = (navigator as AudioSessionNav).audioSession;
  if (session) session.type = S.muted ? "ambient" : "playback";
}

/** Older iOS has no audioSession. A looping silent <audio> element switches it to the playback session instead. */
let silent: HTMLAudioElement | null = null;
function playSilentLoop() {
  if (silent || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
  const sr = 8000, n = sr / 2, buf = new DataView(new ArrayBuffer(44 + n));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) buf.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); buf.setUint32(4, 36 + n, true); str(8, "WAVEfmt "); buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true); buf.setUint16(22, 1, true); buf.setUint32(24, sr, true); buf.setUint32(28, sr, true);
  buf.setUint16(32, 1, true); buf.setUint16(34, 8, true); str(36, "data"); buf.setUint32(40, n, true);
  for (let i = 0; i < n; i++) buf.setUint8(44 + i, 128);
  silent = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
  silent.loop = true;
  silent.setAttribute("playsinline", "");
  void silent.play().catch(() => { silent = null; });
}

/** The running context, or null before the first tap and while the page is hidden. */
export const audioCtx = () => (ctx && unlocked && ctx.state === "running" ? ctx : null);
export const buses = () => ({ sfx: sfxBus, music: musicBus });

/** Runs now if audio has started, otherwise right after the first tap. */
export function whenUnlocked(f: () => void) {
  if (unlocked) f(); else onUnlock.push(f);
}

/** Applies S.muted and S.audio to the running mix. */
export function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(S.muted ? 0 : S.audio.master, t, 0.05);
  sfxBus.gain.setTargetAtTime(SFX_FULL * S.audio.sfx, t, 0.05);
  musicBus.gain.setTargetAtTime(MUSIC_FULL * S.audio.music, t, 0.05);
}

export function setMuted(m: boolean) {
  S.muted = m;
  save();
  applyVolumes();
  setSessionType();
  document.querySelectorAll<HTMLElement>("[data-mute]").forEach(updateMuteButton);
}

export function updateMuteButton(el: HTMLElement) {
  el.setAttribute("aria-pressed", String(S.muted));
  el.setAttribute("aria-label", "Mute");
  el.textContent = S.muted ? "🔇" : "🔊";
}

/** HTML for a sound toggle. A click anywhere on the page toggles any element carrying data-mute. */
export const muteButtonHTML = (cls = "btn") => `<button class="${cls} mute" type="button" data-mute aria-pressed="${S.muted}" aria-label="Mute">${S.muted ? "🔇" : "🔊"}</button>`;

addEventListener("click", e => {
  if ((e.target as HTMLElement).closest?.("[data-mute]")) setMuted(!S.muted);
});
