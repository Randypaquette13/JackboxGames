import { WORLD_H, WORLD_W } from "./constants.js";
/** Match duration (seconds). Clock runs alongside the goals-to-win cap. */
export const AIR_HOCKEY_PERIOD_SEC = 300;
/** First team to this many goals wins (also configurable in Game settings). */
export const AIR_HOCKEY_GOALS_TO_WIN = 5;
/** Seconds before play resumes after a goal / opening face-off. */
export const AIR_HOCKEY_KICKOFF_COUNTDOWN_SEC = 3;
export const AIR_HOCKEY_PLAYER_R = 18;
export const AIR_HOCKEY_PUCK_R = 11;
export const AIR_HOCKEY_MAX_PLAYER_SPEED = 220;
/** Rink band: inset from the world edges so the goals/nets are visible behind each end wall. */
export const AIR_HOCKEY_RINK_MARGIN_Y = 36;
/** Horizontal inset that leaves space outside the end walls to draw the goal cages. */
export const AIR_HOCKEY_RINK_MARGIN_X = 64;
export const AIR_HOCKEY_RINK_X0 = AIR_HOCKEY_RINK_MARGIN_X;
export const AIR_HOCKEY_RINK_X1 = WORLD_W - AIR_HOCKEY_RINK_MARGIN_X;
export const AIR_HOCKEY_RINK_Y0 = AIR_HOCKEY_RINK_MARGIN_Y;
export const AIR_HOCKEY_RINK_Y1 = WORLD_H - AIR_HOCKEY_RINK_MARGIN_Y;
/** Corner rounding radius for the rink boards. */
export const AIR_HOCKEY_RINK_CORNER_R = 46;
/** Mid-rink line; mallets are locked to their own half of this. */
export const AIR_HOCKEY_MID_X = WORLD_W * 0.5;
/** Goal mouth height as a fraction of the playable rink height (centered vertically). */
export const AIR_HOCKEY_GOAL_MOUTH_FRAC = 0.42;
/**
 * Puck velocity decays by this multiplier per second (mild air-hockey glide).
 * Applied as `v *= max(0, 1 - DRAG * dt)`.
 */
export const AIR_HOCKEY_PUCK_DRAG = 0.22;
/** Restitution when the puck bounces off a wall (1 = perfectly elastic). */
export const AIR_HOCKEY_WALL_RESTITUTION = 0.96;
/** Restitution when the puck bounces off a mallet. */
export const AIR_HOCKEY_MALLET_RESTITUTION = 1.05;
/** Base fraction of mallet input velocity transferred to the puck on contact. */
export const AIR_HOCKEY_MALLET_VELOCITY_TRANSFER = 1.45;
/** Added to transfer for each mallet strike in the current rally (resets on goal). */
export const AIR_HOCKEY_MALLET_VELOCITY_TRANSFER_STEP = 0.1;
/** Cap for the ramped transfer multiplier within a rally. */
export const AIR_HOCKEY_MALLET_VELOCITY_TRANSFER_MAX = 2.5;
/** Minimum puck speed kept after a face-off jitter (world units/sec). */
export const AIR_HOCKEY_FACEOFF_JITTER = 90;
/** Clamp puck speed so a hard hit can't tunnel through walls in one tick. */
export const AIR_HOCKEY_PUCK_MAX_SPEED = 980;
/** Mallet-mallet soft separation (same-side crowding). */
export const AIR_HOCKEY_PLAYER_BOUNCE_ITERS = 2;
export const AIR_HOCKEY_PLAYER_BOUNCE_STRENGTH = 0.5;
