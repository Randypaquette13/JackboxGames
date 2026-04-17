import { MINIGAME_IDS, MINIGAME_LABELS } from "../src/shared/messages.js";
import { chooseCrossingModeByHeading, constrainToCrossingLane, KART_FORWARD_SPEED, KART_SPEED_MIN, KART_SPEED_RECOVER, KART_TURN_SPEED, KART_WALL_IMPACT_FRICTION, KART_WALL_SCRAPE_FRICTION, checkLapCross, clampToRing, finishLineSegment, getBridgePolygon, getInnerIslands, getOuterWall, getUnderpassPolygon, isInsideCrossing, normalIntoTrack, spawnPosition, wallScrapeAndImpact, wallViolated, } from "../src/shared/kartTrack.js";
import { snapshot, stepPlayer } from "./game.js";
export const LAPS_TO_WIN = 3;
export const KART_COUNTDOWN_SEC = 3;
const KART_DRIFT_BASE_GRIP = 6.4;
const KART_DRIFT_TURN_LOSS = 1.2;
export function createRoom(host, platforms) {
    return {
        host,
        controllers: new Map(),
        players: new Map(),
        nextPlayerId: 1,
        tick: 0,
        platforms,
        phase: "lobby",
        showQr: true,
        menuIndex: 0,
        settingsOpen: false,
        gameSettings: {},
        stubId: null,
        kartCountdown: null,
        kartPaused: false,
        kartPausedByPlayerId: null,
        kartCars: new Map(),
        kartWinnerId: null,
        seriesWins: new Map(),
    };
}
function menuItemsList() {
    return MINIGAME_IDS.map((id) => ({ id, label: MINIGAME_LABELS[id] }));
}
export function buildHostState(room, roomId) {
    const lobbyPlayers = [];
    for (const p of room.players.values())
        lobbyPlayers.push(snapshot(p));
    let kart = null;
    if (room.phase === "kart" || room.phase === "kart_paused" || room.phase === "kart_results") {
        const outerWall = getOuterWall().map((p) => ({ x: p.x, y: p.y }));
        const innerIslands = getInnerIslands().map((island) => island.map((p) => ({ x: p.x, y: p.y })));
        const bridgePolygon = getBridgePolygon().map((p) => ({ x: p.x, y: p.y }));
        const underpassPolygon = getUnderpassPolygon().map((p) => ({ x: p.x, y: p.y }));
        const finishLine = finishLineSegment();
        const cars = Array.from(room.kartCars.entries()).map(([playerId, c]) => ({
            playerId,
            x: c.x,
            y: c.y,
            angle: c.angle,
            laps: Math.min(LAPS_TO_WIN, c.laps),
        }));
        kart = {
            countdown: room.kartCountdown,
            paused: room.kartPaused,
            pausedByPlayerId: room.kartPausedByPlayerId,
            innerIslands,
            outerWall,
            bridgePolygon,
            underpassPolygon,
            finishLine: { a: finishLine.a, b: finishLine.b },
            cars,
            winnerId: room.kartWinnerId,
            seriesWins: Object.fromEntries(room.seriesWins),
        };
    }
    return {
        type: "host_state",
        phase: room.phase,
        tick: room.tick,
        roomId,
        showQr: room.showQr,
        lobbyPlayers,
        menuIndex: room.menuIndex,
        menuItems: menuItemsList(),
        settingsOpen: room.settingsOpen,
        gameSettings: { ...room.gameSettings },
        stubId: room.stubId,
        kart,
    };
}
export function buildControllerState(room, playerId) {
    const laps = {};
    for (const [pid, car] of room.kartCars) {
        laps[pid] = Math.min(LAPS_TO_WIN, car.laps);
    }
    return {
        type: "controller_state",
        phase: room.phase,
        playerId,
        menuIndex: room.menuIndex,
        menuItems: menuItemsList(),
        settingsOpen: room.settingsOpen,
        stubId: room.stubId,
        kart: room.phase === "kart" || room.phase === "kart_paused" || room.phase === "kart_results"
            ? {
                paused: room.kartPaused,
                laps,
                winnerId: room.kartWinnerId,
                seriesWins: Object.fromEntries(room.seriesWins),
            }
            : null,
    };
}
export function resetKartRace(room) {
    room.kartWinnerId = null;
    room.kartPaused = false;
    room.kartPausedByPlayerId = null;
    room.kartCountdown = KART_COUNTDOWN_SEC;
    room.kartCars.clear();
    const ids = Array.from(room.players.keys()).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++) {
        const sp = spawnPosition(i);
        room.kartCars.set(ids[i], {
            x: sp.x,
            y: sp.y,
            angle: sp.angle,
            laps: 0,
            speed: KART_FORWARD_SPEED,
            prevPauseHeld: false,
            crossingMode: null,
            velX: Math.cos(sp.angle) * KART_FORWARD_SPEED,
            velY: Math.sin(sp.angle) * KART_FORWARD_SPEED,
        });
    }
}
export function startKartFromMenu(room) {
    room.phase = "kart";
    room.stubId = null;
    room.showQr = false;
    resetKartRace(room);
}
export function ensureKartCar(room, playerId) {
    if (!room.kartCars.has(playerId) &&
        (room.phase === "kart" || room.phase === "kart_paused")) {
        const ids = Array.from(room.players.keys()).sort((a, b) => a - b);
        const idx = ids.indexOf(playerId);
        const sp = spawnPosition(idx >= 0 ? idx : 0);
        room.kartCars.set(playerId, {
            x: sp.x,
            y: sp.y,
            angle: sp.angle,
            laps: 0,
            speed: KART_FORWARD_SPEED,
            prevPauseHeld: false,
            crossingMode: null,
            velX: Math.cos(sp.angle) * KART_FORWARD_SPEED,
            velY: Math.sin(sp.angle) * KART_FORWARD_SPEED,
        });
    }
}
export function tickSimulation(room, dt) {
    room.tick = (room.tick + 1) >>> 0;
    if (room.phase === "lobby") {
        for (const p of room.players.values()) {
            stepPlayer(p, room.platforms);
        }
        return;
    }
    if (room.phase !== "kart" || room.kartPaused)
        return;
    if (room.kartCountdown !== null && room.kartCountdown > 0) {
        room.kartCountdown -= dt;
        if (room.kartCountdown <= 0) {
            room.kartCountdown = null;
        }
        return;
    }
    for (const [pid, car] of room.kartCars) {
        const player = room.players.get(pid);
        if (!player)
            continue;
        const h = Math.max(-1, Math.min(1, player.input.h / 127));
        const prev = { x: car.x, y: car.y };
        car.angle += h * KART_TURN_SPEED * dt;
        const desiredVx = Math.cos(car.angle) * car.speed;
        const desiredVy = Math.sin(car.angle) * car.speed;
        const grip = Math.max(1.2, KART_DRIFT_BASE_GRIP - Math.abs(h) * KART_DRIFT_TURN_LOSS);
        const blend = Math.min(1, grip * dt);
        car.velX += (desiredVx - car.velX) * blend;
        car.velY += (desiredVy - car.velY) * blend;
        const vx = car.velX;
        const vy = car.velY;
        const tx = car.x + vx * dt;
        const ty = car.y + vy * dt;
        const maxStep = Math.hypot(vx * dt, vy * dt);
        let clamped = clampToRing(tx, ty);
        if (isInsideCrossing(clamped.x, clamped.y)) {
            if (!car.crossingMode) {
                car.crossingMode = chooseCrossingModeByHeading(car.angle);
            }
            const lane = constrainToCrossingLane(clamped.x, clamped.y, car.crossingMode);
            clamped = { x: lane.x, y: lane.y };
            if (lane.hitSideWall) {
                car.speed = Math.max(KART_SPEED_MIN, car.speed * (1 - Math.min(0.92, dt * 1.8)));
            }
        }
        else {
            car.crossingMode = null;
        }
        const hit = wallViolated(tx, ty);
        if (hit) {
            // Find the furthest point along intended movement that stays drivable.
            // This avoids large tangential snaps that feel like "sticky sliding" on curves.
            let lo = 0;
            let hi = 1;
            for (let i = 0; i < 10; i++) {
                const mid = (lo + hi) * 0.5;
                const mx = prev.x + (tx - prev.x) * mid;
                const my = prev.y + (ty - prev.y) * mid;
                if (wallViolated(mx, my) === null)
                    lo = mid;
                else
                    hi = mid;
            }
            const sx = prev.x + (tx - prev.x) * lo;
            const sy = prev.y + (ty - prev.y) * lo;
            clamped = clampToRing(sx, sy);
            // Prevent boundary projection from pulling cars forward along walls.
            const stepDx = clamped.x - prev.x;
            const stepDy = clamped.y - prev.y;
            const stepLen = Math.hypot(stepDx, stepDy);
            if (stepLen > maxStep && stepLen > 1e-6) {
                const k = maxStep / stepLen;
                clamped = { x: prev.x + stepDx * k, y: prev.y + stepDy * k };
            }
            const { scrape01, impact01 } = wallScrapeAndImpact(vx, vy, clamped.x, clamped.y, hit);
            const desiredDx = tx - prev.x;
            const desiredDy = ty - prev.y;
            const desiredLen = Math.hypot(desiredDx, desiredDy);
            let glancingMomentumKeep = 1;
            if (desiredLen > 1e-6) {
                const n = normalIntoTrack(clamped.x, clamped.y, hit);
                let txWall = -n.y;
                let tyWall = n.x;
                if (txWall * desiredDx + tyWall * desiredDy < 0) {
                    txWall = -txWall;
                    tyWall = -tyWall;
                }
                const along = txWall * desiredDx + tyWall * desiredDy;
                const along01 = Math.abs(along) / desiredLen;
                const glancingThreshold = Math.cos((30 * Math.PI) / 180);
                if (along > 0 && along01 >= glancingThreshold) {
                    // Slight wall glide for shallow (<= 30deg off tangent) contacts.
                    const slideDist = along * 0.38;
                    const sx2 = clamped.x + txWall * slideDist;
                    const sy2 = clamped.y + tyWall * slideDist;
                    const slid = clampToRing(sx2, sy2);
                    if (wallViolated(slid.x, slid.y) === null) {
                        clamped = slid;
                    }
                    // Keep more speed on glancing scrapes than on head-on impacts.
                    glancingMomentumKeep = 0.62;
                }
            }
            const loss = dt *
                (KART_WALL_SCRAPE_FRICTION * scrape01 + KART_WALL_IMPACT_FRICTION * impact01) *
                glancingMomentumKeep;
            const correction = Math.hypot(clamped.x - tx, clamped.y - ty);
            const extraLoss = Math.min(0.6, correction / 24);
            car.speed = Math.max(KART_SPEED_MIN, car.speed * (1 - Math.min(0.94, loss + extraLoss)));
            const retained = Math.max(0.18, 1 - Math.min(0.82, loss + extraLoss));
            car.velX *= retained;
            car.velY *= retained;
        }
        else {
            car.speed += (KART_FORWARD_SPEED - car.speed) * Math.min(1, KART_SPEED_RECOVER * dt);
        }
        car.x = clamped.x;
        car.y = clamped.y;
        if (checkLapCross(prev, { x: car.x, y: car.y }, vx, vy)) {
            car.laps++;
            if (car.laps >= LAPS_TO_WIN) {
                car.laps = LAPS_TO_WIN;
                room.kartWinnerId = pid;
                const w = room.seriesWins.get(pid) ?? 0;
                room.seriesWins.set(pid, w + 1);
                room.phase = "kart_results";
                room.menuIndex = 0;
                return;
            }
        }
    }
}
/** Call when binary input arrives for kart pause edge. */
export function handleKartPauseEdge(room, playerId, car, pauseHeld) {
    const edge = pauseHeld && !car.prevPauseHeld;
    car.prevPauseHeld = pauseHeld;
    if (!edge)
        return;
    if (room.phase === "kart" && !room.kartPaused && room.kartCountdown === null) {
        room.phase = "kart_paused";
        room.kartPaused = true;
        room.kartPausedByPlayerId = playerId;
    }
}
export function applyIntent(room, _playerId, intent) {
    switch (intent.type) {
        case "all_ready":
            if (room.phase === "lobby") {
                room.phase = "menu";
                room.showQr = false;
                room.menuIndex = 0;
            }
            break;
        case "menu_nav": {
            if (room.phase === "kart_results") {
                const n = 3;
                if (intent.dir === "up")
                    room.menuIndex = (room.menuIndex - 1 + n) % n;
                else
                    room.menuIndex = (room.menuIndex + 1) % n;
                break;
            }
            if (room.phase === "menu") {
                const n = MINIGAME_IDS.length;
                if (intent.dir === "up")
                    room.menuIndex = (room.menuIndex - 1 + n) % n;
                else
                    room.menuIndex = (room.menuIndex + 1) % n;
            }
            break;
        }
        case "menu_confirm": {
            if (room.phase === "kart_results") {
                const actions = ["play_again", "minigame_menu", "add_controllers"];
                const action = actions[room.menuIndex % 3];
                if (action === "play_again")
                    startKartFromMenu(room);
                else if (action === "minigame_menu") {
                    room.phase = "menu";
                    room.stubId = null;
                    room.kartCars.clear();
                    room.kartWinnerId = null;
                    room.kartCountdown = null;
                    room.kartPaused = false;
                    room.kartPausedByPlayerId = null;
                    room.showQr = false;
                }
                else {
                    room.phase = "lobby";
                    room.menuIndex = 0;
                    room.stubId = null;
                    room.kartCars.clear();
                    room.kartWinnerId = null;
                    room.kartCountdown = null;
                    room.kartPaused = false;
                    room.kartPausedByPlayerId = null;
                    room.showQr = true;
                }
                break;
            }
            if (room.phase === "menu") {
                const id = MINIGAME_IDS[room.menuIndex];
                if (id === "kart")
                    startKartFromMenu(room);
                else {
                    room.phase = "stub";
                    room.stubId = id;
                    room.showQr = false;
                }
            }
            break;
        }
        case "menu_add_players":
            room.showQr = true;
            break;
        case "menu_game_settings":
            room.settingsOpen = true;
            break;
        case "settings_close":
            room.settingsOpen = false;
            break;
        case "stub_back":
            if (room.phase === "stub") {
                room.phase = "menu";
                room.stubId = null;
            }
            break;
        case "kart_results":
            if (room.phase !== "kart_results")
                break;
            if (intent.action === "play_again") {
                startKartFromMenu(room);
            }
            else if (intent.action === "minigame_menu") {
                room.phase = "menu";
                room.stubId = null;
                room.kartCars.clear();
                room.kartWinnerId = null;
                room.kartCountdown = null;
                room.kartPaused = false;
                room.kartPausedByPlayerId = null;
                room.showQr = false;
            }
            else if (intent.action === "add_controllers") {
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                room.kartCars.clear();
                room.kartWinnerId = null;
                room.kartCountdown = null;
                room.kartPaused = false;
                room.kartPausedByPlayerId = null;
                room.showQr = true;
            }
            break;
        case "pause_resume":
            if (room.phase === "kart_paused") {
                room.phase = "kart";
                room.kartPaused = false;
                room.kartPausedByPlayerId = null;
                for (const c of room.kartCars.values()) {
                    c.prevPauseHeld = false;
                }
            }
            break;
        case "pause_to_menu":
            if (room.phase === "kart_paused" || room.phase === "kart") {
                room.phase = "menu";
                room.kartPaused = false;
                room.kartCountdown = null;
                room.kartCars.clear();
                room.kartWinnerId = null;
                room.stubId = null;
                room.kartPausedByPlayerId = null;
            }
            break;
        default:
            break;
    }
}
