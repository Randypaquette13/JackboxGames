/**
 * JSON WebSocket messages (orchestration + host/controller state).
 * Binary join/input/ping stays in protocol.ts.
 */
export const MINIGAME_IDS = ["kart", "race_walk", "frogger", "football"];
export const MINIGAME_LABELS = {
    kart: "Kart Racing",
    race_walk: "Race Walk",
    frogger: "Frogger",
    football: "Football",
};
export function parseClientIntent(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const o = raw;
    const t = o.type;
    if (t === "all_ready")
        return { type: "all_ready" };
    if (t === "prejoin_create") {
        const name = typeof o.name === "string" ? o.name : "";
        const hue = typeof o.hue === "number" ? o.hue : NaN;
        if (!Number.isFinite(hue))
            return null;
        return { type: "prejoin_create", name, hue };
    }
    if (t === "prejoin_claim") {
        const pid = o.playerId;
        if (typeof pid === "number" && Number.isFinite(pid) && pid > 0) {
            return { type: "prejoin_claim", playerId: pid | 0 };
        }
    }
    if (t === "menu_nav" && (o.dir === "up" || o.dir === "down"))
        return { type: "menu_nav", dir: o.dir };
    if (t === "menu_confirm")
        return { type: "menu_confirm" };
    if (t === "menu_help_open")
        return { type: "menu_help_open" };
    if (t === "menu_help_close")
        return { type: "menu_help_close" };
    if (t === "menu_add_players")
        return { type: "menu_add_players" };
    if (t === "menu_game_settings")
        return { type: "menu_game_settings" };
    if (t === "settings_close")
        return { type: "settings_close" };
    if (t === "game_settings_patch") {
        const patch = o.patch;
        if (patch && typeof patch === "object" && !Array.isArray(patch)) {
            return { type: "game_settings_patch", patch: patch };
        }
    }
    if (t === "stub_back")
        return { type: "stub_back" };
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
    if (t === "football_results") {
        const a = o.action;
        if (a === "play_again" || a === "minigame_menu" || a === "add_controllers") {
            return { type: "football_results", action: a };
        }
    }
    if (t === "football_pick_team") {
        const tm = o.team;
        if (tm === "red" || tm === "blue")
            return { type: "football_pick_team", team: tm };
    }
    if (t === "football_start")
        return { type: "football_start" };
    if (t === "pause_resume")
        return { type: "pause_resume" };
    if (t === "pause_to_menu")
        return { type: "pause_to_menu" };
    return null;
}
