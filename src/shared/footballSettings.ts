import { WORLD_H, WORLD_W } from "./constants.js";

/** Match duration (seconds). */
export const FOOTBALL_PERIOD_SEC = 300;
/** After timer hits 0, next tackle or touchdown ends the game (tick countdown on server). */
export const FOOTBALL_TD_TO_WIN = 3;
/** Teammates cannot recover ball after tackle for this many seconds. */
export const FOOTBALL_TACKLE_PICKUP_LOCK_SEC = 2;
/** Tackling team cannot recover the loose ball for this many seconds (fair contest window). */
export const FOOTBALL_OPPONENT_TACKLE_PICKUP_LOCK_SEC = 0.5;
/** Seconds before gameplay after team summary. */
export const FOOTBALL_KICKOFF_COUNTDOWN_SEC = 3;

export const FOOTBALL_PLAYER_R = 14;
export const FOOTBALL_BALL_R = 8;
export const FOOTBALL_MAX_PLAYER_SPEED = 200;

/** Field band (between sidelines), full world width with vertical margin. */
export const FOOTBALL_FIELD_MARGIN_Y = 40;
export const FOOTBALL_FIELD_X0 = 0;
export const FOOTBALL_FIELD_X1 = WORLD_W;
export const FOOTBALL_FIELD_Y0 = FOOTBALL_FIELD_MARGIN_Y;
export const FOOTBALL_FIELD_Y1 = WORLD_H - FOOTBALL_FIELD_MARGIN_Y;

/** End zone width (world x). Red attacks +x; red EZ left, blue EZ right. */
export const FOOTBALL_ENDZONE_W = 72;

/** Red scores by carrying into x >= this (blue endzone interior start). */
export const FOOTBALL_BLUE_EZ_X0 = WORLD_W - FOOTBALL_ENDZONE_W;
/** Blue scores by carrying into x < this (red endzone interior end). */
export const FOOTBALL_RED_EZ_X1 = FOOTBALL_ENDZONE_W;

/** Live ball must stay in this x band (between endzones, exclusive of scoring strips). */
export const FOOTBALL_LIVE_BALL_X0 = FOOTBALL_RED_EZ_X1;
export const FOOTBALL_LIVE_BALL_X1 = FOOTBALL_BLUE_EZ_X0;

/**
 * Kickoff spawn X: inset from each end zone's inner edge toward midfield (same value both sides).
 * Keeps |x − midfield| equal for both teams when paired with mirrored lateral stagger.
 */
export const FOOTBALL_KICKOFF_X_INSET = 4;

export const FOOTBALL_KICKOFF_BALL_JITTER = 55;

/** Loose ball speed after a pass (world units/sec). */
export const FOOTBALL_PASS_SPEED = 380;
/** Passer's teammates can't scoop immediately (same mechanism as tackle mate lock). */
export const FOOTBALL_PASS_TEAMMATE_LOCK_SEC = 0.35;
/** After a pass, no player may pick up until this elapses (everyone frozen). */
export const FOOTBALL_POST_PASS_GLOBAL_PICKUP_LOCK_SEC = 0.1;

/** After a TD, loose ball sits this fraction of midfield→near-hash toward the receiving team (+x = blue). */
export const FOOTBALL_POST_TD_BALL_FRAC_FROM_MID = 0.72;

/** Non-carrier bounce contact: input speed multiplier until recovered (extra friction feel). */
export const FOOTBALL_PLAYER_BOUNCE_CONTACT_SPEED_MUL = 0.12;
/** Per second, bounce friction multiplier eases back toward 1. */
export const FOOTBALL_PLAYER_BOUNCE_RECOVERY_PER_SEC = 3;
