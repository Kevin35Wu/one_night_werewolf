import "../../js/roles.js";
import "../../js/game.js";

const Game = globalThis.WerewolfGame;

function okOrigin(origin) {
  if (!origin) return true;
  return (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("github.io") ||
    origin.includes("workers.dev")
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), request);
    }
    if (url.pathname === "/health") {
      return cors(new Response("ok"), request);
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4})$/);
    if (m && request.headers.get("Upgrade") === "websocket") {
      const id = env.ROOM.idFromName(m[1].toUpperCase());
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }
    return cors(new Response("一夜終極房間伺服器", { status: 200 }), request);
  },
};

function cors(res, request) {
  const origin = request.headers.get("Origin") || "*";
  const headers = new Headers(res.headers);
  if (okOrigin(origin) || origin === "*") {
    headers.set("Access-Control-Allow-Origin", origin === "*" ? "*" : origin);
  }
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(res.body, { status: res.status, headers });
}

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = Promise.resolve();
  }

  enqueue(fn) {
    this.queue = this.queue.then(fn).catch((err) => console.error(err));
    return this.queue;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("請用 WebSocket 連線", { status: 426 });
    }
    const create = url.searchParams.get("create") === "1";
    const name = String(url.searchParams.get("name") || "玩家").trim().slice(0, 12) || "玩家";
    const clientId = String(url.searchParams.get("clientId") || "").slice(0, 64);
    if (!clientId) return new Response("缺少 clientId", { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ clientId, name, create });

    this.enqueue(() => this.onConnect(server, { clientId, name, create }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    let msg;
    try {
      msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch (_) {
      return;
    }
    if (!msg || msg.type === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong" }));
      } catch (_) {}
      return;
    }
    const att = ws.deserializeAttachment() || {};
    await this.enqueue(() => this.onMessage(ws, att, msg));
  }

  async webSocketClose(ws) {
    await this.enqueue(() => this.broadcast());
  }

  async webSocketError(ws) {
    await this.enqueue(() => this.broadcast());
  }

  async load() {
    return (await this.ctx.storage.get("data")) || null;
  }

  async save(data) {
    await this.ctx.storage.put("data", data);
  }

  sockets() {
    return this.ctx.getWebSockets();
  }

  connectedIds() {
    const ids = [];
    for (const ws of this.sockets()) {
      const att = ws.deserializeAttachment() || {};
      if (att.clientId && !ids.includes(att.clientId)) ids.push(att.clientId);
    }
    return ids;
  }

  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (_) {}
  }

  errorTo(ws, message) {
    this.send(ws, { type: "error", message });
  }

  publicState(data) {
    return {
      hostId: data.hostId,
      members: data.members,
      connectedIds: this.connectedIds(),
      expansion: data.expansion,
      counts: data.counts,
      settings: data.settings,
      game: data.game,
      screen: data.screen,
    };
  }

  async broadcast() {
    const data = await this.load();
    if (!data) return;
    const payload = JSON.stringify({ type: "state", state: this.publicState(data) });
    for (const ws of this.sockets()) {
      try {
        ws.send(payload);
      } catch (_) {}
    }
  }

  async onConnect(ws, { clientId, name, create }) {
    let data = await this.load();
    if (!data) {
      if (!create) {
        this.errorTo(ws, "房間不存在");
        try {
          ws.close(4000, "missing");
        } catch (_) {}
        return;
      }
      data = {
        hostId: clientId,
        members: [{ id: clientId, name }],
        expansion: "base",
        counts: Game.defaultCounts(),
        settings: {
          dusk: false,
          artifacts: false,
          shield: false,
          alphaWolf: false,
          artifactIds: globalThis.WerewolfData.ARTIFACTS.map((a) => a.id),
        },
        game: null,
        screen: "lobby",
      };
      await this.save(data);
      await this.broadcast();
      return;
    }

    const existing = data.members.find((m) => m.id === clientId);
    if (existing) {
      existing.name = name;
    } else {
      if (data.game && data.screen !== "lobby") {
        data.members.push({ id: clientId, name });
      } else if (data.members.length >= 12) {
        this.errorTo(ws, "房間已滿");
        try {
          ws.close(4001, "full");
        } catch (_) {}
        return;
      } else {
        data.members.push({ id: clientId, name });
      }
    }
    await this.save(data);
    await this.broadcast();
  }

  async onMessage(ws, att, msg) {
    const data = await this.load();
    if (!data) {
      this.errorTo(ws, "房間不存在");
      return;
    }
    const isHost = att.clientId === data.hostId;

    if (msg.type === "setup") {
      if (!isHost) {
        this.errorTo(ws, "只有房主可以改設置");
        return;
      }
      if (data.game && data.screen !== "lobby") {
        this.errorTo(ws, "開局後不能改設置");
        return;
      }
      if (msg.expansion) data.expansion = msg.expansion;
      if (msg.counts) data.counts = msg.counts;
      if (msg.settings) data.settings = msg.settings;
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "deal") {
      if (!isHost) {
        this.errorTo(ws, "只有房主可以發牌");
        return;
      }
      const names = data.members.map((m) => m.name);
      const result = Game.createGame({
        playerNames: names,
        counts: data.counts,
        settings: data.settings,
      });
      if (result.error) {
        this.errorTo(ws, result.error);
        return;
      }
      result.game.seatIds = data.members.map((m) => m.id);
      result.game.phase = result.game.settings.dusk ? "dusk" : "night";
      data.game = result.game;
      data.screen = "table";
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "reset") {
      if (!isHost) {
        this.errorTo(ws, "只有房主可以再來一局");
        return;
      }
      data.game = null;
      data.screen = "lobby";
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "action") {
      if (!data.game) {
        this.errorTo(ws, "還沒發牌");
        return;
      }
      const r = Game.applyAction(data.game, msg.action);
      if (r.error) {
        this.errorTo(ws, r.error);
        return;
      }
      if (msg.action.type === "setPhase") {
        if (msg.action.phase === "day") data.screen = "day";
        else if (msg.action.phase === "recap") data.screen = "recap";
        else data.screen = "table";
      }
      await this.save(data);
      await this.broadcast();
    }
  }
}
