import { WORLD_H, WORLD_W } from "./constants.js";

export const RACE_WALK_LANES = 20;
export const RACE_WALK_MARGIN = 20;
export const RACE_WALK_START_X = 52;
export const RACE_WALK_FINISH_X = WORLD_W - 44;

/** px/s — players (walk / run buttons). */
export const RACE_WALK_WALK_SPEED = 32;
export const RACE_WALK_RUN_SPEED = 82;
export const RACE_WALK_NPC_RUN_SPEED = 82;

/** NPC idle between walk bursts: timer = MIN + random * RANDOM (seconds). */
export const RACE_WALK_NPC_STOP_DURATION_MIN = 0.2;
export const RACE_WALK_NPC_STOP_DURATION_RANDOM = 8.8;

/** NPC walk burst length before pausing: MIN + random * RANDOM (seconds). */
export const RACE_WALK_NPC_WALK_BURST_MIN = 0.22;
export const RACE_WALK_NPC_WALK_BURST_RANDOM = 3.65;

export function raceWalkLaneCenterY(lane: number): number {
  const pitch = (WORLD_H - 2 * RACE_WALK_MARGIN) / RACE_WALK_LANES;
  return RACE_WALK_MARGIN + (lane + 0.5) * pitch;
}

export function raceWalkLanePitch(): number {
  return (WORLD_H - 2 * RACE_WALK_MARGIN) / RACE_WALK_LANES;
}
