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
  };

  function loadSetup() {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.playerCount) state.playerCount = saved.playerCount;
      if (Array.isArray(saved.names)) state.names = saved.names;
      if (saved.counts) state.counts = { ...Game.defaultCounts(), ...saved.counts };
      if (saved.settings) state.settings = { ...state.settings, ...saved.settings };
      if (saved.expansion) state.expansion = saved.expansion;
      if (saved.joinName) state.joinName = saved.joinName;
    } catch (_) {}
    ensureNames();
    if (!state.clientId) {
      state.clientId = localStorage.getItem(CLIENT_KEY) || "";
      if (!state.clientId) {
        state.clientId = "p" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(CLIENT_KEY, state.clientId);
      }
    }
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
    if (!isHost() || (state.game && state.screen !== "setup")) return;
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

  function connectRoom(code, create) {
    const name = (state.joinName || "").trim() || "玩家";
    state.joinName = name;
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
      onError: (m) => toast(m),
      onClosed: () => {
        if (state.online) toast("連線中斷");
      },
    });
    try {
      history.replaceState(null, "", "?room=" + roomCode);
    } catch (_) {}
    toast(create ? "正在建立房間…" : "正在加入房間…");
  }

  function applyRoomState(room) {
    state.online = true;
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
      state.screen = "setup";
    } else if (room.screen === "day") {
      state.screen = "day";
      state.tableUnlocked = true;
    } else if (room.screen === "recap") {
      state.screen = "recap";
    } else {
      state.screen = "table";
      state.tableUnlocked = true;
    }
    render();
  }

  function leaveRoom() {
    Net.close();
    state.online = false;
    state.room = null;
    state.game = null;
    state.screen = "setup";
    try {
      history.replaceState(null, "", location.pathname);
    } catch (_) {}
    render();
  }

  function sendAction(action) {
    if (!Net.send({ type: "action", action })) toast("尚未連線");
  }

  function showMyCard() {
    const i = mySeatIndex();
    if (i < 0 || !state.game) {
      toast("找不到你的座位");
      return;
    }
    const c = state.game.players[i].card;
    state.peek = {
      html:
        '<div class="peek-cards"><div class="peek-card" style="border-color:' +
        roleColor(c.roleId) +
        '"><div class="emoji">' +
        escapeHtml(roleEmoji(c.roleId)) +
        '</div><div class="rname" style="color:' +
        roleColor(c.roleId) +
        '">' +
        escapeHtml(roleName(c.roleId)) +
        "</div></div></div>",
    };
    render();
  }

  function showMyMark() {
    const i = mySeatIndex();
    if (i < 0 || !state.game) {
      toast("找不到你的座位");
      return;
    }
    const m = markInfo(state.game.players[i].mark);
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
    state.screen = "viewCards";
    state.viewIndex = 0;
    state.viewOpen = false;
    state.tableUnlocked = false;
    state.tool = null;
    state.selected = [];
    state.peek = null;
    state.rulesOpen = false;
    render();
  }

  function afterViewCards() {
    if (state.game.settings.dusk) enterTable("dusk");
    else enterTable("night");
  }

  function enterTable(phase) {
    state.game.phase = phase;
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
    if (!p?.mark) {
      toast("這位玩家沒有標記");
      return;
    }
    const info = markInfo(p.mark);
    if (state.online) sendAction({ type: "lookMark", playerIndex: index });
    else addLog("看標記：" + p.name + " → " + info.name);
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
    if (!p?.artifact) {
      toast("這位玩家沒有神器");
      return;
    }
    const info = artifactInfo(p.artifact);
    if (state.online) sendAction({ type: "lookArtifact", playerIndex: index });
    else addLog("看神器：" + p.name + " → " + info.name);
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

  function onSeatTap(type, index) {
    if (state.screen === "recap" || state.screen === "setup") return;
    if (state.screen === "table" && !state.tableUnlocked && !state.online) return;
    if (state.screen !== "table" && state.screen !== "day") return;
    toggleSelect({ type, index });
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
      if (state.online) {
        sendAction({ type: "swap", a: sel[0], b: sel[1] });
        state.selected = [];
        state.tool = null;
        render();
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
    const cards = state.selected.map((t) => Game.getCard(state.game, t));
    const where = state.selected.map(seatLabel).join("、");
    const seen = cards.map((c) => roleName(c.roleId)).join("、");
    if (state.online) sendAction({ type: "look", targets: state.selected.slice() });
    else addLog("看牌：" + where + " → " + seen);
    state.peek = {
      html:
        '<div class="peek-cards">' +
        cards
          .map((c) => {
            const color = roleColor(c.roleId);
            return (
              '<div class="peek-card" style="border-color:' +
              color +
              '"><div class="emoji">' +
              escapeHtml(roleEmoji(c.roleId)) +
              '</div><div class="rname" style="color:' +
              color +
              '">' +
              escapeHtml(roleName(c.roleId)) +
              "</div></div>"
            );
          })
          .join("") +
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
    const up = forceUp || card.revealed || publicReveal;
    const alpha = alphaSlot ? " alpha" : "";
    if (!up) return '<div class="card back' + alpha + '"></div>';
    const color = roleColor(card.roleId);
    return (
      '<div class="card front-up' +
      alpha +
      '" style="border-color:' +
      color +
      '"><div class="front"><div class="emoji">' +
      escapeHtml(roleEmoji(card.roleId)) +
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
    const markLabel = extra.revealSecrets && mark ? mark.emoji + mark.name : mark ? "●標記" : "";
    const artLabel = extra.revealSecrets && art ? art.emoji + art.name : art ? "◆神器" : "";
    return (
      '<button class="seat' +
      (selected ? " selected" : "") +
      (snap.shielded ? " shielded" : "") +
      (showFace ? " face-public" : "") +
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
      });
      html += "</div>";
    });
    html += "</div>";

    snap.players.forEach((p, i) => {
      const deg = -90 + (360 / n) * i;
      const rad = (deg * Math.PI) / 180;
      const x = 50 + ring * Math.cos(rad);
      const y = 50 + ring * Math.sin(rad);
      html += renderSeatFromSnap("player", i, p, {
        ...extraBase,
        label: p.name,
        className: "seat-orbit",
        style: "left:" + x.toFixed(2) + "%;top:" + y.toFixed(2) + "%",
      });
    });
    html += "</div>";
    return html;
  }

  function renderRoomPanel() {
    if (!state.online) {
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
    const members = (state.room && state.room.members) || [];
    const code = state.joinCode || "";
    const list = members
      .map((m) => {
        const tags = [];
        if (m.id === state.room.hostId) tags.push("房主");
        if (m.id === state.clientId) tags.push("你");
        tags.push(memberOnline(m.id) ? "在線" : "離線");
        return (
          "<li>" +
          escapeHtml(m.name) +
          ' <span class="tiny">' +
          escapeHtml(tags.join(" · ")) +
          "</span></li>"
        );
      })
      .join("");
    return (
      '<div class="panel room-panel"><div class="row"><div><div class="label">房號</div><div class="room-code">' +
      escapeHtml(code) +
      '</div></div><button class="btn ghost" data-act="copy-code">複製房號</button></div>' +
      '<ol class="member-list">' +
      list +
      "</ol>" +
      (isHost()
        ? '<div class="tiny">人數由加入的手機決定。選好角色後按下面發牌，每人用自己的手機看自己的牌。</div>'
        : '<div class="tiny">已加入，請等房主選角並發牌。</div>') +
      '<button class="btn ghost" style="margin-top:8px" data-act="leave-room">離開房間</button></div>'
    );
  }

  function renderSetup() {
    const have = selectedHave();
    const need = selectedNeed();
    const ok = have === need;
    const roles = Data.ROLES.filter((r) => r.expansion === state.expansion);
    const hostEdit = !state.online || isHost();
    const localSeats = !state.online;
    return (
      '<section class="screen setup-screen">' +
      '<div class="topbar"><div class="brand"><h1>一夜終極 · 牌桌</h1><div class="sub">語音用另一支 App，這裡只負責換牌看牌</div></div>' +
      '<button class="btn ghost" data-act="open-rules">規則書</button></div>' +
      '<div class="scroll-keep">' +
      renderRoomPanel() +
      (localSeats
        ? '<div class="panel"><div class="row"><span class="label">玩家人數</span><div class="stepper">' +
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
          "</div></div>"
        : "") +
      (hostEdit
        ? '<div class="tabs">' +
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
          "</div>" +
          '<div class="panel"><div class="role-grid">' +
          roles
            .map((r) => {
              const q = state.counts[r.id] || 0;
              return (
                '<button class="role-tile' +
                (q ? " sel" : "") +
                '" data-act="role" data-id="' +
                r.id +
                '" style="--c:' +
                Data.TEAMS[r.team].color +
                '"><span class="qty">' +
                q +
                '</span><span class="emoji">' +
                r.emoji +
                '</span><span class="rname">' +
                escapeHtml(r.name) +
                "</span></button>"
              );
            })
            .join("") +
          "</div>" +
          '<div style="margin-top:10px" class="row"><button class="btn ghost" data-act="clear-roles">清空角色</button><span class="tiny">點角色可加到上限</span></div></div>'
        : "") +
      '<div class="need ' +
      (ok ? "ok" : "bad") +
      '">已選 ' +
      have +
      " 張，需要 " +
      need +
      " 張（人數 + 3）" +
      (state.settings.alphaWolf ? "，另外會自動加 1 張中間狼人" : "") +
      "</div>" +
      (hostEdit
        ? '<div class="panel">' +
          settingRow("dusk", "黃昏（含標記）", state.online ? "發牌後每人用自己手機看標記" : "看完牌後先進入黃昏，結束時再傳手機看標記") +
          settingRow("artifacts", "神器", "監護人可從面朝下的神器堆抽放") +
          settingRow("shield", "盾牌", "哨兵可放盾，擋住看牌／換牌／放神器") +
          settingRow("alphaWolf", "阿爾法狼中間狼人", "中間額外放一張狼人牌") +
          "</div>" +
          (state.settings.artifacts
            ? '<div class="panel"><div class="label" style="margin-bottom:8px">本局神器（洗混後抽放）</div><div class="art-grid">' +
              Data.ARTIFACTS.map((a) => {
                const on = (state.settings.artifactIds || []).includes(a.id);
                return (
                  '<button class="art-item' +
                  (on ? " on" : "") +
                  '" data-act="art" data-id="' +
                  a.id +
                  '">' +
                  a.emoji +
                  " " +
                  escapeHtml(a.name) +
                  "</button>"
                );
              }).join("") +
              "</div></div>"
            : "")
        : "") +
      '</div>' +
      (hostEdit
        ? '<div class="footer-bar"><button class="btn primary wide" data-act="deal"' +
          (ok ? "" : " disabled") +
          ">" +
          (state.online ? "洗牌發牌，開始遊戲" : "洗牌發牌，開始看牌") +
          "</button></div>"
        : "") +
      "</section>"
    );
  }

  function settingRow(key, title, hint) {
    return (
      '<div class="toggle"><div><div>' +
      escapeHtml(title) +
      '</div><div class="tiny">' +
      escapeHtml(hint) +
      '</div></div><button class="switch' +
      (state.settings[key] ? " on" : "") +
      '" data-act="set" data-key="' +
      key +
      '"><i></i></button></div>'
    );
  }

  function renderPassView(kind) {
    const g = state.game;
    const p = g.players[state.viewIndex];
    const total = g.players.length;
    const isCard = kind === "card";
    const title = isCard ? "依序看自己的牌" : "黃昏結束 · 看自己的標記";
    const remaining = total - state.viewIndex;
    let body;
    if (!state.viewOpen) {
      body =
        '<div class="panel" style="text-align:center;padding:28px 12px"><div class="phase-tag">傳手機</div><h2 style="margin:8px 0 4px">' +
        escapeHtml(p.name) +
        '</h2><p class="tiny">請確認旁邊的人看不到螢幕</p>' +
        '<button class="btn primary wide" data-act="open-view">點擊查看</button></div>';
    } else if (isCard) {
      const c = p.card;
      body =
        '<div class="panel" style="text-align:center"><div class="tiny">這是你的起始角色</div>' +
        '<div class="peek-cards" style="margin:16px 0"><div class="peek-card" style="border-color:' +
        roleColor(c.roleId) +
        '"><div class="emoji">' +
        roleEmoji(c.roleId) +
        '</div><div class="rname">' +
        escapeHtml(roleName(c.roleId)) +
        "</div></div></div>" +
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
      '<section class="screen"><div class="topbar"><div class="brand"><div class="phase-tag">' +
      title +
      "</div><h1>" +
      (state.viewIndex + 1) +
      " / " +
      total +
      '</h1><div class="sub">還有 ' +
      remaining +
      " 人</div></div></div>" +
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
    if (!n) return "先點牌，再選下面的功能。按完成可取消選取。";
    return "已選 " + n + " 張，再選要做的事。再點一次即可取消。";
  }

  function renderTable() {
    const g = state.game;
    const dusk = g.phase === "dusk";
    const phaseName = dusk ? "黃昏" : "黑夜";
    const tools = [];
    tools.push(toolBtn("look", "看牌"), toolBtn("swap", "換牌"), toolBtn("rotate", "輪轉"), toolBtn("flip", "翻開／蓋上"));
    if (g.settings.dusk) {
      tools.push(toolBtn("placeMark", "放標記"), toolBtn("lookMark", "看標記"), toolBtn("swapMark", "換標記"));
    }
    if (g.settings.artifacts) {
      tools.push(toolBtn("placeArtifact", "放神器"), toolBtn("lookArtifact", "看神器"));
    }
    if (g.settings.shield) tools.push(toolBtn("shield", "放盾牌"));

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

    const nextLabel = dusk ? "結束黃昏" : "天亮了";
    const nextAct = dusk ? "end-dusk" : "end-night";
    const deckNote = g.settings.artifacts ? "神器堆剩 " + g.artifactDeck.length + " 枚" : "";

    return (
      '<section class="screen table-screen"><div class="topbar"><div class="brand"><div class="phase-tag">' +
      phaseName +
      '桌面</div><h1>跟著語音操作</h1><div class="sub">' +
      (state.online ? "房號 " + escapeHtml(state.joinCode) + "　" : "") +
      deckNote +
      "</div></div>" +
      '<div class="row" style="gap:6px">' +
      (state.online ? '<button class="btn ghost" data-act="my-card">我的牌</button>' : "") +
      (state.online && g.settings.dusk ? '<button class="btn ghost" data-act="my-mark">我的標記</button>' : "") +
      '<button class="btn ghost" data-act="undo">還原</button></div></div>' +
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
      '<div class="table-actions"><button class="btn done" data-act="lock-phone">完成</button>' +
      '<button class="btn danger" data-act="' +
      nextAct +
      '">' +
      nextLabel +
      "</button></div></div></section>"
    );
  }

  function renderDay() {
    const g = state.game;
    const hasArt = g.players.some((p) => p.artifact);
    return (
      '<section class="screen table-screen"><div class="topbar"><div class="brand"><div class="phase-tag">白天</div><h1>討論中</h1><div class="sub">蓋著的牌不能再看；已翻開的維持公開</div></div></div>' +
      '<div class="table-wrap">' +
      renderBoard({ showRevealed: true, showTokens: true, revealSecrets: false }) +
      "</div>" +
      '<div class="table-dock">' +
      (hasArt
        ? '<div class="hint">先點有神器的玩家，再按看神器</div><div class="tools">' +
          toolBtn("lookArtifact", "看神器") +
          "</div>"
        : "") +
      '<button class="btn primary wide" data-act="recap">結束，開始復盤</button></div></section>'
    );
  }

  function renderLog() {
    const log = state.game.log || [];
    const phaseName = { dusk: "黃昏", night: "黑夜", day: "白天" };
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
    return (
      '<section class="screen recap-screen"><div class="topbar"><div class="brand"><div class="phase-tag">復盤</div><h1>付盤對照</h1><div class="sub">自由切換原始發牌與目前牌面</div></div></div>' +
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

    if (state.screen === "table" && !state.tableUnlocked && !state.online) {
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

    if (state.screen === "setup") app.innerHTML = renderSetup();
    else if (state.screen === "viewCards") app.innerHTML = renderPassView("card");
    else if (state.screen === "viewMarks") app.innerHTML = renderPassView("mark");
    else if (state.screen === "table") app.innerHTML = renderTable();
    else if (state.screen === "day") app.innerHTML = renderDay();
    else if (state.screen === "recap") app.innerHTML = renderRecap();

    renderOverlay();
    renderModal();

    const keep2 = document.querySelector(".scroll-keep");
    if (keep2) keep2.scrollTop = y;
    requestAnimationFrame(fitTable);
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
      if (state.online && !isHost()) return;
      state.expansion = ds.id;
      saveSetup();
      sendSetup();
      render();
    } else if (act === "role") cycleRole(ds.id);
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
    else if (act === "copy-code") {
      const code = state.joinCode || "";
      const link =
        (location.origin && location.origin.indexOf("http") === 0
          ? location.origin + location.pathname.replace(/index\.html$/, "") + "?room=" + code
          : code);
      if (navigator.clipboard && link) {
        navigator.clipboard.writeText(link).then(
          () => toast("已複製房間連結"),
          () => toast(code)
        );
      } else toast(code || "還沒有房號");
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
    } else if (act === "end-dusk") {
      ask("結束黃昏？", state.online ? "接下來進入黑夜。每人可按「我的標記」查看。" : "接下來會傳手機讓大家看自己的標記。", finishDusk);
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
    if (!el) return;
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

  loadSetup();
  const q = new URLSearchParams(location.search).get("room") || "";
  const roomQ = q.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  if (roomQ.length === 4) state.joinCode = roomQ;
  render();
  if (roomQ.length === 4 && (state.joinName || "").trim()) {
    connectRoom(roomQ, false);
  }
})();
