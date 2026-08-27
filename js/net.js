/* 連線房間、送操作、收整桌狀態 */
(function (global) {
  let ws = null;
  let pingTimer = 0;

  function connect({ code, name, create, clientId, onState, onError, onClosed }) {
    close();
    const base = (global.WEREWOLF_CONFIG && global.WEREWOLF_CONFIG.wsBase) || "";
    const q = new URLSearchParams({
      name: name || "玩家",
      clientId: clientId || "",
      create: create ? "1" : "0",
    });
    const url = String(base).replace(/\/$/, "") + "/room/" + encodeURIComponent(code) + "?" + q;
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      if (onError) onError("連線失敗");
      return;
    }
    ws = socket;
    socket.addEventListener("open", () => {
      pingTimer = setInterval(() => {
        if (ws === socket && socket.readyState === 1) socket.send(JSON.stringify({ type: "ping" }));
      }, 20000);
    });
    socket.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      if (msg.type === "state" && onState) onState(msg.state);
      else if (msg.type === "error" && onError) onError(msg.message || "發生錯誤");
    });
    socket.addEventListener("close", () => {
      if (ws === socket) ws = null;
      clearInterval(pingTimer);
      if (onClosed) onClosed();
    });
    socket.addEventListener("error", () => {
      if (onError) onError("連線失敗，請確認房間伺服器已開啟");
    });
  }

  function send(obj) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }

  function close() {
    clearInterval(pingTimer);
    pingTimer = 0;
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
    }
    ws = null;
  }

  global.WerewolfNet = { connect, send, close };
})(typeof globalThis !== "undefined" ? globalThis : this);
