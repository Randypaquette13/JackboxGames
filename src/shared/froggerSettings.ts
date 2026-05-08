import { TICK_RATE, WORLD_W } from "./constants.js";

/** One discrete row height (px); vertical hops move by this amount. */
export const FROGGER_ROW_H = 40;

/** World pixels per vertical “meter” for distance display (aligned with row hops). */
export const FROGGER_DISTANCE_UNIT = FROGGER_ROW_H;

export const FROGGER_TILE = FROGGER_ROW_H;
export const FROGGER_FROG_SIZE = 32;
export const FROGGER_COUNTDOWN_SEC = 3;
/** Extra grace after countdown before camera starts scrolling. */
export const FROGGER_SCROLL_DELAY_SEC = 4;

/** Pixels / sec — scroll advances upward through the world. */
export const FROGGER_SCROLL_BASE = 36;
export const FROGGER_SCROLL_MAX = 118;
/** Per second ramp while playing. */
export const FROGGER_SCROLL_RAMP = 1.35;

/** If frog center drops below this offset from scroll bottom, they die. */
export const FROGGER_KILL_MARGIN = 56;

/** Seconds between grid steps at full repeat. */
export const FROGGER_MOVE_COOLDOWN = 0.14;

/** Analog left/right movement speed (px/s). */
export const FROGGER_LATERAL_SPEED = 220;

/** Grass safe-zone rows at world bottom before procedural bands. */
export const FROGGER_START_GRASS_ROWS = 4;

/** After this many bands generated, grass can spawn bushes/trees. */
export const FROGGER_OBSTACLE_AFTER_BANDS = 4;
export const FROGGER_OBSTACLE_CHANCE = 0.35;

/** Street car spawn cadence ramps up as bands increase. */
export const FROGGER_CAR_SPAWN_INTERVAL_START_SEC = 6.4;
export const FROGGER_CAR_SPAWN_INTERVAL_END_SEC = 2.8;
export const FROGGER_CAR_SPAWN_RAMP_BANDS = 58;
export const FROGGER_CAR_SPEED_MIN = 50;
export const FROGGER_CAR_SPEED_MAX = 130;
export const FROGGER_FAST_CAR_AFTER_BANDS = 8;
export const FROGGER_FAST_CAR_CHANCE = 0.12;
export const FROGGER_FAST_CAR_MULT = 2.35;

/** Water: seconds between spawn attempts at lane edge (regular cadence). */
export const FROGGER_PLATFORM_SPAWN_INTERVAL_SEC = 3;
/** Nominal gap between platform centers when seeding a new water row. */
export const FROGGER_PLATFORM_GAP = 56;
export const FROGGER_LILY_W = 24;
export const FROGGER_LOG_W_MIN = 60;
export const FROGGER_LOG_W_MAX = 140;
export const FROGGER_PLATFORM_SPEED_MIN = 35;
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
  if (bandsGenerated < 20) {
    // Early game: bias toward grass to give players time to spread out.
    return Math.random() < 0.7 ? "grass" : "street";
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

export function froggerCarSpawnIntervalSec(bandsGenerated: number): number {
  const t = Math.max(0, Math.min(1, bandsGenerated / Math.max(1, FROGGER_CAR_SPAWN_RAMP_BANDS)));
  return FROGGER_CAR_SPAWN_INTERVAL_START_SEC + t * (FROGGER_CAR_SPAWN_INTERVAL_END_SEC - FROGGER_CAR_SPAWN_INTERVAL_START_SEC);
}
