import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";
import { ROOM_TYPE } from "../../packages/shared/dist/index.js";

const client = new Client(process.env.TEST_SERVER_URL || "http://127.0.0.1:2570");
async function waitUntil(check, label, timeout = 9000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error("Timeout waiting for " + label);
}

test("V2 Colyseus room requires manual dual loadout and projects traveling orbs / cores", {timeout:18000}, async () => {
  const room = await client.create(ROOM_TYPE, {nickname:"VoidTester"});
  try {
    await waitUntil(()=>room.state?.players?.size===1,"joined V2 room");
    assert.equal(room.state.ruleset,"dual_v2");
    room.send("match.ready",{ready:true});
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(room.state.phase,"LOBBY","server must reject ready before loadout");
    assert.equal(room.state.players.get(room.sessionId).loadoutConfirmed,false);
    room.send("loadout.select",{weaponIds:["weapon.fireball","weapon.void_orb"]});
    await waitUntil(()=>room.state.players.get(room.sessionId)?.loadoutConfirmed===true,"loadout approval");
    room.send("match.ready",{ready:true});
    await waitUntil(()=>room.state.phase==="RUNNING","match start");
    await waitUntil(()=>[...room.state.projectiles.values()].some(p =>
      p.weaponId==="weapon.fireball" &&
      Math.hypot(p.directionX,p.directionY)>0.95 && p.speed>0
    ),"authoritative fireball heading and speed",6000);
    const fireball=[...room.state.projectiles.values()].find(p=>
      p.weaponId==="weapon.fireball" && Math.hypot(p.directionX,p.directionY)>0.95);
    assert.ok(fireball);
    assert.ok(Math.abs(Math.hypot(fireball.directionX,fireball.directionY)-1)<0.02);
    assert.ok(fireball.speed>=300);

    await waitUntil(()=>[...room.state.projectiles.values()].some(p=>p.weaponId==="weapon.void_orb") ||
      room.state.voidFields.size>0,"server traveling orb or arrived field",6000);
    await waitUntil(()=>room.state.voidFields.size>0,"synced void core",6000);
    const core=[...room.state.voidFields.values()][0];
    assert.equal(core.kind,"collapse");
    assert.ok(core.radius>=100);
    assert.ok(typeof core.essence==="number");
    assert.ok(typeof core.embers==="number");
    assert.ok(room.state.embers !== undefined);
  } finally {
    await room.leave();
  }
});
