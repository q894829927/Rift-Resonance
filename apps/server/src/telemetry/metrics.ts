/**
 * M0-F diagnostics only. No player IDs, names or private room IDs are exported.
 * Bounded rolling windows avoid growth during long-running sessions.
 */
const WINDOW = 1200;

export interface Percentiles {
  count: number;
  mean: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

function pushBounded(target: number[], value: number): void {
  if (!Number.isFinite(value)) return;
  if (target.length >= WINDOW) target.shift();
  target.push(value);
}

export function summarize(samples: readonly number[]): Percentiles {
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, mean: null, p95: null, p99: null, max: null };
  }
  const at = (p: number): number => sorted[Math.ceil(sorted.length * p) - 1]!;
  return {
    count: sorted.length,
    mean: sorted.reduce((sum, n) => sum + n, 0) / sorted.length,
    p95: at(.95),
    p99: at(.99),
    max: sorted[sorted.length - 1]!
  };
}

export class RoomTelemetry {
  private readonly durations: number[] = [];
  private readonly intervals: number[] = [];
  private previousStart: number | null = null;
  private totalTicks = 0;
  private clients = 0;

  tick(startMs: number, durationMs: number): void {
    if (this.previousStart !== null) {
      pushBounded(this.intervals, startMs - this.previousStart);
    }
    this.previousStart = startMs;
    pushBounded(this.durations, durationMs);
    this.totalTicks++;
  }

  setClients(count: number): void {
    this.clients = count;
  }

  snapshot(): object {
    return {
      totalTicks: this.totalTicks,
      clients: this.clients,
      tickDurationMs: summarize(this.durations),
      tickIntervalMs: summarize(this.intervals)
    };
  }
}

const active = new Map<string, RoomTelemetry>();

export function registerRoom(roomId: string): void {
  active.set(roomId, new RoomTelemetry());
}
export function unregisterRoom(roomId: string): void {
  active.delete(roomId);
}
export function recordRoomTick(roomId: string, startMs: number, durationMs: number): void {
  active.get(roomId)?.tick(startMs, durationMs);
}
export function recordRoomClients(roomId: string, count: number): void {
  active.get(roomId)?.setClients(count);
}

export function diagnosticsSnapshot(): object {
  const mem = process.memoryUsage();
  const usage = process.cpuUsage();
  return {
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptimeSeconds: process.uptime(),
    cpuUsageMicros: { user: usage.user, system: usage.system },
    memoryBytes: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external
    },
    activeRooms: active.size,
    rooms: [...active.values()].map(room => room.snapshot())
  };
}
