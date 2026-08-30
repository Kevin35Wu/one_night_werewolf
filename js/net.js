/* 連線房間、送操作、收整桌狀態、斷線重連 */
(function (global) {
  let ws = null;
  let pingTimer = 0;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;
  let manualClose = false;
  let ignoreClose = false;
  let intent = null;

  const FATAL = [4000, 4001, 4003, 4004, 4005];

  function clearPing() {
    clearInterval(pingTimer);
    pingTimer = 0;
  }

  function clearReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }

  function dropSocket() {
    clearPing();
    ignoreClose = true;
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
    }
    ws = null;
    ignoreClose = false;
  }

  function openSocket() {
    if (!intent) return;
    dropSocket();
    const base = (global.WEREWOLF_CONFIG && global.WEREWOLF_CONFIG.wsBase) || "";
    const q = new URLSearchParams({
      name: intent.name || "玩家",
      clientId: intent.clientId || "",
      create: intent.create ? "1" : "0",
    });
    const url = String(base).replace(/\/$/, "") + "/room/" + encodeURIComponent(intent.code) + "?" + q;
    if (!intent.clientId) {
      const err = intent.onError;
      intent = null;
      if (err) err("缺少玩家識別，請重新整理頁面");
      return;
    }
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      if (intent.onError) intent.onError("連線失敗");
      scheduleReconnect();
      return;
    }
    ws = socket;
    socket.addEventListener("open", () => {
      reconnectAttempt = 0;
      intent.create = false;
      pingTimer = setInterval(() => {
        if (ws === socket && socket.readyState === 1) socket.send(JSON.stringify({ type: "ping" }));
      }, 20000);
      if (intent.onOpen) intent.onOpen();
    });
    socket.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      if (msg.type === "state" && intent.onState) intent.onState(msg.state);
      else if (msg.type === "peek" && intent.onPeek) intent.onPeek(msg.peek);
      else if (msg.type === "error" && intent.onError) intent.onError(msg.message || "發生錯誤");
    });
    socket.addEventListener("close", (ev) => {
      if (ws !== socket) return;
      ws = null;
      clearPing();
      if (ignoreClose || manualClose || !intent) return;
      const code = ev && ev.code;
      if (code === 4003) {
        const cb = intent.onKicked;
        intent = null;
        if (cb) cb();
        return;
      }
      if (FATAL.indexOf(code) >= 0) {
        const closed = intent.onClosed;
        intent = null;
        if (closed) closed({ fatal: true, code: code });
        return;
      }
      if (intent.onDisconnected) intent.onDisconnected();
      scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      if (intent && intent.onError && reconnectAttempt === 0) {
        intent.onError("連線失敗，請確認房間伺服器已開啟");
      }
    });
  }

  function scheduleReconnect() {
    if (manualClose || !intent) return;
    const delay = Math.min(15000, 800 * Math.pow(2, reconnectAttempt));
    reconnectAttempt += 1;
    clearReconnect();
    reconnectTimer = setTimeout(() => {
      if (!manualClose && intent) openSocket();
    }, delay);
  }

  function connect(opts) {
    manualClose = false;
    reconnectAttempt = 0;
    clearReconnect();
    intent = {
      code: opts.code,
      name: opts.name,
      create: !!opts.create,
      clientId: opts.clientId,
      onState: opts.onState,
      onPeek: opts.onPeek,
      onError: opts.onError,
      onClosed: opts.onClosed,
      onOpen: opts.onOpen,
      onDisconnected: opts.onDisconnected,
      onKicked: opts.onKicked,
    };
    openSocket();
  }

  function send(obj) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }

  function close() {
    manualClose = true;
    intent = null;
    clearReconnect();
    dropSocket();
  }

  function connected() {
    return !!(ws && ws.readyState === 1);
  }

  global.WerewolfNet = { connect, send, close, connected };
})(typeof globalThis !== "undefined" ? globalThis : this);
