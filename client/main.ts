import "./styles/main.css";
import { createWorld } from "./world/index.js";
import { closeScreen, setWorld } from "./router.js";
import { startBattle } from "./battle/view.js";
import { showDeck } from "./screens/deck.js";
import { $ } from "./util.js";
import { S } from "./state/store.js";
import { OPPONENTS } from "../shared/data/cards.js";
import { audioCtx, initAudio, updateMuteButton, whenUnlocked } from "./audio/engine.js";
import { music } from "./audio/music.js";
import { preloadSamples, sfx } from "./audio/sfx.js";

initAudio();
whenUnlocked(preloadSamples);
music("world");
document.querySelectorAll<HTMLElement>("[data-mute]").forEach(updateMuteButton);
addEventListener("click", e => { if ((e.target as HTMLElement).closest("button:not([disabled])")) sfx("tap"); });

const world = createWorld($("#world")!, { onChallenge: startBattle, onOpenDeck: showDeck });
setWorld(world);
closeScreen();

document.querySelector("[data-open=deck]")!.addEventListener("click", showDeck);

if (import.meta.env.DEV) {
  // Console helpers for playtesting: __fusion.battle("vex"), __fusion.state, __fusion.world(), __fusion.warp(x, z), __fusion.sfx("hitFire"), __fusion.audio()
  Object.assign(window, { __fusion: { state: S, world: world.debug, warp: world.warp, battle: (id: string) => startBattle(OPPONENTS.find(o => o.id === id)!), sfx, audio: () => audioCtx()?.state ?? "locked" } });
}
