import { TICK_RATE } from "../src/shared/constants.js";
import { fallbackPlayerHue } from "../src/shared/playerColors.js";
import { resolveTanksRoundsToWin, resolveTanksTurnSec } from "../src/shared/tanksGameSettings.js";
import { TANKS_BARREL_LEN, TANKS_BLAST_RADIUS, TANKS_BLUE_DEFAULT_ANGLE, TANKS_EXPLOSION_SEC, TANKS_FIELD_X0, TANKS_FIELD_X1, TANKS_FIELD_Y0, TANKS_FIELD_Y1, TANKS_GRAVITY, TANKS_HIT_RADIUS, TANKS_KICKOFF_COUNTDOWN_SEC, TANKS_MAX_DEPRESSION, TANKS_MAX_ELEVATION, TANKS_MAX_POWER, TANKS_MAX_VELOCITY, TANKS_MID_X, TANKS_MIN_POWER, TANKS_ANGLE_RATE, TANKS_POWER_RATE, TANKS_RED_DEFAULT_ANGLE, } from "../src/shared/tanksSettings.js";
import { Btn } from "../src/shared/protocol.js";
const SUMMARY_SEC = 3;
const X0 = TANKS_FIELD_X0;
const X1 = TANKS_FIELD_X1;
const Y0 = TANKS_FIELD_Y0;
const Y1 = TANKS_FIELD_Y1;
const MID_X = TANKS_MID_X;
export function tanksPhases(room) {
    const ph = room.phase;
    return (ph === "tanks_team_select" ||
        ph === "tanks_summary" ||
        ph === "tanks" ||
        ph === "tanks_paused" ||
        ph === "tanks_results");
}
export function clearTanksState(room) {
    room.tanksTeamPick.clear();
    room.tanksTeamAssignment.clear();
    room.tanksPlayers.clear();
    room.tanksTurnOrder = [];
    room.tanksTurnIndex = 0;
    room.tanksTurnPlayerId = null;
    room.tanksSubPhase = "aim";
    room.tanksProjectile = null;
    room.tanksExplosion = null;
    room.tanksTurnSecLeft = 0;
    room.tanksRedScore = 0;
    room.tanksBlueScore = 0;
    room.tanksSummaryEndTick = null;
    room.tanksKickoffCountdown = null;
    room.tanksPausedByPlayerId = null;
    room.tanksWinner = null;
}
export function bootstrapTanksFromMenu(room) {
    room.phase = "tanks_team_select";
    room.stubId = null;
    room.showQr = false;
    clearTanksState(room);
}
function rosterSlot(room, pid) {
    const pl = room.players.get(pid);
    return {
        playerId: pid,
        name: pl?.name ?? `P${pid}`,
        hue: pl?.hue ?? fallbackPlayerHue(pid),
    };
}
function buildRosters(room) {
    const red = [];
    const blue = [];
    for (const [pid, t] of room.tanksTeamPick) {
        if (t === "red")
            red.push(rosterSlot(room, pid));
        else
            blue.push(rosterSlot(room, pid));
    }
    red.sort((a, b) => a.playerId - b.playerId);
    blue.sort((a, b) => a.playerId - b.playerId);
    return { red, blue };
}
function tankStartY(index, total) {
    const pad = TANKS_HIT_RADIUS + 8;
    const lo = Y0 + pad;
    const hi = Y1 - pad;
    if (total <= 1)
        return (lo + hi) * 0.5;
    return lo + (index / (total - 1)) * (hi - lo);
}
function clampAngle(team, angle) {
    if (team === "red") {
        return Math.max(-TANKS_MAX_ELEVATION, Math.min(TANKS_MAX_DEPRESSION, angle));
    }
    const base = Math.PI;
    return Math.max(base - TANKS_MAX_DEPRESSION, Math.min(base + TANKS_MAX_ELEVATION, angle));
}
function defaultAngle(team) {
    return team === "red" ? TANKS_RED_DEFAULT_ANGLE : TANKS_BLUE_DEFAULT_ANGLE;
}
function defaultPower() {
    return 0.62;
}
export function tanksTryStart(room) {
    if (room.phase !== "tanks_team_select")
        return false;
    const ids = [...room.players.keys()].sort((a, b) => a - b);
    if (ids.length < 2)
        return false;
    room.tanksTeamAssignment.clear();
    for (const id of ids) {
        const p = room.tanksTeamPick.get(id);
        if (p === "red" || p === "blue")
            room.tanksTeamAssignment.set(id, p);
    }
    let reds = [...room.tanksTeamAssignment.values()].filter((t) => t === "red").length;
    let blues = ids.length - reds;
    for (const id of ids) {
        if (room.tanksTeamAssignment.has(id))
            continue;
        const choose = reds <= blues ? "red" : "blue";
        room.tanksTeamAssignment.set(id, choose);
        if (choose === "red")
            reds++;
        else
            blues++;
    }
    room.phase = "tanks_summary";
    room.tanksSummaryEndTick = room.tick + Math.floor(TICK_RATE * SUMMARY_SEC);
    return true;
}
function initRoundLayout(room, reviveAll) {
    const redIds = [...room.tanksTeamAssignment.entries()]
        .filter(([, t]) => t === "red")
        .map(([id]) => id)
        .sort((a, b) => a - b);
    const blueIds = [...room.tanksTeamAssignment.entries()]
        .filter(([, t]) => t === "blue")
        .map(([id]) => id)
        .sort((a, b) => a - b);
    const redX = X0 + (MID_X - X0) * 0.32;
    const blueX = X1 - (X1 - MID_X) * 0.32;
    for (let i = 0; i < redIds.length; i++) {
        const id = redIds[i];
        const existing = room.tanksPlayers.get(id);
        const alive = reviveAll ? true : (existing?.alive ?? true);
        room.tanksPlayers.set(id, {
            x: redX,
            y: tankStartY(i, redIds.length),
            team: "red",
            alive,
            angle: existing?.angle ?? defaultAngle("red"),
            power: existing?.power ?? defaultPower(),
            prevPauseHeld: existing?.prevPauseHeld ?? false,
            prevFireHeld: existing?.prevFireHeld ?? false,
            prevAimUp: existing?.prevAimUp ?? false,
            prevAimDown: existing?.prevAimDown ?? false,
            prevPowerUp: existing?.prevPowerUp ?? false,
            prevPowerDown: existing?.prevPowerDown ?? false,
        });
    }
    for (let i = 0; i < blueIds.length; i++) {
        const id = blueIds[i];
        const existing = room.tanksPlayers.get(id);
        const alive = reviveAll ? true : (existing?.alive ?? true);
        room.tanksPlayers.set(id, {
            x: blueX,
            y: tankStartY(i, blueIds.length),
            team: "blue",
            alive,
            angle: existing?.angle ?? defaultAngle("blue"),
            power: existing?.power ?? defaultPower(),
            prevPauseHeld: existing?.prevPauseHeld ?? false,
            prevFireHeld: existing?.prevFireHeld ?? false,
            prevAimUp: existing?.prevAimUp ?? false,
            prevAimDown: existing?.prevAimDown ?? false,
            prevPowerUp: existing?.prevPowerUp ?? false,
            prevPowerDown: existing?.prevPowerDown ?? false,
        });
    }
    room.tanksProjectile = null;
    room.tanksExplosion = null;
    room.tanksSubPhase = "aim";
    buildTurnOrder(room);
    startTurn(room);
}
function buildTurnOrder(room) {
    const redIds = [...room.tanksPlayers.entries()]
        .filter(([, p]) => p.team === "red" && p.alive)
        .map(([id]) => id)
        .sort((a, b) => a - b);
    const blueIds = [...room.tanksPlayers.entries()]
        .filter(([, p]) => p.team === "blue" && p.alive)
        .map(([id]) => id)
        .sort((a, b) => a - b);
    const order = [];
    const maxLen = Math.max(redIds.length, blueIds.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < redIds.length)
            order.push(redIds[i]);
        if (i < blueIds.length)
            order.push(blueIds[i]);
    }
    room.tanksTurnOrder = order;
    room.tanksTurnIndex = 0;
}
function startTurn(room) {
    if (room.tanksTurnOrder.length === 0) {
        room.tanksTurnPlayerId = null;
        return;
    }
    if (room.tanksTurnIndex >= room.tanksTurnOrder.length) {
        room.tanksTurnIndex = 0;
    }
    let tries = 0;
    while (tries < room.tanksTurnOrder.length) {
        const pid = room.tanksTurnOrder[room.tanksTurnIndex];
        const p = room.tanksPlayers.get(pid);
        if (p?.alive) {
            room.tanksTurnPlayerId = pid;
            room.tanksSubPhase = "aim";
            room.tanksTurnSecLeft = resolveTanksTurnSec(room.gameSettings);
            return;
        }
        room.tanksTurnIndex = (room.tanksTurnIndex + 1) % room.tanksTurnOrder.length;
        tries++;
    }
    room.tanksTurnPlayerId = null;
}
function advanceTurn(room) {
    room.tanksTurnIndex = (room.tanksTurnIndex + 1) % Math.max(1, room.tanksTurnOrder.length);
    startTurn(room);
}
function aliveCount(room, team) {
    let n = 0;
    for (const [, p] of room.tanksPlayers) {
        if (p.team === team && p.alive)
            n++;
    }
    return n;
}
function endMatch(room, winner) {
    room.phase = "tanks_results";
    room.menuIndex = 0;
    room.tanksWinner = winner;
    if (winner === "red" || winner === "blue") {
        for (const [pid, t] of room.tanksTeamAssignment) {
            if (t === winner) {
                room.seriesWins.set(pid, (room.seriesWins.get(pid) ?? 0) + 1);
            }
        }
    }
}
function endRound(room, winner) {
    if (winner === "red")
        room.tanksRedScore++;
    else
        room.tanksBlueScore++;
    const need = resolveTanksRoundsToWin(room.gameSettings);
    if ((winner === "red" && room.tanksRedScore >= need) ||
        (winner === "blue" && room.tanksBlueScore >= need)) {
        endMatch(room, winner);
        return;
    }
    initRoundLayout(room, true);
    room.tanksKickoffCountdown = TANKS_KICKOFF_COUNTDOWN_SEC;
}
function checkRoundOver(room) {
    const redAlive = aliveCount(room, "red");
    const blueAlive = aliveCount(room, "blue");
    if (redAlive === 0 && blueAlive === 0) {
        endMatch(room, "tie");
        return true;
    }
    if (redAlive === 0) {
        endRound(room, "blue");
        return true;
    }
    if (blueAlive === 0) {
        endRound(room, "red");
        return true;
    }
    return false;
}
export function tickTanksSummary(room) {
    if (room.phase !== "tanks_summary" || room.tanksSummaryEndTick === null)
        return;
    if (room.tick < room.tanksSummaryEndTick)
        return;
    room.phase = "tanks";
    room.tanksKickoffCountdown = TANKS_KICKOFF_COUNTDOWN_SEC;
    room.tanksSummaryEndTick = null;
    initRoundLayout(room, true);
}
export function handleTanksPauseEdge(room, playerId, p, pauseHeld) {
    const edge = pauseHeld && !p.prevPauseHeld;
    p.prevPauseHeld = pauseHeld;
    if (!edge)
        return;
    if (room.phase === "tanks") {
        room.phase = "tanks_paused";
        room.tanksPausedByPlayerId = playerId;
    }
}
function muzzlePoint(p) {
    const len = TANKS_BARREL_LEN + 6;
    return {
        x: p.x + Math.cos(p.angle) * len,
        y: p.y + Math.sin(p.angle) * len,
    };
}
function fireProjectile(room, pid, p) {
    const speed = TANKS_MAX_VELOCITY * Math.max(TANKS_MIN_POWER, Math.min(TANKS_MAX_POWER, p.power));
    const muzzle = muzzlePoint(p);
    room.tanksProjectile = {
        x: muzzle.x,
        y: muzzle.y,
        vx: Math.cos(p.angle) * speed,
        vy: Math.sin(p.angle) * speed,
        ownerId: pid,
        ownerTeam: p.team,
    };
    room.tanksSubPhase = "flight";
    room.tanksTurnSecLeft = 0;
}
function applyExplosion(room, x, y) {
    room.tanksExplosion = {
        x,
        y,
        radius: TANKS_BLAST_RADIUS,
        untilTick: room.tick + Math.floor(TICK_RATE * TANKS_EXPLOSION_SEC),
    };
    room.tanksSubPhase = "explosion";
    for (const [, tank] of room.tanksPlayers) {
        if (!tank.alive)
            continue;
        const d = Math.hypot(tank.x - x, tank.y - y);
        if (d <= TANKS_BLAST_RADIUS + TANKS_HIT_RADIUS * 0.5) {
            tank.alive = false;
        }
    }
    room.tanksProjectile = null;
}
function finishExplosion(room) {
    room.tanksExplosion = null;
    if (checkRoundOver(room))
        return;
    buildTurnOrder(room);
    advanceTurn(room);
}
function processAimInput(room, pid, p, pl, dt) {
    if (room.tanksTurnPlayerId !== pid || room.tanksSubPhase !== "aim")
        return;
    const aimUp = (pl.input.buttons & Btn.AimUp) !== 0;
    const aimDown = (pl.input.buttons & Btn.AimDown) !== 0;
    const powerUp = (pl.input.buttons & Btn.Run) !== 0;
    const powerDown = (pl.input.buttons & Btn.Jump) !== 0;
    const fireHeld = (pl.input.buttons & Btn.Fire) !== 0;
    if (aimUp)
        p.angle -= TANKS_ANGLE_RATE * dt;
    if (aimDown)
        p.angle += TANKS_ANGLE_RATE * dt;
    p.angle = clampAngle(p.team, p.angle);
    if (powerUp)
        p.power += TANKS_POWER_RATE * dt;
    if (powerDown)
        p.power -= TANKS_POWER_RATE * dt;
    p.power = Math.max(TANKS_MIN_POWER, Math.min(TANKS_MAX_POWER, p.power));
    const fireEdge = fireHeld && !p.prevFireHeld;
    p.prevFireHeld = fireHeld;
    p.prevAimUp = aimUp;
    p.prevAimDown = aimDown;
    p.prevPowerUp = powerUp;
    p.prevPowerDown = powerDown;
    if (fireEdge) {
        fireProjectile(room, pid, p);
    }
}
function tickProjectile(room, dt) {
    const proj = room.tanksProjectile;
    if (!proj)
        return;
    proj.vy += TANKS_GRAVITY * dt;
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    if (proj.y >= Y1 - 4 || proj.x < X0 - 20 || proj.x > X1 + 20 || proj.y < Y0 - 80) {
        const impactY = Math.min(proj.y, Y1 - 4);
        applyExplosion(room, proj.x, impactY);
        return;
    }
    for (const [, tank] of room.tanksPlayers) {
        if (!tank.alive)
            continue;
        const d = Math.hypot(tank.x - proj.x, tank.y - proj.y);
        if (d <= TANKS_HIT_RADIUS + 6) {
            applyExplosion(room, proj.x, proj.y);
            return;
        }
    }
}
export function tickTanksPlay(room, dt) {
    if (room.phase !== "tanks")
        return;
    if (room.tanksKickoffCountdown !== null && room.tanksKickoffCountdown > 0) {
        room.tanksKickoffCountdown -= dt;
        if (room.tanksKickoffCountdown <= 0)
            room.tanksKickoffCountdown = null;
        return;
    }
    if (room.tanksExplosion) {
        if (room.tick >= room.tanksExplosion.untilTick) {
            finishExplosion(room);
        }
        return;
    }
    if (room.tanksSubPhase === "flight") {
        tickProjectile(room, dt);
        return;
    }
    if (room.tanksSubPhase === "aim" && room.tanksTurnPlayerId !== null) {
        room.tanksTurnSecLeft = Math.max(0, room.tanksTurnSecLeft - dt);
        if (room.tanksTurnSecLeft <= 0) {
            const p = room.tanksPlayers.get(room.tanksTurnPlayerId);
            if (p?.alive)
                fireProjectile(room, room.tanksTurnPlayerId, p);
        }
    }
    for (const [pid, p] of room.tanksPlayers) {
        const pl = room.players.get(pid);
        if (!pl || !p.alive)
            continue;
        processAimInput(room, pid, p, pl, dt);
    }
}
export function buildTanksHostJson(room) {
    if (room.phase !== "tanks_team_select" &&
        room.phase !== "tanks_summary" &&
        room.phase !== "tanks" &&
        room.phase !== "tanks_paused" &&
        room.phase !== "tanks_results") {
        return null;
    }
    const { red, blue } = buildRosters(room);
    const rosterRed = room.phase === "tanks_team_select"
        ? red
        : [...room.tanksTeamAssignment.entries()]
            .filter(([, t]) => t === "red")
            .map(([id]) => rosterSlot(room, id))
            .sort((x, y) => x.playerId - y.playerId);
    const rosterBlue = room.phase === "tanks_team_select"
        ? blue
        : [...room.tanksTeamAssignment.entries()]
            .filter(([, t]) => t === "blue")
            .map(([id]) => rosterSlot(room, id))
            .sort((x, y) => x.playerId - y.playerId);
    const players = [];
    if (room.phase === "tanks" || room.phase === "tanks_paused" || room.phase === "tanks_results") {
        for (const [pid, p] of room.tanksPlayers) {
            const pl = room.players.get(pid);
            players.push({
                playerId: pid,
                name: pl?.name ?? `P${pid}`,
                hue: pl?.hue ?? fallbackPlayerHue(pid),
                team: p.team,
                x: p.x,
                y: p.y,
                alive: p.alive,
                angle: p.angle,
                power: p.power,
            });
        }
        players.sort((a, b) => a.playerId - b.playerId);
    }
    const proj = room.tanksProjectile;
    const exp = room.tanksExplosion;
    return {
        red: rosterRed,
        blue: rosterBlue,
        players,
        turnPlayerId: room.tanksTurnPlayerId,
        turnSecLeft: Math.ceil(Math.max(0, room.tanksTurnSecLeft)),
        subPhase: room.tanksSubPhase,
        projectile: proj ? { x: proj.x, y: proj.y, ownerTeam: proj.ownerTeam } : null,
        explosion: exp ? { x: exp.x, y: exp.y, radius: exp.radius } : null,
        redScore: room.tanksRedScore,
        blueScore: room.tanksBlueScore,
        roundsToWin: resolveTanksRoundsToWin(room.gameSettings),
        kickoffCountdown: room.tanksKickoffCountdown !== null && room.tanksKickoffCountdown > 0
            ? Math.ceil(room.tanksKickoffCountdown)
            : null,
        paused: room.phase === "tanks_paused",
        pausedByPlayerId: room.tanksPausedByPlayerId,
        seriesWins: Object.fromEntries(room.seriesWins),
        winner: room.phase === "tanks_results" ? (room.tanksWinner ?? "tie") : null,
        field: { x0: X0, x1: X1, y0: Y0, y1: Y1, midX: MID_X },
    };
}
