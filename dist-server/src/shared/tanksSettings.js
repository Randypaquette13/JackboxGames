import { WORLD_H, WORLD_W } from "./constants.js";
/** Battlefield band (between sidelines). */
export const TANKS_FIELD_MARGIN_Y = 48;
export const TANKS_FIELD_MARGIN_X = 40;
export const TANKS_FIELD_X0 = TANKS_FIELD_MARGIN_X;
export const TANKS_FIELD_X1 = WORLD_W - TANKS_FIELD_MARGIN_X;
export const TANKS_FIELD_Y0 = TANKS_FIELD_MARGIN_Y;
export const TANKS_FIELD_Y1 = WORLD_H - TANKS_FIELD_MARGIN_Y;
/** Center line — tanks stay on their own half. */
export const TANKS_MID_X = WORLD_W * 0.5;
export const TANKS_BODY_W = 44;
export const TANKS_BODY_H = 24;
export const TANKS_BARREL_LEN = 28;
export const TANKS_HIT_RADIUS = 22;
/** Seconds before play after team summary / round reset. */
export const TANKS_KICKOFF_COUNTDOWN_SEC = 3;
/** First team to this many round wins takes the match. */
export const TANKS_ROUNDS_TO_WIN = 3;
/** Projectile physics. */
export const TANKS_GRAVITY = 520;
export const TANKS_MAX_VELOCITY = 680;
export const TANKS_MIN_POWER = 0.22;
export const TANKS_MAX_POWER = 1;
/** Default launch angle (radians; y-down, +x = right). */
export const TANKS_RED_DEFAULT_ANGLE = -0.55;
export const TANKS_BLUE_DEFAULT_ANGLE = Math.PI + 0.55;
/** Allowed elevation/depression from horizontal (radians). */
export const TANKS_MAX_ELEVATION = 1.15;
export const TANKS_MAX_DEPRESSION = 0.35;
/** Aim / power adjustment rates while buttons are held. */
export const TANKS_ANGLE_RATE = 1.4;
export const TANKS_POWER_RATE = 0.85;
/** Blast radius on impact (direct hit or ground splash). */
export const TANKS_BLAST_RADIUS = 36;
/** Brief explosion flash on host (seconds). */
export const TANKS_EXPLOSION_SEC = 0.55;
/** Seconds each player has to aim before auto-fire at current settings. */
export const TANKS_TURN_SEC = 25;
