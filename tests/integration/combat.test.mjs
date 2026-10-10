import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";
import { ROOM_TYPE } from "../../packages/shared/dist/index.js";

const client = new Client(process.env.TEST_SERVER_URL || "http://127.0.0.1:2567");

async function waitUntil(check, label, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Timeout: " + label);
}

test("combat state synchronizes sustained spawning, weapons, health and death", { timeout: 20000 }, async () => {
  const room = await client.create(ROOM_TYPE, { nickname: "Combatant" });
  try {
    await waitUntil(() => room.state?.players?.size === 1, "player projection");
    room.send("match.ready", { ready: true });
    await waitUntil(() => room.state?.phase === "RUNNING", "combat start");
    await waitUntil(() => room.state?.enemies?.size >= 1, "initial enemy spawn");
    const [enemyId, enemy] = [...room.state.enemies.entries()][0];
    assert.equal(enemy.assetId, "enemy.rift_swarm");
    assert.equal(enemy.maxHealth, 35);
    await waitUntil(() => [...room.state.events.values()].some(event =>
      event.type === "weapon.fired" && event.assetId === "weapon.fireball"), "fireball event");
    await waitUntil(() => room.state?.enemies?.size >= 2, "fixed cadence spawn", 3000);
    await waitUntil(() => {
      const player = room.state.players.get(room.sessionId);
      return player?.health === 100 && player.maxHealth === 100 && player.alive === true;
    }, "health projection");
    await waitUntil(() => [...room.state.events.values()].some(event =>
      event.type === "enemy.died" && event.targetId === enemyId), "enemy death");
    const death = [...room.state.events.values()].find(event =>
      event.type === "enemy.died" && event.targetId === enemyId);
    assert.ok(death);
    assert.equal(death.assetId, "enemy.rift_swarm");
  } finally {
    await room.leave();
  }
});

test("combat input projects authoritative dash and hit protection", { timeout: 12000 }, async () => {
  const room = await client.create(ROOM_TYPE, { nickname: "Dasher" });
  try {
    await waitUntil(() => room.state?.players?.size === 1, "player projection");
    room.send("match.ready", { ready: true });
    await waitUntil(() => room.state?.phase === "RUNNING", "combat start");
    const input = room.input();
    input.data.moveX = 1;
    input.data.moveY = 0;
    input.data.dash = true;
    input.send();
    input.data.dash = false;
    await waitUntil(() => [...room.state.events.values()].some(event => event.type === "dash.started"), "dash event");
    await waitUntil(() => room.state.players.get(room.sessionId)?.dashActive === true, "dash projection");
    assert.equal(room.state.players.get(room.sessionId).hitProtected, true);
    await waitUntil(() => room.state.players.get(room.sessionId)?.dashActive === false, "dash projection clears", 1000);
  } finally {
    await room.leave();
  }
});
