import { engine } from "../audio/engine";
import { createStore } from "../app/store";
import type { LayerId } from "../mappings/layers";
import type { QwertasScore } from "../text/types";
import { LearnCoach, type CoachState } from "./coach";

const TICK_MS = 16;

const clock = () => (engine.running ? engine.now() : performance.now() / 1000);

export const learnCoach = new LearnCoach(clock);

export const learnStore = createStore<CoachState>(learnCoach.state());

let timer: ReturnType<typeof setInterval> | null = null;

function publish() {
  learnStore.set(learnCoach.state());
  if (learnCoach.state().status !== "running" && timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function startLearning(score: QwertasScore) {
  learnCoach.start(score);
  if (!timer) {
    timer = setInterval(() => {
      learnCoach.tick();
      publish();
    }, TICK_MS);
  }
  publish();
}

export function stopLearning() {
  learnCoach.stop();
  publish();
}

/** Called by the keyboard controller after every held-set change. */
export function learnKeys(held: ReadonlySet<string>, layer: LayerId) {
  learnCoach.update(held, layer);
  if (learnCoach.state().status === "running") publish();
}
