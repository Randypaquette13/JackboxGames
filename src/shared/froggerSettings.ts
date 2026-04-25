import { TICK_RATE, WORLD_W } from "./constants.js";

/** World pixels per vertical “meter” for distance display. */
export const FROGGER_DISTANCE_UNIT = 40;

export const FROGGER_TILE = 40;
export const FROGGER_FROG_SIZE = 32;
export const FROGGER_COUNTDOWN_SEC = 3;
/** Extra grace after countdown before camera starts scrolling. */
export const FROGGER_SCROLL_DELAY_SEC = 4;

/** Pixels / sec — scroll advances upward through the world. */
export const FROGGER_SCROLL_BASE = 52;
export const FROGGER_SCROLL_MAX = 118;
/** Per second ramp while playing. */
export const FROGGER_SCROLL_RAMP = 1.35;

/** If frog center drops below this offset from scroll bottom, they die. */
export const FROGGER_KILL_MARGIN = 56;

/** Seconds between grid steps at full repeat. */
export const FROGGER_MOVE_COOLDOWN = 0.14;

/** Min / max band height (px). */
export const FROGGER_BAND_H_MIN = 72;
export const FROGGER_BAND_H_MAX = 140;

/** After this many bands generated, grass can spawn bushes/trees. */
export const FROGGER_OBSTACLE_AFTER_BANDS = 4;
export const FROGGER_OBSTACLE_CHANCE = 0.35;

/** Street car spawn (avg seconds between spawns per lane). */
export const FROGGER_CAR_SPAWN_MIN = 1.6;
export const FROGGER_CAR_SPAWN_MAX = 3.2;
export const FROGGER_CAR_SPEED_MIN = 70;
export const FROGGER_CAR_SPEED_MAX = 130;
export const FROGGER_FAST_CAR_AFTER_BANDS = 8;
export const FROGGER_FAST_CAR_CHANCE = 0.12;
export const FROGGER_FAST_CAR_MULT = 2.35;

/** Water platform spawn. */
export const FROGGER_PLATFORM_SPAWN_MIN = 0.12;
export const FROGGER_PLATFORM_SPAWN_MAX = 0.4;
export const FROGGER_LILY_W = 36;
export const FROGGER_LOG_W_MIN = 80;
export const FROGGER_LOG_W_MAX = 140;
export const FROGGER_PLATFORM_SPEED_MIN = 45;
export const FROGGER_PLATFORM_SPEED_MAX = 95;

/** Death notice duration (ticks). */
export const FROGGER_DEATH_NOTICE_TICKS = Math.floor(TICK_RATE * 8);

/** Weight grass vs street vs water: [grass, street, water] — shift toward hazard over time. */
export function froggerSectionWeights(bandsGenerated: number): [number, number, number] {
  const t = Math.min(1, bandsGenerated / 28);
  const grass = 1 - t * 0.55;
  const street = 0.85 + t * 0.55;
  const water = 0.75 + t * 0.6;
  return [grass, street, water];
}

export function pickFroggerSectionKind(bandsGenerated: number): "grass" | "street" | "water" {
  if (bandsGenerated < 10) {
    return Math.random() < 0.55 ? "grass" : "street";
  }
  const [wg, ws, ww] = froggerSectionWeights(bandsGenerated);
  const r = Math.random() * (wg + ws + ww);
  if (r < wg) return "grass";
  if (r < wg + ws) return "street";
  return "water";
}

export function froggerClampX(cx: number): number {
  const half = FROGGER_FROG_SIZE / 2;
  return Math.max(half + 4, Math.min(WORLD_W - half - 4, cx));
}
