import type { BattleMechanic } from "../modes.js";
import { classic } from "../view.js";

/** Placeholder until the prototype is built. */
export const rush: BattleMechanic = { start: o => classic.start(o), stop: () => classic.stop() };
