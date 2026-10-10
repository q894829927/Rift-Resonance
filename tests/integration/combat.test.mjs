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

test("two players receive the same server-owned XP upgrade phase and can resume together", { timeout: 50000 }, async () => {
  const rooms = [];
  const timers = [];
  try {
    const alice = await client.create(ROOM_TYPE, { nickname: "Alice" });
    rooms.push(alice);
    const bob = await client.joinById(alice.roomId, { nickname: "Bob" });
    rooms.push(bob);
    await waitUntil(() => alice.state?.players?.size === 2 && bob.state?.players?.size === 2, "two upgrade players");
    alice.send("match.ready", { ready: true });
    bob.send("match.ready", { ready: true });
    await waitUntil(() => alice.state?.phase === "RUNNING", "running upgrade match");

    // Keep both players moving around the arena while the authoritative weapons
    // accumulate enough deterministic kills to cross the first XP threshold.
    for (const [index, room] of [alice, bob].entries()) {
      const input = room.input();
      let direction = index === 0 ? 1 : -1;
      let elapsed = 0;
      timers.push(setInterval(() => {
        elapsed += 50;
        if (elapsed >= 800) {
          elapsed = 0;
          direction *= -1;
        }
        input.data.moveX = direction;
        input.data.moveY = index === 0 ? 0 : direction;
        input.data.dash = false;
        input.send();
      }, 50));
    }

    await waitUntil(() => alice.state?.phase === "UPGRADING", "shared upgrade phase", 40000);
    assert.equal(bob.state.phase, "UPGRADING");
    assert.equal(alice.state.teamLevel, bob.state.teamLevel);
    assert.equal(alice.state.teamExperience, bob.state.teamExperience);
    const alicePlayer = alice.state.players.get(alice.sessionId);
    const bobPlayer = bob.state.players.get(bob.sessionId);
    const aliceChoices = JSON.parse(alicePlayer.upgradeChoices);
    const bobChoices = JSON.parse(bobPlayer.upgradeChoices);
    assert.ok(aliceChoices.length > 0 && aliceChoices.length <= 3);
    assert.ok(bobChoices.length > 0 && bobChoices.length <= 3);
    alice.send("upgrade.select", { choiceId: aliceChoices[0].id });
    bob.send("upgrade.select", { choiceId: bobChoices[0].id });
    await waitUntil(() => alice.state?.phase === "RUNNING" && bob.state?.phase === "RUNNING", "resume after synchronized choices");
    assert.equal(alice.state.players.get(alice.sessionId).upgradeSelected, false);
  } finally {
    for (const timer of timers) clearInterval(timer);
    await Promise.allSettled(rooms.map(room => room.leave()));
  }
});
