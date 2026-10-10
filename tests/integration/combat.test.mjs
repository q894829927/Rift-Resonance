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

test("combat state synchronizes enemy chase, weapon events, health and death", { timeout: 15000 }, async () => {
  const room = await client.create(ROOM_TYPE, { nickname: "Combatant" });
  try {
    await waitUntil(() => room.state?.enemies?.size === 1, "initial enemy spawn");
    const enemy = room.state.enemies.get("enemy:slime:1");
    assert.equal(enemy.assetId, "enemy.slime");
    assert.equal(enemy.maxHealth, 40);
    await waitUntil(() => [...room.state.events.values()].some(event => event.type === "weapon.fired"), "weapon event");
    await waitUntil(() => {
      const player = room.state.players.get(room.sessionId);
      return player?.health === 100 && player.maxHealth === 100 && player.alive === true;
    }, "health projection");
    await waitUntil(() => room.state.enemies.get("enemy:slime:1")?.alive === false, "enemy death");
    const death = [...room.state.events.values()].find(event =>
      event.type === "enemy.died" && event.targetId === "enemy:slime:1");
    assert.ok(death);
    assert.equal(room.state.enemies.get("enemy:slime:1").health, 0);
  } finally {
    await room.leave();
  }
});
