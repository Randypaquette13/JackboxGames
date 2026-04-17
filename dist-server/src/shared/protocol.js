/**
 * Binary WebSocket protocol — hot path avoids JSON.
 * Little-endian for all multi-byte numbers.
 */
export const Op = {
    ClientJoin: 0x01,
    ClientInput: 0x02,
    ClientPing: 0x03,
    ServerWelcome: 0x10,
    ServerState: 0x11,
    ServerPong: 0x12,
    ServerError: 0x13,
};
export const RoleByte = { host: 0, controller: 1 };
export const Btn = {
    Jump: 1 << 0,
    Pause: 1 << 1,
    /** Race Walk: cycle crosshair toward lower lane index */
    AimUp: 1 << 2,
    /** Race Walk: cycle crosshair toward higher lane index */
    AimDown: 1 << 3,
    Fire: 1 << 4,
};
export function encodeJoin(role, roomId) {
    const room = new TextEncoder().encode(roomId);
    if (room.length > 255)
        throw new Error("room id too long");
    const buf = new ArrayBuffer(3 + room.byteLength);
    const u8 = new Uint8Array(buf);
    let o = 0;
    u8[o++] = Op.ClientJoin;
    u8[o++] = role === "host" ? RoleByte.host : RoleByte.controller;
    u8[o++] = room.byteLength;
    u8.set(room, o);
    return buf;
}
export function encodeInput(seq, horizontal, buttons) {
    const buf = new ArrayBuffer(7);
    const v = new DataView(buf);
    const h = Math.max(-127, Math.min(127, horizontal | 0)) | 0;
    v.setUint8(0, Op.ClientInput);
    v.setUint32(1, seq >>> 0, true);
    v.setInt8(5, h);
    v.setUint8(6, buttons & 0xff);
    return buf;
}
export function encodePing(clientTimeMs) {
    const buf = new ArrayBuffer(9);
    const v = new DataView(buf);
    v.setUint8(0, Op.ClientPing);
    v.setFloat64(1, clientTimeMs, true);
    return buf;
}
export function parseJoin(data) {
    const u8 = new Uint8Array(data);
    if (u8.length < 3 || u8[0] !== Op.ClientJoin)
        throw new Error("bad join");
    const roleByte = u8[1];
    const len = u8[2];
    if (u8.length < 3 + len)
        throw new Error("truncated join");
    const roomId = new TextDecoder().decode(u8.subarray(3, 3 + len));
    const role = roleByte === RoleByte.host ? "host" : "controller";
    return { role, roomId };
}
export function parseInput(data) {
    const v = new DataView(data);
    if (data.byteLength < 7 || v.getUint8(0) !== Op.ClientInput)
        throw new Error("bad input");
    return {
        seq: v.getUint32(1, true) >>> 0,
        h: v.getInt8(5),
        buttons: v.getUint8(6),
    };
}
export function parsePing(data) {
    const v = new DataView(data);
    if (data.byteLength < 9 || v.getUint8(0) !== Op.ClientPing)
        throw new Error("bad ping");
    return v.getFloat64(1, true);
}
export function parseWelcome(data) {
    const u8 = new Uint8Array(data);
    if (u8.length < 3 || u8[0] !== Op.ServerWelcome)
        throw new Error("bad welcome");
    const playerId = u8[1];
    const len = u8[2];
    if (u8.length < 3 + len)
        throw new Error("truncated welcome");
    const roomId = new TextDecoder().decode(u8.subarray(3, 3 + len));
    return { playerId, roomId };
}
export function parseState(data) {
    const v = new DataView(data);
    if (data.byteLength < 6 || v.getUint8(0) !== Op.ServerState)
        throw new Error("bad state");
    const tick = v.getUint32(1, true) >>> 0;
    const n = v.getUint8(5);
    let o = 6;
    const players = [];
    for (let i = 0; i < n; i++) {
        if (o + 21 > data.byteLength)
            throw new Error("truncated state");
        const id = v.getUint8(o);
        o += 1;
        const x = v.getFloat32(o, true);
        o += 4;
        const y = v.getFloat32(o, true);
        o += 4;
        const vx = v.getFloat32(o, true);
        o += 4;
        const vy = v.getFloat32(o, true);
        o += 4;
        players.push({ id, x, y, vx, vy });
    }
    return { tick, players };
}
export function parsePong(data) {
    const v = new DataView(data);
    if (data.byteLength < 17 || v.getUint8(0) !== Op.ServerPong)
        throw new Error("bad pong");
    return {
        clientTime: v.getFloat64(1, true),
        serverTime: v.getFloat64(9, true),
    };
}
export function parseError(data) {
    const v = new DataView(data);
    if (data.byteLength < 3 || v.getUint8(0) !== Op.ServerError)
        throw new Error("bad error");
    const len = v.getUint16(1, true);
    const u8 = new Uint8Array(data, 3, len);
    return new TextDecoder().decode(u8);
}
/** Server-side encode helpers */
export function encodeWelcome(playerId, roomId) {
    const room = new TextEncoder().encode(roomId);
    if (room.length > 255)
        throw new Error("room id too long");
    const buf = new ArrayBuffer(3 + room.byteLength);
    const u8 = new Uint8Array(buf);
    let o = 0;
    u8[o++] = Op.ServerWelcome;
    u8[o++] = playerId & 0xff;
    u8[o++] = room.byteLength;
    u8.set(room, o);
    return buf;
}
export function encodeState(tick, players) {
    const n = Math.min(players.length, 255);
    const buf = new ArrayBuffer(6 + n * 21);
    const v = new DataView(buf);
    const u8 = new Uint8Array(buf);
    v.setUint8(0, Op.ServerState);
    v.setUint32(1, tick >>> 0, true);
    v.setUint8(5, n);
    let o = 6;
    for (let i = 0; i < n; i++) {
        const p = players[i];
        u8[o++] = p.id & 0xff;
        v.setFloat32(o, p.x, true);
        o += 4;
        v.setFloat32(o, p.y, true);
        o += 4;
        v.setFloat32(o, p.vx, true);
        o += 4;
        v.setFloat32(o, p.vy, true);
        o += 4;
    }
    return buf;
}
export function encodePong(clientTime, serverTime) {
    const buf = new ArrayBuffer(17);
    const v = new DataView(buf);
    v.setUint8(0, Op.ServerPong);
    v.setFloat64(1, clientTime, true);
    v.setFloat64(9, serverTime, true);
    return buf;
}
export function encodeError(message) {
    const text = new TextEncoder().encode(message);
    if (text.length > 65535)
        throw new Error("error message too long");
    const buf = new ArrayBuffer(3 + text.byteLength);
    const v = new DataView(buf);
    const u8 = new Uint8Array(buf);
    v.setUint8(0, Op.ServerError);
    v.setUint16(1, text.byteLength, true);
    u8.set(text, 3);
    return buf;
}
