import { MINIGAME_IDS, MINIGAME_LABELS } from "../src/shared/messages.js";
import { TICK_RATE, WORLD_H, WORLD_W } from "../src/shared/constants.js";
import { clampFootballMaxPlayerSpeed, clampFootballPeriodSec, clampFootballTdToWin, resolveFootballTdToWin, } from "../src/shared/footballGameSettings.js";
import { clampDodgeballMaxPlayerSpeed, clampDodgeballRoundsToWin, clampDodgeballThrowHomingRate, clampDodgeballThrowReleaseAim, clampDodgeballThrowSpeed, resolveDodgeballRoundsToWin, } from "../src/shared/dodgeballGameSettings.js";
import { clampAirHockeyGoalsToWin, clampAirHockeyMaxPlayerSpeed, clampAirHockeyPeriodSec, resolveAirHockeyGoalsToWin, } from "../src/shared/airHockeyGameSettings.js";
import { clampPacmanLivesPerPlayer, } from "../src/shared/pacmanGameSettings.js";
import { clampKartForwardSpeed, KART_BOOST_DURATION_SEC, KART_BOOST_INITIAL_KICK_FRAC, KART_BOOST_SPEED_MULT, KART_BOOST_USES_PER_RACE, resolveKartForwardSpeed, } from "../src/shared/kartSettings.js";
import { fallbackPlayerHue } from "../src/shared/playerColors.js";
import { FROGGER_CAR_SPEED_MAX, FROGGER_CAR_SPEED_MIN, FROGGER_COUNTDOWN_SEC, FROGGER_DEATH_NOTICE_TICKS, FROGGER_DISTANCE_UNIT, FROGGER_FAST_CAR_AFTER_BANDS, FROGGER_FAST_CAR_CHANCE, FROGGER_FAST_CAR_MULT, FROGGER_FROG_SIZE, FROGGER_KILL_MARGIN, FROGGER_LILY_W, FROGGER_LOG_W_MAX, FROGGER_LOG_W_MIN, FROGGER_LATERAL_SPEED, FROGGER_MOVE_COOLDOWN, FROGGER_OBSTACLE_AFTER_BANDS, FROGGER_OBSTACLE_CHANCE, FROGGER_PLATFORM_GAP, FROGGER_PLATFORM_SPEED_MAX, FROGGER_PLATFORM_SPEED_MIN, FROGGER_PLATFORM_SPAWN_INTERVAL_SEC, FROGGER_ROW_H, FROGGER_SCROLL_BASE, FROGGER_SCROLL_DELAY_SEC, FROGGER_SCROLL_MAX, FROGGER_SCROLL_RAMP, FROGGER_START_GRASS_ROWS, froggerClampX, froggerCarSpawnIntervalSec, pickFroggerSectionKind, } from "../src/shared/froggerSettings.js";
import { RACE_WALK_FINISH_X, RACE_WALK_LANES, RACE_WALK_NPC_RUN_SPEED, RACE_WALK_NPC_STOP_DURATION_MIN, RACE_WALK_NPC_STOP_DURATION_RANDOM, RACE_WALK_NPC_WALK_BURST_MIN, RACE_WALK_NPC_WALK_BURST_RANDOM, RACE_WALK_RUN_SPEED, RACE_WALK_START_X, RACE_WALK_WALK_SPEED, } from "../src/shared/raceWalk.js";
import { Btn } from "../src/shared/protocol.js";
import { chooseCrossingModeByHeading, constrainToCrossingLane, KART_SPEED_MIN, KART_SPEED_RECOVER, KART_TURN_SPEED, KART_WALL_IMPACT_FRICTION, KART_WALL_SCRAPE_FRICTION, checkFinishLineCross, clampToRing, finishLineSegment, getBridgePolygon, getInnerIslands, getOuterWall, getUnderpassPolygon, isInsideCrossing, normalIntoTrack, spawnPosition, wallScrapeAndImpact, wallViolated, } from "../src/shared/kartTrack.js";
import { stepPlayer } from "./game.js";
import { bootstrapFootballFromMenu, buildFootballHostJson, clearFootballState, footballTryStart, tickFootballPlay, tickFootballSummary, } from "./footballRoom.js";
import { airHockeyTryStart, bootstrapAirHockeyFromMenu, buildAirHockeyHostJson, clearAirHockeyState, tickAirHockeyPlay, tickAirHockeySummary, } from "./airHockeyRoom.js";
import { bootstrapDodgeballFromMenu, buildDodgeballHostJson, clearDodgeballState, dodgeballTryStart, tickDodgeballPlay, tickDodgeballSummary, } from "./dodgeballRoom.js";
import { bootstrapBombermanFromMenu, buildBombermanHostJson, clearBombermanState, tickBombermanPlay, } from "./bombermanRoom.js";
import { bootstrapPacmanFromMenu, buildPacmanHostJson, clearPacmanState, tickPacmanPlay, } from "./pacmanRoom.js";
export { handleFootballPauseEdge } from "./footballRoom.js";
export { handleAirHockeyPauseEdge } from "./airHockeyRoom.js";
export { handleDodgeballPauseEdge } from "./dodgeballRoom.js";
export { handleBombermanPauseEdge } from "./bombermanRoom.js";
export { handlePacmanPauseEdge } from "./pacmanRoom.js";
// Laps are tracked as forward finish-line crossings:
// 0 = not started, 1 = lap 1 started, 2 = lap 2 started, 3 = finished (2 full laps completed).
export const LAPS_TO_WIN = 3;
export const KART_COUNTDOWN_SEC = 3;
export { RACE_WALK_LANES } from "../src/shared/raceWalk.js";
export const RACE_WALK_COUNTDOWN_SEC = KART_COUNTDOWN_SEC;
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
        menuHelpOpen: false,
        menuControllerId: null,
        settingsOpen: false,
        gameSettings: {},
        stubId: null,
        kartCountdown: null,
        kartPaused: false,
        kartPausedByPlayerId: null,
        kartCars: new Map(),
        kartWinnerId: null,
        seriesWins: new Map(),
        raceWalkCountdown: null,
        raceWalkRunners: [],
        raceWalkShooters: new Map(),
        raceWalkNpcAi: [],
        raceWalkBanners: [],
        raceWalkWinnerLane: null,
        raceWalkWinnerPlayerId: null,
        raceWalkPausedByPlayerId: null,
        froggerCountdown: null,
        froggerScroll: 0,
        froggerScrollSpeed: FROGGER_SCROLL_BASE,
        froggerScrollDelaySec: FROGGER_SCROLL_DELAY_SEC,
        froggerGameTimeSec: 0,
        froggerBandsGenerated: 0,
        froggerBands: [],
        froggerFrogs: new Map(),
        froggerWinnerId: null,
        froggerPausedByPlayerId: null,
        froggerBanners: [],
        froggerDeathNotices: new Map(),
        footballTeamPick: new Map(),
        footballTeamAssignment: new Map(),
        footballAthletes: new Map(),
        footballBall: { x: 480, y: 270, vx: 0, vy: 0, carrierId: null },
        footballRedScore: 0,
        footballBlueScore: 0,
        footballTimeLeftSec: 0,
        footballTimerExpired: false,
        footballPickupLockTeam: null,
        footballPickupLockUntilTick: 0,
        footballOpponentPickupLockTeam: null,
        footballOpponentPickupLockUntilTick: 0,
        footballPickupFreezeUntilTick: 0,
        footballSummaryEndTick: null,
        footballKickoffCountdown: null,
        footballPausedByPlayerId: null,
        footballWinner: null,
        airHockeyTeamPick: new Map(),
        airHockeyTeamAssignment: new Map(),
        airHockeyMallets: new Map(),
        airHockeyPuck: { x: 480, y: 270, vx: 0, vy: 0 },
        airHockeyRedScore: 0,
        airHockeyBlueScore: 0,
        airHockeyTimeLeftSec: 0,
        airHockeyTimerExpired: false,
        airHockeySummaryEndTick: null,
        airHockeyKickoffCountdown: null,
        airHockeyPausedByPlayerId: null,
        airHockeyWinner: null,
        airHockeyVelocityTransferHits: 0,
        dodgeballTeamPick: new Map(),
        dodgeballTeamAssignment: new Map(),
        dodgeballPlayers: new Map(),
        dodgeballBalls: [],
        dodgeballNextBallId: 1,
        dodgeballRedScore: 0,
        dodgeballBlueScore: 0,
        dodgeballRedElimOrder: [],
        dodgeballBlueElimOrder: [],
        dodgeballSummaryEndTick: null,
        dodgeballKickoffCountdown: null,
        dodgeballPausedByPlayerId: null,
        dodgeballWinner: null,
        bombermanCountdown: null,
        bombermanCells: [],
        bombermanPlayers: new Map(),
        bombermanBombs: [],
        bombermanFlames: [],
        bombermanPowerUps: [],
        bombermanWinnerId: null,
        bombermanPausedByPlayerId: null,
        bombermanBanners: [],
        bombermanDeathNotices: new Map(),
        pacmanCountdown: null,
        pacmanWalls: [],
        pacmanPellets: [],
        pacmanPowerPelletKeys: new Set(),
        pacmanPelletsRemaining: 0,
        pacmanTotalPellets: 0,
        pacmanFrightenedSecLeft: 0,
        pacmanChaseScatterTimer: 0,
        pacmanChaseMode: true,
        pacmanGhostHouse: { col: 15, row: 5 },
        pacmanPlayerSpawn: { col: 15, row: 15 },
        pacmanPlayers: new Map(),
        pacmanGhosts: [],
        pacmanPausedByPlayerId: null,
        pacmanBanners: [],
        pacmanDeathNotices: new Map(),
        pacmanTeamCleared: false,
        pacmanTeamWiped: false,
    };
}
function clearRaceWalkState(room) {
    room.raceWalkCountdown = null;
    room.raceWalkRunners = [];
    room.raceWalkShooters.clear();
    room.raceWalkNpcAi = [];
    room.raceWalkBanners = [];
    room.raceWalkWinnerLane = null;
    room.raceWalkWinnerPlayerId = null;
    room.raceWalkPausedByPlayerId = null;
}
function clearFroggerState(room) {
    room.froggerCountdown = null;
    room.froggerScroll = 0;
    room.froggerScrollSpeed = FROGGER_SCROLL_BASE;
    room.froggerScrollDelaySec = FROGGER_SCROLL_DELAY_SEC;
    room.froggerGameTimeSec = 0;
    room.froggerBandsGenerated = 0;
    room.froggerBands = [];
    room.froggerFrogs.clear();
    room.froggerWinnerId = null;
    room.froggerPausedByPlayerId = null;
    room.froggerBanners = [];
    room.froggerDeathNotices.clear();
}
function shuffleIntRange(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function pushRaceWalkBanner(room, text, durationSec) {
    const ticks = Math.max(1, Math.floor(durationSec * TICK_RATE));
    room.raceWalkBanners.push({ text, untilTick: room.tick + ticks });
}
function pruneRaceWalkBanners(room) {
    room.raceWalkBanners = room.raceWalkBanners.filter((b) => b.untilTick > room.tick);
}
function pushFroggerBanner(room, text, durationSec) {
    const ticks = Math.max(1, Math.floor(durationSec * TICK_RATE));
    room.froggerBanners.push({ text, untilTick: room.tick + ticks });
}
function pruneFroggerBanners(room) {
    room.froggerBanners = room.froggerBanners.filter((b) => b.untilTick > room.tick);
}
function froggerWorldTop(room) {
    if (room.froggerBands.length === 0)
        return 0;
    const last = room.froggerBands[room.froggerBands.length - 1];
    return last.y0 + last.h;
}
function overlapAx(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function distToSegmentSq(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby;
    const t = abLenSq > 1e-9 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq)) : 0;
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
}
function frogFrogRect(f) {
    const s = FROGGER_FROG_SIZE;
    return { x: f.x - s / 2, y: f.y - s / 2, w: s, h: s };
}
function createGrassBand(y0, h, bandsGen) {
    const obstacles = [];
    if (bandsGen >= FROGGER_OBSTACLE_AFTER_BANDS && Math.random() < FROGGER_OBSTACLE_CHANCE) {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
            const big = Math.random() < 0.35;
            const w = big ? 44 + Math.random() * 36 : 28 + Math.random() * 22;
            const hh = Math.min(big ? Math.min(h * 0.85, 52) : 22 + Math.random() * 14, h - 6);
            const x = 40 + Math.random() * (WORLD_W - w - 80);
            const yLocal = (h - hh) / 2;
            obstacles.push({ x, y: y0 + yLocal, w, h: hh });
        }
    }
    return { kind: "grass", y0, h, obstacles };
}
function createStreetBand(y0, h, bandsGenerated) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const laneY = y0 + h / 2;
    const laneSpeed = FROGGER_CAR_SPEED_MIN + Math.random() * (FROGGER_CAR_SPEED_MAX - FROGGER_CAR_SPEED_MIN);
    const spawnIntervalSec = froggerCarSpawnIntervalSec(bandsGenerated);
    return {
        kind: "street",
        y0,
        h,
        dir,
        cars: [],
        laneY,
        laneSpeed,
        spawnIntervalSec,
        spawnAccum: spawnIntervalSec * (0.15 + Math.random() * 0.85),
    };
}
function nextWaterRowDir(room) {
    const prev = room.froggerBands[room.froggerBands.length - 1];
    if (prev?.kind === "water")
        return (-prev.dir);
    return -1;
}
function seedWaterPlatforms(laneY, h, dir, platformSpeed) {
    const platforms = [];
    const vx = platformSpeed * dir;
    let x = -420;
    while (x < WORLD_W + 420) {
        const isLog = Math.random() < 0.45;
        const w = isLog ? FROGGER_LOG_W_MIN + Math.random() * (FROGGER_LOG_W_MAX - FROGGER_LOG_W_MIN) : FROGGER_LILY_W;
        const hh = Math.min(isLog ? 26 : 22, h - 4);
        platforms.push({ x, laneY, w, h: hh, vx, kind: isLog ? "log" : "lily" });
        x += w + FROGGER_PLATFORM_GAP;
    }
    return platforms;
}
function createWaterBand(room, y0, h) {
    const dir = nextWaterRowDir(room);
    const laneY = y0 + h / 2;
    const platformSpeed = FROGGER_PLATFORM_SPEED_MIN + Math.random() * (FROGGER_PLATFORM_SPEED_MAX - FROGGER_PLATFORM_SPEED_MIN);
    const platforms = seedWaterPlatforms(laneY, h, dir, platformSpeed);
    return {
        kind: "water",
        y0,
        h,
        dir,
        platforms,
        laneY,
        platformSpeed,
        spawnAccum: FROGGER_PLATFORM_SPAWN_INTERVAL_SEC,
    };
}
function appendFroggerBand(room) {
    const y0 = froggerWorldTop(room);
    const h = FROGGER_ROW_H;
    const kind = pickFroggerSectionKind(room.froggerBandsGenerated);
    room.froggerBandsGenerated++;
    let band;
    if (kind === "grass")
        band = createGrassBand(y0, h, room.froggerBandsGenerated);
    else if (kind === "street") {
        band = createStreetBand(y0, h, room.froggerBandsGenerated);
    }
    else
        band = createWaterBand(room, y0, h);
    room.froggerBands.push(band);
}
function ensureFroggerBands(room) {
    const target = room.froggerScroll + WORLD_H + 420;
    let safety = 0;
    while (froggerWorldTop(room) < target && safety++ < 80) {
        appendFroggerBand(room);
    }
}
function pruneFroggerBands(room) {
    const margin = 320;
    const threshold = room.froggerScroll - margin;
    while (room.froggerBands.length > 0 && room.froggerBands[0].y0 + room.froggerBands[0].h < threshold) {
        room.froggerBands.shift();
    }
}
function spawnStreetCar(room, band) {
    const laneY = band.laneY;
    const laneCars = band.cars;
    const fast = room.froggerBandsGenerated > FROGGER_FAST_CAR_AFTER_BANDS && Math.random() < FROGGER_FAST_CAR_CHANCE;
    const base = band.laneSpeed;
    const speed = (fast ? base * FROGGER_FAST_CAR_MULT : base) * band.dir;
    const w = 52 + Math.random() * 28;
    const hh = Math.min(22 + Math.random() * 14, band.h - 4);
    const x = band.dir > 0 ? -w - 8 : WORLD_W + 8;
    const gap = 28;
    for (const c of laneCars) {
        const cLeft = c.x;
        const cRight = c.x + c.w;
        const nLeft = x;
        const nRight = x + w;
        if (nLeft < cRight + gap && nRight > cLeft - gap)
            return false;
    }
    band.cars.push({ x, laneY, w, h: hh, vx: speed, fast });
    return true;
}
function spawnWaterPlatform(band) {
    const laneY = band.laneY;
    const isLog = Math.random() < 0.45;
    const w = isLog
        ? FROGGER_LOG_W_MIN + Math.random() * (FROGGER_LOG_W_MAX - FROGGER_LOG_W_MIN)
        : FROGGER_LILY_W;
    const hh = Math.min(isLog ? 26 : 22, band.h - 4);
    const vx = band.platformSpeed * band.dir;
    const x = band.dir > 0 ? -w - 6 : WORLD_W + 6;
    const y = laneY - hh / 2;
    const gap = 22;
    for (const p of band.platforms) {
        const py = p.laneY - p.h / 2;
        if (overlapAx(x - gap, y - gap, w + gap * 2, hh + gap * 2, p.x, py, p.w, p.h))
            return false;
    }
    band.platforms.push({ x, laneY, w, h: hh, vx, kind: isLog ? "log" : "lily" });
    return true;
}
function grassBlocksPosition(room, nx, ny) {
    const s = FROGGER_FROG_SIZE;
    const nr = { x: nx - s / 2, y: ny - s / 2, w: s, h: s };
    for (const b of room.froggerBands) {
        if (b.kind !== "grass")
            continue;
        for (const o of b.obstacles) {
            if (overlapAx(nr.x, nr.y, nr.w, nr.h, o.x, o.y, o.w, o.h))
                return true;
        }
    }
    return false;
}
function platformUnderFrog(f, band) {
    const fr = frogFrogRect(f);
    for (const p of band.platforms) {
        const py = p.laneY - p.h / 2;
        if (overlapAx(fr.x, fr.y, fr.w, fr.h, p.x, py, p.w, p.h))
            return p;
    }
    return null;
}
function carHitsFrog(f, band) {
    const fr = frogFrogRect(f);
    for (const c of band.cars) {
        const cy = c.laneY - c.h / 2;
        if (overlapAx(fr.x, fr.y, fr.w, fr.h, c.x, cy, c.w, c.h))
            return true;
    }
    return false;
}
function checkFroggerGameOver(room) {
    if (room.phase !== "frogger")
        return;
    for (const fr of room.froggerFrogs.values()) {
        if (fr.alive)
            return;
    }
    let bestY = -Infinity;
    let bestId = null;
    for (const [pid, fr] of room.froggerFrogs) {
        if (bestId === null || fr.maxY > bestY || (fr.maxY === bestY && pid > bestId)) {
            bestY = fr.maxY;
            bestId = pid;
        }
    }
    room.froggerWinnerId = bestId;
    if (room.froggerWinnerId !== null) {
        const wid = room.froggerWinnerId;
        const w = room.seriesWins.get(wid) ?? 0;
        room.seriesWins.set(wid, w + 1);
    }
    room.phase = "frogger_results";
    room.menuIndex = 0;
}
function froggerBandAt(room, y) {
    for (const bd of room.froggerBands) {
        if (y >= bd.y0 && y < bd.y0 + bd.h)
            return bd;
    }
    return null;
}
function killFroggerPlayer(room, playerId) {
    const f = room.froggerFrogs.get(playerId);
    if (!f || !f.alive)
        return;
    f.alive = false;
    const d = Math.max(0, Math.floor(f.maxY / FROGGER_DISTANCE_UNIT));
    const text = `You died — You got ${d} m`;
    room.froggerDeathNotices.set(playerId, { text, untilTick: room.tick + FROGGER_DEATH_NOTICE_TICKS });
    pushFroggerBanner(room, `Player ${playerId} is out (${d} m)`, 3.2);
    checkFroggerGameOver(room);
}
function anyRaceWalkCrosshairHasAmmo(room) {
    for (const s of room.raceWalkShooters.values()) {
        if (s.ammo > 0 && !s.crosshairDisabled)
            return true;
    }
    return false;
}
function runnerForPlayer(room, playerId) {
    return room.raceWalkRunners.find((r) => r.controllerId === playerId);
}
function getKartForwardSpeed(room) {
    return resolveKartForwardSpeed(room.gameSettings);
}
export function resetRaceWalk(room) {
    clearRaceWalkState(room);
    room.raceWalkCountdown = RACE_WALK_COUNTDOWN_SEC;
    const ids = Array.from(room.players.keys()).sort((a, b) => a - b);
    const nPlayers = ids.length;
    const ammo = Math.max(1, nPlayers - 1);
    const lanes = shuffleIntRange(RACE_WALK_LANES);
    room.raceWalkRunners = [];
    for (let lane = 0; lane < RACE_WALK_LANES; lane++) {
        room.raceWalkRunners.push({
            lane,
            x: RACE_WALK_START_X,
            downed: false,
            controllerId: null,
        });
    }
    const cap = Math.min(nPlayers, RACE_WALK_LANES);
    for (let i = 0; i < cap; i++) {
        const lane = lanes[i];
        const runner = room.raceWalkRunners[lane];
        if (runner)
            runner.controllerId = ids[i];
        room.raceWalkShooters.set(ids[i], {
            ammo,
            crosshairLane: Math.floor(Math.random() * RACE_WALK_LANES),
            crosshairDisabled: false,
            prevJump: false,
            prevRun: false,
            prevGamePauseHeld: false,
            prevAimUp: false,
            prevAimDown: false,
            prevFire: false,
        });
    }
    room.raceWalkNpcAi = Array.from({ length: RACE_WALK_LANES }, (_, lane) => {
        const r = room.raceWalkRunners[lane];
        if (r?.controllerId === null) {
            const startWalk = Math.random() < 0.26;
            const firstWait = true;
            const firstWalkBurst = true;
            return {
                mode: (startWalk ? "walk" : "stop"),
                timer: startWalk
                    ? RACE_WALK_NPC_WALK_BURST_MIN + Math.random() * (RACE_WALK_NPC_WALK_BURST_RANDOM * 0.5)
                    : RACE_WALK_NPC_STOP_DURATION_MIN +
                        Math.random() * (RACE_WALK_NPC_STOP_DURATION_RANDOM * 1.5),
                firstWait,
                firstWalkBurst: startWalk ? false : firstWalkBurst,
            };
        }
        return { mode: "stop", timer: 9999, firstWait: false, firstWalkBurst: false };
    });
}
export function startRaceWalkFromMenu(room) {
    room.phase = "race_walk";
    room.stubId = null;
    room.showQr = false;
    room.kartCars.clear();
    room.kartWinnerId = null;
    room.kartCountdown = null;
    room.kartPaused = false;
    room.kartPausedByPlayerId = null;
    clearFroggerState(room);
    clearFootballState(room);
    clearBombermanState(room);
    clearPacmanState(room);
    resetRaceWalk(room);
}
function tickRaceWalk(room, dt) {
    pruneRaceWalkBanners(room);
    if (room.raceWalkCountdown !== null && room.raceWalkCountdown > 0) {
        room.raceWalkCountdown -= dt;
        if (room.raceWalkCountdown <= 0) {
            room.raceWalkCountdown = null;
        }
        return;
    }
    const racing = room.phase === "race_walk";
    if (!racing)
        return;
    const npcsMayRun = !anyRaceWalkCrosshairHasAmmo(room);
    for (const [pid, shooter] of room.raceWalkShooters) {
        const player = room.players.get(pid);
        if (!player)
            continue;
        const b = player.input.buttons;
        const walkHeld = (b & Btn.Jump) !== 0;
        const runHeld = (b & Btn.Run) !== 0;
        const aimUpHeld = (b & Btn.AimUp) !== 0;
        const aimDownHeld = (b & Btn.AimDown) !== 0;
        const fireHeld = (b & Btn.Fire) !== 0;
        const edgeAimUp = aimUpHeld && !shooter.prevAimUp;
        const edgeAimDown = aimDownHeld && !shooter.prevAimDown;
        const edgeFire = fireHeld && !shooter.prevFire;
        if (edgeAimUp) {
            shooter.crosshairLane = (shooter.crosshairLane + RACE_WALK_LANES - 1) % RACE_WALK_LANES;
        }
        else if (edgeAimDown) {
            shooter.crosshairLane = (shooter.crosshairLane + 1) % RACE_WALK_LANES;
        }
        const canUseCrosshair = shooter.ammo > 0 && !shooter.crosshairDisabled;
        if (edgeFire && canUseCrosshair) {
            const lane = shooter.crosshairLane;
            const victim = room.raceWalkRunners[lane];
            if (victim && !victim.downed) {
                victim.downed = true;
                shooter.ammo -= 1;
                if (victim.controllerId !== null) {
                    const vid = victim.controllerId;
                    pushRaceWalkBanner(room, `Player ${vid} was eliminated`, 3.2);
                    const victimShooter = room.raceWalkShooters.get(vid);
                    if (victimShooter) {
                        victimShooter.crosshairDisabled = true;
                    }
                }
            }
        }
        shooter.prevJump = walkHeld;
        shooter.prevRun = runHeld;
        shooter.prevAimUp = aimUpHeld;
        shooter.prevAimDown = aimDownHeld;
        shooter.prevFire = fireHeld;
    }
    for (const runner of room.raceWalkRunners) {
        if (runner.downed)
            continue;
        let speed = 0;
        if (runner.controllerId !== null) {
            const p = room.players.get(runner.controllerId);
            if (!p)
                continue;
            const b = p.input.buttons;
            const walkHeld = (b & Btn.Jump) !== 0;
            const runHeld = (b & Btn.Run) !== 0;
            if (runHeld)
                speed = RACE_WALK_RUN_SPEED;
            else if (walkHeld)
                speed = RACE_WALK_WALK_SPEED;
        }
        else {
            const lane = runner.lane;
            const ai = room.raceWalkNpcAi[lane];
            if (ai) {
                ai.timer -= dt;
                if (ai.timer <= 0) {
                    if (ai.mode === "walk") {
                        ai.mode = "stop";
                        const ammoScale = npcsMayRun ? 0.25 : 1.0;
                        const firstScale = ai.firstWait ? 1.5 : 1.0;
                        const stopMin = RACE_WALK_NPC_STOP_DURATION_MIN * ammoScale;
                        const stopRand = RACE_WALK_NPC_STOP_DURATION_RANDOM * ammoScale * firstScale;
                        ai.timer = stopMin + Math.random() * stopRand;
                        ai.firstWait = false;
                    }
                    else {
                        ai.mode = "walk";
                        const walkRand = ai.firstWalkBurst
                            ? RACE_WALK_NPC_WALK_BURST_RANDOM * 0.5
                            : RACE_WALK_NPC_WALK_BURST_RANDOM;
                        ai.timer = RACE_WALK_NPC_WALK_BURST_MIN + Math.random() * walkRand;
                        ai.firstWalkBurst = false;
                        ai.firstWait = false;
                    }
                }
                if (ai.mode === "walk") {
                    speed = npcsMayRun ? RACE_WALK_NPC_RUN_SPEED : RACE_WALK_WALK_SPEED;
                }
            }
        }
        runner.x += speed * dt;
    }
    for (const runner of room.raceWalkRunners) {
        if (runner.downed)
            continue;
        if (runner.x >= RACE_WALK_FINISH_X) {
            room.raceWalkWinnerLane = runner.lane;
            room.raceWalkWinnerPlayerId = runner.controllerId;
            if (runner.controllerId !== null) {
                const wid = runner.controllerId;
                const w = room.seriesWins.get(wid) ?? 0;
                room.seriesWins.set(wid, w + 1);
                pushRaceWalkBanner(room, `Player ${wid} wins!`, 4);
            }
            else {
                pushRaceWalkBanner(room, "An NPC wins — no series points", 4);
            }
            room.phase = "race_walk_results";
            room.menuIndex = 0;
            return;
        }
    }
}
export function startFroggerFromMenu(room) {
    room.phase = "frogger";
    room.stubId = null;
    room.showQr = false;
    room.kartCars.clear();
    room.kartWinnerId = null;
    room.kartCountdown = null;
    room.kartPaused = false;
    room.kartPausedByPlayerId = null;
    clearRaceWalkState(room);
    clearFootballState(room);
    clearAirHockeyState(room);
    clearBombermanState(room);
    clearPacmanState(room);
    clearFroggerState(room);
    room.froggerCountdown = FROGGER_COUNTDOWN_SEC;
    room.froggerScroll = 0;
    room.froggerScrollSpeed = FROGGER_SCROLL_BASE;
    room.froggerScrollDelaySec = FROGGER_SCROLL_DELAY_SEC;
    room.froggerGameTimeSec = 0;
    room.froggerBandsGenerated = 0;
    room.froggerBands = [];
    for (let i = 0; i < FROGGER_START_GRASS_ROWS; i++) {
        const y0 = froggerWorldTop(room);
        room.froggerBandsGenerated++;
        room.froggerBands.push(createGrassBand(y0, FROGGER_ROW_H, room.froggerBandsGenerated));
    }
    ensureFroggerBands(room);
    const ids = Array.from(room.players.keys()).sort((a, b) => a - b);
    const n = ids.length;
    const frogRowCenterY = (FROGGER_START_GRASS_ROWS - 1) * FROGGER_ROW_H + FROGGER_ROW_H / 2;
    const y = Math.max(frogRowCenterY, FROGGER_KILL_MARGIN + 28);
    for (let i = 0; i < n; i++) {
        const pid = ids[i];
        const x = n === 1 ? WORLD_W * 0.5 : 90 + (i * (WORLD_W - 180)) / Math.max(1, n - 1);
        room.froggerFrogs.set(pid, {
            x: froggerClampX(x),
            y,
            alive: true,
            maxY: y,
            prevPauseHeld: false,
            prevAimUp: false,
            prevAimDown: false,
            prevH: 0,
            moveCooldown: 0,
        });
    }
}
function tickFrogger(room, dt) {
    pruneFroggerBanners(room);
    if (room.froggerCountdown !== null && room.froggerCountdown > 0) {
        room.froggerCountdown -= dt;
        if (room.froggerCountdown <= 0)
            room.froggerCountdown = null;
        ensureFroggerBands(room);
        return;
    }
    if (room.froggerScrollDelaySec > 0) {
        room.froggerScrollDelaySec = Math.max(0, room.froggerScrollDelaySec - dt);
    }
    else {
        room.froggerGameTimeSec += dt;
        room.froggerScrollSpeed = Math.min(FROGGER_SCROLL_MAX, FROGGER_SCROLL_BASE + room.froggerGameTimeSec * FROGGER_SCROLL_RAMP);
        room.froggerScroll += room.froggerScrollSpeed * dt;
    }
    ensureFroggerBands(room);
    pruneFroggerBands(room);
    for (const band of room.froggerBands) {
        if (band.kind === "street") {
            for (const c of band.cars) {
                c.x += c.vx * dt;
            }
            band.cars = band.cars.filter((c) => c.x > -120 && c.x < WORLD_W + 120);
            band.spawnAccum -= dt;
            if (band.spawnAccum <= 0) {
                const spawned = spawnStreetCar(room, band);
                band.spawnAccum = spawned ? band.spawnIntervalSec : 0.15;
            }
        }
        else if (band.kind === "water") {
            for (const p of band.platforms) {
                p.x += p.vx * dt;
            }
            band.platforms = band.platforms.filter((p) => p.x > -200 && p.x < WORLD_W + 200);
            band.spawnAccum -= dt;
            if (band.spawnAccum <= 0) {
                const spawned = spawnWaterPlatform(band);
                band.spawnAccum = spawned ? FROGGER_PLATFORM_SPAWN_INTERVAL_SEC : 0.15;
            }
        }
    }
    if (room.phase !== "frogger")
        return;
    for (const [playerId, f] of room.froggerFrogs) {
        if (!f.alive)
            continue;
        const player = room.players.get(playerId);
        if (!player)
            continue;
        const b = player.input.buttons;
        const aimUp = (b & Btn.AimUp) !== 0;
        const aimDown = (b & Btn.AimDown) !== 0;
        const h = player.input.h;
        const edgeUp = aimUp && !f.prevAimUp;
        const edgeDown = aimDown && !f.prevAimDown;
        f.prevAimUp = aimUp;
        f.prevAimDown = aimDown;
        f.prevH = h;
        // Analog left/right (no cooldown). Keep a small deadzone to avoid drift.
        const deadzone = 12;
        if (Math.abs(h) > deadzone) {
            const nx = froggerClampX(f.x + (h / 100) * FROGGER_LATERAL_SPEED * dt);
            if (!grassBlocksPosition(room, nx, f.y)) {
                f.x = nx;
            }
        }
        if (f.moveCooldown > 0) {
            f.moveCooldown -= dt;
        }
        else {
            const tryMove = (dx, dy) => {
                const nx = froggerClampX(f.x + dx);
                const ny = f.y + dy;
                if (grassBlocksPosition(room, nx, ny))
                    return;
                f.x = nx;
                f.y = ny;
                f.maxY = Math.max(f.maxY, f.y);
                f.moveCooldown = FROGGER_MOVE_COOLDOWN;
            };
            if (edgeUp)
                tryMove(0, FROGGER_ROW_H);
            else if (edgeDown)
                tryMove(0, -FROGGER_ROW_H);
        }
        const curBand = froggerBandAt(room, f.y);
        if (curBand?.kind === "water") {
            const plat = platformUnderFrog(f, curBand);
            if (plat)
                f.x = froggerClampX(f.x + plat.vx * dt);
        }
    }
    if (room.phase !== "frogger")
        return;
    for (const [playerId, f] of room.froggerFrogs) {
        if (!f.alive)
            continue;
        const curBand = froggerBandAt(room, f.y);
        if (curBand?.kind === "water" && !platformUnderFrog(f, curBand)) {
            killFroggerPlayer(room, playerId);
            continue;
        }
        if (curBand?.kind === "street" && carHitsFrog(f, curBand)) {
            killFroggerPlayer(room, playerId);
        }
    }
    if (room.phase !== "frogger")
        return;
    for (const [playerId, f] of room.froggerFrogs) {
        if (!f.alive)
            continue;
        if (f.y < room.froggerScroll + FROGGER_KILL_MARGIN) {
            killFroggerPlayer(room, playerId);
        }
    }
}
function buildFroggerHostJson(room) {
    if (room.phase !== "frogger" &&
        room.phase !== "frogger_paused" &&
        room.phase !== "frogger_results") {
        return null;
    }
    const bands = room.froggerBands.map((band) => {
        if (band.kind === "grass") {
            return {
                kind: "grass",
                y0: band.y0,
                h: band.h,
                obstacles: band.obstacles.map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
            };
        }
        if (band.kind === "street") {
            return {
                kind: "street",
                y0: band.y0,
                h: band.h,
                dir: band.dir,
                cars: band.cars.map((c) => ({
                    x: c.x,
                    y: c.laneY - c.h / 2,
                    w: c.w,
                    h: c.h,
                    fast: c.fast,
                })),
            };
        }
        return {
            kind: "water",
            y0: band.y0,
            h: band.h,
            dir: band.dir,
            platforms: band.platforms.map((p) => ({
                x: p.x,
                y: p.laneY - p.h / 2,
                w: p.w,
                h: p.h,
                kind: p.kind,
            })),
        };
    });
    const frogs = [];
    for (const [playerId, fr] of room.froggerFrogs) {
        const pl = room.players.get(playerId);
        frogs.push({
            playerId,
            name: pl?.name ?? `P${playerId}`,
            hue: pl?.hue ?? fallbackPlayerHue(playerId),
            x: fr.x,
            y: fr.y,
            alive: fr.alive,
            distance: Math.max(0, Math.floor(fr.maxY / FROGGER_DISTANCE_UNIT)),
        });
    }
    frogs.sort((a, b) => a.playerId - b.playerId);
    return {
        countdown: room.froggerCountdown,
        scroll: room.froggerScroll,
        scrollSpeed: room.froggerScrollSpeed,
        bands,
        frogs,
        winnerId: room.froggerWinnerId,
        seriesWins: Object.fromEntries(room.seriesWins),
        paused: room.phase === "frogger_paused",
        pausedByPlayerId: room.froggerPausedByPlayerId,
        banners: room.froggerBanners.filter((b) => b.untilTick > room.tick),
    };
}
function buildRaceWalkHostJson(room) {
    if (room.phase !== "race_walk" &&
        room.phase !== "race_walk_paused" &&
        room.phase !== "race_walk_results") {
        return null;
    }
    const runners = room.raceWalkRunners.map((r) => ({
        lane: r.lane,
        x: r.x,
        downed: r.downed,
        controllerId: r.controllerId,
    }));
    const crosshairs = [];
    for (const [playerId, s] of room.raceWalkShooters) {
        const pl = room.players.get(playerId);
        crosshairs.push({
            playerId,
            hue: pl?.hue ?? fallbackPlayerHue(playerId),
            lane: s.crosshairLane,
            ammo: s.ammo,
            active: s.ammo > 0 && !s.crosshairDisabled,
        });
    }
    crosshairs.sort((a, b) => a.playerId - b.playerId);
    const banners = room.raceWalkBanners.filter((b) => b.untilTick > room.tick);
    return {
        countdown: room.raceWalkCountdown,
        startX: RACE_WALK_START_X,
        finishX: RACE_WALK_FINISH_X,
        worldW: WORLD_W,
        worldH: WORLD_H,
        runners,
        crosshairs,
        banners,
        winnerLane: room.raceWalkWinnerLane,
        winnerPlayerId: room.raceWalkWinnerPlayerId,
        seriesWins: Object.fromEntries(room.seriesWins),
        paused: room.phase === "race_walk_paused",
        pausedByPlayerId: room.raceWalkPausedByPlayerId,
    };
}
function menuItemsList() {
    return MINIGAME_IDS.map((id) => ({ id, label: MINIGAME_LABELS[id] }));
}
export function buildHostState(room, roomId, reconnectingPlayers = []) {
    const lobbyPlayers = [];
    for (const p of room.players.values()) {
        lobbyPlayers.push({ playerId: p.id, name: p.name ?? `P${p.id}`, hue: p.hue, x: p.x, y: p.y });
    }
    let kart = null;
    if (room.phase === "kart" || room.phase === "kart_paused" || room.phase === "kart_results") {
        const cars = Array.from(room.kartCars.entries()).map(([playerId, c]) => {
            const pl = room.players.get(playerId);
            return {
                playerId,
                name: pl?.name ?? `P${playerId}`,
                hue: pl?.hue ?? fallbackPlayerHue(playerId),
                x: c.x,
                y: c.y,
                angle: c.angle,
                laps: Math.min(LAPS_TO_WIN, c.laps),
                boostsRemaining: c.boostsRemaining,
                boosting: c.boostTimerSec > 0,
            };
        });
        kart = {
            countdown: room.kartCountdown,
            paused: room.kartPaused,
            pausedByPlayerId: room.kartPausedByPlayerId,
            cars,
            winnerId: room.kartWinnerId,
            seriesWins: Object.fromEntries(room.seriesWins),
        };
        // Static geometry is ~34KB; send it only during the countdown (spans many
        // frames, so resilient to a dropped packet) and let the host cache it,
        // rather than re-serializing it on every racing tick.
        if (room.kartCountdown !== null) {
            const finishLine = finishLineSegment();
            kart.outerWall = getOuterWall().map((p) => ({ x: p.x, y: p.y }));
            kart.innerIslands = getInnerIslands().map((island) => island.map((p) => ({ x: p.x, y: p.y })));
            kart.bridgePolygon = getBridgePolygon().map((p) => ({ x: p.x, y: p.y }));
            kart.underpassPolygon = getUnderpassPolygon().map((p) => ({ x: p.x, y: p.y }));
            kart.finishLine = { a: finishLine.a, b: finishLine.b };
        }
    }
    return {
        type: "host_state",
        phase: room.phase,
        tick: room.tick,
        roomId,
        reconnectingPlayers,
        showQr: room.showQr,
        lobbyPlayers,
        menuIndex: room.menuIndex,
        menuItems: menuItemsList(),
        menuHelpOpen: room.phase === "menu" && room.menuHelpOpen,
        settingsOpen: room.settingsOpen,
        gameSettings: { ...room.gameSettings },
        stubId: room.stubId,
        kart,
        raceWalk: buildRaceWalkHostJson(room),
        frogger: buildFroggerHostJson(room),
        football: buildFootballHostJson(room),
        airHockey: buildAirHockeyHostJson(room),
        dodgeball: buildDodgeballHostJson(room),
        bomberman: buildBombermanHostJson(room),
        pacman: buildPacmanHostJson(room),
    };
}
export function buildControllerState(room, playerId) {
    const laps = {};
    for (const [pid, car] of room.kartCars) {
        laps[pid] = Math.min(LAPS_TO_WIN, car.laps);
    }
    const shooter = room.raceWalkShooters.get(playerId);
    const assigned = runnerForPlayer(room, playerId);
    const raceWalkHud = room.phase === "race_walk" ||
        room.phase === "race_walk_paused" ||
        room.phase === "race_walk_results"
        ? {
            assignedLane: assigned?.lane ?? null,
            runnerDowned: assigned?.downed ?? false,
            crosshairLane: shooter?.crosshairLane ?? 0,
            ammo: shooter?.ammo ?? 0,
            crosshairActive: shooter ? shooter.ammo > 0 && !shooter.crosshairDisabled : false,
            seriesWins: Object.fromEntries(room.seriesWins),
            paused: room.phase === "race_walk_paused",
        }
        : null;
    const fr = room.froggerFrogs.get(playerId);
    const froggerDist = fr ? Math.max(0, Math.floor(fr.maxY / FROGGER_DISTANCE_UNIT)) : 0;
    const froggerAlive = fr?.alive ?? false;
    const frogNotice = room.froggerDeathNotices.get(playerId);
    const froggerHud = room.phase === "frogger" || room.phase === "frogger_paused" || room.phase === "frogger_results"
        ? {
            alive: froggerAlive,
            distance: froggerDist,
            deathNotice: frogNotice && room.tick < frogNotice.untilTick
                ? { text: frogNotice.text, untilTick: frogNotice.untilTick }
                : undefined,
            seriesWins: Object.fromEntries(room.seriesWins),
            paused: room.phase === "frogger_paused",
        }
        : null;
    const myKart = room.kartCars.get(playerId);
    const nPlayers = room.players.size;
    const canFootballStart = nPlayers >= 2;
    const teamMapForUi = room.phase === "football_team_select" ? room.footballTeamPick : room.footballTeamAssignment;
    const footballHud = room.phase === "football_team_select" ||
        room.phase === "football_summary" ||
        room.phase === "football" ||
        room.phase === "football_paused" ||
        room.phase === "football_results"
        ? {
            teamSelect: room.phase === "football_team_select",
            myTeam: (teamMapForUi.get(playerId) ?? room.footballTeamPick.get(playerId)) ?? null,
            redIds: [...teamMapForUi.entries()]
                .filter(([, t]) => t === "red")
                .map(([id]) => id)
                .sort((a, b) => a - b),
            blueIds: [...teamMapForUi.entries()]
                .filter(([, t]) => t === "blue")
                .map(([id]) => id)
                .sort((a, b) => a - b),
            canStart: canFootballStart && room.phase === "football_team_select",
            isStarter: room.phase === "football_team_select" && canFootballStart,
            redScore: room.footballRedScore,
            blueScore: room.footballBlueScore,
            tdToWin: resolveFootballTdToWin(room.gameSettings),
            timeLeftSec: Math.ceil(room.footballTimeLeftSec),
            timerExpired: room.footballTimerExpired,
            seriesWins: Object.fromEntries(room.seriesWins),
            paused: room.phase === "football_paused",
        }
        : null;
    const canAirHockeyStart = nPlayers >= 2;
    const ahTeamMapForUi = room.phase === "air_hockey_team_select" ? room.airHockeyTeamPick : room.airHockeyTeamAssignment;
    const airHockeyHud = room.phase === "air_hockey_team_select" ||
        room.phase === "air_hockey_summary" ||
        room.phase === "air_hockey" ||
        room.phase === "air_hockey_paused" ||
        room.phase === "air_hockey_results"
        ? {
            teamSelect: room.phase === "air_hockey_team_select",
            myTeam: (ahTeamMapForUi.get(playerId) ?? room.airHockeyTeamPick.get(playerId)) ?? null,
            redIds: [...ahTeamMapForUi.entries()]
                .filter(([, t]) => t === "red")
                .map(([id]) => id)
                .sort((a, b) => a - b),
            blueIds: [...ahTeamMapForUi.entries()]
                .filter(([, t]) => t === "blue")
                .map(([id]) => id)
                .sort((a, b) => a - b),
            canStart: canAirHockeyStart && room.phase === "air_hockey_team_select",
            isStarter: room.phase === "air_hockey_team_select" && canAirHockeyStart,
            redScore: room.airHockeyRedScore,
            blueScore: room.airHockeyBlueScore,
            goalsToWin: resolveAirHockeyGoalsToWin(room.gameSettings),
            timeLeftSec: Math.ceil(room.airHockeyTimeLeftSec),
            timerExpired: room.airHockeyTimerExpired,
            seriesWins: Object.fromEntries(room.seriesWins),
            paused: room.phase === "air_hockey_paused",
        }
        : null;
    const canDodgeballStart = nPlayers >= 2;
    const dbTeamMapForUi = room.phase === "dodgeball_team_select"
        ? room.dodgeballTeamPick
        : room.dodgeballTeamAssignment;
    const dbPlayer = room.dodgeballPlayers.get(playerId);
    let dbHoldingBall = false;
    for (const ball of room.dodgeballBalls) {
        if (ball.carrierId === playerId) {
            dbHoldingBall = true;
            break;
        }
    }
    const dodgeballHud = room.phase === "dodgeball_team_select" ||
        room.phase === "dodgeball_summary" ||
        room.phase === "dodgeball" ||
        room.phase === "dodgeball_paused" ||
        room.phase === "dodgeball_results"
        ? {
            teamSelect: room.phase === "dodgeball_team_select",
            myTeam: (dbTeamMapForUi.get(playerId) ?? room.dodgeballTeamPick.get(playerId)) ?? null,
            redIds: [...dbTeamMapForUi.entries()]
                .filter(([, t]) => t === "red")
                .map(([id]) => id)
                .sort((a, b) => a - b),
            blueIds: [...dbTeamMapForUi.entries()]
                .filter(([, t]) => t === "blue")
                .map(([id]) => id)
                .sort((a, b) => a - b),
            canStart: canDodgeballStart && room.phase === "dodgeball_team_select",
            isStarter: room.phase === "dodgeball_team_select" && canDodgeballStart,
            redScore: room.dodgeballRedScore,
            blueScore: room.dodgeballBlueScore,
            roundsToWin: resolveDodgeballRoundsToWin(room.gameSettings),
            holdingBall: dbHoldingBall,
            isOut: dbPlayer ? !dbPlayer.alive : false,
            seriesWins: Object.fromEntries(room.seriesWins),
            paused: room.phase === "dodgeball_paused",
        }
        : null;
    const bm = room.bombermanPlayers.get(playerId);
    const bmNotice = room.bombermanDeathNotices.get(playerId);
    const bombermanHud = room.phase === "bomberman" ||
        room.phase === "bomberman_paused" ||
        room.phase === "bomberman_results"
        ? {
            alive: bm?.alive ?? false,
            deathNotice: bmNotice && room.tick < bmNotice.untilTick
                ? { text: bmNotice.text, untilTick: bmNotice.untilTick }
                : undefined,
            seriesWins: Object.fromEntries(room.seriesWins),
            paused: room.phase === "bomberman_paused",
        }
        : null;
    const pm = room.pacmanPlayers.get(playerId);
    const pmNotice = room.pacmanDeathNotices.get(playerId);
    const pacmanHud = room.phase === "pacman" || room.phase === "pacman_paused" || room.phase === "pacman_results"
        ? {
            alive: pm?.alive ?? false,
            lives: pm?.lives ?? 0,
            score: pm?.score ?? 0,
            pelletsRemaining: room.pacmanPelletsRemaining,
            frightenedSecLeft: room.pacmanFrightenedSecLeft > 0 ? room.pacmanFrightenedSecLeft : null,
            deathNotice: pmNotice && room.tick < pmNotice.untilTick
                ? { text: pmNotice.text, untilTick: pmNotice.untilTick }
                : undefined,
            seriesWins: Object.fromEntries(room.seriesWins),
            paused: room.phase === "pacman_paused",
        }
        : null;
    return {
        type: "controller_state",
        tick: room.tick,
        phase: room.phase,
        playerId,
        menuIndex: room.menuIndex,
        menuItems: menuItemsList(),
        menuHelpOpen: room.phase === "menu" && room.menuHelpOpen,
        menuControllerId: room.menuControllerId,
        menuControllerName: menuControllerName(room),
        settingsOpen: room.settingsOpen,
        gameSettings: { ...room.gameSettings },
        stubId: room.stubId,
        kart: room.phase === "kart" || room.phase === "kart_paused" || room.phase === "kart_results"
            ? {
                paused: room.kartPaused,
                countdown: room.kartCountdown,
                laps,
                winnerId: room.kartWinnerId,
                seriesWins: Object.fromEntries(room.seriesWins),
                boostsRemaining: myKart?.boostsRemaining ?? KART_BOOST_USES_PER_RACE,
                boosting: (myKart?.boostTimerSec ?? 0) > 0,
            }
            : null,
        raceWalk: raceWalkHud,
        frogger: froggerHud,
        football: footballHud,
        airHockey: airHockeyHud,
        dodgeball: dodgeballHud,
        bomberman: bombermanHud,
        pacman: pacmanHud,
    };
}
export function resetKartRace(room) {
    room.kartWinnerId = null;
    room.kartPaused = false;
    room.kartPausedByPlayerId = null;
    room.kartCountdown = KART_COUNTDOWN_SEC;
    room.kartCars.clear();
    const ids = Array.from(room.players.keys()).sort((a, b) => a - b);
    const cruise = getKartForwardSpeed(room);
    for (let i = 0; i < ids.length; i++) {
        const sp = spawnPosition(i);
        room.kartCars.set(ids[i], {
            x: sp.x,
            y: sp.y,
            angle: sp.angle,
            laps: 0,
            lastLapTick: room.tick - TICK_RATE * 9999,
            // Start behind the finish line; the first forward cross starts lap 1.
            lapArmed: true,
            speed: cruise,
            prevPauseHeld: false,
            crossingMode: null,
            velX: Math.cos(sp.angle) * cruise,
            velY: Math.sin(sp.angle) * cruise,
            prevBoostHeld: false,
            boostsRemaining: KART_BOOST_USES_PER_RACE,
            boostTimerSec: 0,
        });
    }
}
export function startPacmanFromMenu(room) {
    clearRaceWalkState(room);
    clearFroggerState(room);
    clearFootballState(room);
    clearAirHockeyState(room);
    clearBombermanState(room);
    room.kartCars.clear();
    room.kartWinnerId = null;
    room.kartCountdown = null;
    room.kartPaused = false;
    room.kartPausedByPlayerId = null;
    bootstrapPacmanFromMenu(room);
}
export function startBombermanFromMenu(room) {
    clearRaceWalkState(room);
    clearFroggerState(room);
    clearFootballState(room);
    clearAirHockeyState(room);
    clearDodgeballState(room);
    clearPacmanState(room);
    room.kartCars.clear();
    room.kartWinnerId = null;
    room.kartCountdown = null;
    room.kartPaused = false;
    room.kartPausedByPlayerId = null;
    bootstrapBombermanFromMenu(room);
}
export function startKartFromMenu(room) {
    room.phase = "kart";
    room.stubId = null;
    room.showQr = false;
    clearRaceWalkState(room);
    clearFroggerState(room);
    clearFootballState(room);
    clearAirHockeyState(room);
    clearDodgeballState(room);
    clearBombermanState(room);
    clearPacmanState(room);
    resetKartRace(room);
}
export function startFootballFromMenu(room) {
    clearDodgeballState(room);
    clearBombermanState(room);
    clearPacmanState(room);
    bootstrapFootballFromMenu(room);
}
export function startAirHockeyFromMenu(room) {
    room.kartCars.clear();
    room.kartWinnerId = null;
    room.kartCountdown = null;
    room.kartPaused = false;
    room.kartPausedByPlayerId = null;
    clearRaceWalkState(room);
    clearFroggerState(room);
    clearFootballState(room);
    clearDodgeballState(room);
    clearBombermanState(room);
    clearPacmanState(room);
    bootstrapAirHockeyFromMenu(room);
}
export function startDodgeballFromMenu(room) {
    room.kartCars.clear();
    room.kartWinnerId = null;
    room.kartCountdown = null;
    room.kartPaused = false;
    room.kartPausedByPlayerId = null;
    clearRaceWalkState(room);
    clearFroggerState(room);
    clearFootballState(room);
    clearAirHockeyState(room);
    clearBombermanState(room);
    clearPacmanState(room);
    bootstrapDodgeballFromMenu(room);
}
export function ensureKartCar(room, playerId) {
    if (!room.kartCars.has(playerId) &&
        (room.phase === "kart" || room.phase === "kart_paused")) {
        const ids = Array.from(room.players.keys()).sort((a, b) => a - b);
        const idx = ids.indexOf(playerId);
        const sp = spawnPosition(idx >= 0 ? idx : 0);
        const cruise = getKartForwardSpeed(room);
        room.kartCars.set(playerId, {
            x: sp.x,
            y: sp.y,
            angle: sp.angle,
            laps: 0,
            lastLapTick: room.tick - TICK_RATE * 9999,
            // Start behind the finish line; the first forward cross starts lap 1.
            lapArmed: true,
            speed: cruise,
            prevPauseHeld: false,
            crossingMode: null,
            velX: Math.cos(sp.angle) * cruise,
            velY: Math.sin(sp.angle) * cruise,
            prevBoostHeld: false,
            boostsRemaining: KART_BOOST_USES_PER_RACE,
            boostTimerSec: 0,
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
    if (room.phase === "race_walk_results") {
        pruneRaceWalkBanners(room);
        return;
    }
    if (room.phase === "race_walk_paused") {
        pruneRaceWalkBanners(room);
        return;
    }
    if (room.phase === "race_walk") {
        tickRaceWalk(room, dt);
        return;
    }
    if (room.phase === "frogger_results") {
        pruneFroggerBanners(room);
        return;
    }
    if (room.phase === "football_results") {
        return;
    }
    if (room.phase === "frogger_paused") {
        pruneFroggerBanners(room);
        return;
    }
    if (room.phase === "frogger") {
        tickFrogger(room, dt);
        return;
    }
    if (room.phase === "football_team_select") {
        return;
    }
    if (room.phase === "football_summary") {
        tickFootballSummary(room);
        return;
    }
    if (room.phase === "football_paused") {
        return;
    }
    if (room.phase === "football") {
        tickFootballPlay(room, dt);
        return;
    }
    if (room.phase === "air_hockey_team_select" || room.phase === "air_hockey_results") {
        return;
    }
    if (room.phase === "air_hockey_summary") {
        tickAirHockeySummary(room);
        return;
    }
    if (room.phase === "air_hockey_paused") {
        return;
    }
    if (room.phase === "air_hockey") {
        tickAirHockeyPlay(room, dt);
        return;
    }
    if (room.phase === "dodgeball_team_select" || room.phase === "dodgeball_results") {
        return;
    }
    if (room.phase === "dodgeball_summary") {
        tickDodgeballSummary(room);
        return;
    }
    if (room.phase === "dodgeball_paused") {
        return;
    }
    if (room.phase === "dodgeball") {
        tickDodgeballPlay(room, dt);
        return;
    }
    if (room.phase === "bomberman_results") {
        return;
    }
    if (room.phase === "bomberman_paused") {
        return;
    }
    if (room.phase === "bomberman") {
        tickBombermanPlay(room, dt);
        return;
    }
    if (room.phase === "pacman_results") {
        return;
    }
    if (room.phase === "pacman_paused") {
        return;
    }
    if (room.phase === "pacman") {
        tickPacmanPlay(room, dt);
        return;
    }
    if (room.phase !== "kart" || room.kartPaused)
        return;
    const kartCruise = getKartForwardSpeed(room);
    if (room.kartCountdown !== null && room.kartCountdown > 0) {
        room.kartCountdown -= dt;
        if (room.kartCountdown <= 0) {
            room.kartCountdown = null;
            for (const [pid, car] of room.kartCars) {
                const pl = room.players.get(pid);
                car.prevBoostHeld = pl ? (pl.input.buttons & Btn.Boost) !== 0 : false;
            }
        }
        return;
    }
    for (const [pid, car] of room.kartCars) {
        const player = room.players.get(pid);
        if (!player)
            continue;
        const boostHeld = (player.input.buttons & Btn.Boost) !== 0;
        const boostEdge = boostHeld && !car.prevBoostHeld;
        const boostMult = car.boostTimerSec > 0 ? KART_BOOST_SPEED_MULT : 1;
        const effectiveCruise = kartCruise * boostMult;
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
            car.speed += (effectiveCruise - car.speed) * Math.min(1, KART_SPEED_RECOVER * dt);
        }
        car.x = clamped.x;
        car.y = clamped.y;
        if (boostEdge && car.boostsRemaining > 0) {
            car.boostsRemaining--;
            car.boostTimerSec = KART_BOOST_DURATION_SEC;
            const cap = kartCruise * KART_BOOST_SPEED_MULT * 1.12;
            car.speed = Math.min(car.speed + kartCruise * KART_BOOST_INITIAL_KICK_FRAC, cap);
        }
        car.prevBoostHeld = boostHeld;
        if (car.boostTimerSec > 0) {
            car.boostTimerSec = Math.max(0, car.boostTimerSec - dt);
        }
        // Arm lap counting once the car has clearly left the finish line region.
        if (!car.lapArmed) {
            const seg = finishLineSegment();
            const armDist = 90;
            if (distToSegmentSq(car.x, car.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y) > armDist * armDist) {
                car.lapArmed = true;
            }
        }
        const finishCross = checkFinishLineCross(prev, { x: car.x, y: car.y }, vx, vy);
        const lapCooldownTicks = Math.floor(TICK_RATE * 1.25);
        const canCountLap = room.tick - car.lastLapTick > lapCooldownTicks;
        if (finishCross === "forward" && canCountLap && car.lapArmed) {
            car.laps++;
            car.lastLapTick = room.tick;
            car.lapArmed = false;
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
        else if (finishCross === "backward" && canCountLap && car.lapArmed) {
            car.laps = Math.max(0, car.laps - 1);
            car.lastLapTick = room.tick;
            car.lapArmed = false;
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
/** Call when binary input arrives for Race Walk game-pause edge (Btn.Pause, same as kart). */
export function handleRaceWalkPauseEdge(room, playerId, shooter, pauseHeld) {
    const edge = pauseHeld && !shooter.prevGamePauseHeld;
    shooter.prevGamePauseHeld = pauseHeld;
    if (!edge)
        return;
    if (room.phase === "race_walk" && room.raceWalkCountdown === null) {
        room.phase = "race_walk_paused";
        room.raceWalkPausedByPlayerId = playerId;
    }
}
/** Call when binary input arrives for Frogger pause edge. */
export function handleFroggerPauseEdge(room, playerId, frog, pauseHeld) {
    const edge = pauseHeld && !frog.prevPauseHeld;
    frog.prevPauseHeld = pauseHeld;
    if (!edge)
        return;
    if (room.phase === "frogger" && room.froggerCountdown === null) {
        room.phase = "frogger_paused";
        room.froggerPausedByPlayerId = playerId;
    }
}
function goToMinigameMenu(room) {
    room.phase = "menu";
    room.menuHelpOpen = false;
    room.menuControllerId = null;
    clearFootballState(room);
    clearAirHockeyState(room);
    clearDodgeballState(room);
    clearBombermanState(room);
    clearPacmanState(room);
}
function isResultsPhase(phase) {
    return (phase === "kart_results" ||
        phase === "race_walk_results" ||
        phase === "frogger_results" ||
        phase === "football_results" ||
        phase === "air_hockey_results" ||
        phase === "dodgeball_results" ||
        phase === "bomberman_results" ||
        phase === "pacman_results");
}
function isSharedMenuActive(room) {
    return room.phase === "menu" || isResultsPhase(room.phase);
}
function clearMenuController(room) {
    room.menuControllerId = null;
}
export function onMenuControllerPlayerRemoved(room, playerId) {
    if (room.menuControllerId === playerId)
        clearMenuController(room);
}
function menuControllerName(room) {
    if (room.menuControllerId === null)
        return null;
    const p = room.players.get(room.menuControllerId);
    return p?.name ?? `P${room.menuControllerId}`;
}
function authorizeMenuIntent(room, playerId, intent) {
    if (!isSharedMenuActive(room))
        return true;
    if (intent.type === "menu_game_settings" || intent.type === "menu_help_open") {
        room.menuControllerId = playerId;
        return true;
    }
    if (room.menuControllerId === null) {
        room.menuControllerId = playerId;
        return true;
    }
    return room.menuControllerId === playerId;
}
export function applyIntent(room, _playerId, intent) {
    if (intent.type === "menu_nav" ||
        intent.type === "menu_select" ||
        intent.type === "menu_confirm" ||
        intent.type === "menu_help_open" ||
        intent.type === "menu_help_close" ||
        intent.type === "menu_add_players" ||
        intent.type === "menu_game_settings" ||
        intent.type === "settings_close" ||
        intent.type === "game_settings_patch" ||
        intent.type === "kart_results" ||
        intent.type === "race_walk_results" ||
        intent.type === "frogger_results" ||
        intent.type === "football_results" ||
        intent.type === "air_hockey_results" ||
        intent.type === "dodgeball_results" ||
        intent.type === "bomberman_results" ||
        intent.type === "pacman_results") {
        if (!authorizeMenuIntent(room, _playerId, intent))
            return;
    }
    switch (intent.type) {
        case "all_ready":
            if (room.phase === "lobby") {
                goToMinigameMenu(room);
                room.menuControllerId = _playerId;
                room.showQr = false;
                room.menuIndex = 0;
            }
            break;
        case "menu_nav": {
            if (room.phase === "kart_results" ||
                room.phase === "race_walk_results" ||
                room.phase === "frogger_results" ||
                room.phase === "football_results" ||
                room.phase === "air_hockey_results" ||
                room.phase === "dodgeball_results" ||
                room.phase === "bomberman_results" ||
                room.phase === "pacman_results") {
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
        case "menu_select": {
            if (room.phase === "menu") {
                const n = MINIGAME_IDS.length;
                const idx = intent.index;
                if (idx >= 0 && idx < n)
                    room.menuIndex = idx;
            }
            break;
        }
        case "menu_help_open":
            if (room.phase === "menu" && !room.settingsOpen)
                room.menuHelpOpen = true;
            break;
        case "menu_help_close":
            if (room.phase === "menu")
                room.menuHelpOpen = false;
            break;
        case "menu_confirm": {
            if (room.phase === "kart_results") {
                const actions = ["play_again", "minigame_menu", "add_controllers"];
                const action = actions[room.menuIndex % 3];
                if (action === "play_again") {
                    clearMenuController(room);
                    startKartFromMenu(room);
                }
                else if (action === "minigame_menu") {
                    goToMinigameMenu(room);
                    room.stubId = null;
                    room.kartCars.clear();
                    room.kartWinnerId = null;
                    room.kartCountdown = null;
                    room.kartPaused = false;
                    room.kartPausedByPlayerId = null;
                    clearFroggerState(room);
                    room.showQr = false;
                }
                else {
                    clearMenuController(room);
                    room.phase = "lobby";
                    room.menuIndex = 0;
                    room.stubId = null;
                    room.kartCars.clear();
                    room.kartWinnerId = null;
                    room.kartCountdown = null;
                    room.kartPaused = false;
                    room.kartPausedByPlayerId = null;
                    clearFroggerState(room);
                    room.showQr = true;
                }
                break;
            }
            if (room.phase === "race_walk_results") {
                const actions = ["play_again", "minigame_menu", "add_controllers"];
                const action = actions[room.menuIndex % 3];
                if (action === "play_again") {
                    clearMenuController(room);
                    startRaceWalkFromMenu(room);
                }
                else if (action === "minigame_menu") {
                    goToMinigameMenu(room);
                    room.stubId = null;
                    clearRaceWalkState(room);
                    clearFroggerState(room);
                    room.showQr = false;
                }
                else {
                    clearMenuController(room);
                    room.phase = "lobby";
                    room.menuIndex = 0;
                    room.stubId = null;
                    clearRaceWalkState(room);
                    clearFroggerState(room);
                    room.showQr = true;
                }
                break;
            }
            if (room.phase === "frogger_results") {
                const actions = ["play_again", "minigame_menu", "add_controllers"];
                const action = actions[room.menuIndex % 3];
                if (action === "play_again") {
                    clearMenuController(room);
                    startFroggerFromMenu(room);
                }
                else if (action === "minigame_menu") {
                    goToMinigameMenu(room);
                    room.stubId = null;
                    clearFroggerState(room);
                    room.showQr = false;
                }
                else {
                    clearMenuController(room);
                    room.phase = "lobby";
                    room.menuIndex = 0;
                    room.stubId = null;
                    clearFroggerState(room);
                    room.showQr = true;
                }
                break;
            }
            if (room.phase === "football_results") {
                const actions = ["play_again", "minigame_menu", "add_controllers"];
                const action = actions[room.menuIndex % 3];
                if (action === "play_again") {
                    clearMenuController(room);
                    startFootballFromMenu(room);
                }
                else if (action === "minigame_menu") {
                    goToMinigameMenu(room);
                    room.stubId = null;
                    clearFootballState(room);
                    room.showQr = false;
                }
                else {
                    clearMenuController(room);
                    room.phase = "lobby";
                    room.menuIndex = 0;
                    room.stubId = null;
                    clearFootballState(room);
                    room.showQr = true;
                }
                break;
            }
            if (room.phase === "air_hockey_results") {
                const actions = ["play_again", "minigame_menu", "add_controllers"];
                const action = actions[room.menuIndex % 3];
                if (action === "play_again") {
                    clearMenuController(room);
                    startAirHockeyFromMenu(room);
                }
                else if (action === "minigame_menu") {
                    goToMinigameMenu(room);
                    room.stubId = null;
                    clearAirHockeyState(room);
                    room.showQr = false;
                }
                else {
                    clearMenuController(room);
                    room.phase = "lobby";
                    room.menuIndex = 0;
                    room.stubId = null;
                    clearAirHockeyState(room);
                    room.showQr = true;
                }
                break;
            }
            if (room.phase === "dodgeball_results") {
                const actions = ["play_again", "minigame_menu", "add_controllers"];
                const action = actions[room.menuIndex % 3];
                if (action === "play_again") {
                    clearMenuController(room);
                    startDodgeballFromMenu(room);
                }
                else if (action === "minigame_menu") {
                    goToMinigameMenu(room);
                    room.stubId = null;
                    clearDodgeballState(room);
                    room.showQr = false;
                }
                else {
                    clearMenuController(room);
                    room.phase = "lobby";
                    room.menuIndex = 0;
                    room.stubId = null;
                    clearDodgeballState(room);
                    room.showQr = true;
                }
                break;
            }
            if (room.phase === "bomberman_results") {
                const actions = ["play_again", "minigame_menu", "add_controllers"];
                const action = actions[room.menuIndex % 3];
                if (action === "play_again") {
                    clearMenuController(room);
                    startBombermanFromMenu(room);
                }
                else if (action === "minigame_menu") {
                    goToMinigameMenu(room);
                    room.stubId = null;
                    clearBombermanState(room);
                    room.showQr = false;
                }
                else {
                    clearMenuController(room);
                    room.phase = "lobby";
                    room.menuIndex = 0;
                    room.stubId = null;
                    clearBombermanState(room);
                    room.showQr = true;
                }
                break;
            }
            if (room.phase === "pacman_results") {
                const actions = ["play_again", "minigame_menu", "add_controllers"];
                const action = actions[room.menuIndex % 3];
                if (action === "play_again") {
                    clearMenuController(room);
                    startPacmanFromMenu(room);
                }
                else if (action === "minigame_menu") {
                    goToMinigameMenu(room);
                    room.stubId = null;
                    clearPacmanState(room);
                    room.showQr = false;
                }
                else {
                    clearMenuController(room);
                    room.phase = "lobby";
                    room.menuIndex = 0;
                    room.stubId = null;
                    clearPacmanState(room);
                    room.showQr = true;
                }
                break;
            }
            if (room.phase === "menu") {
                if (room.menuHelpOpen) {
                    room.menuHelpOpen = false;
                    break;
                }
                clearMenuController(room);
                const id = MINIGAME_IDS[room.menuIndex];
                if (id === "kart")
                    startKartFromMenu(room);
                else if (id === "race_walk")
                    startRaceWalkFromMenu(room);
                else if (id === "frogger")
                    startFroggerFromMenu(room);
                else if (id === "football")
                    startFootballFromMenu(room);
                else if (id === "air_hockey")
                    startAirHockeyFromMenu(room);
                else if (id === "dodgeball")
                    startDodgeballFromMenu(room);
                else if (id === "bomberman")
                    startBombermanFromMenu(room);
                else if (id === "pacman")
                    startPacmanFromMenu(room);
                else {
                    room.phase = "stub";
                    room.stubId = id;
                    room.showQr = false;
                }
            }
            break;
        }
        case "football_pick_team":
            if (room.phase === "football_team_select") {
                room.footballTeamPick.set(_playerId, intent.team);
            }
            break;
        case "football_start":
            if (room.phase === "football_team_select") {
                footballTryStart(room);
            }
            break;
        case "air_hockey_pick_team":
            if (room.phase === "air_hockey_team_select") {
                room.airHockeyTeamPick.set(_playerId, intent.team);
            }
            break;
        case "air_hockey_start":
            if (room.phase === "air_hockey_team_select") {
                airHockeyTryStart(room);
            }
            break;
        case "dodgeball_pick_team":
            if (room.phase === "dodgeball_team_select") {
                room.dodgeballTeamPick.set(_playerId, intent.team);
            }
            break;
        case "dodgeball_start":
            if (room.phase === "dodgeball_team_select") {
                dodgeballTryStart(room);
            }
            break;
        case "team_select_back":
            if (room.phase === "football_team_select" ||
                room.phase === "football_summary" ||
                room.phase === "air_hockey_team_select" ||
                room.phase === "air_hockey_summary" ||
                room.phase === "dodgeball_team_select" ||
                room.phase === "dodgeball_summary") {
                goToMinigameMenu(room);
                room.stubId = null;
                room.showQr = false;
            }
            break;
        case "menu_add_players":
            if (room.phase === "menu") {
                clearMenuController(room);
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                room.settingsOpen = false;
                room.kartCars.clear();
                room.kartWinnerId = null;
                room.kartCountdown = null;
                room.kartPaused = false;
                room.kartPausedByPlayerId = null;
                clearRaceWalkState(room);
                clearFroggerState(room);
                clearFootballState(room);
                clearAirHockeyState(room);
                clearDodgeballState(room);
                clearBombermanState(room);
                clearPacmanState(room);
                room.showQr = true;
            }
            else {
                room.showQr = true;
            }
            break;
        case "menu_game_settings":
            if (room.phase === "menu")
                room.menuHelpOpen = false;
            room.settingsOpen = true;
            break;
        case "settings_close":
            room.settingsOpen = false;
            break;
        case "game_settings_patch": {
            const p = intent.patch;
            if (Object.prototype.hasOwnProperty.call(p, "kartForwardSpeed")) {
                const v = p.kartForwardSpeed;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.kartForwardSpeed = clampKartForwardSpeed(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "footballPeriodSec")) {
                const v = p.footballPeriodSec;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.footballPeriodSec = clampFootballPeriodSec(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "footballTdToWin")) {
                const v = p.footballTdToWin;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.footballTdToWin = clampFootballTdToWin(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "footballMaxPlayerSpeed")) {
                const v = p.footballMaxPlayerSpeed;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.footballMaxPlayerSpeed = clampFootballMaxPlayerSpeed(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "airHockeyPeriodSec")) {
                const v = p.airHockeyPeriodSec;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.airHockeyPeriodSec = clampAirHockeyPeriodSec(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "airHockeyGoalsToWin")) {
                const v = p.airHockeyGoalsToWin;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.airHockeyGoalsToWin = clampAirHockeyGoalsToWin(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "airHockeyMaxPlayerSpeed")) {
                const v = p.airHockeyMaxPlayerSpeed;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.airHockeyMaxPlayerSpeed = clampAirHockeyMaxPlayerSpeed(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "dodgeballRoundsToWin")) {
                const v = p.dodgeballRoundsToWin;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.dodgeballRoundsToWin = clampDodgeballRoundsToWin(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "dodgeballMaxPlayerSpeed")) {
                const v = p.dodgeballMaxPlayerSpeed;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.dodgeballMaxPlayerSpeed = clampDodgeballMaxPlayerSpeed(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "dodgeballThrowSpeed")) {
                const v = p.dodgeballThrowSpeed;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.dodgeballThrowSpeed = clampDodgeballThrowSpeed(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "dodgeballThrowHomingRate")) {
                const v = p.dodgeballThrowHomingRate;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.dodgeballThrowHomingRate = clampDodgeballThrowHomingRate(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "dodgeballThrowReleaseAim")) {
                const v = p.dodgeballThrowReleaseAim;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.dodgeballThrowReleaseAim = clampDodgeballThrowReleaseAim(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(p, "pacmanLivesPerPlayer")) {
                const v = p.pacmanLivesPerPlayer;
                if (typeof v === "number" && Number.isFinite(v)) {
                    room.gameSettings.pacmanLivesPerPlayer = clampPacmanLivesPerPlayer(v);
                }
            }
            break;
        }
        case "stub_back":
            if (room.phase === "stub") {
                goToMinigameMenu(room);
                room.stubId = null;
            }
            break;
        case "kart_results":
            if (room.phase !== "kart_results")
                break;
            if (intent.action === "play_again") {
                clearMenuController(room);
                startKartFromMenu(room);
            }
            else if (intent.action === "minigame_menu") {
                goToMinigameMenu(room);
                room.stubId = null;
                room.kartCars.clear();
                room.kartWinnerId = null;
                room.kartCountdown = null;
                room.kartPaused = false;
                room.kartPausedByPlayerId = null;
                clearFroggerState(room);
                room.showQr = false;
            }
            else if (intent.action === "add_controllers") {
                clearMenuController(room);
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                room.kartCars.clear();
                room.kartWinnerId = null;
                room.kartCountdown = null;
                room.kartPaused = false;
                room.kartPausedByPlayerId = null;
                clearFroggerState(room);
                room.showQr = true;
            }
            break;
        case "race_walk_results":
            if (room.phase !== "race_walk_results")
                break;
            if (intent.action === "play_again") {
                clearMenuController(room);
                startRaceWalkFromMenu(room);
            }
            else if (intent.action === "minigame_menu") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearRaceWalkState(room);
                clearFroggerState(room);
                room.showQr = false;
            }
            else if (intent.action === "add_controllers") {
                clearMenuController(room);
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                clearRaceWalkState(room);
                clearFroggerState(room);
                room.showQr = true;
            }
            break;
        case "frogger_results":
            if (room.phase !== "frogger_results")
                break;
            if (intent.action === "play_again") {
                clearMenuController(room);
                startFroggerFromMenu(room);
            }
            else if (intent.action === "minigame_menu") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearFroggerState(room);
                room.showQr = false;
            }
            else if (intent.action === "add_controllers") {
                clearMenuController(room);
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                clearFroggerState(room);
                room.showQr = true;
            }
            break;
        case "football_results":
            if (room.phase !== "football_results")
                break;
            if (intent.action === "play_again") {
                clearMenuController(room);
                startFootballFromMenu(room);
            }
            else if (intent.action === "minigame_menu") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearFootballState(room);
                room.showQr = false;
            }
            else if (intent.action === "add_controllers") {
                clearMenuController(room);
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                clearFootballState(room);
                room.showQr = true;
            }
            break;
        case "air_hockey_results":
            if (room.phase !== "air_hockey_results")
                break;
            if (intent.action === "play_again") {
                clearMenuController(room);
                startAirHockeyFromMenu(room);
            }
            else if (intent.action === "minigame_menu") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearAirHockeyState(room);
                room.showQr = false;
            }
            else if (intent.action === "add_controllers") {
                clearMenuController(room);
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                clearAirHockeyState(room);
                room.showQr = true;
            }
            break;
        case "dodgeball_results":
            if (room.phase !== "dodgeball_results")
                break;
            if (intent.action === "play_again") {
                clearMenuController(room);
                startDodgeballFromMenu(room);
            }
            else if (intent.action === "minigame_menu") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearDodgeballState(room);
                room.showQr = false;
            }
            else if (intent.action === "add_controllers") {
                clearMenuController(room);
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                clearDodgeballState(room);
                room.showQr = true;
            }
            break;
        case "bomberman_results":
            if (room.phase !== "bomberman_results")
                break;
            if (intent.action === "play_again") {
                clearMenuController(room);
                startBombermanFromMenu(room);
            }
            else if (intent.action === "minigame_menu") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearBombermanState(room);
                room.showQr = false;
            }
            else if (intent.action === "add_controllers") {
                clearMenuController(room);
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                clearBombermanState(room);
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
            else if (room.phase === "race_walk_paused") {
                room.phase = "race_walk";
                room.raceWalkPausedByPlayerId = null;
                for (const s of room.raceWalkShooters.values()) {
                    s.prevGamePauseHeld = false;
                }
            }
            else if (room.phase === "frogger_paused") {
                room.phase = "frogger";
                room.froggerPausedByPlayerId = null;
                for (const fr of room.froggerFrogs.values()) {
                    fr.prevPauseHeld = false;
                }
            }
            else if (room.phase === "football_paused") {
                room.phase = "football";
                room.footballPausedByPlayerId = null;
                for (const a of room.footballAthletes.values()) {
                    a.prevPauseHeld = false;
                    a.prevPassHeld = false;
                }
            }
            else if (room.phase === "air_hockey_paused") {
                room.phase = "air_hockey";
                room.airHockeyPausedByPlayerId = null;
                for (const m of room.airHockeyMallets.values()) {
                    m.prevPauseHeld = false;
                }
            }
            else if (room.phase === "dodgeball_paused") {
                room.phase = "dodgeball";
                room.dodgeballPausedByPlayerId = null;
                for (const p of room.dodgeballPlayers.values()) {
                    p.prevPauseHeld = false;
                    p.prevPassHeld = false;
                }
            }
            else if (room.phase === "bomberman_paused") {
                room.phase = "bomberman";
                room.bombermanPausedByPlayerId = null;
                for (const p of room.bombermanPlayers.values()) {
                    p.prevPauseHeld = false;
                }
            }
            else if (room.phase === "pacman_paused") {
                room.phase = "pacman";
                room.pacmanPausedByPlayerId = null;
                for (const p of room.pacmanPlayers.values()) {
                    p.prevPauseHeld = false;
                }
            }
            break;
        case "pause_to_menu":
            if (room.phase === "kart_paused" || room.phase === "kart") {
                goToMinigameMenu(room);
                room.kartPaused = false;
                room.kartCountdown = null;
                room.kartCars.clear();
                room.kartWinnerId = null;
                room.stubId = null;
                room.kartPausedByPlayerId = null;
            }
            else if (room.phase === "race_walk" || room.phase === "race_walk_paused") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearRaceWalkState(room);
                room.showQr = false;
            }
            else if (room.phase === "frogger" || room.phase === "frogger_paused") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearFroggerState(room);
                room.showQr = false;
            }
            else if (room.phase === "football" || room.phase === "football_paused") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearFootballState(room);
                room.showQr = false;
            }
            else if (room.phase === "air_hockey" || room.phase === "air_hockey_paused") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearAirHockeyState(room);
                room.showQr = false;
            }
            else if (room.phase === "dodgeball" || room.phase === "dodgeball_paused") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearDodgeballState(room);
                room.showQr = false;
            }
            else if (room.phase === "bomberman" || room.phase === "bomberman_paused") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearBombermanState(room);
                room.showQr = false;
            }
            else if (room.phase === "pacman" || room.phase === "pacman_paused") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearPacmanState(room);
                room.showQr = false;
            }
            break;
        case "pacman_results":
            if (room.phase !== "pacman_results")
                break;
            if (intent.action === "play_again") {
                clearMenuController(room);
                startPacmanFromMenu(room);
            }
            else if (intent.action === "minigame_menu") {
                goToMinigameMenu(room);
                room.stubId = null;
                clearPacmanState(room);
                room.showQr = false;
            }
            else if (intent.action === "add_controllers") {
                clearMenuController(room);
                room.phase = "lobby";
                room.menuIndex = 0;
                room.stubId = null;
                clearPacmanState(room);
                room.showQr = true;
            }
            break;
        default:
            break;
    }
}
