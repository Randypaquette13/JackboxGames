import { WORLD_H, WORLD_W } from "./constants.js";

export type Platform = { x: number; y: number; w: number; h: number };

/** Must match `DEFAULT_PLATFORMS` on the server. */
export const PLATFORMS: Platform[] = [
  { x: 0, y: WORLD_H - 40, w: WORLD_W, h: 40 },
  { x: 120, y: 420, w: 180, h: 24 },
  { x: 420, y: 340, w: 200, h: 24 },
  { x: 700, y: 400, w: 160, h: 24 },
  { x: 260, y: 280, w: 140, h: 24 },
];
