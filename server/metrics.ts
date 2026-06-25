/**
 * Lightweight in-process counters + periodic diagnostics for the game server.
 * Logged hourly to stdout as a single structured JSON line (searchable in
 * Railway's Log Explorer). No external dependencies / endpoints.
 */

export type ServerCounters = {
  /** Rooms created via a host join. */
  roomsCreated: number;
  /** Rooms torn down (host disconnect / reap). */
  roomsDestroyed: number;
  /** New players created from the prejoin "create" flow. */
  joinsCreate: number;
  /** Players resumed via the prejoin "Join As:" claim flow. */
  joinsClaim: number;
  /** Seamless auto-resumes within the cid grace window. */
  autoResumes: number;
  /** Controller/host socket close events observed. */
  disconnects: number;
  /** Grace windows that expired without a reconnect. */
  graceExpirations: number;
  /** Half-open sockets terminated by the heartbeat. */
  zombiesReaped: number;
};

export const counters: ServerCounters = {
  roomsCreated: 0,
  roomsDestroyed: 0,
  joinsCreate: 0,
  joinsClaim: 0,
  autoResumes: 0,
  disconnects: 0,
  graceExpirations: 0,
  zombiesReaped: 0,
};

/**
 * Measures event-loop lag: schedule a 0ms timer and report how late it fires.
 * High lag indicates the loop is saturated (unexpected for a low-CPU process).
 */
function sampleEventLoopLagMs(): Promise<number> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    setTimeout(() => {
      const elapsedNs = Number(process.hrtime.bigint() - start);
      resolve(elapsedNs / 1e6);
    }, 0);
  });
}

const MB = 1024 * 1024;
function toMb(bytes: number): number {
  return Math.round((bytes / MB) * 10) / 10;
}

export type SnapshotInput = {
  /** Live websocket clients (host + controllers + prejoin). */
  clientCount: number;
  roomCount: number;
  playerCount: number;
  controllerCount: number;
  prejoinCount: number;
  /** Sum of `bufferedAmount` across all live sockets (bytes). */
  bufferedSumBytes: number;
  /** Max `bufferedAmount` of any single socket (bytes). */
  bufferedMaxBytes: number;
};

/** Builds and logs a single structured diagnostics line to stdout. */
export async function logDiagnostics(label: string, input: SnapshotInput): Promise<void> {
  const mem = process.memoryUsage();
  const lagMs = await sampleEventLoopLagMs();
  const line = {
    evt: "server_metrics",
    label,
    uptimeSec: Math.round(process.uptime()),
    mem: {
      rssMb: toMb(mem.rss),
      heapUsedMb: toMb(mem.heapUsed),
      heapTotalMb: toMb(mem.heapTotal),
      externalMb: toMb(mem.external),
      arrayBuffersMb: toMb(mem.arrayBuffers),
    },
    eventLoopLagMs: Math.round(lagMs * 10) / 10,
    live: {
      clients: input.clientCount,
      rooms: input.roomCount,
      players: input.playerCount,
      controllers: input.controllerCount,
      prejoin: input.prejoinCount,
    },
    sockets: {
      bufferedSumMb: toMb(input.bufferedSumBytes),
      bufferedMaxMb: toMb(input.bufferedMaxBytes),
    },
    totals: { ...counters },
  };
  console.log(JSON.stringify(line));
}
