/**
 * JSON WebSocket messages (orchestration + host/controller state).
 * Binary join/input/ping stays in protocol.ts.
 */

import type { PlayerSnapshot } from "./protocol.js";

export type GamePhase = "lobby" | "menu" | "stub" | "kart" | "kart_paused" | "kart_results";

export const MINIGAME_IDS = ["kart", "stub2", "stub3"] as const;
export type MinigameId = (typeof MINIGAME_IDS)[number];

export const MINIGAME_LABELS: Record<MinigameId, string> = {
  kart: "Kart Racing",
  stub2: "minigame2",
  stub3: "minigame3",
};

/** Client → server (controller or dev; some allowed from host in dev only — server validates). */
export type ClientIntent =
  | { type: "all_ready" }
  | { type: "menu_nav"; dir: "up" | "down" }
  | { type: "menu_confirm" }
  | { type: "menu_add_players" }
  | { type: "menu_game_settings" }
  | { type: "settings_close" }
  | { type: "stub_back" }
  | { type: "kart_results"; action: "play_again" | "minigame_menu" | "add_controllers" }
  | { type: "pause_resume" }
  | { type: "pause_to_menu" };

export type KartCarState = {
  playerId: number;
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
  showQr: boolean;
  lobbyPlayers: PlayerSnapshot[];
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
};

export type ControllerStateJson = {
  type: "controller_state";
  phase: GamePhase;
  playerId: number;
  menuIndex: number;
  menuItems: { id: MinigameId; label: string }[];
  settingsOpen: boolean;
  stubId: MinigameId | null;
  kart: null | {
    paused: boolean;
    laps: Record<number, number>;
    winnerId: number | null;
    seriesWins: Record<number, number>;
  };
};

export function parseClientIntent(raw: unknown): ClientIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = o.type;
  if (t === "all_ready") return { type: "all_ready" };
  if (t === "menu_nav" && (o.dir === "up" || o.dir === "down")) return { type: "menu_nav", dir: o.dir };
  if (t === "menu_confirm") return { type: "menu_confirm" };
  if (t === "menu_add_players") return { type: "menu_add_players" };
  if (t === "menu_game_settings") return { type: "menu_game_settings" };
  if (t === "settings_close") return { type: "settings_close" };
  if (t === "stub_back") return { type: "stub_back" };
  if (t === "kart_results") {
    const a = o.action;
    if (a === "play_again" || a === "minigame_menu" || a === "add_controllers") {
      return { type: "kart_results", action: a };
    }
  }
  if (t === "pause_resume") return { type: "pause_resume" };
  if (t === "pause_to_menu") return { type: "pause_to_menu" };
  return null;
}
