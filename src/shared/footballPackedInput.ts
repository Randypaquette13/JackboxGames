/** Packed into input byte (uint8): 6-bit direction CCW from +x, 2-bit magnitude tier. */

export const FOOTBALL_MAG_TIERS = 4 as const;
export const FOOTBALL_DIR_STEPS = 64 as const;

/** Speed multipliers per mag tier: stop, walk, run, full. */
export const FOOTBALL_MAG_SPEED_FRAC = [0, 1 / 3, 2 / 3, 1] as const;

/**
 * Normalized stick length (0–1 from knob center) — must match controller SVG rings and knob clamp
 * (`FOOTBALL_JOYSTICK_SURFACE_FRAC` of puck radius).
 * Tiny dead zone; walk/run use equal radial thickness; everything outside run is full sprint.
 */
export const FOOTBALL_JOYSTICK_LEN_DEADZONE = 0.02;

/** Radial thickness of walk tier and of run tier (identical so both bands feel the same size). */
export const FOOTBALL_JOYSTICK_SPEED_BAND = 0.15;

/** Outer edge of walk tier (speed ×⅓). Inner edge is effectively right outside dead zone. */
export const FOOTBALL_JOYSTICK_LEN_WALK_END =
  FOOTBALL_JOYSTICK_LEN_DEADZONE + FOOTBALL_JOYSTICK_SPEED_BAND;

/** Outer edge of run tier (speed ×⅔). Beyond this → full speed until physical rim. */
export const FOOTBALL_JOYSTICK_LEN_RUN_END =
  FOOTBALL_JOYSTICK_LEN_DEADZONE + 2 * FOOTBALL_JOYSTICK_SPEED_BAND;

/** Fraction of half the joystick puck size used as stick length 1 (physics + rings + knob travel). */
export const FOOTBALL_JOYSTICK_SURFACE_FRAC = 0.62;

export function packFootballAxis(dir: number, mag: number): number {
  const d = ((dir | 0) % FOOTBALL_DIR_STEPS) + (dir < 0 ? FOOTBALL_DIR_STEPS : 0);
  const normalizedDir = ((d % FOOTBALL_DIR_STEPS) + FOOTBALL_DIR_STEPS) % FOOTBALL_DIR_STEPS;
  const m = Math.max(0, Math.min(3, mag | 0));
  return (m << 6) | normalizedDir;
}

export function unpackFootballAxis(u8: number): { dir: number; mag: number } {
  const byte = u8 & 0xff;
  const dir = byte & 63;
  const mag = byte >> 6;
  return { dir, mag };
}

/** Heading angle radians: 0 = +x, CCW increases (matches kart: +y is down ⇒ sin grows downward). */
export function footballDirToAngle(dir: number): number {
  const d = ((dir % FOOTBALL_DIR_STEPS) + FOOTBALL_DIR_STEPS) % FOOTBALL_DIR_STEPS;
  return (d / FOOTBALL_DIR_STEPS) * Math.PI * 2;
}

export function joystickToPackedFootballAxis(jx: number, jy: number): number {
  const len = Math.hypot(jx, jy);
  if (len < FOOTBALL_JOYSTICK_LEN_DEADZONE) return packFootballAxis(0, 0);
  const angle = Math.atan2(jy, jx);
  let step = Math.round(angle / ((Math.PI * 2) / FOOTBALL_DIR_STEPS));
  step = ((step % FOOTBALL_DIR_STEPS) + FOOTBALL_DIR_STEPS) % FOOTBALL_DIR_STEPS;
  let mag = 3;
  if (len < FOOTBALL_JOYSTICK_LEN_WALK_END) mag = 1;
  else if (len < FOOTBALL_JOYSTICK_LEN_RUN_END) mag = 2;
  return packFootballAxis(step, mag);
}

export function packedAxisToVelocity(u8: number, maxSpeed: number): { vx: number; vy: number } {
  const { dir, mag } = unpackFootballAxis(u8);
  const frac = FOOTBALL_MAG_SPEED_FRAC[mag] ?? 0;
  if (frac <= 0) return { vx: 0, vy: 0 };
  const th = footballDirToAngle(dir);
  const sp = maxSpeed * frac;
  return { vx: Math.cos(th) * sp, vy: Math.sin(th) * sp };
}
