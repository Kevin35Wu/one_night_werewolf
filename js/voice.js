/* 玩家端只執行法官指令：在 playAt 播音、顯示 deadline、不自己推進流程 */
(function (global) {
  const SOUND_KEY = "onuw-voice-sound";
  const BASE = "audio/";

  const audio = new Audio();
  audio.preload = "auto";

  let playTimer = 0;
  let tickTimer = 0;
  let lastSeq = -1;
  let lastPhase = "";
  let hooks = {
    getGame: function () {
      return null;
    },
    defaultMute: function () {
      return false;
    },
  };

  function soundOn() {
    try {
      const v = localStorage.getItem(SOUND_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
      // 未設定：線上非房主預設靜音，避免多人疊音
      return !hooks.defaultMute();
    } catch (_) {
      return !hooks.defaultMute();
    }
  }

  function setSoundOn(on) {
    try {
      localStorage.setItem(SOUND_KEY, on ? "1" : "0");
    } catch (_) {}
    audio.muted = !on;
  }

  function judgeOf(game) {
    return (game && game.judge) || null;
  }

  function remainingMs() {
    const j = judgeOf(hooks.getGame());
    if (!j || !j.running || !j.deadlineAt) return 0;
    return Math.max(0, j.deadlineAt - Date.now());
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = 0;
    }
  }

  function ensureTick() {
    if (tickTimer) return;
    tickTimer = setInterval(paintCountdown, 250);
  }

  function paintCountdown() {
    const el = document.getElementById("script-hold");
    if (!el) return;
    const game = hooks.getGame();
    const j = judgeOf(game);
    if (!j || !j.running) {
      el.textContent = "按「開始主持」由系統帶流程";
      stopTick();
      return;
    }
    const sec = Math.ceil(remainingMs() / 1000);
    if (j.stage === "audio") el.textContent = "播放中 " + sec + " 秒";
    else el.textContent = "倒數 " + sec + " 秒";
  }

  function paintButtons() {
    const playBtn = document.getElementById("voice-play");
    const muteBtn = document.getElementById("voice-mute");
    const game = hooks.getGame();
    const j = judgeOf(game);
    const running = !!(j && j.running);
    if (playBtn) {
      playBtn.textContent = running ? "主持中" : "開始主持";
      const canStart = playBtn.getAttribute("data-can-start") !== "0";
      playBtn.disabled = running || !canStart;
      playBtn.setAttribute("aria-pressed", running ? "true" : "false");
    }
    if (muteBtn) {
      const on = soundOn();
      muteBtn.textContent = on ? "語音開" : "語音關";
      muteBtn.classList.toggle("on", on);
    }
    paintCountdown();
  }

  function clearPlay() {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = 0;
    }
  }

  function playFile(file) {
    if (!file) return;
    audio.muted = !soundOn();
    const url = BASE + file;
    try {
      audio.pause();
    } catch (_) {}
    audio.src = url;
    audio.currentTime = 0;
    if (soundOn()) {
      const p = audio.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function schedulePlay(j) {
    clearPlay();
    if (!j || !j.running || !j.audioId) return;
    const delay = (j.playAt || 0) - Date.now();
    if (delay <= 20) playFile(j.audioId);
    else {
      playTimer = setTimeout(function () {
        playTimer = 0;
        playFile(j.audioId);
      }, delay);
    }
    ensureTick();
  }

  function stopAll() {
    lastSeq = -1;
    clearPlay();
    stopTick();
    try {
      audio.pause();
    } catch (_) {}
    paintButtons();
  }

  function toggleMute() {
    setSoundOn(!soundOn());
    const j = judgeOf(hooks.getGame());
    if (soundOn() && j && j.running && audio.src) {
      const p = audio.play();
      if (p && p.catch) p.catch(function () {});
    } else if (!soundOn()) {
      try {
        audio.pause();
      } catch (_) {}
    }
    paintButtons();
  }

  function sync(game) {
    const night = game && (game.phase === "dusk" || game.phase === "night");
    if (!night) {
      if (lastPhase) {
        lastPhase = "";
        stopAll();
      }
      return;
    }
    lastPhase = game.phase;
    const j = judgeOf(game);
    if (!j || !j.running) {
      if (lastSeq !== -1) {
        lastSeq = -1;
        clearPlay();
        try {
          audio.pause();
        } catch (_) {}
      }
      paintButtons();
      return;
    }
    if (j.seq !== lastSeq) {
      lastSeq = j.seq;
      schedulePlay(j);
    }
    paintButtons();
  }

  function init(opts) {
    if (!opts) return;
    if (typeof opts.getGame === "function") hooks.getGame = opts.getGame;
    if (typeof opts.defaultMute === "function") hooks.defaultMute = opts.defaultMute;
    audio.muted = !soundOn();
  }

  global.WerewolfVoice = {
    init: init,
    sync: sync,
    toggleMute: toggleMute,
    soundOn: soundOn,
    isPlaying: function () {
      const j = judgeOf(hooks.getGame());
      return !!(j && j.running);
    },
    remainingMs: remainingMs,
    paint: paintButtons,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
