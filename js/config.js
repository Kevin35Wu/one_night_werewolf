/* 線上房間伺服器。本機 wrangler 用 8787；上線後改成你的 workers.dev */
(function (global) {
  const local =
    global.location &&
    (location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname === "");
  global.WEREWOLF_CONFIG = {
    wsBase: local ? "ws://127.0.0.1:8787" : "wss://one-night-werewolf.kevin35wu.workers.dev",
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
