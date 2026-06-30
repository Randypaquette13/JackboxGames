/**
 * JSON WebSocket messages (orchestration + host/controller state).
 * Binary join/input/ping stays in protocol.ts.
 */
export const MINIGAME_IDS = ["kart", "race_walk", "frogger", "football", "air_hockey", "bomberman", "pacman"];
export const MINIGAME_LABELS = {
    kart: "Kart Racing",
    race_walk: "Race Walk",
    frogger: "Frogger",
    football: "Football",
    air_hockey: "Air Hockey",
    bomberman: "Bomberman",
    pacman: "Pac-Man",
};
/** Display metadata for minigame select menus (controller + host). */
export const MINIGAME_META = {
    kart: { icon: "🏎️", accent: "#ff6b4a" },
    race_walk: { icon: "🎯", accent: "#6bcbff" },
    frogger: { icon: "🐸", accent: "#5ee06a" },
    football: { icon: "🏈", accent: "#c87840" },
    air_hockey: { icon: "🏒", accent: "#58a8ff" },
    bomberman: { icon: "💣", accent: "#ff8844" },
    pacman: { icon: "👻", accent: "#ffe14a" },
};
/** One-line pitch shown under each game on the minigame select menu. */
export const MINIGAME_TAGLINE = {
    kart: "Race two laps — boost past your rivals",
    race_walk: "Blend in, find your runner, snipe the rest",
    frogger: "Hop across traffic and rivers — go the distance",
    football: "Pick a team, carry the ball to the end zone",
    air_hockey: "Slide your mallet and bury the puck",
    bomberman: "Drop bombs, dodge blasts, be the last alive",
    pacman: "Team up to clear every pellet in the maze",
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
    if (t === "menu_select") {
        const index = o.index;
        if (typeof index === "number" && Number.isFinite(index) && index >= 0) {
            return { type: "menu_select", index: index | 0 };
        }
    }
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
    if (t === "bomberman_results") {
        const a = o.action;
        if (a === "play_again" || a === "minigame_menu" || a === "add_controllers") {
            return { type: "bomberman_results", action: a };
        }
    }
    if (t === "pacman_results") {
        const a = o.action;
        if (a === "play_again" || a === "minigame_menu" || a === "add_controllers") {
            return { type: "pacman_results", action: a };
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
    if (t === "team_select_back")
        return { type: "team_select_back" };
    if (t === "air_hockey_results") {
        const a = o.action;
        if (a === "play_again" || a === "minigame_menu" || a === "add_controllers") {
            return { type: "air_hockey_results", action: a };
        }
    }
    if (t === "air_hockey_pick_team") {
        const tm = o.team;
        if (tm === "red" || tm === "blue")
            return { type: "air_hockey_pick_team", team: tm };
    }
    if (t === "air_hockey_start")
        return { type: "air_hockey_start" };
    if (t === "pause_resume")
        return { type: "pause_resume" };
    if (t === "pause_to_menu")
        return { type: "pause_to_menu" };
    return null;
}
