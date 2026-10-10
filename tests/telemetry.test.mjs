import test from "node:test";
import assert from "node:assert/strict";
import { RoomTelemetry, summarize } from "../apps/server/dist/telemetry/metrics.js";

test("telemetry reports nearest-rank percentiles and bounded data", () => {
  assert.deepEqual(summarize([]), {count:0,mean:null,p95:null,p99:null,max:null});
  const stats = summarize(Array.from({length:100}, (_,i)=>i+1));
  assert.equal(stats.count,100);
  assert.equal(stats.mean,50.5);
  assert.equal(stats.p95,95);
  assert.equal(stats.p99,99);
  assert.equal(stats.max,100);
  const room = new RoomTelemetry();
  for(let i=0;i<3000;i++)room.tick(i*50, 2);
  room.setClients(4);
  const snapshot = room.snapshot();
  assert.equal(snapshot.clients,4);
  assert.equal(snapshot.totalTicks,3000);
  assert.equal(snapshot.tickDurationMs.count,1200);
  assert.equal(snapshot.tickIntervalMs.count,1200);
  assert.equal(snapshot.tickIntervalMs.p99,50);
});
