import { WORLD_H, WORLD_W } from "./constants.js";
/** Opening balls placed at center each round. */
export const DODGEBALL_BALL_COUNT = 6;
/** Seconds before play after team summary / round reset. */
export const DODGEBALL_KICKOFF_COUNTDOWN_SEC = 3;
export const DODGEBALL_PLAYER_R = 16;
export const DODGEBALL_BALL_R = 9;
export const DODGEBALL_MAX_PLAYER_SPEED = 210;
/** Court band (between sidelines). */
export const DODGEBALL_COURT_MARGIN_Y = 36;
export const DODGEBALL_COURT_MARGIN_X = 48;
export const DODGEBALL_COURT_X0 = DODGEBALL_COURT_MARGIN_X;
export const DODGEBALL_COURT_X1 = WORLD_W - DODGEBALL_COURT_MARGIN_X;
export const DODGEBALL_COURT_Y0 = DODGEBALL_COURT_MARGIN_Y;
export const DODGEBALL_COURT_Y1 = WORLD_H - DODGEBALL_COURT_MARGIN_Y;
/** Center line; players stay on their own half. */
export const DODGEBALL_MID_X = WORLD_W * 0.5;
/** Loose ball speed after a throw (world units/sec). */
export const DODGEBALL_THROW_SPEED = 1040;
/** Thrown ball stays "live" (team-colored) for this long — hits and catches count. */
export const DODGEBALL_LIVE_THROW_SEC = 0.65;
/** Live throws steer toward the nearest opponent at this rate (1/sec, subtle curve). */
export const DODGEBALL_THROW_HOMING_RATE = 2.5;
/** Release direction blend toward nearest opponent (0 = pure input, 1 = full homing). */
export const DODGEBALL_THROW_RELEASE_AIM = 0.1;
/** Catch stance duration; movement disabled, loose balls stick on contact. */
export const DODGEBALL_CATCH_SEC = 0.42;
export const DODGEBALL_BALL_DRAG = 1.4;
export const DODGEBALL_WALL_RESTITUTION = 0.55;
/** First team to this many round wins takes the match (overridable in game settings). */
export const DODGEBALL_ROUNDS_TO_WIN = 3;
/** Mallet-style crowding separation on the same half. */
export const DODGEBALL_PLAYER_BOUNCE_ITERS = 2;
export const DODGEBALL_PLAYER_BOUNCE_STRENGTH = 0.48;
/** Small jitter when spawning center balls so they don't perfectly overlap. */
export const DODGEBALL_CENTER_BALL_JITTER = 28;
