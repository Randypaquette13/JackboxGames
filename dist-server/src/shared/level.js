import { WORLD_H, WORLD_W } from "./constants.js";
/** Must match `DEFAULT_PLATFORMS` on the server. */
export const PLATFORMS = [
    { x: 0, y: WORLD_H - 40, w: WORLD_W, h: 40 },
    { x: 120, y: 380, w: 180, h: 24 },
    { x: 420, y: 300, w: 200, h: 24 },
    { x: 700, y: 360, w: 160, h: 24 },
    { x: 260, y: 220, w: 140, h: 24 },
];
