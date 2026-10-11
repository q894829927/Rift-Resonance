import { diagnosticsSnapshot } from "./telemetry/metrics.js";
import { defineRoom, defineServer } from "colyseus";
import { APP_VERSION, PROTOCOL_VERSION, ROOM_TYPE } from "@rift/shared";
import { ScaffoldRoom } from "./rooms/ScaffoldRoom.js";

const port = Number.parseInt(process.env.PORT ?? "2567", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer in the range 1..65535");
}

const server = defineServer({
  rooms: { [ROOM_TYPE]: defineRoom(ScaffoldRoom) },
  express: (app) => {
    // M0-A 仅供本地开发与部署烟测，不返回敏感信息。
    app.get("/health", (_req: unknown, res: { json: (payload: object) => void }) => {
      res.json({ status: "ok", service: "rift-server", protocolVersion: PROTOCOL_VERSION, appVersion: APP_VERSION });
    });
    // Disabled by default. Defense in depth: loopback-only even when enabled.
    if (process.env.M0_DIAGNOSTICS === "1") {
      app.get("/internal/m0-metrics", (
        req: {socket: {remoteAddress?: string}},
        res: {status: (code: number) => {json: (data: object) => void}; json: (data: object) => void}
      ) => {
        const source = req.socket.remoteAddress;
        if (!source || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(source)) {
          res.status(403).json({error:"local diagnostics only"});
          return;
        }
        res.json(diagnosticsSnapshot());
      });
    }
  }
});

void server.listen(port).then(() => {
  console.info(`[rift-server] listening on :${port}; room=${ROOM_TYPE}; version=${APP_VERSION}`);
}).catch((error: unknown) => {
  console.error("[rift-server] failed to start", error);
  process.exitCode = 1;
});
