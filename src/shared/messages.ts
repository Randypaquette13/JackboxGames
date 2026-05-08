/**
 * JSON WebSocket messages (orchestration + host/controller state).
 * Binary join/input/ping stays in protocol.ts.
 */

// Note: binary `PlayerSnapshot` is intentionally not used for lobby/host UI JSON.

export type LobbyPlayerJson = {
  playerId: number;
  name: string;
  /** HSL hue 0–359; chosen at join to be visually distinct from other players in the room. */
  hue: number;
  x: number;
  y: number;
};

export type PrejoinResumablePlayerJson = {
  playerId: number;
  name: string;
  hue: number;
  /** Seconds remaining before this player is removed (optional; can be omitted for persistent rejoin). */
  secondsLeft?: number;
};

export type GamePhase =
  | "lobby"
  | "menu"
  | "stub"
  | "kart"
  | "kart_paused"
  | "kart_results"
  | "race_walk"
  | "race_walk_paused"
  | "race_walk_results"
  | "frogger"
  | "frogger_paused"
  | "frogger_results";

export const MINIGAME_IDS = ["kart", "race_walk", "frogger"] as const;
export type MinigameId = (typeof MINIGAME_IDS)[number];

export const MINIGAME_LABELS: Record<MinigameId, string> = {
  kart: "Kart Racing",
  race_walk: "Race Walk",
  frogger: "Frogger",
};

export type RaceWalkRunnerJson = {
  lane: number;
  x: number;
  downed: boolean;
  controllerId: number | null;
};

export type RaceWalkCrosshairJson = {
  playerId: number;
  /** HSL hue 0–359 (same as lobby / kart for this player). */
  hue: number;
  lane: number;
  ammo: number;
  /** false when out of ammo or after this player has been eliminated */
  active: boolean;
};

export type RaceWalkBannerJson = {
  text: string;
  untilTick: number;
};

export type FroggerObstacleJson = { x: number; y: number; w: number; h: number };

export type FroggerCarJson = {
  x: number;
  y: number;
  w: number;
  h: number;
  fast: boolean;
};

export type FroggerPlatformJson = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "lily" | "log";
};

export type FroggerBandJson =
  | { kind: "grass"; y0: number; h: number; obstacles: FroggerObstacleJson[] }
  | { kind: "street"; y0: number; h: number; dir: 1 | -1; cars: FroggerCarJson[] }
  | { kind: "water"; y0: number; h: number; dir: 1 | -1; platforms: FroggerPlatformJson[] };

export type FroggerFrogHostJson = {
  playerId: number;
  name: string;
  hue: number;
  x: number;
  y: number;
  alive: boolean;
  /** Best distance (m) reached this round. */
  distance: number;
};

/** Client → server (controller or dev; some allowed from host in dev only — server validates). */
export type ClientIntent =
  | { type: "all_ready" }
  | { type: "prejoin_create"; name: string; hue: number }
  | { type: "prejoin_claim"; playerId: number }
  | { type: "menu_nav"; dir: "up" | "down" }
  | { type: "menu_confirm" }
  | { type: "menu_add_players" }
  | { type: "menu_game_settings" }
  | { type: "settings_close" }
  | { type: "game_settings_patch"; patch: Record<string, unknown> }
  | { type: "stub_back" }
  | { type: "kart_results"; action: "play_again" | "minigame_menu" | "add_controllers" }
  | { type: "race_walk_results"; action: "play_again" | "minigame_menu" | "add_controllers" }
  | { type: "frogger_results"; action: "play_again" | "minigame_menu" | "add_controllers" }
  | { type: "pause_resume" }
  | { type: "pause_to_menu" };

export type KartCarState = {
  playerId: number;
  name: string;
  /** HSL hue 0–359 */
  hue: number;
  x: number;
  y: number;
  /** Heading radians; +x = 0, +y = π/2 (y-down) */
  angle: number;
  laps: number;
};

export type HostStateJson = {
  type: "host_state";
  phase: GamePhase;
  tick: number;
  roomId: string;
  reconnectingPlayers: { playerId: number; secondsLeft: number }[];
  showQr: boolean;
  lobbyPlayers: LobbyPlayerJson[];
  menuIndex: number;
  menuItems: { id: MinigameId; label: string }[];
  settingsOpen: boolean;
  gameSettings: Record<string, unknown>;
  stubId: MinigameId | null;
  kart: null | {
    countdown: number | null;
    paused: boolean;
    pausedByPlayerId: number | null;
    /** Grass islands (infield) — each closed polygon */
    innerIslands: { x: number; y: number }[][];
    outerWall: { x: number; y: number }[];
    /** Figure-8 crossing: bridge deck quad (UL–LR); underpass is the same vertices in reverse winding */
    bridgePolygon: { x: number; y: number }[];
    underpassPolygon: { x: number; y: number }[];
    finishLine: { a: { x: number; y: number }; b: { x: number; y: number } };
    cars: KartCarState[];
    winnerId: number | null;
    /** Cumulative race wins per playerId in this room */
    seriesWins: Record<number, number>;
  };
  raceWalk: null | {
    countdown: number | null;
    startX: number;
    finishX: number;
    worldW: number;
    worldH: number;
    runners: RaceWalkRunnerJson[];
    crosshairs: RaceWalkCrosshairJson[];
    banners: RaceWalkBannerJson[];
    winnerLane: number | null;
    winnerPlayerId: number | null;
    seriesWins: Record<number, number>;
    paused: boolean;
    pausedByPlayerId: number | null;
  };
  frogger: null | {
    countdown: number | null;
    scroll: number;
    scrollSpeed: number;
    bands: FroggerBandJson[];
    frogs: FroggerFrogHostJson[];
    winnerId: number | null;
    seriesWins: Record<number, number>;
    paused: boolean;
    pausedByPlayerId: number | null;
    banners: RaceWalkBannerJson[];
  };
};

export type ControllerStateJson = {
  type: "controller_state";
  /** Authoritative tick (for timed UI like Frogger death notice). */
  tick: number;
  phase: GamePhase;
  /** 0 when not yet joined as a player (pre-join menu). */
  playerId: number;
  prejoin?: {
    suggestedName: string;
    suggestedHue: number;
    resumablePlayers: PrejoinResumablePlayerJson[];
  };
  menuIndex: number;
  menuItems: { id: MinigameId; label: string }[];
  settingsOpen: boolean;
  gameSettings: Record<string, unknown>;
  stubId: MinigameId | null;
  kart: null | {
    paused: boolean;
    laps: Record<number, number>;
    winnerId: number | null;
    seriesWins: Record<number, number>;
  };
  raceWalk: null | {
    assignedLane: number | null;
    runnerDowned: boolean;
    crosshairLane: number;
    ammo: number;
    crosshairActive: boolean;
    seriesWins: Record<number, number>;
    paused: boolean;
  };
  frogger: null | {
    alive: boolean;
    distance: number;
    deathNotice?: { text: string; untilTick: number };
    seriesWins: Record<number, number>;
    paused: boolean;
  };
};

export function parseClientIntent(raw: unknown): ClientIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = o.type;
  if (t === "all_ready") return { type: "all_ready" };
  if (t === "prejoin_create") {
    const name = typeof o.name === "string" ? o.name : "";
    const hue = typeof o.hue === "number" ? o.hue : NaN;
    if (!Number.isFinite(hue)) return null;
    return { type: "prejoin_create", name, hue };
  }
  if (t === "prejoin_claim") {
    const pid = o.playerId;
    if (typeof pid === "number" && Number.isFinite(pid) && pid > 0) {
      return { type: "prejoin_claim", playerId: pid | 0 };
    }
  }
  if (t === "menu_nav" && (o.dir === "up" || o.dir === "down")) return { type: "menu_nav", dir: o.dir };
  if (t === "menu_confirm") return { type: "menu_confirm" };
  if (t === "menu_add_players") return { type: "menu_add_players" };
  if (t === "menu_game_settings") return { type: "menu_game_settings" };
  if (t === "settings_close") return { type: "settings_close" };
  if (t === "game_settings_patch") {
    const patch = o.patch;
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      return { type: "game_settings_patch", patch: patch as Record<string, unknown> };
    }
  }
  if (t === "stub_back") return { type: "stub_back" };
  if (t === "kart_results") {
    const a = o.action;
    if (a === "play_again" || a === "minigame_menu" || a === "add_controllers") {
      return { type: "kart_results", action: a };
    }
  }
  if (t === "race_walk_results") {
    const a = o.action;
    if (a === "play_again" || a === "minigame_menu" || a === "add_controllers") {
      return { type: "race_walk_results", action: a };
    }
  }
  if (t === "frogger_results") {
    const a = o.action;
    if (a === "play_again" || a === "minigame_menu" || a === "add_controllers") {
      return { type: "frogger_results", action: a };
    }
  }
  if (t === "pause_resume") return { type: "pause_resume" };
  if (t === "pause_to_menu") return { type: "pause_to_menu" };
  return null;
}
