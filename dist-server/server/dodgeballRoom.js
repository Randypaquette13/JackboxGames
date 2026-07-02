import { TICK_RATE } from "../src/shared/constants.js";
import { fallbackPlayerHue } from "../src/shared/playerColors.js";
import { resolveDodgeballMaxPlayerSpeed, resolveDodgeballRoundsToWin, resolveDodgeballThrowHomingRate, resolveDodgeballThrowReleaseAim, resolveDodgeballThrowSpeed, } from "../src/shared/dodgeballGameSettings.js";
import { DODGEBALL_BALL_COUNT, DODGEBALL_BALL_DRAG, DODGEBALL_BALL_R, DODGEBALL_CATCH_SEC, DODGEBALL_CENTER_BALL_JITTER, DODGEBALL_COURT_X0, DODGEBALL_COURT_X1, DODGEBALL_COURT_Y0, DODGEBALL_COURT_Y1, DODGEBALL_KICKOFF_COUNTDOWN_SEC, DODGEBALL_LIVE_THROW_SEC, DODGEBALL_MID_X, DODGEBALL_PLAYER_BOUNCE_ITERS, DODGEBALL_PLAYER_BOUNCE_STRENGTH, DODGEBALL_PLAYER_R, DODGEBALL_WALL_RESTITUTION, } from "../src/shared/dodgeballSettings.js";
import { Btn } from "../src/shared/protocol.js";
const SUMMARY_SEC = 3;
const X0 = DODGEBALL_COURT_X0;
const X1 = DODGEBALL_COURT_X1;
const Y0 = DODGEBALL_COURT_Y0;
const Y1 = DODGEBALL_COURT_Y1;
const MID_X = DODGEBALL_MID_X;
const MID_Y = (Y0 + Y1) * 0.5;
const PICKUP_DIST = DODGEBALL_PLAYER_R + DODGEBALL_BALL_R - 2;
const HIT_DIST = DODGEBALL_PLAYER_R + DODGEBALL_BALL_R;
/** Hex-ish cluster offsets for six center balls. */
const CENTER_BALL_OFFSETS = [
    { dx: 0, dy: 0 },
    { dx: -22, dy: -14 },
    { dx: 22, dy: -14 },
    { dx: -22, dy: 14 },
    { dx: 22, dy: 14 },
    { dx: 0, dy: 26 },
];
export function dodgeballPhases(room) {
    const ph = room.phase;
    return (ph === "dodgeball_team_select" ||
        ph === "dodgeball_summary" ||
        ph === "dodgeball" ||
        ph === "dodgeball_paused" ||
        ph === "dodgeball_results");
}
export function clearDodgeballState(room) {
    room.dodgeballTeamPick.clear();
    room.dodgeballTeamAssignment.clear();
    room.dodgeballPlayers.clear();
    room.dodgeballBalls = [];
    room.dodgeballNextBallId = 1;
    room.dodgeballRedScore = 0;
    room.dodgeballBlueScore = 0;
    room.dodgeballRedElimOrder = [];
    room.dodgeballBlueElimOrder = [];
    room.dodgeballSummaryEndTick = null;
    room.dodgeballKickoffCountdown = null;
    room.dodgeballPausedByPlayerId = null;
    room.dodgeballWinner = null;
}
export function bootstrapDodgeballFromMenu(room) {
    room.phase = "dodgeball_team_select";
    room.stubId = null;
    room.showQr = false;
    clearDodgeballState(room);
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
    for (const [pid, t] of room.dodgeballTeamPick) {
        if (t === "red")
            red.push(rosterSlot(room, pid));
        else
            blue.push(rosterSlot(room, pid));
    }
    red.sort((a, b) => a.playerId - b.playerId);
    blue.sort((a, b) => a.playerId - b.playerId);
    return { red, blue };
}
function playerStartY(index, total) {
    const pr = DODGEBALL_PLAYER_R;
    const lo = Y0 + pr;
    const hi = Y1 - pr;
    if (total <= 1)
        return (lo + hi) * 0.5;
    return lo + (index / (total - 1)) * (hi - lo);
}
export function dodgeballTryStart(room) {
    if (room.phase !== "dodgeball_team_select")
        return false;
    const ids = [...room.players.keys()].sort((a, b) => a - b);
    if (ids.length < 2)
        return false;
    room.dodgeballTeamAssignment.clear();
    for (const id of ids) {
        const p = room.dodgeballTeamPick.get(id);
        if (p === "red" || p === "blue")
            room.dodgeballTeamAssignment.set(id, p);
    }
    let reds = [...room.dodgeballTeamAssignment.values()].filter((t) => t === "red").length;
    let blues = ids.length - reds;
    for (const id of ids) {
        if (room.dodgeballTeamAssignment.has(id))
            continue;
        const choose = reds <= blues ? "red" : "blue";
        room.dodgeballTeamAssignment.set(id, choose);
        if (choose === "red")
            reds++;
        else
            blues++;
    }
    room.phase = "dodgeball_summary";
    room.dodgeballSummaryEndTick = room.tick + Math.floor(TICK_RATE * SUMMARY_SEC);
    return true;
}
function spawnCenterBalls(room) {
    room.dodgeballBalls = [];
    for (let i = 0; i < DODGEBALL_BALL_COUNT; i++) {
        const off = CENTER_BALL_OFFSETS[i] ?? { dx: 0, dy: 0 };
        const j = DODGEBALL_CENTER_BALL_JITTER;
        room.dodgeballBalls.push({
            id: room.dodgeballNextBallId++,
            x: MID_X + off.dx + (Math.random() - 0.5) * j,
            y: MID_Y + off.dy + (Math.random() - 0.5) * j,
            vx: (Math.random() - 0.5) * j * 0.4,
            vy: (Math.random() - 0.5) * j * 0.4,
            carrierId: null,
            liveTeam: null,
            thrownByPlayerId: null,
            liveUntilTick: 0,
        });
    }
}
function initRoundLayout(room, reviveAll) {
    if (reviveAll) {
        room.dodgeballRedElimOrder = [];
        room.dodgeballBlueElimOrder = [];
    }
    const redIds = [...room.dodgeballTeamAssignment.entries()]
        .filter(([, t]) => t === "red")
        .map(([id]) => id)
        .sort((a, b) => a - b);
    const blueIds = [...room.dodgeballTeamAssignment.entries()]
        .filter(([, t]) => t === "blue")
        .map(([id]) => id)
        .sort((a, b) => a - b);
    const pr = DODGEBALL_PLAYER_R;
    const redX = X0 + (MID_X - X0) * 0.38;
    const blueX = X1 - (X1 - MID_X) * 0.38;
    for (let i = 0; i < redIds.length; i++) {
        const id = redIds[i];
        const existing = room.dodgeballPlayers.get(id);
        const alive = reviveAll ? true : (existing?.alive ?? true);
        room.dodgeballPlayers.set(id, {
            x: Math.max(X0 + pr, Math.min(MID_X - pr, redX)),
            y: playerStartY(i, redIds.length),
            team: "red",
            alive,
            prevPauseHeld: existing?.prevPauseHeld ?? false,
            prevPassHeld: existing?.prevPassHeld ?? false,
            catchUntilTick: 0,
        });
    }
    for (let i = 0; i < blueIds.length; i++) {
        const id = blueIds[i];
        const existing = room.dodgeballPlayers.get(id);
        const alive = reviveAll ? true : (existing?.alive ?? true);
        room.dodgeballPlayers.set(id, {
            x: Math.max(MID_X + pr, Math.min(X1 - pr, blueX)),
            y: playerStartY(i, blueIds.length),
            team: "blue",
            alive,
            prevPauseHeld: existing?.prevPauseHeld ?? false,
            prevPassHeld: existing?.prevPassHeld ?? false,
            catchUntilTick: 0,
        });
    }
    for (const ball of room.dodgeballBalls) {
        if (ball.carrierId !== null) {
            ball.carrierId = null;
            ball.liveTeam = null;
            ball.thrownByPlayerId = null;
            ball.liveUntilTick = 0;
        }
    }
    spawnCenterBalls(room);
}
export function tickDodgeballSummary(room) {
    if (room.phase !== "dodgeball_summary" || room.dodgeballSummaryEndTick === null)
        return;
    if (room.tick < room.dodgeballSummaryEndTick)
        return;
    room.phase = "dodgeball";
    room.dodgeballKickoffCountdown = DODGEBALL_KICKOFF_COUNTDOWN_SEC;
    room.dodgeballSummaryEndTick = null;
    initRoundLayout(room, true);
}
export function handleDodgeballPauseEdge(room, playerId, p, pauseHeld) {
    const edge = pauseHeld && !p.prevPauseHeld;
    p.prevPauseHeld = pauseHeld;
    if (!edge)
        return;
    if (room.phase === "dodgeball") {
        room.phase = "dodgeball_paused";
        room.dodgeballPausedByPlayerId = playerId;
    }
}
function clampPlayer(p) {
    const pr = DODGEBALL_PLAYER_R;
    if (p.team === "red") {
        p.x = Math.max(X0 + pr, Math.min(MID_X - pr, p.x));
    }
    else {
        p.x = Math.max(MID_X + pr, Math.min(X1 - pr, p.x));
    }
    p.y = Math.max(Y0 + pr, Math.min(Y1 - pr, p.y));
}
function resolvePlayerCrowding(room) {
    const ids = [...room.dodgeballPlayers.entries()]
        .filter(([, p]) => p.alive)
        .map(([id]) => id);
    const minD = DODGEBALL_PLAYER_R * 2;
    const halfStrength = DODGEBALL_PLAYER_BOUNCE_STRENGTH * 0.5;
    for (let iter = 0; iter < DODGEBALL_PLAYER_BOUNCE_ITERS; iter++) {
        for (let i = 0; i < ids.length; i++) {
            const a = room.dodgeballPlayers.get(ids[i]);
            if (!a?.alive)
                continue;
            for (let j = i + 1; j < ids.length; j++) {
                const b = room.dodgeballPlayers.get(ids[j]);
                if (!b?.alive)
                    continue;
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                const d = Math.hypot(dx, dy);
                if (d >= minD || d < 1e-8)
                    continue;
                dx /= d;
                dy /= d;
                const push = (minD - d) * halfStrength;
                a.x -= dx * push;
                a.y -= dy * push;
                b.x += dx * push;
                b.y += dy * push;
            }
        }
    }
    for (const id of ids) {
        const p = room.dodgeballPlayers.get(id);
        if (p?.alive)
            clampPlayer(p);
    }
}
function ballIsLive(ball, tick) {
    return ball.liveTeam !== null && tick < ball.liveUntilTick && ball.carrierId === null;
}
function elimQueueForTeam(room, team) {
    return team === "red" ? room.dodgeballRedElimOrder : room.dodgeballBlueElimOrder;
}
function eliminatePlayer(room, pid, team) {
    const p = room.dodgeballPlayers.get(pid);
    if (!p || !p.alive)
        return;
    p.alive = false;
    p.catchUntilTick = 0;
    /** FIFO: first eliminated sits at the front and is revived first on a catch. */
    const q = elimQueueForTeam(room, team);
    q.push(pid);
    for (const ball of room.dodgeballBalls) {
        if (ball.carrierId === pid) {
            ball.carrierId = null;
            ball.liveTeam = null;
            ball.thrownByPlayerId = null;
            ball.liveUntilTick = 0;
            ball.x = p.x;
            ball.y = p.y;
        }
    }
}
/** Revive the teammate who was eliminated earliest (still waiting in the out queue). */
function reviveFirstEliminatedTeammate(room, team) {
    const q = elimQueueForTeam(room, team);
    while (q.length > 0) {
        const pid = q.shift();
        const p = room.dodgeballPlayers.get(pid);
        if (p && !p.alive) {
            p.alive = true;
            p.catchUntilTick = 0;
            const pr = DODGEBALL_PLAYER_R;
            if (team === "red") {
                p.x = X0 + (MID_X - X0) * 0.38;
            }
            else {
                p.x = X1 - (X1 - MID_X) * 0.38;
            }
            p.y = MID_Y + (Math.random() - 0.5) * (Y1 - Y0 - pr * 4) * 0.5;
            clampPlayer(p);
            return;
        }
    }
}
function aliveCount(room, team) {
    let n = 0;
    for (const [, p] of room.dodgeballPlayers) {
        if (p.team === team && p.alive)
            n++;
    }
    return n;
}
function endMatch(room, winner) {
    room.phase = "dodgeball_results";
    room.menuIndex = 0;
    room.dodgeballWinner = winner;
    if (winner === "red" || winner === "blue") {
        for (const [pid, t] of room.dodgeballTeamAssignment) {
            if (t === winner) {
                room.seriesWins.set(pid, (room.seriesWins.get(pid) ?? 0) + 1);
            }
        }
    }
}
function endRound(room, winner) {
    if (winner === "red")
        room.dodgeballRedScore++;
    else
        room.dodgeballBlueScore++;
    const need = resolveDodgeballRoundsToWin(room.gameSettings);
    if ((winner === "red" && room.dodgeballRedScore >= need) ||
        (winner === "blue" && room.dodgeballBlueScore >= need)) {
        endMatch(room, winner);
        return;
    }
    for (const p of room.dodgeballPlayers.values()) {
        p.alive = true;
        p.catchUntilTick = 0;
    }
    room.dodgeballRedElimOrder = [];
    room.dodgeballBlueElimOrder = [];
    initRoundLayout(room, true);
    room.dodgeballKickoffCountdown = DODGEBALL_KICKOFF_COUNTDOWN_SEC;
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
function playerHoldingBall(room, pid) {
    for (const ball of room.dodgeballBalls) {
        if (ball.carrierId === pid)
            return ball;
    }
    return null;
}
function assignBallToPlayer(ball, pid, p) {
    ball.carrierId = pid;
    ball.x = p.x;
    ball.y = p.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.liveTeam = null;
    ball.thrownByPlayerId = null;
    ball.liveUntilTick = 0;
}
function tryPickupBall(room, pid, p, ball) {
    if (!p.alive || ball.carrierId !== null)
        return false;
    if (playerHoldingBall(room, pid))
        return false;
    const d = Math.hypot(p.x - ball.x, p.y - ball.y);
    if (d > PICKUP_DIST)
        return false;
    assignBallToPlayer(ball, pid, p);
    return true;
}
function onSuccessfulCatch(room, catcherId, catcher, ball) {
    const throwerId = ball.thrownByPlayerId;
    const throwerTeam = ball.liveTeam;
    const opponentLiveThrow = throwerTeam !== null &&
        throwerTeam !== catcher.team &&
        ballIsLive(ball, room.tick);
    assignBallToPlayer(ball, catcherId, catcher);
    if (!opponentLiveThrow)
        return;
    reviveFirstEliminatedTeammate(room, catcher.team);
    if (throwerId !== null) {
        eliminatePlayer(room, throwerId, throwerTeam);
    }
}
function resolveBallPlayerContacts(room) {
    const tick = room.tick;
    for (const ball of room.dodgeballBalls) {
        if (ball.carrierId !== null)
            continue;
        for (const [pid, p] of room.dodgeballPlayers) {
            if (!p.alive)
                continue;
            const d = Math.hypot(p.x - ball.x, p.y - ball.y);
            if (d > HIT_DIST)
                continue;
            const catching = tick < p.catchUntilTick;
            const live = ballIsLive(ball, tick);
            if (catching) {
                if (live && ball.liveTeam !== p.team) {
                    onSuccessfulCatch(room, pid, p, ball);
                    if (checkRoundOver(room))
                        return;
                }
                else if (!playerHoldingBall(room, pid)) {
                    tryPickupBall(room, pid, p, ball);
                }
                continue;
            }
            if (live && ball.liveTeam !== p.team) {
                eliminatePlayer(room, pid, p.team);
                ball.liveTeam = null;
                ball.thrownByPlayerId = null;
                ball.liveUntilTick = 0;
                ball.vx *= 0.35;
                ball.vy *= 0.35;
                if (checkRoundOver(room))
                    return;
                continue;
            }
            if (!live && !playerHoldingBall(room, pid)) {
                tryPickupBall(room, pid, p, ball);
            }
        }
    }
}
function clampLooseBall(ball) {
    const br = DODGEBALL_BALL_R;
    if (ball.x < X0 + br) {
        ball.x = X0 + br;
        ball.vx = Math.abs(ball.vx) * DODGEBALL_WALL_RESTITUTION;
    }
    else if (ball.x > X1 - br) {
        ball.x = X1 - br;
        ball.vx = -Math.abs(ball.vx) * DODGEBALL_WALL_RESTITUTION;
    }
    if (ball.y < Y0 + br) {
        ball.y = Y0 + br;
        ball.vy = Math.abs(ball.vy) * DODGEBALL_WALL_RESTITUTION;
    }
    else if (ball.y > Y1 - br) {
        ball.y = Y1 - br;
        ball.vy = -Math.abs(ball.vy) * DODGEBALL_WALL_RESTITUTION;
    }
}
function resolveBallBallSeparation(room) {
    const balls = room.dodgeballBalls.filter((b) => b.carrierId === null);
    const minD = DODGEBALL_BALL_R * 2;
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i];
            const b = balls[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            const d = Math.hypot(dx, dy);
            if (d >= minD || d < 1e-8)
                continue;
            dx /= d;
            dy /= d;
            const overlap = (minD - d) * 0.5;
            a.x -= dx * overlap;
            a.y -= dy * overlap;
            b.x += dx * overlap;
            b.y += dy * overlap;
        }
    }
}
function nearestOpponentUnitDir(room, team, x, y) {
    let bestDist = Infinity;
    let tx = 0;
    let ty = 0;
    for (const opp of room.dodgeballPlayers.values()) {
        if (!opp.alive || opp.team === team)
            continue;
        const dx = opp.x - x;
        const dy = opp.y - y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-8)
            continue;
        if (d < bestDist) {
            bestDist = d;
            tx = dx / d;
            ty = dy / d;
        }
    }
    if (!Number.isFinite(bestDist) || bestDist === Infinity)
        return null;
    return { x: tx, y: ty };
}
function blendUnitDir(ax, ay, bx, by, t) {
    let x = ax * (1 - t) + bx * t;
    let y = ay * (1 - t) + by * t;
    const len = Math.hypot(x, y);
    if (len < 1e-8)
        return { x: bx, y: by };
    return { x: x / len, y: y / len };
}
/** Gently curve live throws toward the closest living opponent. */
function applyLiveThrowHoming(room, ball, dt) {
    if (!ballIsLive(ball, room.tick) || ball.liveTeam === null)
        return;
    const aim = nearestOpponentUnitDir(room, ball.liveTeam, ball.x, ball.y);
    if (!aim)
        return;
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp < 40)
        return;
    const homingRate = resolveDodgeballThrowHomingRate(room.gameSettings);
    const curNx = ball.vx / sp;
    const curNy = ball.vy / sp;
    const blend = Math.min(1, homingRate * dt);
    const dir = blendUnitDir(curNx, curNy, aim.x, aim.y, blend);
    ball.vx = dir.x * sp;
    ball.vy = dir.y * sp;
}
function maybeTryThrow(room, pid, p, ball, pl) {
    const passHeld = (pl.input.buttons & Btn.Pass) !== 0;
    const edge = passHeld && !p.prevPassHeld;
    p.prevPassHeld = passHeld;
    if (!edge || !p.alive)
        return;
    let nx = pl.input.footballVx ?? 0;
    let ny = pl.input.footballVy ?? 0;
    const len = Math.hypot(nx, ny);
    const moveFloor = resolveDodgeballMaxPlayerSpeed(room.gameSettings) * 0.1;
    if (len < moveFloor) {
        nx = p.team === "red" ? 1 : -1;
        ny = 0;
    }
    else {
        nx /= len;
        ny /= len;
    }
    const aim = nearestOpponentUnitDir(room, p.team, p.x, p.y);
    if (aim) {
        const releaseAim = resolveDodgeballThrowReleaseAim(room.gameSettings);
        const dir = blendUnitDir(nx, ny, aim.x, aim.y, releaseAim);
        nx = dir.x;
        ny = dir.y;
    }
    const throwSpeed = resolveDodgeballThrowSpeed(room.gameSettings);
    const pad = DODGEBALL_PLAYER_R + DODGEBALL_BALL_R + 4;
    ball.carrierId = null;
    ball.x = p.x + nx * pad;
    ball.y = p.y + ny * pad;
    ball.vx = nx * throwSpeed;
    ball.vy = ny * throwSpeed;
    ball.liveTeam = p.team;
    ball.thrownByPlayerId = pid;
    ball.liveUntilTick = room.tick + Math.floor(TICK_RATE * DODGEBALL_LIVE_THROW_SEC);
}
function maybeTryCatch(room, pid, p, pl) {
    const passHeld = (pl.input.buttons & Btn.Pass) !== 0;
    const edge = passHeld && !p.prevPassHeld;
    p.prevPassHeld = passHeld;
    if (!edge || !p.alive)
        return;
    if (playerHoldingBall(room, pid))
        return;
    p.catchUntilTick = room.tick + Math.floor(TICK_RATE * DODGEBALL_CATCH_SEC);
}
export function tickDodgeballPlay(room, dt) {
    if (room.phase !== "dodgeball")
        return;
    if (room.dodgeballKickoffCountdown !== null && room.dodgeballKickoffCountdown > 0) {
        room.dodgeballKickoffCountdown -= dt;
        if (room.dodgeballKickoffCountdown <= 0)
            room.dodgeballKickoffCountdown = null;
        return;
    }
    for (const [pid, p] of room.dodgeballPlayers) {
        const pl = room.players.get(pid);
        if (!pl || !p.alive)
            continue;
        const held = playerHoldingBall(room, pid);
        const catching = room.tick < p.catchUntilTick;
        if (held) {
            maybeTryThrow(room, pid, p, held, pl);
            p.x += (pl.input.footballVx ?? 0) * dt;
            p.y += (pl.input.footballVy ?? 0) * dt;
            clampPlayer(p);
            held.x = p.x;
            held.y = p.y;
        }
        else if (!catching) {
            maybeTryCatch(room, pid, p, pl);
            p.x += (pl.input.footballVx ?? 0) * dt;
            p.y += (pl.input.footballVy ?? 0) * dt;
            clampPlayer(p);
        }
        else {
            maybeTryCatch(room, pid, p, pl);
        }
    }
    resolvePlayerCrowding(room);
    for (const ball of room.dodgeballBalls) {
        if (ball.carrierId !== null)
            continue;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        applyLiveThrowHoming(room, ball, dt);
        const sp = Math.hypot(ball.vx, ball.vy);
        if (sp > 0.5) {
            const k = Math.max(0, 1 - DODGEBALL_BALL_DRAG * dt);
            ball.vx *= k;
            ball.vy *= k;
        }
        if (!ballIsLive(ball, room.tick)) {
            ball.liveTeam = null;
            ball.thrownByPlayerId = null;
        }
        clampLooseBall(ball);
    }
    resolveBallBallSeparation(room);
    resolveBallPlayerContacts(room);
    if (room.phase !== "dodgeball")
        return;
    checkRoundOver(room);
}
export function buildDodgeballHostJson(room) {
    if (room.phase !== "dodgeball_team_select" &&
        room.phase !== "dodgeball_summary" &&
        room.phase !== "dodgeball" &&
        room.phase !== "dodgeball_paused" &&
        room.phase !== "dodgeball_results") {
        return null;
    }
    const { red, blue } = buildRosters(room);
    const rosterRed = room.phase === "dodgeball_team_select"
        ? red
        : [...room.dodgeballTeamAssignment.entries()]
            .filter(([, t]) => t === "red")
            .map(([id]) => rosterSlot(room, id))
            .sort((x, y) => x.playerId - y.playerId);
    const rosterBlue = room.phase === "dodgeball_team_select"
        ? blue
        : [...room.dodgeballTeamAssignment.entries()]
            .filter(([, t]) => t === "blue")
            .map(([id]) => rosterSlot(room, id))
            .sort((x, y) => x.playerId - y.playerId);
    const players = [];
    if (room.phase === "dodgeball" ||
        room.phase === "dodgeball_paused" ||
        room.phase === "dodgeball_results") {
        for (const [pid, p] of room.dodgeballPlayers) {
            const pl = room.players.get(pid);
            let holdingBallId = null;
            for (const ball of room.dodgeballBalls) {
                if (ball.carrierId === pid) {
                    holdingBallId = ball.id;
                    break;
                }
            }
            players.push({
                playerId: pid,
                name: pl?.name ?? `P${pid}`,
                hue: pl?.hue ?? fallbackPlayerHue(pid),
                team: p.team,
                x: p.x,
                y: p.y,
                alive: p.alive,
                catching: room.tick < p.catchUntilTick,
                holdingBallId,
            });
        }
        players.sort((a, b) => a.playerId - b.playerId);
    }
    const balls = room.dodgeballBalls.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        live: ballIsLive(b, room.tick),
        liveTeam: b.liveTeam,
        carrierId: b.carrierId,
    }));
    return {
        red: rosterRed,
        blue: rosterBlue,
        players,
        balls,
        redScore: room.dodgeballRedScore,
        blueScore: room.dodgeballBlueScore,
        roundsToWin: resolveDodgeballRoundsToWin(room.gameSettings),
        kickoffCountdown: room.dodgeballKickoffCountdown !== null && room.dodgeballKickoffCountdown > 0
            ? Math.ceil(room.dodgeballKickoffCountdown)
            : null,
        paused: room.phase === "dodgeball_paused",
        pausedByPlayerId: room.dodgeballPausedByPlayerId,
        seriesWins: Object.fromEntries(room.seriesWins),
        winner: room.phase === "dodgeball_results" ? (room.dodgeballWinner ?? "tie") : null,
        court: {
            x0: X0,
            x1: X1,
            y0: Y0,
            y1: Y1,
            midX: MID_X,
        },
    };
}
