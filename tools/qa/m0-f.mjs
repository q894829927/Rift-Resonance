#!/usr/bin/env node
/**
 * M0-F repeatable network endurance / impaired-link harness.
 * Run against a PRIVATE local server. TCP proxy simulates delay and jitter, not packet loss.
 * Uses real Colyseus SDK clients and their fixed-rate input channels.
 */
import net from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { Client } from "@colyseus/sdk";
import { ROOM_TYPE } from "../../packages/shared/dist/index.js";

function argument(name, fallback) {
  const found = process.argv.find(arg => arg.startsWith("--" + name + "="));
  return found ? found.slice(name.length + 3) : fallback;
}
const durationSec = Number(argument("duration-sec", "20"));
const playerCount = Number(argument("players", "4"));
const rttMs = Number(argument("rtt-ms", "0"));
const jitterMs = Number(argument("jitter-ms", "0"));
const maxOutKBps = Number(argument("max-out-kbps", "60"));
const reportPath = argument("report", "reports/m0-f-last.json");
const disconnect = process.argv.includes("--disconnect");
const requireMetrics = process.argv.includes("--require-metrics");
const origin = argument("server", "http://127.0.0.1:2567");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
  throw new Error("M0-F only accepts a loopback development server URL");
}
if (![durationSec,playerCount,rttMs,jitterMs,maxOutKBps].every(Number.isFinite) ||
    durationSec < 6 || durationSec > 7200 || !Number.isInteger(playerCount) ||
    playerCount < 2 || playerCount > 4 || rttMs < 0 || jitterMs < 0 || maxOutKBps <= 0) {
  throw new Error("Invalid parameters: players=2..4, duration=6..7200sec, RTT/jitter>=0");
}
const targetPort = Number(new URL(origin).port);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitUntil(check, label, limitMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < limitMs) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error("Timed out: " + label);
}

function startProxy() {
  const sockets = new Set();
  const stats = {upstreamBytes:0, downstreamBytes:0, tcpConnections:0};
  let impaired = false;
  const server = net.createServer((downstream) => {
    const upstream = net.connect({host:"127.0.0.1",port:targetPort});
    sockets.add(downstream); sockets.add(upstream);
    stats.tcpConnections++;
    const timers = new Set();
    let clientDue = 0, serverDue = 0;
    let aborted = false;

    function abortConnection() {
      if(aborted)return;
      aborted = true;
      for(const timer of timers)clearTimeout(timer);
      timers.clear();
      downstream.destroy();
      upstream.destroy();
    }

    function relay(source, dest, direction) {
      let endReceived = false;
      let pending = 0;
      const flushEnd = () => {
        // Do not end the receiving stream until all delayed chunks have gone out.
        if(endReceived && pending===0 && !dest.destroyed) dest.end();
      };

      source.on("data", (chunk) => {
        if(aborted)return;
        if(direction==="up")stats.upstreamBytes+=chunk.byteLength;
        else stats.downstreamBytes+=chunk.byteLength;

        const jitter=impaired ? jitterMs*(Math.random()*2-1) : 0;
        const previous=direction==="up"?clientDue:serverDue;
        const due=Math.max(Date.now()+Math.max(0,(impaired?rttMs/2:0)+jitter),previous+0.01);
        if(direction==="up")clientDue=due;
        else serverDue=due;

        pending++;
        const timer=setTimeout(()=>{
          timers.delete(timer);
          pending--;
          if(!aborted && !dest.destroyed)dest.write(chunk);
          flushEnd();
        },Math.max(0,due-Date.now()));
        timers.add(timer);
      });
      source.on("end",()=>{
        endReceived = true;
        flushEnd();
      });
      source.on("error",abortConnection);
      source.on("close",()=>{
        sockets.delete(source);
        // Normal TCP FIN is not an error: delayed responses may still be queued.
        if(!endReceived)abortConnection();
      });
    }
    relay(downstream,upstream,"up");
    relay(upstream,downstream,"down");
  });
  server.on("error", error => console.error("[proxy]", error.message));

  return {
    stats,
    setImpairment(value){ impaired=Boolean(value); },
    async listen() {
      await new Promise((resolve,reject)=>{
        server.once("error",reject);
        server.listen(0,"127.0.0.1",resolve);
      });
      const addr=server.address();
      return "http://127.0.0.1:"+addr.port;
    },
    async close() {
      for(const socket of [...sockets])socket.destroy();
      await new Promise(resolve=>server.close(resolve));
    }
  };
}

async function getMetrics() {
  const response = await fetch(origin+"/internal/m0-metrics");
  if (!response.ok) throw new Error("metrics HTTP " + response.status);
  return await response.json();
}
function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.ceil(sorted.length*fraction)-1];
}
const report = {
  type:"m0-f-benchmark",
  generatedAt:new Date().toISOString(),
  configuration:{durationSec,playerCount,rttMs,jitterMs,disconnect,requireMetrics,maxOutKBps},
  methodology:"Real SDK clients; matchmaking uses clean transport. After room join, per-client TCP proxy adds RTT/jitter to live game traffic and measured HTTP probes. Traffic baseline excludes setup. No IP packet loss emulation.",
  result:"running"
};
const proxies=[], rooms=[], senders=[], observations=[], endpoints=[], setupFailures=[];
let firstMetrics=null, peakRss=0, maxTickP99=0, endedMetrics=null, monitor=null;
let startedAt=0, endedAt=0;

try {
  try {
    firstMetrics=await getMetrics();
  } catch(error) {
    if (requireMetrics) throw new Error("Enable M0_DIAGNOSTICS=1 on the server: " + error.message);
    report.metricsAvailable=false;
  }
  for(let i=0;i<playerCount;i++) {
    const proxy=startProxy();
    const endpoint=await proxy.listen();
    proxies.push(proxy);
    endpoints.push(endpoint);
    const client=new Client(endpoint);
    let room;
    for(let attempt=0;attempt<3;attempt++){
      try {
        room=i===0
          ?await client.create(ROOM_TYPE,{nickname:"Load"+i})
          :await client.joinById(rooms[0].roomId,{nickname:"Load"+i});
        break;
      } catch(error) {
        setupFailures.push({player:i,attempt:attempt+1,message:String(error)});
        if(attempt===2)throw error;
        await sleep(300 + rttMs*2);
      }
    }
    if(!room)throw new Error("No room obtained after retries");
    rooms.push(room);
    observations.push({player:i,positions:0,tickSamples:0,lastTick:null,disconnects:0});
    const stat=observations[i];
    room.onLeave(()=>{stat.disconnects++});
    room.onStateChange((state)=>{
      if (!state || !state.players) return;
      stat.tickSamples++;
      stat.lastTick=state.serverTick;
      const player=state.players.get(room.sessionId);
      if (player && Number.isFinite(player.x) && Number.isFinite(player.y)) stat.positions++;
    });
  }
  await waitUntil(()=>rooms.every(room=>room.state?.players?.size===playerCount),"room membership");
  // Load tests stress the LIVE game transport, not the HTTP matchmaking handshake.
  // Enable impairment only after all players have joined successfully.
  for(const proxy of proxies)proxy.setImpairment(true);
  const tBefore=rooms[0].state.serverTick;
  await waitUntil(()=>rooms[0].state.serverTick>=tBefore+3,"tick updates");
  for(let i=0;i<rooms.length;i++) {
    if(rooms[i].input().tickRate!==20) throw new Error("Input tick rate mismatch");
  }
  // Probe observed HTTP request/response round-trip through the same proxy.
  // This is an HTTP probe including processing overhead, not WebSocket gameplay RTT.
  const observedHttpRtts = [];
  for(let i=0;i<5;i++){
    const begin=performance.now();
    const response=await fetch(endpoints[0]+"/health");
    if(!response.ok)throw new Error("Health probe failed");
    await response.arrayBuffer();
    observedHttpRtts.push(performance.now()-begin);
  }
  const httpRttP50=quantile(observedHttpRtts,.5);
  if(rttMs>=80 && httpRttP50<rttMs*.65){
    throw new Error("Delay proxy not applying expected round trip delay: "+httpRttP50);
  }
  // Each proxy receives its own matchmaking and WS traffic; connection stats are
  // snapshotted after join so sustained rates exclude asset/room matchmaking.
  const baseline=proxies.map(p=>({...p.stats}));
  const metricsStart=firstMetrics ? await getMetrics() : null;
  const windowStats=[];
  if(metricsStart) {
    monitor=setInterval(async()=>{
      try {
        const m=await getMetrics();
        windowStats.push(m);
        peakRss=Math.max(peakRss,m.memoryBytes.rss);
        for(const room of m.rooms) maxTickP99=Math.max(maxTickP99,room.tickDurationMs.p99??0);
      } catch {}
    },1000);
  }
  startedAt=performance.now();
  for(let i=0;i<rooms.length;i++) {
    const input=rooms[i].input();
    let tick=0;
    const timer=setInterval(()=>{
      // Clockwise loop: constant motion, avoid long-term drift to map edges.
      const phase=Math.floor(tick/20)%4;
      const dir=[[1,0],[0,1],[-1,0],[0,-1]][phase];
      input.data.moveX=dir[0];
      input.data.moveY=dir[1];
      try{input.send()}catch{}
      tick++;
    },50);
    senders.push(timer);
  }

  let disconnectedIndex=-1, rejoined=false, tickAtDisconnect=0;
  if(disconnect){
    await sleep(durationSec*500);
    disconnectedIndex=rooms.length-1;
    tickAtDisconnect=rooms[0].state.serverTick;
    clearInterval(senders[disconnectedIndex]);
    await proxies[disconnectedIndex].close();
    await waitUntil(()=>rooms[0].state?.players?.size===playerCount-1,"forced disconnect removal",12000);
    await waitUntil(()=>rooms[0].state.serverTick>=tickAtDisconnect+4,"survivors remain active",8000);
    // An ordinary new join is NOT a resumed identity; reconnection is a later milestone.
    const replacement=startProxy();
    const endpoint=await replacement.listen();
    proxies.push(replacement);
    const newRoom=await new Client(endpoint).joinById(rooms[0].roomId,{nickname:"Rejoin"});
    rooms.push(newRoom);
    await waitUntil(()=>rooms[0].state?.players?.size===playerCount,"new user can reuse slot");
    if(newRoom.sessionId===rooms[disconnectedIndex].sessionId) {
      throw new Error("Replacement unexpectedly reused disconnected session ID");
    }
    rejoined=true;
    replacement.setImpairment(true);
    baseline.push({...replacement.stats});
    const newInput=newRoom.input();
    senders.push(setInterval(()=>{
      newInput.data.moveX=0;newInput.data.moveY=1;
      try{newInput.send()}catch{}
    },50));
  }
  await sleep(disconnect ? Math.max(1000,durationSec*500) : durationSec*1000);
  endedAt=performance.now();
  if(monitor) {clearInterval(monitor); monitor=null;}
  endedMetrics=firstMetrics ? await getMetrics() : null;
  if(endedMetrics){
    windowStats.push(endedMetrics);
    peakRss=Math.max(peakRss,endedMetrics.memoryBytes.rss);
  }

  for (const room of rooms.slice(0,playerCount)) {
    if(room===rooms[disconnectedIndex])continue;
    if(room.state?.players?.size!==playerCount) throw new Error("Room lost a player unexpectedly");
    if(!Number.isInteger(room.state.serverTick)||room.state.serverTick<=tBefore)throw new Error("Room tick stalled");
    for(const member of room.state.players.values()){
      if(![member.x,member.y].every(Number.isFinite)||
        member.x<22-1e-5 || member.x>938+1e-5 ||
        member.y<22-1e-5 || member.y>518+1e-5)throw new Error("Authoritative coordinate out of bounds");
    }
  }

  const elapsedSeconds=(endedAt-startedAt)/1000;
  const traffic=proxies.map((p,i)=>({
    clientIndex:i,
    outBytes:Math.max(0,p.stats.downstreamBytes-(baseline[i]?.downstreamBytes??p.stats.downstreamBytes)),
    inBytes:Math.max(0,p.stats.upstreamBytes-(baseline[i]?.upstreamBytes??p.stats.upstreamBytes)),
    connections:p.stats.tcpConnections
  }));
  const roomOutBytes=traffic.reduce((sum,v)=>sum+v.outBytes,0);
  const roomInBytes=traffic.reduce((sum,v)=>sum+v.inBytes,0);
  const outKBps=roomOutBytes/1024/elapsedSeconds;
  if(outKBps>maxOutKBps)throw new Error("Room downstream bandwidth exceeds budget: "+outKBps.toFixed(2)+" KB/s");
  report.measured={
    elapsedSeconds,roomOutBytes,roomInBytes,outKBps,setupFailures,
    inKBps:roomInBytes/1024/elapsedSeconds,
    clients:traffic, observations: observations.map(item=>({...item})),
    observedHttpRttMs:{ samples:observedHttpRtts, p50:httpRttP50, p95:quantile(observedHttpRtts,.95) },
    disconnectedIndex, replacementJoined:rejoined,
    peakServerRssBytes:peakRss||null,
    serverSnapshots:windowStats,
    startMetrics:metricsStart,
    endMetrics:endedMetrics
  };
  if(metricsStart && endedMetrics){
    const usecStart = metricsStart.cpuUsageMicros.user + metricsStart.cpuUsageMicros.system;
    const usecEnd = endedMetrics.cpuUsageMicros.user + endedMetrics.cpuUsageMicros.system;
    report.measured.cpuSingleCorePercent = (usecEnd-usecStart) / 10000 / elapsedSeconds;
    report.measured.maxObservedTickP99Ms = maxTickP99;
  }
  if(endedMetrics?.rooms?.length) {
    const rm=endedMetrics.rooms[0];
    if(rm.tickDurationMs.p95>25 || rm.tickDurationMs.p99>45) {
      throw new Error("Tick duration exceeds agreed budget");
    }
    if(peakRss>350*1024*1024)throw new Error("M0 Node RSS exceeds 350 MiB (CI diagnostic budget)");
  }
  report.result="pass";
  console.log("M0-F PASS "+JSON.stringify({
    players:playerCount,durationSeconds:elapsedSeconds,
    impairment:{rttMs,jitterMs},
    downstreamKBps:Number(outKBps.toFixed(2)),
    peakRssMiB:Number((peakRss/1048576).toFixed(1)),
    cpuSingleCorePercent:Number((report.measured.cpuSingleCorePercent??0).toFixed(2)),
    observedHttpRttP50Ms:Number(httpRttP50.toFixed(1)),
    tickP95Ms:endedMetrics?.rooms?.[0]?.tickDurationMs?.p95,
    tickP99Ms:endedMetrics?.rooms?.[0]?.tickDurationMs?.p99,
    disconnectedAndRejoined:rejoined,
    setupFailures:setupFailures.length
  }));
} catch(error) {
  report.result="fail";
  report.error=error?.stack||String(error);
  console.error("M0-F FAIL",report.error);
  process.exitCode=1;
} finally {
  if(monitor)clearInterval(monitor);
  for (const timer of senders)clearInterval(timer);
  await Promise.allSettled(rooms.map(room=>room.leave()));
  await Promise.allSettled(proxies.map(proxy=>proxy.close().catch(()=>{})));
  try {
    const dir=reportPath.substring(0,reportPath.lastIndexOf("/"));
    if(dir)await mkdir(dir,{recursive:true});
    await writeFile(reportPath,JSON.stringify(report,null,2)+"\n","utf8");
    console.log("Wrote "+reportPath);
  } catch(error){console.error("Could not save report:",error.message);process.exitCode=1;}
}
