import "../../js/roles.js";
import "../../js/script.js";
import "../../js/game.js";

const Game = globalThis.WerewolfGame;
const LOBBY_PURGE_MS = 45000;

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

function emptyRoom(clientId, name) {
  return {
    hostId: clientId,
    members: [{ id: clientId, name, ready: false }],
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
}

function inLobby(data) {
  return !data.game || data.screen === "lobby";
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
    await this.enqueue(() => this.onDisconnect());
  }

  async webSocketError(ws) {
    await this.enqueue(() => this.onDisconnect());
  }

  async alarm() {
    await this.enqueue(() => this.onAlarm());
  }

  async onAlarm() {
    const data = await this.load();
    if (!data) return;
    const j = data.game && data.game.judge;
    if (j && j.running) {
      const r = Game.judgeTimeout(data.game, Date.now(), 150);
      if (r && r.waiting && j.deadlineAt) {
        try {
          await this.ctx.storage.setAlarm(j.deadlineAt);
        } catch (_) {}
        return;
      }
      await this.save(data);
      await this.broadcast();
      await this.scheduleNextAlarm(data);
      return;
    }
    if (inLobby(data)) await this.purgeDisconnectedLobby();
  }

  async scheduleNextAlarm(data) {
    const j = data.game && data.game.judge;
    if (j && j.running && j.deadlineAt) {
      try {
        await this.ctx.storage.setAlarm(j.deadlineAt);
      } catch (_) {}
      return;
    }
    if (inLobby(data)) await this.scheduleLobbyPurge();
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

  closeSocket(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch (_) {}
  }

  closeClient(clientId, code, reason) {
    for (const ws of this.sockets()) {
      const att = ws.deserializeAttachment() || {};
      if (att.clientId === clientId) this.closeSocket(ws, code, reason);
    }
  }

  ensureHost(data) {
    const connected = this.connectedIds();
    if (connected.includes(data.hostId)) return false;
    const next = data.members.find((m) => connected.includes(m.id));
    if (next) {
      data.hostId = next.id;
      return true;
    }
    return false;
  }

  viewFor(ws, data) {
    const att = ws.deserializeAttachment() || {};
    const clientId = att.clientId;
    const recap = data.screen === "recap";
    const seatIndex =
      data.game && data.game.seatIds ? data.game.seatIds.indexOf(clientId) : -1;
    const game = data.game ? Game.censorGame(data.game, { recap, seatIndex }) : null;
    const priv = data.game && !recap ? Game.privateInfo(data.game, seatIndex) : null;
    return {
      hostId: data.hostId,
      members: data.members,
      connectedIds: this.connectedIds(),
      expansion: data.expansion,
      counts: data.counts,
      settings: data.settings,
      game,
      screen: data.screen,
      private: priv,
      cardSeen: (data.game && data.game.cardSeen) || {},
    };
  }

  async broadcast() {
    const data = await this.load();
    if (!data) return;
    for (const ws of this.sockets()) {
      try {
        ws.send(JSON.stringify({ type: "state", state: this.viewFor(ws, data) }));
      } catch (_) {}
    }
  }

  async scheduleLobbyPurge() {
    try {
      await this.ctx.storage.setAlarm(Date.now() + LOBBY_PURGE_MS);
    } catch (_) {}
  }

  async onDisconnect() {
    const data = await this.load();
    if (!data) return;
    this.ensureHost(data);
    await this.save(data);
    if (inLobby(data)) await this.scheduleLobbyPurge();
    await this.broadcast();
  }

  async purgeDisconnectedLobby() {
    const data = await this.load();
    if (!data || !inLobby(data)) return;
    const connected = new Set(this.connectedIds());
    const before = data.members.length;
    data.members = data.members.filter((m) => connected.has(m.id));
    this.ensureHost(data);
    if (data.members.length !== before) {
      await this.save(data);
      await this.broadcast();
    }
  }

  async onConnect(ws, { clientId, name, create }) {
    let data = await this.load();
    if (!data || !data.members || data.members.length === 0) {
      if (!create) {
        this.errorTo(ws, "房間不存在");
        this.closeSocket(ws, 4000, "missing");
        return;
      }
      data = emptyRoom(clientId, name);
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (create && data.members.length > 0) {
      this.errorTo(ws, "房號已被使用");
      this.closeSocket(ws, 4004, "taken");
      return;
    }

    const existing = data.members.find((m) => m.id === clientId);
    if (existing) {
      existing.name = name;
      if (existing.ready == null) existing.ready = false;
    } else if (!inLobby(data)) {
      this.errorTo(ws, "遊戲進行中");
      this.closeSocket(ws, 4005, "playing");
      return;
    } else if (data.members.length >= 12) {
      this.errorTo(ws, "房間已滿");
      this.closeSocket(ws, 4001, "full");
      return;
    } else {
      data.members.push({ id: clientId, name, ready: false });
    }
    this.ensureHost(data);
    await this.save(data);
    await this.broadcast();
  }

  findMember(data, clientId) {
    return data.members.find((m) => m.id === clientId);
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
      if (!inLobby(data)) {
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

    if (msg.type === "ready") {
      if (!inLobby(data)) return;
      const m = this.findMember(data, att.clientId);
      if (!m) return;
      m.ready = !!msg.ready;
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "cardSeen") {
      if (!data.game || data.game.phase !== "looking") {
        this.errorTo(ws, "現在不是看牌階段");
        return;
      }
      if (!data.game.cardSeen) data.game.cardSeen = {};
      data.game.cardSeen[att.clientId] = true;
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "leave") {
      if (inLobby(data)) {
        data.members = data.members.filter((m) => m.id !== att.clientId);
        this.ensureHost(data);
        await this.save(data);
        await this.broadcast();
      }
      this.closeSocket(ws, 4002, "left");
      return;
    }

    if (msg.type === "kick") {
      if (!isHost) {
        this.errorTo(ws, "只有房主可以踢人");
        return;
      }
      if (!inLobby(data)) {
        this.errorTo(ws, "開局後不能踢人");
        return;
      }
      const targetId = String(msg.targetId || "");
      if (!targetId || targetId === data.hostId) {
        this.errorTo(ws, "不能踢房主");
        return;
      }
      if (!this.findMember(data, targetId)) {
        this.errorTo(ws, "找不到這位玩家");
        return;
      }
      data.members = data.members.filter((m) => m.id !== targetId);
      await this.save(data);
      await this.broadcast();
      this.closeClient(targetId, 4003, "kicked");
      return;
    }

    if (msg.type === "transfer") {
      if (!isHost) {
        this.errorTo(ws, "只有房主可以移交");
        return;
      }
      const targetId = String(msg.targetId || "");
      const target = this.findMember(data, targetId);
      if (!target) {
        this.errorTo(ws, "找不到這位玩家");
        return;
      }
      if (!this.connectedIds().includes(target.id)) {
        this.errorTo(ws, "對方不在線");
        return;
      }
      data.hostId = target.id;
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "moveSeat") {
      if (!isHost) {
        this.errorTo(ws, "只有房主可以換座位");
        return;
      }
      if (!inLobby(data)) {
        this.errorTo(ws, "開局後不能換座位");
        return;
      }
      const a = Number(msg.a);
      const b = Number(msg.b);
      if (
        a === b ||
        !Number.isInteger(a) ||
        !Number.isInteger(b) ||
        a < 0 ||
        b < 0 ||
        a >= data.members.length ||
        b >= data.members.length
      ) {
        this.errorTo(ws, "座位無效");
        return;
      }
      const tmp = data.members[a];
      data.members[a] = data.members[b];
      data.members[b] = tmp;
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "vote") {
      if (!data.game) {
        this.errorTo(ws, "還沒發牌");
        return;
      }
      const seat = (data.game.seatIds || []).indexOf(att.clientId);
      const r = Game.castVote(data.game, seat, Number(msg.targetIndex));
      if (r.error) {
        this.errorTo(ws, r.error);
        return;
      }
      if (Game.allVoted(data.game)) {
        Game.resolveVotes(data.game);
        data.screen = "recap";
      }
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "tally") {
      if (!isHost) {
        this.errorTo(ws, "只有房主可以開票");
        return;
      }
      if (!data.game) {
        this.errorTo(ws, "還沒發牌");
        return;
      }
      const r = Game.resolveVotes(data.game);
      if (r.error) {
        this.errorTo(ws, r.error);
        return;
      }
      data.screen = "recap";
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "deal") {
      if (!isHost) {
        this.errorTo(ws, "只有房主可以發牌");
        return;
      }
      if (!inLobby(data)) {
        this.errorTo(ws, "已經開局");
        return;
      }
      const connected = this.connectedIds();
      const offline = data.members.filter((m) => !connected.includes(m.id));
      if (offline.length) {
        this.errorTo(ws, "還有人離線，請先踢人或等重連");
        return;
      }
      if (data.members.some((m) => !m.ready)) {
        this.errorTo(ws, "還有人尚未準備");
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
      result.game.phase = "arrange";
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
      const connected = new Set(this.connectedIds());
      data.game = null;
      data.screen = "lobby";
      data.members = data.members.filter((m) => connected.has(m.id));
      data.members.forEach((m) => {
        m.ready = false;
      });
      this.ensureHost(data);
      await this.save(data);
      await this.broadcast();
      return;
    }

    if (msg.type === "action") {
      if (!data.game) {
        this.errorTo(ws, "還沒發牌");
        return;
      }
      if (msg.action && (msg.action.type === "judgeTimeout" || msg.action.type === "judgeDone")) {
        this.errorTo(ws, "流程由伺服器計時");
        return;
      }
      if (msg.action && msg.action.type === "judgeStart" && att.clientId !== data.hostId) {
        this.errorTo(ws, "只有房主可以開始主持");
        return;
      }
      if (msg.action && msg.action.type === "script" && att.clientId !== data.hostId) {
        this.errorTo(ws, "只有房主可以換字幕");
        return;
      }
      if (msg.action && msg.action.type === "setPhase" && att.clientId !== data.hostId) {
        this.errorTo(ws, "只有房主可以推進流程");
        return;
      }
      if (msg.action && (msg.action.type === "judgeStart" || msg.action.type === "script")) {
        msg.action.now = Date.now();
        msg.action.syncDelay = 150;
      }
      const BOARD_ACT = {
        swap: 1,
        flip: 1,
        rotate: 1,
        shield: 1,
        placeMark: 1,
        swapMark: 1,
        placeArtifact: 1,
        look: 1,
        lookMark: 1,
        lookArtifact: 1,
        undo: 1,
      };
      if (msg.action && BOARD_ACT[msg.action.type]) {
        const ids = data.game.seatIds || [];
        msg.action.actorSeat = ids.indexOf(att.clientId);
      }
      const r = Game.applyAction(data.game, msg.action);
      if (r.error) {
        this.errorTo(ws, r.error);
        return;
      }
      if (msg.action.type === "setPhase") {
        if (msg.action.phase === "day") data.screen = "day";
        else if (msg.action.phase === "voting") data.screen = "voting";
        else if (msg.action.phase === "recap") data.screen = "recap";
        else if (msg.action.phase === "looking") data.screen = "viewCards";
        else data.screen = "table";
      }
      await this.save(data);
      await this.broadcast();
      await this.scheduleNextAlarm(data);
      if (r.peek) this.send(ws, { type: "peek", peek: r.peek });
    }
  }
}
