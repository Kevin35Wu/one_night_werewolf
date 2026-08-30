/* 畫面：設置、傳手機看牌、黃昏／黑夜桌面、白天、復盤 */
(function () {
  const Data = window.WerewolfData;
  const Game = window.WerewolfGame;
  const Net = window.WerewolfNet;
  const STORAGE = "onuw-card-table-v1";
  const CLIENT_KEY = "onuw-client-id";

  const app = document.getElementById("app");
  const overlayEl = document.getElementById("overlay");
  const modalEl = document.getElementById("modal");
  const toastEl = document.getElementById("toast");

  let toastTimer = 0;
  let judgeTimer = 0;

  const state = {
    screen: "setup",
    expansion: "base",
    playerCount: 6,
    names: ["玩家1", "玩家2", "玩家3", "玩家4", "玩家5", "玩家6"],
    counts: Game.defaultCounts(),
    settings: {
      dusk: false,
      artifacts: false,
      shield: false,
      alphaWolf: false,
      artifactIds: Data.ARTIFACTS.map((a) => a.id),
    },
    game: null,
    viewIndex: 0,
    viewOpen: false,
    tableUnlocked: false,
    tool: null,
    selected: [],
    markChoice: null,
    rotateSelf: null,
    recapMode: "current",
    peek: null,
    modal: null,
    rulesOpen: false,
    online: false,
    clientId: "",
    joinName: "",
    joinCode: "",
    room: null,
    lobbyPick: null,
    voteIndex: 0,
    reconnecting: false,
    myActionsOpen: true,
    lobbyRolesOpen: false,
    markHintShown: false,
  };

  function ensureClientId() {
    if (state.clientId) return state.clientId;
    try {
      state.clientId = localStorage.getItem(CLIENT_KEY) || "";
    } catch (_) {}
    if (!state.clientId) {
      state.clientId = "p" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try {
        localStorage.setItem(CLIENT_KEY, state.clientId);
      } catch (_) {}
    }
    return state.clientId;
  }

  function loadSetup() {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.playerCount) state.playerCount = saved.playerCount;
        if (Array.isArray(saved.names)) state.names = saved.names;
        if (saved.counts) state.counts = { ...Game.defaultCounts(), ...saved.counts };
        if (saved.settings) state.settings = { ...state.settings, ...saved.settings };
        if (saved.expansion) state.expansion = saved.expansion;
        if (saved.joinName) state.joinName = saved.joinName;
      }
    } catch (_) {}
    ensureNames();
    ensureClientId();
  }

  function saveSetup() {
    localStorage.setItem(
      STORAGE,
      JSON.stringify({
        playerCount: state.playerCount,
        names: state.names,
        counts: state.counts,
        settings: state.settings,
        expansion: state.expansion,
        joinName: state.joinName,
      })
    );
  }

  function ensureNames() {
    const next = [];
    for (let i = 0; i < state.playerCount; i++) {
      next.push((state.names[i] || "").trim() || "玩家" + (i + 1));
    }
    state.names = next;
  }

  function isHost() {
    return state.online && state.room && state.room.hostId === state.clientId;
  }

  function mySeatIndex() {
    const ids = state.game && state.game.seatIds;
    if (!ids || !state.clientId) return -1;
    return ids.indexOf(state.clientId);
  }

  function memberOnline(id) {
    return !!(state.room && (state.room.connectedIds || []).includes(id));
  }

  function sendSetup() {
    if (!isHost()) return;
    if (state.online && state.screen !== "lobby") return;
    Net.send({
      type: "setup",
      expansion: state.expansion,
      counts: state.counts,
      settings: state.settings,
    });
  }

  function makeRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function connectRoom(code, create, attempt) {
    const name = (state.joinName || "").trim() || "玩家";
    state.joinName = name;
    ensureClientId();
    saveSetup();
    const roomCode = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (roomCode.length !== 4) {
      toast("房號需為 4 碼");
      return;
    }
    state.joinCode = roomCode;
    Net.connect({
      code: roomCode,
      name,
      create: !!create,
      clientId: state.clientId,
      onState: applyRoomState,
      onPeek: applyPeek,
      onError: (m) => {
        if (create && m === "房號已被使用" && (attempt || 0) < 6) {
          connectRoom(makeRoomCode(), true, (attempt || 0) + 1);
          return;
        }
        toast(m);
      },
      onOpen: () => {
        state.reconnecting = false;
        render();
      },
      onDisconnected: () => {
        if (!state.online) return;
        state.reconnecting = true;
        render();
      },
      onKicked: () => {
        toast("你已被踢出房間");
        resetLocalRoom();
      },
      onClosed: (info) => {
        if (info && info.fatal) {
          if (info.code === 4004 && create) return;
          resetLocalRoom();
        }
      },
    });
    try {
      history.replaceState(null, "", "?room=" + roomCode);
    } catch (_) {}
    if (!(attempt > 0)) toast(create ? "正在建立房間…" : "正在加入房間…");
  }

  function applyRoomState(room) {
    const prevScreen = state.screen;
    const prevPhase = state.game && state.game.phase;
    state.online = true;
    state.reconnecting = false;
    state.room = room;
    if (room.counts) state.counts = { ...Game.defaultCounts(), ...room.counts };
    if (room.settings) state.settings = { ...state.settings, ...room.settings };
    if (room.expansion) state.expansion = room.expansion;
    state.game = room.game || null;
    const members = room.members || [];
    if (members.length) {
      state.playerCount = members.length;
      state.names = members.map((m) => m.name);
    }
    if (!room.game || room.screen === "lobby") {
      state.screen = "lobby";
      state.game = null;
      state.markHintShown = false;
      if (prevScreen !== "lobby") {
        state.lobbyPick = null;
        state.lobbyRolesOpen = false;
      }
    } else if (room.screen === "day") {
      state.screen = "day";
      state.tableUnlocked = true;
    } else if (room.screen === "voting") {
      state.screen = "voting";
      state.tableUnlocked = true;
    } else if (room.screen === "recap") {
      state.screen = "recap";
    } else if (room.game && room.game.phase === "looking") {
      state.screen = "viewCards";
      state.tableUnlocked = false;
    } else {
      state.screen = "table";
      state.tableUnlocked = true;
    }
    // 線上：黃昏結束進黑夜時，提示看標記一次
    if (
      room.game &&
      room.game.phase === "night" &&
      room.game.settings &&
      room.game.settings.dusk &&
      prevPhase === "dusk" &&
      !state.markHintShown
    ) {
      state.markHintShown = true;
      state.modal = {
        title: "黃昏結束",
        text: "請點右上角「我的標記」查看你現在的標記。",
        onYes: function () {
          showMyMark();
        },
      };
    }
    render();
  }

  function resetLocalRoom() {
    state.online = false;
    state.room = null;
    state.game = null;
    state.screen = "setup";
    state.reconnecting = false;
    state.lobbyPick = null;
    try {
      history.replaceState(null, "", location.pathname);
    } catch (_) {}
    render();
  }

  function leaveRoom() {
    Net.send({ type: "leave" });
    Net.close();
    resetLocalRoom();
  }

  function sendAction(action) {
    const board = {
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
    if (action && board[action.type] && action.actorSeat == null) {
      action.actorSeat = mySeatIndex();
    }
    if (!Net.send({ type: "action", action })) toast("尚未連線");
  }

  function isArrange() {
    return !!(state.game && state.game.phase === "arrange");
  }

  function peekCardHtml(roleId) {
    const color = roleColor(roleId);
    return (
      '<div class="peek-card" style="border-color:' +
      color +
      '"><div class="emoji">' +
      roleIconHtml(roleId) +
      '</div><div class="rname" style="color:' +
      color +
      '">' +
      escapeHtml(roleName(roleId)) +
      "</div></div>"
    );
  }

  function applyPeek(peek) {
    if (!peek) return;
    if (peek.kind === "cards") {
      state.peek = {
        html:
          '<div class="peek-cards">' +
          (peek.cards || []).map((c) => peekCardHtml(c.roleId)).join("") +
          "</div>",
      };
    } else if (peek.kind === "mark") {
      const info = markInfo(peek.markId);
      state.peek = {
        title: (peek.name || "玩家") + " 的標記",
        html:
          '<div class="peek-card"><div class="emoji">' +
          escapeHtml(info ? info.emoji : "❓") +
          '</div><div class="rname">' +
          escapeHtml(info ? info.name + "標記" : "沒有標記") +
          "</div></div>",
      };
    } else if (peek.kind === "artifact") {
      const info = artifactInfo(peek.artifactId);
      state.peek = {
        title: (peek.name || "玩家") + " 的神器",
        html:
          '<div class="peek-card"><div class="emoji">' +
          escapeHtml(info ? info.emoji : "❓") +
          '</div><div class="rname">' +
          escapeHtml(info ? info.name : "未知神器") +
          "</div></div>",
      };
    }
    render();
  }

  function myPrivate() {
    return (state.room && state.room.private) || {};
  }

  function showMyCard() {
    if (isArrange()) {
      toast("先換完牌，再按開始看牌");
      return;
    }
    if (state.online) {
      const priv = myPrivate();
      const c = priv.myCard;
      if (!c || !c.roleId) {
        toast("還沒開始看牌");
        return;
      }
      state.peek = {
        html:
          '<div class="peek-cards">' +
          peekCardHtml(c.roleId) +
          "</div>" +
          seenHtml(priv.seen),
      };
      render();
      return;
    }
    const i = mySeatIndex();
    if (i < 0 || !state.game) {
      toast("找不到你的座位");
      return;
    }
    const c = state.game.players[i].card;
    const seen = Game.visibilityFor(state.game, i, Game.effectiveRole(state.game, i));
    state.peek = {
      html: '<div class="peek-cards">' + peekCardHtml(c.roleId) + "</div>" + seenHtml(seen),
    };
    render();
  }

  function seenHtml(seen) {
    if (!seen || !seen.length) return "";
    const label = seen[0].kind === "mason" ? "你的守夜人同伴" : "你看到的狼人";
    return (
      '<div class="seen-list"><div class="tiny">' +
      label +
      "</div><div>" +
      seen.map((s) => escapeHtml(s.name)).join("、") +
      "</div></div>"
    );
  }

  function showMyMark() {
    if (isArrange()) {
      toast("先換完牌，再按開始看牌");
      return;
    }
    let markId = null;
    let missing = false;
    if (state.online) {
      markId = myPrivate().myMark;
      if (markId === undefined) missing = true;
    } else {
      const i = mySeatIndex();
      if (i < 0 || !state.game) {
        toast("找不到你的座位");
        return;
      }
      markId = state.game.players[i].mark;
    }
    if (missing) {
      toast("找不到你的標記");
      return;
    }
    const m = markInfo(markId);
    state.peek = {
      html:
        '<div class="peek-cards"><div class="peek-card"><div class="emoji">' +
        escapeHtml(m ? m.emoji : "❓") +
        '</div><div class="rname">' +
        escapeHtml(m ? m.name + "標記" : "沒有標記") +
        "</div></div></div>",
    };
    render();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2200);
  }

  function selectedNeed() {
    return state.playerCount + 3;
  }

  function selectedHave() {
    return Game.selectedCount(state.counts);
  }

  function roleColor(roleId) {
    const role = Data.ROLE_BY_ID[roleId];
    return role ? Data.TEAMS[role.team].color : "#d4af5a";
  }

  function roleName(roleId) {
    return Data.ROLE_BY_ID[roleId]?.name || roleId;
  }

  function roleEmoji(roleId) {
    return Data.ROLE_BY_ID[roleId]?.emoji || "❓";
  }

  function roleIconHtml(roleId) {
    const r = Data.ROLE_BY_ID[roleId];
    const emoji = r ? r.emoji : "❓";
    if (r && r.icon) {
      return (
        '<span class="role-icon-wrap portrait"><img class="role-icon" src="' +
        escapeHtml(r.icon) +
        '" alt="' +
        escapeHtml(r.name || "") +
        '" onerror="this.onerror=null;this.parentNode.replaceWith(document.createTextNode(this.dataset.emoji||\'❓\'))" data-emoji="' +
        escapeHtml(emoji) +
        '"></span>'
      );
    }
    return escapeHtml(emoji);
  }

  function brandMarkHtml() {
    return (
      '<div class="brand-mark" aria-hidden="true"><img src="img/mystery/mystery-lit-lantern.png" alt=""></div>'
    );
  }

  function brandBlock(titleHtml, subHtml) {
    return (
      '<div class="brand">' +
      brandMarkHtml() +
      '<div class="brand-text">' +
      titleHtml +
      (subHtml || "") +
      "</div></div>"
    );
  }

  function markInfo(id) {
    return Data.MARK_BY_ID[id];
  }

  function artifactInfo(id) {
    return Data.ARTIFACT_BY_ID[id];
  }

  function setPlayerCount(n) {
    if (state.online) return;
    state.playerCount = Math.max(3, Math.min(12, n));
    ensureNames();
    saveSetup();
    render();
  }

  function cycleRole(id) {
    if (state.online && !isHost()) return;
    const role = Data.ROLE_BY_ID[id];
    if (!role) return;
    const cur = state.counts[id] || 0;
    state.counts[id] = cur >= role.max ? 0 : cur + 1;
    state.settings = Game.inferSettings(state.counts, state.settings);
    if (state.settings.artifacts && (!state.settings.artifactIds || !state.settings.artifactIds.length)) {
      state.settings.artifactIds = Data.ARTIFACTS.map((a) => a.id);
    }
    saveSetup();
    sendSetup();
    render();
  }

  function toggleSetting(key) {
    if (state.online && !isHost()) return;
    state.settings[key] = !state.settings[key];
    if (key === "dusk" && state.settings.dusk) {
      /* 黃昏一定帶標記 */
    }
    saveSetup();
    sendSetup();
    render();
  }

  function toggleArtifact(id) {
    if (state.online && !isHost()) return;
    const set = new Set(state.settings.artifactIds || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    state.settings.artifactIds = [...set];
    saveSetup();
    sendSetup();
    render();
  }

  function startGame() {
    if (state.online) {
      if (!isHost()) {
        toast("請等房主發牌");
        return;
      }
      if (!Net.send({ type: "deal" })) toast("尚未連線");
      return;
    }
    ensureNames();
    const result = Game.createGame({
      playerNames: state.names,
      counts: state.counts,
      settings: state.settings,
    });
    if (result.error) {
      toast(result.error);
      return;
    }
    state.game = result.game;
    state.game.phase = "arrange";
    state.screen = "table";
    state.viewIndex = 0;
    state.viewOpen = false;
    state.tableUnlocked = true;
    state.tool = null;
    state.selected = [];
    state.peek = null;
    state.rulesOpen = false;
    render();
  }

  function beginLook() {
    if (state.online) {
      sendAction({ type: "setPhase", phase: "looking" });
      return;
    }
    state.screen = "viewCards";
    state.viewIndex = 0;
    state.viewOpen = false;
    state.tool = null;
    state.selected = [];
    state.peek = null;
    render();
  }

  function continueAfterLooking() {
    const next = state.game.settings.dusk ? "dusk" : "night";
    if (state.online) {
      sendAction({ type: "setPhase", phase: next });
      return;
    }
    if (next === "dusk") enterTable("dusk");
    else enterTable("night");
  }

  function afterViewCards() {
    continueAfterLooking();
  }

  function enterTable(phase) {
    Game.applyAction(state.game, { type: "setPhase", phase: phase });
    state.screen = "table";
    state.tableUnlocked = false;
    state.tool = null;
    state.selected = [];
    state.markChoice = null;
    state.rotateSelf = null;
    render();
  }

  function finishDusk() {
    if (state.online) {
      sendAction({ type: "setPhase", phase: "night" });
      return;
    }
    enterViewMarks();
  }

  function enterViewMarks() {
    state.screen = "viewMarks";
    state.viewIndex = 0;
    state.viewOpen = false;
    render();
  }

  function finishNight() {
    if (state.online) {
      sendAction({ type: "setPhase", phase: "day" });
      return;
    }
    state.game.phase = "day";
    state.screen = "day";
    state.tableUnlocked = true;
    state.tool = null;
    state.selected = [];
    render();
  }

  function enterRecap() {
    if (state.online) {
      sendAction({ type: "setPhase", phase: "recap" });
      return;
    }
    state.screen = "recap";
    state.recapMode = "current";
    render();
  }

  function newGame() {
    if (state.online) {
      if (!isHost()) {
        toast("請等房主再來一局");
        return;
      }
      Net.send({ type: "reset" });
      return;
    }
    state.screen = "setup";
    state.game = null;
    state.rulesOpen = false;
    render();
  }

  function currentBoard() {
    if (state.screen === "recap" && state.recapMode === "original") {
      return state.game.original;
    }
    return Game.currentSnapshot(state.game);
  }

  function targetKey(t) {
    return t.type + ":" + t.index;
  }

  function isSelected(t) {
    return state.selected.some((s) => s.type === t.type && s.index === t.index);
  }

  function toggleSelect(t) {
    const i = state.selected.findIndex((s) => s.type === t.type && s.index === t.index);
    if (i >= 0) state.selected.splice(i, 1);
    else state.selected.push(t);
  }

  function seatLabel(target) {
    if (!state.game || !target) return "";
    if (target.type === "center") {
      const c = state.game.center[target.index];
      if (!c) return "中間牌";
      return c.alphaSlot ? "中間狼人" : "中" + (target.index + 1);
    }
    return state.game.players[target.index]?.name || "玩家";
  }

  function addLog(text) {
    if (!state.game || !text) return;
    if (!state.game.log) state.game.log = [];
    state.game.log.push({ phase: state.game.phase, text: String(text) });
    if (state.game.phase === "dusk" || state.game.phase === "night") {
      Game.pushSeatLog(state.game, -1, text);
    }
  }

  function myActionList() {
    if (!state.game) return [];
    if (state.online) {
      const priv = myPrivate();
      return Array.isArray(priv.myActions) ? priv.myActions : [];
    }
    return Game.seatActions(state.game, -1);
  }

  function currentYourTurn() {
    const g = state.game;
    if (!g || (g.phase !== "dusk" && g.phase !== "night")) return null;
    if (state.online) {
      const priv = myPrivate();
      return priv.yourTurn || null;
    }
    const seat = mySeatIndex();
    if (seat >= 0) return Game.yourTurnForSeat(g, seat);
    return Game.yourTurnOffline(g);
  }

  function inferOfflineActorSeat() {
    const seat = mySeatIndex();
    if (seat >= 0) return seat;
    const g = state.game;
    if (!g || !g.nightStartRoles) return -1;
    const steps = Game.scriptSteps(g);
    const step = steps[g.scriptIndex || 0];
    if (!step || !step.roles || step.roles.length !== 1) return -1;
    const role = step.roles[0];
    const hits = [];
    g.nightStartRoles.forEach((id, i) => {
      if (id === role) hits.push(i);
    });
    return hits.length === 1 ? hits[0] : -1;
  }

  function renderMyActionsPanel() {
    const g = state.game;
    if (!g || (g.phase !== "dusk" && g.phase !== "night")) return "";
    const items = myActionList();
    const title = state.online ? "我的行動" : "本機黃昏／黑夜紀錄";
    const turn = currentYourTurn();
    const dusk = items.filter((x) => x.phase === "dusk");
    const night = items.filter((x) => x.phase === "night");
    let body = "";
    if (!items.length) {
      body = '<div class="tiny">還沒有黃昏／黑夜操作</div>';
    } else {
      if (dusk.length) {
        body += '<div class="my-actions-phase">黃昏</div><ol class="my-actions-list">';
        dusk.forEach((x) => {
          body += "<li>" + escapeHtml(x.text) + "</li>";
        });
        body += "</ol>";
      }
      if (night.length) {
        body += '<div class="my-actions-phase">黑夜</div><ol class="my-actions-list">';
        night.forEach((x) => {
          body += "<li>" + escapeHtml(x.text) + "</li>";
        });
        body += "</ol>";
      }
    }
    const banner = turn
      ? '<div class="your-turn-banner">輪到你了 · ' + escapeHtml(turn.label) + "</div>"
      : "";
    return (
      banner +
      '<div class="panel my-actions-panel' +
      (state.myActionsOpen ? " open" : "") +
      '"><button type="button" class="my-actions-toggle" data-act="toggle-my-actions">' +
      escapeHtml(title) +
      (state.myActionsOpen ? " ▾" : " ▸") +
      "</button>" +
      (state.myActionsOpen ? '<div class="my-actions-body">' + body + "</div>" : "") +
      "</div>"
    );
  }

  function applyResult(result, okMsg, logText) {
    if (result.error) {
      toast(result.error);
      state.selected = [];
      render();
      return false;
    }
    if (logText) addLog(logText);
    if (okMsg) toast(okMsg);
    state.selected = [];
    state.markChoice = null;
    state.rotateSelf = null;
    state.tool = null;
    render();
    return true;
  }

  function onePlayer() {
    return state.selected.length === 1 && state.selected[0].type === "player"
      ? state.selected[0]
      : null;
  }

  function twoPlayers() {
    return state.selected.length === 2 && state.selected.every((s) => s.type === "player");
  }

  function peekMarkAt(index) {
    const p = state.game.players[index];
    if (!p || !(p.mark || p.hasMark)) {
      toast("這位玩家沒有標記");
      return;
    }
    if (state.online) {
      sendAction({ type: "lookMark", playerIndex: index });
      state.selected = [];
      state.tool = null;
      render();
      return;
    }
    const info = markInfo(p.mark);
    addLog("看標記：" + p.name);
    state.peek = {
      title: p.name + " 的標記",
      html:
        '<div class="peek-card"><div class="emoji">' +
        escapeHtml(info.emoji) +
        '</div><div class="rname">' +
        escapeHtml(info.name) +
        "標記</div></div>",
    };
    render();
  }

  function peekArtifactAt(index) {
    const p = state.game.players[index];
    if (!p || !(p.artifact || p.hasArtifact)) {
      toast("這位玩家沒有神器");
      return;
    }
    if (state.online) {
      sendAction({ type: "lookArtifact", playerIndex: index });
      state.selected = [];
      state.tool = null;
      render();
      return;
    }
    const info = artifactInfo(p.artifact);
    addLog("看神器：" + p.name);
    state.peek = {
      title: p.name + " 的神器",
      html:
        '<div class="peek-card"><div class="emoji">' +
        escapeHtml(info.emoji) +
        '</div><div class="rname">' +
        escapeHtml(info.name) +
        "</div></div>",
    };
    render();
  }

  function mySeatTarget() {
    const i = mySeatIndex();
    if (i < 0) return null;
    return { type: "player", index: i };
  }

  function isMySeat(t) {
    return !!(t && t.type === "player" && t.index === mySeatIndex());
  }

  function performSwap(a, b) {
    if (state.online) {
      sendAction({ type: "swap", a: a, b: b });
      state.selected = [];
      state.tool = null;
      render();
      return;
    }
    applyResult(
      Game.swapCards(state.game, a, b),
      "已換牌",
      "換牌：" + seatLabel(a) + " ↔ " + seatLabel(b)
    );
  }

  function startOrDoOnlineSwap() {
    const me = mySeatTarget();
    if (!me) {
      toast("找不到你的座位");
      return;
    }
    const sel = state.selected;
    if (sel.length === 2) {
      performSwap(sel[0], sel[1]);
      return;
    }
    if (sel.length === 1 && !isMySeat(sel[0])) {
      performSwap(me, sel[0]);
      return;
    }
    state.tool = "swap";
    if (sel.length === 1 && isMySeat(sel[0])) state.selected = [];
    render();
  }

  function onSeatTap(type, index) {
    if (state.screen === "recap" || state.screen === "setup") return;
    if (state.screen === "table" && !state.tableUnlocked && !state.online) {
      return;
    }
    if (state.screen === "voting") {
      if (type !== "player") return;
      if (index === currentVoter()) {
        toast("不能投自己");
        return;
      }
      state.selected = [{ type: "player", index: index }];
      render();
      return;
    }
    if (state.screen !== "table" && state.screen !== "day") return;
    const t = { type, index };
    if (isArrange() && Game.isAlphaCenterTarget(state.game, t)) {
      toast("天黑前不能換中間狼人牌");
      return;
    }
    if (state.online && state.tool === "swap" && state.screen === "table") {
      if (isMySeat(t)) {
        toast("請點對方或中間的牌");
        return;
      }
      const me = mySeatTarget();
      if (!me) {
        toast("找不到你的座位");
        return;
      }
      performSwap(me, t);
      return;
    }
    toggleSelect(t);
    if (state.tool === "rotate") {
      const p = onePlayer();
      if (p) state.rotateSelf = p.index;
      else {
        state.tool = null;
        state.rotateSelf = null;
      }
    }
    if (state.tool === "placeMark" && !onePlayer()) {
      state.tool = null;
      state.markChoice = null;
    }
    render();
  }

  function runAction(id) {
    const g = state.game;
    const sel = state.selected;
    if (state.screen === "day" && id !== "lookArtifact") {
      toast("白天不能再動牌");
      return;
    }
    if (isArrange() && id !== "swap") {
      toast("現在只能換牌");
      return;
    }
    if (id === "swap" && state.online) {
      startOrDoOnlineSwap();
      return;
    }
    if (!sel.length) {
      toast("請先點牌，再選功能");
      return;
    }

    if (id === "look") {
      lookSelectedCards();
      return;
    }
    if (id === "swap") {
      if (sel.length !== 2) {
        toast("換牌請先點兩張牌");
        return;
      }
      applyResult(
        Game.swapCards(g, sel[0], sel[1]),
        "已換牌",
        "換牌：" + seatLabel(sel[0]) + " ↔ " + seatLabel(sel[1])
      );
      return;
    }
    if (id === "flip") {
      if (sel.length !== 1) {
        toast("請點一張要翻開或蓋上的牌");
        return;
      }
      const t = sel[0];
      const label = seatLabel(t);
      if (state.online) {
        sendAction({ type: "flip", target: t });
        state.selected = [];
        state.tool = null;
        render();
        return;
      }
      const result = Game.flipCard(g, t);
      const card = Game.getCard(g, t);
      applyResult(
        result,
        "已切換翻開／蓋上",
        result.error
          ? null
          : (card.revealed ? "翻開：" : "蓋上：") + label + "（" + roleName(card.roleId) + "）"
      );
      return;
    }
    if (id === "rotate") {
      const p = onePlayer();
      if (!p) {
        toast("輪轉請先點你自己的座位");
        return;
      }
      state.rotateSelf = p.index;
      state.tool = "rotate";
      render();
      return;
    }
    if (id === "shield") {
      const p = onePlayer();
      if (!p) {
        toast("請先點一位玩家");
        return;
      }
      if (state.online) {
        sendAction({ type: "shield", playerIndex: p.index });
        state.selected = [];
        state.tool = null;
        render();
        return;
      }
      applyResult(
        Game.placeShield(g, p.index),
        "已放置盾牌",
        "放盾牌：" + g.players[p.index].name
      );
      return;
    }
    if (id === "placeMark") {
      if (!onePlayer()) {
        toast("請先點一位玩家");
        return;
      }
      state.tool = "placeMark";
      render();
      return;
    }
    if (id === "lookMark") {
      const p = onePlayer();
      if (!p) {
        toast("請先點一位玩家");
        return;
      }
      peekMarkAt(p.index);
      return;
    }
    if (id === "swapMark") {
      if (!twoPlayers()) {
        toast("換標記請先點兩位玩家");
        return;
      }
      if (state.online) {
        sendAction({ type: "swapMark", aIndex: sel[0].index, bIndex: sel[1].index });
        state.selected = [];
        state.tool = null;
        render();
        return;
      }
      applyResult(
        Game.swapMarks(g, sel[0].index, sel[1].index),
        "已交換標記",
        "換標記：" + g.players[sel[0].index].name + " ↔ " + g.players[sel[1].index].name
      );
      return;
    }
    if (id === "placeArtifact") {
      const p = onePlayer();
      if (!p) {
        toast("請先點一位玩家");
        return;
      }
      const name = g.players[p.index].name;
      if (state.online) {
        sendAction({ type: "placeArtifact", playerIndex: p.index });
        state.selected = [];
        state.tool = null;
        render();
        return;
      }
      const result = Game.placeArtifact(g, p.index);
      const art = result.error ? null : artifactInfo(g.players[p.index].artifact);
      applyResult(
        result,
        "已放上神器（未查看）",
        art ? "放神器：" + name + " ← " + art.name : null
      );
      return;
    }
    if (id === "lookArtifact") {
      const p = onePlayer();
      if (!p) {
        toast("請先點一位玩家");
        return;
      }
      peekArtifactAt(p.index);
    }
  }

  function lookSelectedCards() {
    if (!state.selected.length) {
      toast("請先點要看的牌");
      return;
    }
    const blocked = state.selected.filter((t) => Game.lookBlocked(state.game, t));
    if (blocked.length) {
      toast("有盾牌的牌不能看");
      return;
    }
    if (state.online) {
      sendAction({ type: "look", targets: state.selected.slice() });
      state.selected = [];
      state.tool = null;
      render();
      return;
    }
    const cards = state.selected.map((t) => Game.getCard(state.game, t));
    const where = state.selected.map(seatLabel).join("、");
    addLog("看牌：" + where);
    Game.applyCopyFromLook(state.game, inferOfflineActorSeat(), state.selected.slice());
    state.peek = {
      html:
        '<div class="peek-cards">' +
        cards.map((c) => peekCardHtml(c.roleId)).join("") +
        "</div>",
    };
    render();
  }

  function doRotate(dir) {
    if (state.rotateSelf == null) {
      toast("請先點你自己的座位");
      return;
    }
    const who = state.game.players[state.rotateSelf]?.name || "";
    if (state.online) {
      sendAction({ type: "rotate", selfIndex: state.rotateSelf, direction: dir });
      state.selected = [];
      state.markChoice = null;
      state.rotateSelf = null;
      state.tool = null;
      render();
      return;
    }
    applyResult(
      Game.rotatePlayerCards(state.game, state.rotateSelf, dir),
      dir === 1 ? "已向右輪轉" : "已向左輪轉",
      (dir === 1 ? "輪轉向右" : "輪轉向左") + "（自己：" + who + "）"
    );
  }

  function ask(title, text, onYes) {
    state.modal = { title, text, onYes };
    render();
  }

  function cardFaceHtml(card, forceUp, publicReveal, alphaSlot) {
    const up = (forceUp || card.revealed || publicReveal) && card.roleId;
    const alpha = alphaSlot ? " alpha" : "";
    if (!up) return '<div class="card back' + alpha + '"></div>';
    const color = roleColor(card.roleId);
    return (
      '<div class="card front-up' +
      alpha +
      '" style="border-color:' +
      color +
      '"><div class="front"><div class="emoji">' +
      roleIconHtml(card.roleId) +
      '</div><div class="rname" style="color:' +
      color +
      '">' +
      escapeHtml(roleName(card.roleId)) +
      "</div></div></div>"
    );
  }

  function snapshotCard(snap) {
    return {
      roleId: snap.roleId,
      revealed: snap.revealed,
    };
  }

  function renderSeatFromSnap(kind, index, snap, extra) {
    const selected = isSelected({ type: kind === "center" ? "center" : "player", index });
    const showFace = extra.forceUp || (extra.showRevealed && snap.revealed);
    const card = snapshotCard(snap);
    const mark = extra.showTokens && snap.mark ? markInfo(snap.mark) : null;
    const art = extra.showTokens && snap.artifact ? artifactInfo(snap.artifact) : null;
    const hasMark = extra.showTokens && (!!snap.hasMark || !!snap.mark);
    const hasArt = extra.showTokens && (!!snap.hasArtifact || !!snap.artifact);
    const markLabel = extra.revealSecrets && mark ? mark.emoji + mark.name : hasMark ? "●標記" : "";
    const artLabel = extra.revealSecrets && art ? art.emoji + art.name : hasArt ? "◆神器" : "";
    return (
      '<button class="seat' +
      (selected ? " selected" : "") +
      (snap.shielded ? " shielded" : "") +
      (showFace ? " face-public" : "") +
      (extra.mine ? " seat-mine" : "") +
      (extra.className ? " " + extra.className : "") +
      '" data-act="seat" data-type="' +
      (kind === "center" ? "center" : "player") +
      '" data-index="' +
      index +
      '"' +
      (extra.style ? ' style="' + extra.style + '"' : "") +
      '><div class="who">' +
      escapeHtml(extra.label) +
      "</div>" +
      cardFaceHtml(card, extra.forceUp, extra.showRevealed && snap.revealed, !!snap.alphaSlot) +
      '<div class="badges">' +
      (snap.shielded ? '<span class="badge shield">盾</span>' : "") +
      (markLabel ? '<span class="badge mark">' + escapeHtml(markLabel) + "</span>" : "") +
      (artLabel ? '<span class="badge art">' + escapeHtml(artLabel) + "</span>" : "") +
      "</div></button>"
    );
  }

  function renderBoard(opts) {
    const g = state.game;
    const snap = opts.fromOriginal ? g.original : Game.currentSnapshot(g);
    const extraBase = {
      forceUp: !!opts.forceUp,
      showRevealed: opts.showRevealed !== false,
      showTokens: opts.showTokens !== false,
      revealSecrets: !!opts.revealSecrets,
    };
    const n = snap.players.length;
    const ring = n >= 9 ? 42 : n >= 7 ? 41 : 40;
    const sizeClass = n >= 9 ? " seats-12" : n >= 7 ? " seats-8" : "";
    const mains = snap.center.filter((c) => !c.alphaSlot);
    const extras = snap.center.filter((c) => c.alphaSlot);

    let html = '<div class="table-circle' + sizeClass + '"><div class="table-felt"></div>';
    html += '<div class="center-cluster"><div class="center-row">';
    mains.forEach((c) => {
      const i = snap.center.indexOf(c);
      html += renderSeatFromSnap("center", i, c, {
        ...extraBase,
        label: "中" + (i + 1),
      });
    });
    html += "</div>";
    extras.forEach((c) => {
      const i = snap.center.indexOf(c);
      html += '<div class="center-row alpha-row">';
      html += renderSeatFromSnap("center", i, c, {
        ...extraBase,
        label: "中間狼人",
        className: isArrange() ? "seat-alpha-locked" : "",
      });
      html += "</div>";
    });
    html += "</div>";

    const my = state.online ? mySeatIndex() : -1;
    snap.players.forEach((p, i) => {
      const mine = my >= 0 && i === my;
      const offset = my >= 0 ? (i - my + n) % n : i;
      const deg = (my >= 0 ? 90 : -90) + (360 / n) * offset;
      const rad = (deg * Math.PI) / 180;
      const x = 50 + ring * Math.cos(rad);
      const y = 50 + ring * Math.sin(rad);
      html += renderSeatFromSnap("player", i, p, {
        ...extraBase,
        mine: mine,
        label: p.name,
        className: "seat-orbit",
        style: "left:" + x.toFixed(2) + "%;top:" + y.toFixed(2) + "%",
      });
    });
    html += "</div>";
    return html;
  }

  function brandSub() {
    return state.online ? "線上房間 · 每人看自己的牌" : "可開房間，或單機傳同一支手機玩";
  }

  function reconnectBar() {
    if (!state.reconnecting) return "";
    return '<div class="reconnect-bar">重新連線中…</div>';
  }

  function copyRoomLink() {
    const code = state.joinCode || "";
    const link =
      location.origin && location.origin.indexOf("http") === 0
        ? location.origin + location.pathname.replace(/index\.html$/, "") + "?room=" + code
        : code;
    if (navigator.clipboard && link) {
      navigator.clipboard.writeText(link).then(
        () => toast("已複製房間連結"),
        () => toast(code)
      );
    } else toast(code || "還沒有房號");
  }

  function renderScriptBar() {
    const g = state.game;
    if (!g || (g.phase !== "dusk" && g.phase !== "night")) return "";
    const steps = Game.scriptSteps(g);
    if (!steps.length) return "";
    const i = Math.min(g.scriptIndex || 0, steps.length - 1);
    const step = steps[i];
    const Voice = window.WerewolfVoice;
    const soundOn = Voice ? Voice.soundOn() : true;
    const j = g.judge || {};
    const running = !!j.running;
    const canStart = !state.online || isHost();
    const canScript = !state.online || isHost();
    const muteHint = state.online && !isHost() && !soundOn ? "（聽房主喇叭）" : "";
    return (
      '<div class="script-bar"><div class="script-text">' +
      escapeHtml(step.text) +
      '</div><div class="script-meta"><span class="tiny">第 ' +
      (i + 1) +
      " / " +
      steps.length +
      ' 句</span><span class="tiny" id="script-hold">' +
      (running ? "主持中" : canStart ? "按「開始主持」由系統帶流程" : "房主主持中，請依字幕行動") +
      '</span></div><div class="script-nav">' +
      (canScript
        ? '<button class="btn ghost" data-act="script" data-d="-1"' +
          (i <= 0 ? " disabled" : "") +
          ">上一句</button>"
        : "") +
      (canStart
        ? '<button class="btn primary" data-act="voice-play" id="voice-play" data-can-start="1"' +
          (running ? " disabled" : "") +
          ">" +
          (running ? "主持中" : "開始主持") +
          "</button>"
        : '<button class="btn primary" id="voice-play" data-can-start="0" disabled>主持中</button>') +
      (canScript
        ? '<button class="btn ghost" data-act="script" data-d="1"' +
          (i >= steps.length - 1 ? " disabled" : "") +
          ">下一句</button>"
        : "") +
      '<button class="btn ghost' +
      (soundOn ? " on" : "") +
      '" data-act="voice-mute" id="voice-mute">' +
      (soundOn ? "語音開" : "語音關") +
      muteHint +
      "</button></div></div>"
    );
  }

  function renderRoleBlock(editable) {
    const roles = Data.ROLES.filter((r) => r.expansion === state.expansion);
    const have = selectedHave();
    const need = selectedNeed();
    const ok = have === need;
    let html = "";
    html +=
      '<div class="tabs">' +
      Data.EXPANSIONS.map(
        (e) =>
          '<button class="tab' +
          (state.expansion === e.id ? " active" : "") +
          '" data-act="exp" data-id="' +
          e.id +
          '">' +
          escapeHtml(e.name) +
          "</button>"
      ).join("") +
      "</div>";
    html +=
      '<div class="panel"><div class="role-grid">' +
      roles
        .map((r) => {
          const q = state.counts[r.id] || 0;
          return (
            '<button class="role-tile' +
            (q ? " sel" : "") +
            (editable ? "" : " view-only") +
            '"' +
            (editable ? ' data-act="role" data-id="' + r.id + '"' : ' data-id="' + r.id + '"') +
            ' style="--c:' +
            Data.TEAMS[r.team].color +
            '"><span class="qty">' +
            q +
            '</span><span class="emoji">' +
            roleIconHtml(r.id) +
            '</span><span class="rname">' +
            escapeHtml(r.name) +
            "</span></button>"
          );
        })
        .join("") +
      "</div>" +
      (editable
        ? '<div style="margin-top:10px" class="row"><button class="btn ghost" data-act="clear-roles">清空角色</button><span class="tiny">點角色可加到上限</span></div>'
        : '<div class="tiny" style="margin-top:8px">可滑看各系列角色，只有房主能點選加入牌組</div>') +
      "</div>";
    html +=
      '<div class="need ' +
      (ok ? "ok" : "bad") +
      '">已選 ' +
      have +
      " 張，需要 " +
      need +
      " 張（人數 + 3）" +
      (state.settings.alphaWolf ? "，另外會自動加 1 張中間狼人" : "") +
      "</div>";
    html +=
      '<div class="panel">' +
      settingRow("dusk", "黃昏（含標記）", state.online ? "發牌後每人用自己手機看標記" : "看完牌後先進入黃昏，結束時再傳手機看標記", editable) +
      settingRow("artifacts", "神器", "監護人可從面朝下的神器堆抽放", editable) +
      settingRow("shield", "盾牌", "哨兵可放盾，擋住看牌／換牌／放神器", editable) +
      settingRow("alphaWolf", "阿爾法狼中間狼人", "中間額外放一張狼人牌", editable) +
      voicePrefRow() +
      "</div>";
    if (state.settings.artifacts) {
      html +=
        '<div class="panel"><div class="label" style="margin-bottom:8px">本局神器（洗混後抽放）</div><div class="art-grid">' +
        Data.ARTIFACTS.map((a) => {
          const on = (state.settings.artifactIds || []).includes(a.id);
          return (
            '<button class="art-item' +
            (on ? " on" : "") +
            (editable ? "" : " view-only") +
            '"' +
            (editable ? ' data-act="art" data-id="' + a.id + '"' : ' data-id="' + a.id + '"') +
            ">" +
            a.emoji +
            " " +
            escapeHtml(a.name) +
            "</button>"
          );
        }).join("") +
        "</div></div>";
    }
    return html;
  }

  function renderLobbySeats() {
    const members = (state.room && state.room.members) || [];
    const n = Math.max(members.length, 1);
    const ring = n >= 9 ? 42 : n >= 7 ? 41 : 40;
    const sizeClass = n >= 9 ? " seats-12" : n >= 7 ? " seats-8" : "";
    const my = members.findIndex((m) => m.id === state.clientId);
    let html = '<div class="table-circle' + sizeClass + ' lobby-circle"><div class="table-felt"></div>';
    html +=
      '<div class="lobby-center"><div class="lobby-count">' +
      members.length +
      " 人</div><div class=\"tiny\">準備 " +
      members.filter((m) => m.ready).length +
      "／" +
      members.length +
      "</div></div>";
    members.forEach((m, i) => {
      const mine = i === my;
      const offset = my >= 0 ? (i - my + n) % n : i;
      const deg = (my >= 0 ? 90 : -90) + (360 / n) * offset;
      const rad = (deg * Math.PI) / 180;
      const x = 50 + ring * Math.cos(rad);
      const y = 50 + ring * Math.sin(rad);
      const online = memberOnline(m.id);
      const picked = state.lobbyPick === i;
      const initial = (m.name || "?").trim().slice(0, 1);
      const statusChip = !online
        ? '<span class="lobby-chip offline">離線</span>'
        : m.ready
          ? '<span class="lobby-chip ready">準備</span>'
          : '<span class="lobby-chip wait">未準備</span>';
      html +=
        '<button class="seat seat-orbit lobby-seat' +
        (mine ? " seat-mine" : "") +
        (online ? "" : " seat-offline") +
        (m.ready ? " seat-ready" : "") +
        (picked ? " selected" : "") +
        '" data-act="lobby-seat" data-index="' +
        i +
        '" style="left:' +
        x.toFixed(2) +
        "%;top:" +
        y.toFixed(2) +
        '%"><div class="lobby-avatar">' +
        escapeHtml(initial) +
        '</div><div class="who">' +
        escapeHtml(m.name || "?") +
        "</div>" +
        statusChip +
        "</button>";
    });
    html += "</div>";
    return html;
  }

  function renderLobbyRoleSummary() {
    const have = selectedHave();
    const need = selectedNeed();
    const flags = [];
    if (state.settings.dusk) flags.push("黃昏");
    if (state.settings.artifacts) flags.push("神器");
    if (state.settings.shield) flags.push("盾牌");
    if (state.settings.alphaWolf) flags.push("阿爾法狼");
    return (
      '<div class="panel lobby-role-summary"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
      "<div><strong>已選 " +
      have +
      "／" +
      need +
      " 張</strong><div class=\"tiny\">" +
      (flags.length ? flags.join(" · ") : "無特殊規則") +
      '</div></div><button class="btn ghost" data-act="toggle-lobby-roles">' +
      (state.lobbyRolesOpen ? "收起角色" : "查看角色") +
      "</button></div>" +
      (state.lobbyRolesOpen ? renderRoleBlock(false) : "") +
      "</div>"
    );
  }

  function onLobbySeatTap(index) {
    if (!isHost()) return;
    const members = (state.room && state.room.members) || [];
    if (index < 0 || index >= members.length) return;
    if (state.lobbyPick == null || state.lobbyPick === index) {
      state.lobbyPick = state.lobbyPick === index ? null : index;
      render();
      return;
    }
    Net.send({ type: "moveSeat", a: state.lobbyPick, b: index });
    state.lobbyPick = null;
  }

  function renderLobby() {
    const members = (state.room && state.room.members) || [];
    const code = state.joinCode || "";
    const me = members.find((m) => m.id === state.clientId);
    const have = selectedHave();
    const need = selectedNeed();
    const ok = have === need;
    const allReady = members.length > 0 && members.every((m) => m.ready);
    const allOnline = members.length > 0 && members.every((m) => memberOnline(m.id));
    const canDeal = isHost() && ok && allReady && allOnline && members.length >= 3 && members.length <= 12;
    const picked = state.lobbyPick != null ? members[state.lobbyPick] : null;
    let hostHint = "";
    if (isHost() && members.length < 3) hostHint = "至少 3 人才能發牌";
    else if (isHost() && !allOnline) hostHint = "還有人離線，請先踢人或等重連";
    else if (isHost() && !allReady) hostHint = "等所有人按準備";
    else if (isHost() && !ok) hostHint = "請選正好 " + need + " 張角色牌";
    let pickBar = "";
    if (isHost() && picked) {
      pickBar =
        '<div class="panel lobby-pick"><div class="tiny" style="text-align:left">已選 ' +
        escapeHtml(picked.name) +
        "：再點另一座位可對調</div><div class=\"row\" style=\"margin-top:8px;gap:8px;flex-wrap:wrap\">" +
        (picked.id !== state.room.hostId
          ? '<button class="btn danger" data-act="kick" data-id="' +
            escapeHtml(picked.id) +
            '">踢出</button><button class="btn ghost" data-act="transfer" data-id="' +
            escapeHtml(picked.id) +
            '">設為房主</button>'
          : '<span class="tiny">這是房主</span>') +
        '<button class="btn ghost" data-act="clear-pick">取消</button></div></div>';
    }
    const dealLabel = canDeal ? "洗牌發牌，開始遊戲" : hostHint || "請等房主發牌";
    const notReady = members.filter((m) => !m.ready).map((m) => m.name);
    const offline = members.filter((m) => !memberOnline(m.id)).map((m) => m.name);
    let guestHint = "已加入，請按準備並等房主發牌。";
    if (!me || !me.ready) guestHint = "請先按「準備」，再等房主發牌。";
    else if (offline.length) guestHint = "還有人離線：" + offline.join("、");
    else if (notReady.length) guestHint = "還在等：" + notReady.join("、") + " 按準備";
    else if (!ok) guestHint = "已準備，等房主選正好 " + need + " 張角色牌";
    else guestHint = "大家都準備好了，等房主發牌。";
    return (
      '<section class="screen lobby-screen">' +
      '<div class="topbar">' +
      brandBlock("<h1>一夜終極 · 房間</h1>", '<div class="sub">' + brandSub() + "</div>") +
      '<button class="btn ghost" data-act="open-rules">規則書</button></div>' +
      reconnectBar() +
      '<div class="scroll-keep">' +
      '<div class="panel room-panel"><div class="row"><div><div class="label">房號</div><div class="room-code">' +
      escapeHtml(code) +
      '</div></div><button class="btn ghost" data-act="copy-code">複製房號</button></div>' +
      '<div class="tiny" style="margin-top:6px">在線 ' +
      members.filter((m) => memberOnline(m.id)).length +
      "／" +
      members.length +
      "　準備 " +
      members.filter((m) => m.ready).length +
      "／" +
      members.length +
      "</div></div>" +
      '<div class="table-wrap lobby-table">' +
      renderLobbySeats() +
      "</div>" +
      pickBar +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
      '<button class="btn ' +
      (me && me.ready ? "done" : "primary") +
      '" data-act="toggle-ready">' +
      (me && me.ready ? "取消準備" : "準備") +
      '</button>' +
      '<button class="btn ghost" data-act="leave-room">離開房間</button></div>' +
      (isHost() ? renderRoleBlock(true) : renderLobbyRoleSummary()) +
      "</div>" +
      (isHost()
        ? '<div class="footer-bar"><button class="btn primary wide" data-act="deal"' +
          (canDeal ? "" : " disabled") +
          ">" +
          escapeHtml(dealLabel) +
          "</button></div>"
        : '<div class="footer-bar guest-hint"><div class="tiny">' +
          escapeHtml(guestHint) +
          "</div></div>") +
      "</section>"
    );
  }

  function renderRoomPanel() {
    return (
      '<div class="panel room-panel"><div class="label" style="margin-bottom:8px">線上房間</div>' +
      '<label class="room-field">你的名字<input data-act="join-name" value="' +
      escapeHtml(state.joinName) +
      '" placeholder="例如：小明"></label>' +
      '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">' +
      '<button class="btn primary" data-act="create-room">建立房間</button></div>' +
      '<div class="row" style="margin-top:10px;gap:8px;align-items:center">' +
      '<input class="room-code-input" data-act="join-code" maxlength="4" placeholder="房號" value="' +
      escapeHtml(state.joinCode) +
      '">' +
      '<button class="btn" data-act="join-room">加入房間</button></div>' +
      '<div class="tiny" style="margin-top:8px">不開房間的話，下面仍可單機、傳同一支手機玩。</div></div>'
    );
  }

  function renderSetup() {
    const have = selectedHave();
    const need = selectedNeed();
    const ok = have === need;
    return (
      '<section class="screen setup-screen">' +
      '<div class="topbar">' +
      brandBlock("<h1>一夜終極 · 牌桌</h1>", '<div class="sub">' + brandSub() + "</div>") +
      '<button class="btn ghost" data-act="open-rules">規則書</button></div>' +
      '<div class="scroll-keep">' +
      renderRoomPanel() +
      '<div class="panel"><div class="row"><span class="label">玩家人數</span><div class="stepper">' +
      '<button data-act="count" data-d="-1">−</button><span class="count-num">' +
      state.playerCount +
      "</span><button data-act=\"count\" data-d=\"1\">+</button></div></div></div>" +
      '<div class="panel"><div class="label" style="margin-bottom:8px">座位名稱</div><div class="name-list">' +
      state.names
        .map(
          (n, i) =>
            "<label>座位 " +
            (i + 1) +
            '<input data-act="name" data-index="' +
            i +
            '" value="' +
            escapeHtml(n) +
            '"></label>'
        )
        .join("") +
      "</div></div>" +
      renderRoleBlock(true) +
      "</div>" +
      '<div class="footer-bar"><button class="btn primary wide" data-act="deal"' +
      (ok ? "" : " disabled") +
      ">洗牌發牌，開始看牌</button></div>" +
      "</section>"
    );
  }

  function voicePrefRow() {
    const on = window.WerewolfVoice ? WerewolfVoice.soundOn() : true;
    const hint = state.online && !isHost()
      ? "線上非房主預設關語音，請聽房主喇叭。若要本機也播可自行打開"
      : "線上建議只開房主喇叭，避免疊音。此開關只存在這台裝置";
    return (
      '<div class="toggle"><div><div>本機播放語音</div><div class="tiny">' +
      escapeHtml(hint) +
      '</div></div><button class="switch' +
      (on ? " on" : "") +
      '" data-act="voice-mute"><i></i></button></div>'
    );
  }

  function settingRow(key, title, hint, editable) {
    const can = editable !== false;
    return (
      '<div class="toggle"><div><div>' +
      escapeHtml(title) +
      '</div><div class="tiny">' +
      escapeHtml(hint) +
      '</div></div><button class="switch' +
      (state.settings[key] ? " on" : "") +
      '" data-act="set" data-key="' +
      key +
      '"' +
      (can ? "" : " disabled") +
      "><i></i></button></div>"
    );
  }

  function lookingSeenMap() {
    return (state.room && state.room.cardSeen) || (state.game && state.game.cardSeen) || {};
  }

  function lookingSeenStats() {
    const members = (state.room && state.room.members) || [];
    const seen = lookingSeenMap();
    const online = members.filter((m) => memberOnline(m.id));
    const nSeen = online.filter((m) => seen[m.id]).length;
    return {
      nSeen: nSeen,
      nNeed: online.length,
      all: online.length > 0 && nSeen >= online.length,
      meSeen: !!seen[state.clientId],
      rows: online.map((m) => ({
        id: m.id,
        name: m.name || "玩家",
        seen: !!seen[m.id],
        mine: m.id === state.clientId,
      })),
    };
  }

  function renderLookingSeenPanel(stats) {
    const rows = (stats.rows || [])
      .map(
        (r) =>
          '<li class="' +
          (r.seen ? "seen" : "wait") +
          '">' +
          (r.seen ? "✓ " : "○ ") +
          escapeHtml(r.name) +
          (r.mine ? "（你）" : "") +
          (r.seen ? "" : " · 未確認") +
          "</li>"
      )
      .join("");
    return (
      '<div class="looking-seen-panel">' +
      '<div class="looking-seen-title">看牌確認（全員可見）</div>' +
      '<div class="looking-seen-count">已確認 <strong>' +
      stats.nSeen +
      "</strong>／" +
      stats.nNeed +
      '</div><ul class="looking-seen-list">' +
      rows +
      "</ul></div>"
    );
  }

  function renderOnlineOwnCard() {
    const priv = myPrivate();
    const c = priv.myCard;
    const me = ((state.room && state.room.members) || []).find((m) => m.id === state.clientId);
    const nextLabel = state.game.settings.dusk ? "確認，進入黃昏" : "確認，進入黑夜";
    const stats = lookingSeenStats();
    const seenPanel = renderLookingSeenPanel(stats);
    let body;
    if (!c || !c.roleId) {
      body =
        '<div class="pass-view-body">' +
        seenPanel +
        '<p class="tiny">正在取得你的角色…</p></div>';
    } else {
      const color = roleColor(c.roleId);
      body =
        '<div class="pass-view-body"><div class="tiny">' +
        escapeHtml(me ? me.name : "你") +
        " · 這是你的起始角色</div>" +
        '<div class="pass-role-card" style="border-color:' +
        color +
        '"><div class="emoji">' +
        roleIconHtml(c.roleId) +
        '</div><div class="rname" style="color:' +
        color +
        '">' +
        escapeHtml(roleName(c.roleId)) +
        "</div></div>" +
        seenPanel +
        (stats.meSeen
          ? '<div class="tiny" style="color:var(--ok)">你已按「我已記住」</div>'
          : '<button class="btn primary wide" data-act="card-seen">我已記住</button>' +
            '<div class="tiny">每位玩家（含房主）都要按一次</div>') +
        (isHost()
          ? '<button class="btn ' +
            (stats.all ? "primary" : "ghost") +
            ' wide" data-act="finish-looking"' +
            (stats.all ? "" : " disabled") +
            ">" +
            escapeHtml(nextLabel) +
            '</button><div class="tiny">' +
            (stats.all
              ? "大家（含你）都已確認，可以繼續"
              : "等所有在線玩家（含房主自己）按「我已記住」") +
            "</div>"
          : '<div class="tiny">進度全員同步顯示，確認後等房主繼續</div>') +
        "</div>";
    }
    return (
      '<section class="screen"><div class="topbar">' +
      brandBlock(
        '<div class="phase-tag">看自己的牌</div><h1>起始角色</h1>',
        '<div class="sub">已確認 ' + stats.nSeen + "／" + stats.nNeed + " · 全員可見</div>"
      ) +
      "</div>" +
      body +
      "</section>"
    );
  }

  function renderPassView(kind) {
    if (state.online && kind === "card") {
      return renderOnlineOwnCard();
    }
    const g = state.game;
    const p = g.players[state.viewIndex];
    const total = g.players.length;
    const isCard = kind === "card";
    const title = isCard ? "依序看自己的牌" : "黃昏結束 · 看自己的標記";
    const remaining = total - state.viewIndex;
    let body;
    // 天黑前看牌：直接顯示角色牌；看標記仍先蓋住，避免旁邊的人瞄到
    if (!isCard && !state.viewOpen) {
      body =
        '<div class="panel" style="text-align:center;padding:28px 12px"><div class="phase-tag">傳手機</div><h2 style="margin:8px 0 4px">' +
        escapeHtml(p.name) +
        '</h2><p class="tiny">請確認旁邊的人看不到螢幕</p>' +
        '<button class="btn primary wide" data-act="open-view">點擊查看</button></div>';
    } else if (isCard) {
      const c = p.card;
      const color = roleColor(c.roleId);
      body =
        '<div class="pass-view-body"><div class="tiny">傳給 <strong style="color:var(--gold-2)">' +
        escapeHtml(p.name) +
        "</strong> · 這是你的起始角色</div>" +
        '<div class="pass-role-card" style="border-color:' +
        color +
        '"><div class="emoji">' +
        roleIconHtml(c.roleId) +
        '</div><div class="rname" style="color:' +
        color +
        '">' +
        escapeHtml(roleName(c.roleId)) +
        "</div></div>" +
        '<button class="btn primary wide" data-act="next-view">蓋上，下一位</button></div>';
    } else {
      const m = markInfo(p.mark);
      body =
        '<div class="panel" style="text-align:center"><div class="tiny">這是你現在的標記</div>' +
        '<div class="peek-cards" style="margin:16px 0"><div class="peek-card"><div class="emoji">' +
        (m ? m.emoji : "❓") +
        '</div><div class="rname">' +
        escapeHtml(m ? m.name + "標記" : "沒有標記") +
        "</div></div></div>" +
        '<button class="btn primary wide" data-act="next-view">蓋上，下一位</button></div>';
    }
    return (
      '<section class="screen"><div class="topbar">' +
      brandBlock(
        '<div class="phase-tag">' + title + "</div><h1>" + (state.viewIndex + 1) + " / " + total + "</h1>",
        '<div class="sub">還有 ' + remaining + " 人</div>"
      ) +
      "</div>" +
      body +
      "</section>"
    );
  }

  function toolBtn(id, label) {
    return (
      '<button class="tool' +
      (state.tool === id ? " active" : "") +
      '" data-act="tool" data-id="' +
      id +
      '">' +
      label +
      "</button>"
    );
  }

  function tableHint() {
    const n = state.selected.length;
    if (state.tool === "rotate") return "已選自己的座位，再選向左或向右。";
    if (state.tool === "placeMark") return "已選玩家，再選要放上的標記。";
    if (state.online && state.tool === "swap") return "再點對方或中間的牌，與自己對調。若已選兩張則對調那兩張。";
    if (isArrange()) return state.online
      ? "發牌後可先換牌。先按換牌，再點要和自己對調的那張。中間狼人不能換。"
      : "發牌後可先換牌。請先點兩張再按換牌。中間狼人不能換。";
    if (state.online && !n) return "先點牌再選功能。換牌可先按換牌，再點要和自己對調的那張。";
    if (!n) return "先點牌，再選下面的功能。可按「取消選取」清空。";
    return "已選 " + n + " 張，再選要做的事。再點一次即可取消。";
  }

  function renderTable() {
    const g = state.game;
    const arrange = g.phase === "arrange";
    const dusk = g.phase === "dusk";
    const phaseName = arrange ? "發牌後" : dusk ? "黃昏" : "黑夜";
    const tools = [];
    if (arrange) {
      tools.push(toolBtn("swap", "換牌"));
    } else {
      tools.push(toolBtn("look", "看牌"), toolBtn("swap", "換牌"), toolBtn("rotate", "輪轉"), toolBtn("flip", "翻開／蓋上"));
      if (g.settings.dusk) {
        tools.push(toolBtn("placeMark", "放標記"), toolBtn("lookMark", "看標記"), toolBtn("swapMark", "換標記"));
      }
      if (g.settings.artifacts) {
        tools.push(toolBtn("placeArtifact", "放神器"), toolBtn("lookArtifact", "看神器"));
      }
      if (g.settings.shield) tools.push(toolBtn("shield", "放盾牌"));
    }

    let extra = "";
    if (state.tool === "placeMark") {
      extra += '<div class="mark-pick">';
      extra += Data.MARKS.map((m) => {
        const left = g.markPool[m.id] || 0;
        return (
          '<button class="chip' +
          (state.markChoice === m.id ? " on" : "") +
          '" data-act="mark" data-id="' +
          m.id +
          '"' +
          (left ? "" : " disabled") +
          ">" +
          m.emoji +
          " " +
          escapeHtml(m.name) +
          "</button>"
        );
      }).join("");
      extra += "</div>";
    }
    if (state.tool === "rotate") {
      extra +=
        '<div class="dir-pick"><button class="btn" data-act="rot" data-d="-1">向左</button><button class="btn" data-act="rot" data-d="1">向右</button></div>' +
        '<div class="tiny">' +
        (state.rotateSelf == null
          ? "請先點你自己的座位"
          : "已選：" + escapeHtml(g.players[state.rotateSelf].name)) +
        "</div>";
    }

    const nextLabel = arrange ? "開始看牌" : dusk ? "結束黃昏" : "天亮了";
    const nextAct = arrange ? "begin-look" : dusk ? "end-dusk" : "end-night";
    const deckNote = g.settings.artifacts ? "神器堆剩 " + g.artifactDeck.length + " 枚" : "";
    const title = arrange ? "先換牌" : "依字幕行動";
    const sub = arrange
      ? (state.online
          ? "房號 " + escapeHtml(state.joinCode) + "　還沒看牌，可先對調（中間狼人不能換）"
          : "還沒看牌，可先對調座位上的牌（中間狼人不能換）")
      : (state.online ? "房號 " + escapeHtml(state.joinCode) + "　" : "") + deckNote;

    return (
      '<section class="screen table-screen"><div class="topbar">' +
      brandBlock(
        '<div class="phase-tag">' + phaseName + "桌面</div><h1>" + title + "</h1>",
        '<div class="sub">' + sub + "</div>"
      ) +
      '<div class="row" style="gap:6px">' +
      (state.online && !arrange ? '<button class="btn ghost" data-act="my-card">我的牌</button>' : "") +
      (state.online && !arrange && g.settings.dusk ? '<button class="btn ghost" data-act="my-mark">我的標記</button>' : "") +
      '<button class="btn ghost" data-act="undo">還原</button></div></div>' +
      reconnectBar() +
      renderScriptBar() +
      (arrange ? "" : renderMyActionsPanel()) +
      '<div class="table-wrap">' +
      renderBoard({ showRevealed: true, showTokens: true, revealSecrets: false }) +
      "</div>" +
      '<div class="table-dock">' +
      '<div class="hint">' +
      escapeHtml(tableHint()) +
      "</div>" +
      extra +
      '<div class="tools">' +
      tools.join("") +
      "</div>" +
      '<div class="table-actions"><button class="btn done" data-act="lock-phone">取消選取</button>' +
      (!state.online || isHost()
        ? '<button class="btn ' +
          (arrange ? "primary" : "danger") +
          '" data-act="' +
          nextAct +
          '">' +
          nextLabel +
          "</button>"
        : '<div class="tiny">請等房主操作流程</div>') +
      "</div></div></section>"
    );
  }

  function renderDay() {
    const g = state.game;
    const hasArt = g.players.some((p) => p.artifact || p.hasArtifact);
    return (
      '<section class="screen table-screen"><div class="topbar">' +
      brandBlock(
        '<div class="phase-tag">白天</div><h1>討論中</h1>',
        '<div class="sub">蓋著的牌不能再看；已翻開的維持公開</div>'
      ) +
      "</div>" +
      reconnectBar() +
      '<div class="table-wrap">' +
      renderBoard({ showRevealed: true, showTokens: true, revealSecrets: false }) +
      "</div>" +
      '<div class="table-dock">' +
      (hasArt
        ? '<div class="hint">先點有神器的玩家，再按看神器</div><div class="tools">' +
          toolBtn("lookArtifact", "看神器") +
          "</div>"
        : "") +
      (!state.online || isHost()
        ? '<button class="btn primary wide" data-act="start-vote">開始投票</button>'
        : '<div class="tiny" style="text-align:center;padding:12px 0">請等房主開始投票</div>') +
      "</div></section>"
    );
  }

  function hasVoted(index) {
    const voted = (state.game && state.game.voted) || [];
    if (voted.indexOf(index) >= 0) return true;
    return !!(state.game && state.game.votes && state.game.votes[index] != null);
  }

  function currentVoter() {
    if (state.online) return mySeatIndex();
    if (state.voteIndex == null) state.voteIndex = 0;
    return state.voteIndex;
  }

  function startVote() {
    if (state.online) {
      if (!isHost()) {
        toast("請等房主開始投票");
        return;
      }
      sendAction({ type: "setPhase", phase: "voting" });
      return;
    }
    Game.applyAction(state.game, { type: "setPhase", phase: "voting" });
    state.screen = "voting";
    state.voteIndex = 0;
    state.selected = [];
    render();
  }

  function submitVote() {
    const p = onePlayer();
    if (!p) {
      toast("請先點要投的玩家");
      return;
    }
    const me = currentVoter();
    if (state.online) {
      if (!Net.send({ type: "vote", targetIndex: p.index })) toast("尚未連線");
      state.selected = [];
      render();
      return;
    }
    const r = Game.castVote(state.game, me, p.index);
    if (r.error) {
      toast(r.error);
      return;
    }
    state.selected = [];
    if (Game.allVoted(state.game)) {
      Game.resolveVotes(state.game);
      state.screen = "recap";
      state.recapMode = "current";
    } else {
      const next = state.game.players.findIndex((_, i) => !hasVoted(i));
      state.voteIndex = next < 0 ? me : next;
    }
    render();
  }

  function tallyVotes() {
    if (state.online) {
      if (!isHost()) {
        toast("請等房主開票");
        return;
      }
      if (!Net.send({ type: "tally" })) toast("尚未連線");
      return;
    }
    const r = Game.resolveVotes(state.game);
    if (r.error) {
      toast(r.error);
      return;
    }
    state.screen = "recap";
    state.recapMode = "current";
    render();
  }

  function renderVoting() {
    const g = state.game;
    const n = g.players.length;
    const votedN = g.players.filter((_, i) => hasVoted(i)).length;
    const pick = onePlayer();
    const me = currentVoter();
    const iVoted = me >= 0 && hasVoted(me);
    const voterName = me >= 0 ? g.players[me].name : "玩家";
    return (
      '<section class="screen table-screen"><div class="topbar">' +
      brandBlock(
        '<div class="phase-tag">投票</div><h1>' +
          (state.online ? "投出你認定的狼人" : "請 " + escapeHtml(voterName) + " 投票") +
          "</h1>",
        '<div class="sub">已投 ' + votedN + " / " + n + "　不公開投給誰</div>"
      ) +
      "</div>" +
      reconnectBar() +
      '<div class="table-wrap">' +
      renderBoard({ showRevealed: true, showTokens: true, revealSecrets: false }) +
      "</div>" +
      '<div class="table-dock"><div class="hint">' +
      (iVoted ? "你已投票，開票前仍可改投。" : pick ? "已選 " + escapeHtml(g.players[pick.index].name) : "點一位其他玩家") +
      "</div>" +
      '<button class="btn primary wide" data-act="cast-vote"' +
      (pick ? "" : " disabled") +
      ">" +
      (pick ? "投票給 " + escapeHtml(g.players[pick.index].name) : "請先選人") +
      "</button>" +
      (state.online && isHost()
        ? '<button class="btn ghost wide" style="margin-top:8px" data-act="tally">開票</button>'
        : !state.online
          ? '<button class="btn ghost wide" style="margin-top:8px" data-act="tally">開票</button>'
          : "") +
      "</div></section>"
    );
  }

  function renderVoteResult() {
    const r = state.game && state.game.voteResult;
    if (!r) return "";
    const g = state.game;
    const dead = (r.dead || []).map((i) => g.players[i].name).join("、") || "無人";
    let lines = g.players
      .map((p, i) => {
        const c = (r.counts && r.counts[i]) || 0;
        const out = (r.dead || []).indexOf(i) >= 0 ? "　出局" : "";
        return "<li>" + escapeHtml(p.name) + "　" + c + " 票" + out + "</li>";
      })
      .join("");
    return (
      '<div class="panel log-panel"><div class="label">投票結果 · ' +
      escapeHtml(r.winnerLabel || "") +
      '勝</div><div class="tiny" style="text-align:left;margin:6px 0">出局：' +
      escapeHtml(dead) +
      '</div><ol class="log-list">' +
      lines +
      "</ol></div>"
    );
  }

  function renderLog() {
    const log = state.game.log || [];
    const phaseName = {
      arrange: "發牌後",
      looking: "看牌",
      dusk: "黃昏",
      night: "黑夜",
      day: "白天",
      voting: "投票",
    };
    if (!log.length) {
      return '<div class="panel log-panel"><div class="label">操作紀錄</div><div class="tiny">這一局沒有留下操作</div></div>';
    }
    let html = '<div class="panel log-panel"><div class="label">操作紀錄</div><ol class="log-list">';
    let last = "";
    log.forEach((item) => {
      if (item.phase && item.phase !== last) {
        last = item.phase;
        html += '<li class="log-phase">' + escapeHtml(phaseName[item.phase] || item.phase) + "</li>";
      }
      html += "<li>" + escapeHtml(item.text) + "</li>";
    });
    html += "</ol></div>";
    return html;
  }

  function renderRecap() {
    const orig = state.recapMode === "original";
    if (orig && !(state.game && state.game.original)) {
      return (
        '<section class="screen recap-screen"><div class="topbar">' +
        brandBlock('<div class="phase-tag">復盤</div><h1>復盤對照</h1>') +
        '</div><div class="tiny">原始發牌資料還未送到</div></section>'
      );
    }
    return (
      '<section class="screen recap-screen"><div class="topbar">' +
      brandBlock(
        '<div class="phase-tag">復盤</div><h1>復盤對照</h1>',
        '<div class="sub">自由切換原始發牌與目前牌面</div>'
      ) +
      "</div>" +
      reconnectBar() +
      '<div class="recap-toggle">' +
      '<button class="btn' +
      (orig ? " on" : "") +
      '" data-act="recap-mode" data-id="original">原始卡牌</button>' +
      '<button class="btn' +
      (!orig ? " on" : "") +
      '" data-act="recap-mode" data-id="current">當前卡牌</button></div>' +
      '<div class="table-wrap">' +
      renderBoard({
        fromOriginal: orig,
        forceUp: true,
        showTokens: true,
        revealSecrets: true,
      }) +
      "</div>" +
      renderVoteResult() +
      renderLog() +
      '<button class="btn primary wide" data-act="again">再來一局</button></section>'
    );
  }

  function renderOverlay() {
    overlayEl.classList.add("hidden");
    overlayEl.innerHTML = "";
    overlayEl.classList.remove("peek-overlay");
    overlayEl.classList.remove("rules-overlay");

    if (state.rulesOpen) {
      overlayEl.classList.remove("hidden");
      overlayEl.classList.add("rules-overlay");
      overlayEl.innerHTML =
        '<div class="rules-stack">' +
        '<iframe class="rules-frame" src="rules.pdf" title="規則書"></iframe>' +
        '<a class="rules-fallback" href="rules.pdf" target="_blank" rel="noopener">若無法顯示請點此另開規則書</a>' +
        '<button class="btn primary big-btn" data-act="close-rules">關閉</button>' +
        "</div>";
      return;
    }

    if (state.peek) {
      overlayEl.classList.remove("hidden");
      overlayEl.classList.add("peek-overlay");
      overlayEl.innerHTML =
        '<div class="peek-stack">' +
        (state.peek.title ? "<h2>" + escapeHtml(state.peek.title) + "</h2>" : "") +
        state.peek.html +
        '<button class="btn primary big-btn" data-act="close-peek">蓋上</button>' +
        "</div>";
      return;
    }

    if (state.screen === "table" && !state.tableUnlocked && !state.online && !isArrange()) {
      const dusk = state.game.phase === "dusk";
      overlayEl.classList.remove("hidden");
      overlayEl.innerHTML =
        '<div class="phase-tag">' +
        (dusk ? "黃昏" : "黑夜") +
        "</div><h2>請被喚醒的玩家<br>拿起手機</h2><p>其他人都閉上眼睛</p>" +
        '<button class="btn primary big-btn" data-act="unlock">開始操作</button>';
    }
  }

  function renderModal() {
    if (!state.modal) {
      modalEl.classList.add("hidden");
      modalEl.innerHTML = "";
      return;
    }
    modalEl.classList.remove("hidden");
    modalEl.innerHTML =
      '<div class="modal"><h3>' +
      escapeHtml(state.modal.title) +
      "</h3><p>" +
      escapeHtml(state.modal.text) +
      '</p><div class="modal-actions"><button class="btn ghost" data-act="modal-no">取消</button><button class="btn primary" data-act="modal-yes">確定</button></div></div>';
  }

  function fitTable() {
    const wrap = document.querySelector(".table-wrap");
    const circle = document.querySelector(".table-circle");
    if (!wrap || !circle) return;
    const pad = 4;
    const size = Math.max(120, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight) - pad));
    circle.style.width = size + "px";
    circle.style.height = size + "px";
  }

  function render() {
    const keep = document.querySelector(".scroll-keep");
    const y = keep ? keep.scrollTop : 0;
    ensureNames();

    if (state.screen === "lobby") app.innerHTML = renderLobby();
    else if (state.screen === "setup") app.innerHTML = renderSetup();
    else if (state.screen === "viewCards") app.innerHTML = renderPassView("card");
    else if (state.screen === "viewMarks") app.innerHTML = renderPassView("mark");
    else if (state.screen === "table") app.innerHTML = renderTable();
    else if (state.screen === "day") app.innerHTML = renderDay();
    else if (state.screen === "voting") app.innerHTML = renderVoting();
    else if (state.screen === "recap") app.innerHTML = renderRecap();

    renderOverlay();
    renderModal();
    if (window.WerewolfVoice) WerewolfVoice.sync(state.game);
    armJudgeTimer();

    const keep2 = document.querySelector(".scroll-keep");
    if (keep2) keep2.scrollTop = y;
    requestAnimationFrame(fitTable);
  }

  function armJudgeTimer() {
    if (judgeTimer) {
      clearTimeout(judgeTimer);
      judgeTimer = 0;
    }
    if (state.online) return;
    const j = state.game && state.game.judge;
    if (!j || !j.running || !j.deadlineAt) return;
    const wait = j.deadlineAt - Date.now();
    judgeTimer = setTimeout(function () {
      judgeTimer = 0;
      if (!state.game || state.online) return;
      const r = Game.judgeTimeout(state.game, Date.now());
      if (r && !r.error) render();
    }, Math.max(0, wait));
  }

  function nextView() {
    state.viewOpen = false;
    state.viewIndex += 1;
    const n = state.game.players.length;
    if (state.viewIndex >= n) {
      if (state.screen === "viewCards") afterViewCards();
      else enterTable("night");
      return;
    }
    render();
  }

  function handleAct(act, ds) {
    if (act === "count") setPlayerCount(state.playerCount + Number(ds.d));
    else if (act === "exp") {
      state.expansion = ds.id;
      if (!state.online || isHost()) {
        saveSetup();
        sendSetup();
      }
      render();
    } else if (act === "role") {
      if (state.online && !isHost()) {
        toast("只有房主可以選擇角色");
        return;
      }
      cycleRole(ds.id);
    }
    else if (act === "clear-roles") {
      if (state.online && !isHost()) return;
      state.counts = Game.defaultCounts();
      state.settings = Game.inferSettings(state.counts, state.settings);
      saveSetup();
      sendSetup();
      render();
    } else if (act === "set") toggleSetting(ds.key);
    else if (act === "art") toggleArtifact(ds.id);
    else if (act === "deal") startGame();
    else if (act === "create-room") connectRoom(makeRoomCode(), true);
    else if (act === "join-room") connectRoom(state.joinCode, false);
    else if (act === "leave-room") leaveRoom();
    else if (act === "copy-code") copyRoomLink();
    else if (act === "toggle-ready") {
      const me = ((state.room && state.room.members) || []).find((m) => m.id === state.clientId);
      Net.send({ type: "ready", ready: !(me && me.ready) });
    } else if (act === "script") {
      if (state.online && !isHost()) {
        toast("只有房主可以換字幕");
        return;
      }
      const dir = Number(ds.d);
      if (state.online) sendAction({ type: "script", dir: dir });
      else {
        const r = Game.moveScript(state.game, dir);
        if (r.error) toast(r.error);
        else render();
      }
    } else if (act === "toggle-my-actions") {
      state.myActionsOpen = !state.myActionsOpen;
      render();
    } else if (act === "toggle-lobby-roles") {
      state.lobbyRolesOpen = !state.lobbyRolesOpen;
      render();
    } else if (act === "card-seen") {
      if (!state.online) return;
      Net.send({ type: "cardSeen" });
      toast("已確認");
    } else if (act === "voice-play") {
      if (state.online && !isHost()) {
        toast("只有房主可以開始主持");
        return;
      }
      if (state.online) sendAction({ type: "judgeStart" });
      else {
        const r = Game.startJudge(state.game, Date.now(), 0);
        if (r.error) toast(r.error);
        else render();
      }
    } else if (act === "voice-mute") {
      if (window.WerewolfVoice) {
        WerewolfVoice.toggleMute();
        render();
      }
    } else if (act === "start-vote") {
      if (state.online && !isHost()) {
        toast("請等房主開始投票");
        return;
      }
      ask("開始投票？", "每人投一位其他玩家。全員投完或房主開票後進入復盤。", startVote);
    }
    else if (act === "cast-vote") submitVote();
    else if (act === "tally") tallyVotes();
    else if (act === "lobby-seat") onLobbySeatTap(Number(ds.index));
    else if (act === "clear-pick") {
      state.lobbyPick = null;
      render();
    } else if (act === "kick") {
      ask("踢出這位玩家？", "他會立刻離開房間。", () => Net.send({ type: "kick", targetId: ds.id }));
      state.lobbyPick = null;
    } else if (act === "transfer") {
      ask("把房主交給這位玩家？", "之後由對方選角與發牌。", () => Net.send({ type: "transfer", targetId: ds.id }));
      state.lobbyPick = null;
    } else if (act === "my-card") showMyCard();
    else if (act === "my-mark") showMyMark();
    else if (act === "open-rules") {
      state.rulesOpen = true;
      render();
    } else if (act === "close-rules") {
      state.rulesOpen = false;
      render();
    }
    else if (act === "open-view") {
      state.viewOpen = true;
      render();
    } else if (act === "next-view") nextView();
    else if (act === "unlock") {
      state.tableUnlocked = true;
      render();
    } else if (act === "lock-phone") {
      state.tool = null;
      state.selected = [];
      state.markChoice = null;
      state.rotateSelf = null;
      state.peek = null;
      render();
    } else if (act === "tool") {
      runAction(ds.id);
    } else if (act === "seat") onSeatTap(ds.type, Number(ds.index));
    else if (act === "peek-cards") lookSelectedCards();
    else if (act === "close-peek") {
      state.peek = null;
      state.selected = [];
      render();
    } else if (act === "mark") {
      const p = onePlayer();
      if (!p) {
        toast("請先點一位玩家");
        return;
      }
      const player = state.game.players[p.index];
      const old = player.mark ? markInfo(player.mark) : null;
      const neu = markInfo(ds.id);
      if (state.online) {
        sendAction({ type: "placeMark", playerIndex: p.index, markId: ds.id });
        state.selected = [];
        state.markChoice = null;
        state.tool = null;
        render();
        return;
      }
      applyResult(
        Game.placeMark(state.game, p.index, ds.id),
        "已放置標記",
        "放標記：" + player.name + " ← " + (neu ? neu.name : ds.id) + (old ? "（原為" + old.name + "）" : "")
      );
    } else if (act === "rot") doRotate(Number(ds.d));
    else if (act === "undo") {
      if (state.online) {
        sendAction({ type: "undo" });
        return;
      }
      if (Game.undo(state.game)) {
        addLog("還原上一步");
        toast("已還原上一步");
        render();
      } else toast("沒有可還原的操作");
    } else if (act === "begin-look") {
      if (state.online && !isHost()) {
        toast("請等房主開始看牌");
        return;
      }
      ask("開始看牌？", "之後就不能在看牌前再換了。每人先看自己的牌。", beginLook);
    } else if (act === "finish-looking") {
      if (state.online && !isHost()) {
        toast("請等房主繼續");
        return;
      }
      if (state.online && !lookingSeenStats().all) {
        toast("還有人尚未按「我已記住」");
        return;
      }
      ask(
        state.game.settings.dusk ? "進入黃昏？" : "進入黑夜？",
        "大家已確認記住角色，確定繼續？",
        continueAfterLooking
      );
    } else if (act === "end-dusk") {
      ask(
        "結束黃昏？",
        state.online
          ? "接下來進入黑夜。進入後會提醒大家查看「我的標記」。"
          : "接下來會傳手機讓大家看自己的標記。",
        finishDusk
      );
    } else if (act === "end-night") {
      ask("天亮了？", "之後不能再偷看蓋著的牌。", finishNight);
    } else if (act === "recap") enterRecap();
    else if (act === "recap-mode") {
      state.recapMode = ds.id;
      render();
    } else if (act === "again") newGame();
    else if (act === "modal-no") {
      state.modal = null;
      render();
    } else if (act === "modal-yes") {
      const fn = state.modal && state.modal.onYes;
      state.modal = null;
      if (fn) fn();
      else render();
    }
  }

  app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT") return;
    if (el.hasAttribute("disabled")) return;
    handleAct(el.dataset.act, el.dataset);
  });
  overlayEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT") return;
    handleAct(el.dataset.act, el.dataset);
  });
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) {
      state.modal = null;
      render();
      return;
    }
    const el = e.target.closest("[data-act]");
    if (!el) return;
    handleAct(el.dataset.act, el.dataset);
  });
  app.addEventListener("input", (e) => {
    const joinName = e.target.closest('input[data-act="join-name"]');
    if (joinName) {
      state.joinName = joinName.value;
      saveSetup();
      return;
    }
    const joinCode = e.target.closest('input[data-act="join-code"]');
    if (joinCode) {
      state.joinCode = joinCode.value.toUpperCase();
      joinCode.value = state.joinCode;
      return;
    }
    const el = e.target.closest('input[data-act="name"]');
    if (!el) return;
    state.names[Number(el.dataset.index)] = el.value;
    saveSetup();
  });
  app.addEventListener("change", (e) => {
    const el = e.target.closest('input[data-act="name"]');
    if (!el) return;
    ensureNames();
    saveSetup();
    render();
  });

  window.addEventListener("resize", fitTable);
  window.addEventListener("orientationchange", () => requestAnimationFrame(fitTable));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitTable);
  }

  if (window.WerewolfVoice) {
    WerewolfVoice.init({
      getGame: function () {
        return state.game;
      },
      defaultMute: function () {
        return !!(state.online && !isHost());
      },
    });
  }

  loadSetup();
  const q = new URLSearchParams(location.search).get("room") || "";
  const roomQ = q.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  if (roomQ.length === 4) state.joinCode = roomQ;
  render();
  if (roomQ.length === 4 && (state.joinName || "").trim()) {
    connectRoom(roomQ, false);
  }
})();
