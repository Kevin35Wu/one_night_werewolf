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
    // #region agent log
    fetch("http://127.0.0.1:7369/ingest/6228a8cb-e43d-48e3-b6e2-032cd21d51be", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "730a37" },
      body: JSON.stringify({
        sessionId: "730a37",
        runId: "post-fix",
        hypothesisId: "A",
        location: "js/net.js:openSocket",
        message: "ws connect attempt",
        data: {
          hostname: (global.location && location.hostname) || "",
          href: (global.location && location.href) || "",
          wsBase: base,
          url: url,
          create: !!intent.create,
          code: intent.code || "",
          hasClientId: !!(intent.clientId && String(intent.clientId).length),
        },
        timestamp: Date.now(),
      }),
    }).catch(function () {});
    // #endregion
    if (!intent.clientId) {
      // #region agent log
      fetch("http://127.0.0.1:7369/ingest/6228a8cb-e43d-48e3-b6e2-032cd21d51be", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "730a37" },
        body: JSON.stringify({
          sessionId: "730a37",
          runId: "post-fix",
          hypothesisId: "A",
          location: "js/net.js:openSocket.emptyClientId",
          message: "abort connect: empty clientId",
          data: { code: intent.code || "", create: !!intent.create },
          timestamp: Date.now(),
        }),
      }).catch(function () {});
      // #endregion
      const err = intent.onError;
      intent = null;
      if (err) err("缺少玩家識別，請重新整理頁面");
      return;
    }
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      // #region agent log
      fetch("http://127.0.0.1:7369/ingest/6228a8cb-e43d-48e3-b6e2-032cd21d51be", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "730a37" },
        body: JSON.stringify({
          sessionId: "730a37",
          runId: "post-fix",
          hypothesisId: "D",
          location: "js/net.js:openSocket.catch",
          message: "WebSocket constructor threw",
          data: { err: String(err && err.message ? err.message : err), url: url },
          timestamp: Date.now(),
        }),
      }).catch(function () {});
      // #endregion
      if (intent.onError) intent.onError("連線失敗");
      scheduleReconnect();
      return;
    }
    ws = socket;
    socket.addEventListener("open", () => {
      // #region agent log
      fetch("http://127.0.0.1:7369/ingest/6228a8cb-e43d-48e3-b6e2-032cd21d51be", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "730a37" },
        body: JSON.stringify({
          sessionId: "730a37",
          runId: "post-fix",
          hypothesisId: "E",
          location: "js/net.js:open",
          message: "ws open",
          data: { url: url },
          timestamp: Date.now(),
        }),
      }).catch(function () {});
      // #endregion
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
      // #region agent log
      fetch("http://127.0.0.1:7369/ingest/6228a8cb-e43d-48e3-b6e2-032cd21d51be", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "730a37" },
        body: JSON.stringify({
          sessionId: "730a37",
          runId: "post-fix",
          hypothesisId: "E",
          location: "js/net.js:close",
          message: "ws close",
          data: { code: code, reason: (ev && ev.reason) || "", wasClean: !!(ev && ev.wasClean), url: url },
          timestamp: Date.now(),
        }),
      }).catch(function () {});
      // #endregion
      if (intent.onDisconnected) intent.onDisconnected();
      scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      // #region agent log
      fetch("http://127.0.0.1:7369/ingest/6228a8cb-e43d-48e3-b6e2-032cd21d51be", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "730a37" },
        body: JSON.stringify({
          sessionId: "730a37",
          runId: "post-fix",
          hypothesisId: "A",
          location: "js/net.js:error",
          message: "ws error event",
          data: { url: url, reconnectAttempt: reconnectAttempt, readyState: socket.readyState },
          timestamp: Date.now(),
        }),
      }).catch(function () {});
      // #endregion
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
