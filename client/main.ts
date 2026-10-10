import "./styles/main.css";
import { createWorld } from "./world/index.js";
import { closeScreen, setWorld } from "./router.js";
import { startBattle } from "./battle/view.js";
import { showDeck } from "./screens/deck.js";
import { $ } from "./util.js";
import { S } from "./state/store.js";
import { OPPONENTS } from "../shared/data/cards.js";

const world = createWorld($("#world")!, { onChallenge: startBattle, onOpenDeck: showDeck });
setWorld(world);
closeScreen();

document.querySelector("[data-open=deck]")!.addEventListener("click", showDeck);

if (import.meta.env.DEV) {
  // Console helpers for playtesting: __fusion.battle("vex"), __fusion.state, __fusion.world()
  Object.assign(window, { __fusion: { state: S, world: world.debug, battle: (id: string) => startBattle(OPPONENTS.find(o => o.id === id)!) } });
}
