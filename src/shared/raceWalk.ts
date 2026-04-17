import { WORLD_H, WORLD_W } from "./constants.js";

export const RACE_WALK_LANES = 20;
export const RACE_WALK_MARGIN = 20;
export const RACE_WALK_START_X = 52;
export const RACE_WALK_FINISH_X = WORLD_W - 44;

export function raceWalkLaneCenterY(lane: number): number {
  const pitch = (WORLD_H - 2 * RACE_WALK_MARGIN) / RACE_WALK_LANES;
  return RACE_WALK_MARGIN + (lane + 0.5) * pitch;
}

export function raceWalkLanePitch(): number {
  return (WORLD_H - 2 * RACE_WALK_MARGIN) / RACE_WALK_LANES;
}
