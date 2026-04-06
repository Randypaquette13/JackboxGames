import { GRAVITY, JUMP_V, MAX_RUN_SPEED, MOVE_ACCEL, PLAYER_H, PLAYER_W, TICK_DT, WORLD_H, WORLD_W, } from "../src/shared/constants.js";
import { PLATFORMS } from "../src/shared/level.js";
export const DEFAULT_PLATFORMS = PLATFORMS;
const BTN_JUMP = 1 << 0;
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
export function createPlayer(id, spawnX, spawnY) {
    return {
        id,
        x: spawnX,
        y: spawnY,
        vx: 0,
        vy: 0,
        grounded: false,
        prevJumpHeld: false,
        input: { h: 0, buttons: 0, seq: 0 },
    };
}
export function stepPlayer(p, platforms) {
    const hNorm = clamp(p.input.h / 127, -1, 1);
    const targetVx = hNorm * MAX_RUN_SPEED;
    const dv = MOVE_ACCEL * TICK_DT;
    if (p.vx < targetVx)
        p.vx = Math.min(p.vx + dv, targetVx);
    else if (p.vx > targetVx)
        p.vx = Math.max(p.vx - dv, targetVx);
    const jumpHeld = (p.input.buttons & BTN_JUMP) !== 0;
    const jumpPressed = jumpHeld && !p.prevJumpHeld;
    p.prevJumpHeld = jumpHeld;
    if (jumpPressed && p.grounded) {
        p.vy = -JUMP_V;
        p.grounded = false;
    }
    p.vy += GRAVITY * TICK_DT;
    p.grounded = false;
    let nx = clamp(p.x + p.vx * TICK_DT, 0, WORLD_W - PLAYER_W);
    p.x = nx;
    for (const pl of platforms) {
        if (!aabbOverlap(p.x, p.y, PLAYER_W, PLAYER_H, pl.x, pl.y, pl.w, pl.h))
            continue;
        if (p.vx > 0.01)
            p.x = pl.x - PLAYER_W;
        else if (p.vx < -0.01)
            p.x = pl.x + pl.w;
        else if (p.x + PLAYER_W * 0.5 < pl.x + pl.w * 0.5)
            p.x = pl.x - PLAYER_W;
        else
            p.x = pl.x + pl.w;
        p.vx = 0;
    }
    let ny = p.y + p.vy * TICK_DT;
    p.y = ny;
    for (const pl of platforms) {
        if (!aabbOverlap(p.x, p.y, PLAYER_W, PLAYER_H, pl.x, pl.y, pl.w, pl.h))
            continue;
        if (p.vy > 0) {
            p.y = pl.y - PLAYER_H;
            p.vy = 0;
            p.grounded = true;
        }
        else {
            p.y = pl.y + pl.h;
            p.vy = 0;
        }
    }
    if (p.y + PLAYER_H > WORLD_H) {
        p.y = WORLD_H - PLAYER_H;
        p.vy = 0;
        p.grounded = true;
    }
    if (p.y < 0) {
        p.y = 0;
        p.vy = 0;
    }
}
export function snapshot(p) {
    return { id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy };
}
