import { Client, Callbacks, Predict, type Room } from "@colyseus/sdk";
import {
  ROOM_TYPE, MOVE_SEND_HZ, advanceDeterministicMovement, isMovementInput, validateNickname, validateRoomId
} from "@rift/shared";

export interface LobbyPlayerView {
  nickname: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  connected: boolean;
  dashActive: boolean;
  hitProtected: boolean;
  ready: boolean;
  kills: number;
  totalDamage: number;
  damageTaken: number;
  survivalTicks: number;
  facingX: number;
  facingY: number;
  dashDirectionX: number;
  dashDirectionY: number;
  dashRemainingTicks: number;
  dashInvulnerableRemainingTicks: number;
  dashCooldownRemainingTicks: number;
  hitProtectionRemainingTicks: number;
  weaponIds: readonly string[];
  weaponLevels: Readonly<Record<string, number>>;
  weaponBranches: Readonly<Record<string, string>>;
  dualBoonId: string;
  loadoutConfirmed: boolean;
  passiveLevels: Readonly<Record<string, number>>;
  upgradeChoices: readonly UpgradeChoiceView[];
  upgradeSelectionId: string;
  upgradeSelected: boolean;
  upgradeRerollUsed: boolean;
}
export interface UpgradeChoiceView {
  id: string;
  kind: string;
  label: string;
  description: string;
  nextLevel: number;
  weaponId?: string;
  passiveId?: string;
  branchId?: string;
  boonId?: string;
}
export interface EnemyView {
  assetId: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  behavior: string;
  chargeDirectionX: number;
  chargeDirectionY: number;
}
export interface ProjectileView {
  weaponId: string;
  phase: string;
  outwardDistance: number;
  maxDistance: number;
  directionX: number;
  directionY: number;
  speed: number;
  x: number;
  y: number;
}
export interface VoidFieldView {
  kind: string;
  phase: string;
  x: number;
  y: number;
  radius: number;
  essence: number;
  embers: number;
}
export interface EmberView { x: number; y: number; remainingTicks: number; }
export interface CombatEventView {
  id: string;
  tick: number;
  type: string;
  sourceId: string;
  targetId: string;
  assetId: string;
  x: number;
  y: number;
  amount: number;
  rawAmount: number;
  /** Immutable orientation and tier captured on server when this attack fired. */
  facingX: number;
  facingY: number;
  weaponLevel: number;
}
export interface CombatRenderState {
  enemies: ReadonlyMap<string, EnemyView>;
  projectiles: ReadonlyMap<string, ProjectileView>;
  voidFields: ReadonlyMap<string, VoidFieldView>;
  embers: ReadonlyMap<string, EmberView>;
  /** Only events not previously observed by this client connection. */
  events: readonly CombatEventView[];
}
export interface LobbyView {
  ruleset: string;
  roomId: string;
  sessionId: string;
  phase: string;
  matchElapsedTicks: number;
  matchDurationTicks: number;
  hostSessionId: string;
  winner: string;
  teamLevel: number;
  teamExperience: number;
  teamNextLevelExperience: number;
  upgradeId: string;
  upgradeDeadlineTick: number;
  players: Map<string, LobbyPlayerView>;
}
export interface MatchSnapshot {
  ruleset: string;
  phase: string;
  matchElapsedTicks: number;
  matchDurationTicks: number;
  hostSessionId: string;
  winner: string;
  teamLevel: number;
  teamExperience: number;
  teamNextLevelExperience: number;
  upgradeId: string;
  upgradeDeadlineTick: number;
}
export interface RenderPosition { x: number; y: number }
export type LobbyListener = (view: LobbyView) => void;
export type RenderListener = (positions: ReadonlyMap<string, RenderPosition>, combat: CombatRenderState) => void;

/**
 * M0-E network adapter. Colyseus owns input sequence IDs, acknowledgement and replay.
 * The client never mutates authoritative Schema positions.
 */
export class LobbyConnection {
  private readonly client: Client;
  private room: Room | null = null;
  private readonly players = new Map<string, LobbyPlayerView>();
  private readonly seenEventIds = new Set<string>();
  private axes = { moveX: 0, moveY: 0 } as const as {moveX: -1 | 0 | 1; moveY: -1 | 0 | 1};
  private dashQueued = false;
  private phase = "LOBBY";
  private animationFrame: number | undefined;

  constructor(
    endpoint: string,
    private onView: LobbyListener,
    private onDropped: (message: string) => void,
    private onTick: (tick: number, match: MatchSnapshot) => void = () => {},
    private onRender: RenderListener = () => {}
  ) {
    this.client = new Client(endpoint);
  }

  async create(nickname: string): Promise<void> {
    const name = validateNickname(nickname);
    await this.connect(() => this.client.create(ROOM_TYPE, { nickname: name }));
  }

  async join(roomId: string, nickname: string): Promise<void> {
    const id = validateRoomId(roomId);
    const name = validateNickname(nickname);
    await this.connect(() => this.client.joinById(id, { nickname: name }));
  }

  private async connect(open: () => Promise<Room>): Promise<void> {
    if (this.room !== null) throw new Error("请先退出当前房间");
    const room = await open();
    this.room = room;
    this.players.clear();
    const callbacks = Callbacks.get(room);
    callbacks.onAdd("players", (value: unknown, key: unknown) => {
      if (this.room !== room || typeof key !== "string" || !isLobbyPlayerView(value)) return;
      this.players.set(key, toLobbyPlayerView(value));
      // Ordinary patches update the decoded schema instance itself. Rendering is
      // driven by Predict.value() once per frame, not by patch-driven DOM rebuilds.
      callbacks.onChange(value as never, () => {
        if (this.room !== room || !isLobbyPlayerView(value)) return;
        const next = toLobbyPlayerView(value);
        const old = this.players.get(key);
        if (old && JSON.stringify(old) !== JSON.stringify(next)) {
          this.players.set(key, next);
          this.emit();
        }
      });
      this.emit();
    });
    callbacks.onRemove("players", (_player: unknown, key: unknown) => {
      if (this.room !== room || typeof key !== "string") return;
      this.players.delete(key);
      this.emit();
    });
    callbacks.listen("phase", () => {
      if (this.room === room) {
        this.phase = String((room.state as {phase?: string}).phase ?? "LOBBY");
        this.emit();
      }
    });
    callbacks.listen("serverTick", (value: unknown) => {
      if (this.room === room && typeof value === "number") {
        const match = readMatchSnapshot(room.state as MatchStateShape);
        this.phase = match.phase;
        this.onTick(value, match);
      }
    });
    room.onLeave((code: number) => {
      if (this.room !== room) return;
      this.stopInputs();
      this.room = null;
      this.players.clear();
      this.seenEventIds.clear();
      this.onDropped("房间连接已关闭，代码：" + code);
    });
    room.onError((code: number, message?: string) => {
      if (this.room === room) this.onDropped("网络异常：" + code + " " + (message ?? ""));
    });
    try {
      this.startPrediction(room);
      this.emit();
    } catch (error) {
      this.stopInputs();
      this.room = null;
      this.players.clear();
      await room.leave();
      throw error;
    }
  }

  /** Only input intent is sent to the server; never the predicted coordinates. */
  setMoveDirection(axes: {moveX: -1 | 0 | 1; moveY: -1 | 0 | 1}): void {
    this.axes = axes;
  }

  /** The input is edge-triggered; server cooldown and timing remain authoritative. */
  queueDash(): void {
    if (this.room) this.dashQueued = true;
  }

  selectLoadout(weaponIds: readonly string[]): void {
    this.room?.send("loadout.select", {weaponIds});
  }

  setReady(ready: boolean): void {
    this.room?.send("match.ready", { ready });
  }

  restartMatch(): void {
    this.room?.send("match.restart");
  }

  selectUpgrade(choiceId: string): void {
    if (choiceId.trim()) this.room?.send("upgrade.select", { choiceId });
  }

  rerollUpgrade(): void {
    this.room?.send("upgrade.reroll");
  }

  private startPrediction(room: Room): void {
    this.stopInputs();
    const input = room.input();
    if (input.tickRate !== MOVE_SEND_HZ) {
      throw new Error("服务端移动 Tick 频率与客户端不一致");
    }

    const predictor = Predict.get(room, { mode: "lerp", delay: 100 });
    predictor.attachAll("players", { mode: "lerp", fields: ["x", "y"] });
    let localReconcilerAttached = false;

    const frame = (now: number): void => {
      if (this.room !== room) return;
      const state = room.state as {
        players?: Map<string, LobbyPlayerView>;
        enemies?: Map<string, EnemyView>;
        projectiles?: Map<string, ProjectileView>;
        voidFields?: Map<string, VoidFieldView>;
        embers?: Map<string, EmberView>;
        events?: Map<string, Omit<CombatEventView, "id">>;
      };
      const players = state.players;

      // Initial Schema collection callbacks may arrive after the join promise.
      // Construct the local controller only once the authoritative self exists.
      if (!localReconcilerAttached) {
        const self = players?.get(room.sessionId);
        if (self) {
          predictor.reconciler(self, {
            input,
            fields: [
              "x", "y", "facingX", "facingY", "dashDirectionX", "dashDirectionY",
              "dashRemainingTicks", "dashInvulnerableRemainingTicks",
              "dashCooldownRemainingTicks", "hitProtectionRemainingTicks"
            ],
            smoothMs: 65,
            snap: 150,
            step: (ctx, pose, cmd) => {
              if (this.phase === "RUNNING" && isMovementInput(cmd)) {
                advanceDeterministicMovement(pose, cmd, ctx.dt);
              }
            }
          });
          localReconcilerAttached = true;
        }
      }

      // SDK performs acknowledgment-driven rollback/replay; send before reading.
      const steps = predictor.tick(now);
      for (let i = 0; i < steps; i++) {
        const wire = input.data as { moveX: number; moveY: number; dash: boolean };
        wire.moveX = this.axes.moveX;
        wire.moveY = this.axes.moveY;
        wire.dash = this.dashQueued;
        this.dashQueued = false;
        input.send();
      }

      if (players) {
        const positions = new Map<string, RenderPosition>();
        for (const [id, player] of players) {
          const x = predictor.value(player, "x");
          const y = predictor.value(player, "y");
          if (Number.isFinite(x) && Number.isFinite(y)) positions.set(id, { x, y });
        }
        this.onRender(positions, this.readCombatState(state));
      }

      this.animationFrame = window.requestAnimationFrame(frame);
    };
    this.animationFrame = window.requestAnimationFrame(frame);
  }

  private stopInputs(): void {
    if (this.animationFrame !== undefined) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.axes = { moveX: 0, moveY: 0 };
    this.dashQueued = false;
    this.phase = "LOBBY";
  }

  get connected(): boolean { return this.room !== null; }
  get roomId(): string { return this.room?.roomId ?? ""; }

  async leave(): Promise<void> {
    const room = this.room;
    if (!room) return;
    this.stopInputs();
    this.room = null;
    this.players.clear();
    this.seenEventIds.clear();
    this.phase = "LOBBY";
    await room.leave();
  }

  private emit(): void {
    const room = this.room;
    if (!room) return;
    const match = readMatchSnapshot(room.state as MatchStateShape);
    this.phase = match.phase;
    this.onView({
      roomId: room.roomId,
      ruleset: match.ruleset,
      sessionId: room.sessionId,
      phase: match.phase,
      matchElapsedTicks: match.matchElapsedTicks,
      matchDurationTicks: match.matchDurationTicks,
      hostSessionId: match.hostSessionId,
      winner: match.winner,
      teamLevel: match.teamLevel,
      teamExperience: match.teamExperience,
      teamNextLevelExperience: match.teamNextLevelExperience,
      upgradeId: match.upgradeId,
      upgradeDeadlineTick: match.upgradeDeadlineTick,
      players: new Map(this.players)
    });
  }

  private readCombatState(state: {
    enemies?: Map<string, EnemyView>;
    projectiles?: Map<string, ProjectileView>;
    events?: Map<string, Omit<CombatEventView, "id">>;
    voidFields?: Map<string, VoidFieldView>;
    embers?: Map<string, EmberView>;
  }): CombatRenderState {
    const enemies = new Map<string, EnemyView>();
    for (const [id, enemy] of state.enemies ?? []) {
      enemies.set(id, {
        assetId: enemy.assetId,
        x: enemy.x,
        y: enemy.y,
        health: enemy.health,
        maxHealth: enemy.maxHealth,
        alive: enemy.alive,
        behavior: enemy.behavior,
        chargeDirectionX: enemy.chargeDirectionX,
        chargeDirectionY: enemy.chargeDirectionY
      });
    }

    const projectiles = new Map<string, ProjectileView>();
    for (const [id, projectile] of state.projectiles ?? []) {
      projectiles.set(id, {
        weaponId: projectile.weaponId,
        phase: projectile.phase ?? "",
        outwardDistance: Number(projectile.outwardDistance ?? 0),
        maxDistance: Number(projectile.maxDistance ?? 0),
        directionX: Number(projectile.directionX ?? 0),
        directionY: Number(projectile.directionY ?? 0),
        speed: Number(projectile.speed ?? 0),
        x: projectile.x,
        y: projectile.y
      });
    }

    const voidFields = new Map<string, VoidFieldView>();
    for (const [id, f] of state.voidFields ?? []) {
      voidFields.set(id,{kind:f.kind,phase:f.phase,x:f.x,y:f.y,radius:f.radius,essence:f.essence,embers:f.embers});
    }
    const embers = new Map<string, EmberView>();
    for (const [id, e] of state.embers ?? []) embers.set(id,{x:e.x,y:e.y,remainingTicks:e.remainingTicks ?? 0});
    const events: CombatEventView[] = [];
    for (const [id, event] of state.events ?? []) {
      if (this.seenEventIds.has(id)) continue;
      this.seenEventIds.add(id);
      events.push({
        id,
        tick: event.tick, type: event.type, sourceId: event.sourceId,
        targetId: event.targetId, assetId: event.assetId,
        x: event.x, y: event.y, amount: event.amount, rawAmount: event.rawAmount,
        facingX: Number(event.facingX ?? 0),
        facingY: Number(event.facingY ?? 0),
        weaponLevel: Number(event.weaponLevel ?? 0)
      });
    }
    while (this.seenEventIds.size > 4096) {
      const oldest = this.seenEventIds.values().next().value as string | undefined;
      if (!oldest) break;
      this.seenEventIds.delete(oldest);
    }
    return { enemies, projectiles, voidFields, embers, events };
  }
}

interface MatchStateShape {
  ruleset?: string;
  phase?: string;
  matchElapsedTicks?: number;
  matchDurationTicks?: number;
  hostSessionId?: string;
  winner?: string;
  teamLevel?: number;
  teamExperience?: number;
  teamNextLevelExperience?: number;
  upgradeId?: string;
  upgradeDeadlineTick?: number;
}

function readMatchSnapshot(state: MatchStateShape): MatchSnapshot {
  return {
    ruleset: String(state.ruleset ?? "legacy"),
    phase: state.phase ?? "LOBBY",
    matchElapsedTicks: Number(state.matchElapsedTicks ?? 0),
    matchDurationTicks: Number(state.matchDurationTicks ?? 4800),
    hostSessionId: String(state.hostSessionId ?? ""),
    winner: String(state.winner ?? "NONE"),
    teamLevel: Number(state.teamLevel ?? 1),
    teamExperience: Number(state.teamExperience ?? 0),
    teamNextLevelExperience: Number(state.teamNextLevelExperience ?? 50),
    upgradeId: String(state.upgradeId ?? ""),
    upgradeDeadlineTick: Number(state.upgradeDeadlineTick ?? 0)
  };
}

export function getServerEndpoint(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env?.trim()) return env.trim();
  return window.location.protocol + "//" + window.location.hostname + ":2567";
}

function isLobbyPlayerView(value: unknown): value is LobbyPlayerView {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.nickname === "string" && typeof item.x === "number" && typeof item.y === "number" &&
    typeof item.health === "number" && typeof item.maxHealth === "number" && typeof item.alive === "boolean" &&
    typeof item.connected === "boolean" &&
    typeof item.dashActive === "boolean" && typeof item.hitProtected === "boolean" &&
    typeof item.ready === "boolean" && typeof item.kills === "number" &&
    typeof item.totalDamage === "number" && typeof item.damageTaken === "number" &&
    typeof item.survivalTicks === "number" && typeof item.facingX === "number" &&
    typeof item.facingY === "number" && typeof item.dashDirectionX === "number" &&
    typeof item.dashDirectionY === "number" && typeof item.dashRemainingTicks === "number" &&
    typeof item.dashInvulnerableRemainingTicks === "number" &&
    typeof item.dashCooldownRemainingTicks === "number" &&
    typeof item.hitProtectionRemainingTicks === "number" &&
    typeof item.weaponIds === "string" && typeof item.weaponLevels === "string" &&
    typeof item.passiveLevels === "string" && typeof item.upgradeChoices === "string" &&
    typeof item.upgradeSelectionId === "string" && typeof item.upgradeSelected === "boolean" &&
    typeof item.upgradeRerollUsed === "boolean";
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function toLobbyPlayerView(value: LobbyPlayerView): LobbyPlayerView {
  const raw = value as unknown as Record<string, unknown>;
  return {
    nickname: value.nickname, x: value.x, y: value.y, health: value.health, maxHealth: value.maxHealth,
    alive: value.alive, connected: value.connected, dashActive: value.dashActive, hitProtected: value.hitProtected,
    ready: value.ready, kills: value.kills, totalDamage: value.totalDamage, damageTaken: value.damageTaken,
    survivalTicks: value.survivalTicks, facingX: value.facingX, facingY: value.facingY,
    dashDirectionX: value.dashDirectionX, dashDirectionY: value.dashDirectionY,
    dashRemainingTicks: value.dashRemainingTicks, dashInvulnerableRemainingTicks: value.dashInvulnerableRemainingTicks,
    dashCooldownRemainingTicks: value.dashCooldownRemainingTicks, hitProtectionRemainingTicks: value.hitProtectionRemainingTicks,
    weaponIds: parseJson<readonly string[]>(String(raw.weaponIds ?? "[]"), []),
    weaponLevels: parseJson<Readonly<Record<string, number>>>(String(raw.weaponLevels ?? "{}"), {}),
    weaponBranches: parseJson<Readonly<Record<string, string>>>(String(raw.weaponBranches ?? "{}"), {}),
    dualBoonId: String(raw.dualBoonId ?? ""),
    loadoutConfirmed: Boolean(raw.loadoutConfirmed ?? true),
    passiveLevels: parseJson<Readonly<Record<string, number>>>(String(raw.passiveLevels ?? "{}"), {}),
    upgradeChoices: parseJson<readonly UpgradeChoiceView[]>(String(raw.upgradeChoices ?? "[]"), []),
    upgradeSelectionId: String(raw.upgradeSelectionId ?? ""),
    upgradeSelected: Boolean(raw.upgradeSelected),
    upgradeRerollUsed: Boolean(raw.upgradeRerollUsed)
  };
}
