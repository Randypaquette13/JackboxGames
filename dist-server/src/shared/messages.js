/**
 * JSON WebSocket messages (orchestration + host/controller state).
 * Binary join/input/ping stays in protocol.ts.
 */
export const MINIGAME_IDS = ["kart", "race_walk"];
export const MINIGAME_LABELS = {
    kart: "Kart Racing",
    race_walk: "Race Walk",
};
export function parseClientIntent(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const o = raw;
    const t = o.type;
    if (t === "all_ready")
        return { type: "all_ready" };
    if (t === "menu_nav" && (o.dir === "up" || o.dir === "down"))
        return { type: "menu_nav", dir: o.dir };
    if (t === "menu_confirm")
        return { type: "menu_confirm" };
    if (t === "menu_add_players")
        return { type: "menu_add_players" };
    if (t === "menu_game_settings")
        return { type: "menu_game_settings" };
    if (t === "settings_close")
        return { type: "settings_close" };
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
    if (t === "pause_resume")
        return { type: "pause_resume" };
    if (t === "pause_to_menu")
        return { type: "pause_to_menu" };
    return null;
}
