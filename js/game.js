/* 發牌、換牌、標記／神器／盾牌與快照 */
(function (global) {
  const D = () => global.WerewolfData;

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function roleOf(roleId) {
    return D().ROLE_BY_ID[roleId];
  }

  function selectedCount(counts) {
    return Object.values(counts).reduce((n, v) => n + (v || 0), 0);
  }

  function flattenCounts(counts) {
    const ids = [];
    for (const role of D().ROLES) {
      const n = counts[role.id] || 0;
      for (let i = 0; i < n; i++) ids.push(role.id);
    }
    return ids;
  }

  function inferSettings(counts, previous) {
    const ids = flattenCounts(counts);
    const roles = ids.map(roleOf).filter(Boolean);
    const next = {
      dusk: previous?.dusk ?? false,
      artifacts: previous?.artifacts ?? false,
      shield: previous?.shield ?? false,
      alphaWolf: previous?.alphaWolf ?? false,
      artifactIds: previous?.artifactIds ? previous.artifactIds.slice() : D().ARTIFACTS.map((a) => a.id),
    };
    next.dusk = roles.some((r) => r.dusk);
    next.artifacts = roles.some((r) => r.enablesArtifacts);
    next.shield = roles.some((r) => r.enablesShield);
    next.alphaWolf = roles.some((r) => r.enablesAlphaWolf);
    if (!next.artifacts) next.artifactIds = D().ARTIFACTS.map((a) => a.id);
    return next;
  }

  function neededCardCount(playerCount, alphaWolf) {
    return playerCount + 3 + (alphaWolf ? 1 : 0);
  }

  function selectedDeckCount(counts, alphaWolf) {
    return selectedCount(counts) + (alphaWolf ? 1 : 0);
  }

  function emptyMarkPool() {
    const pool = {};
    for (const mark of D().MARKS) pool[mark.id] = mark.qty;
    return pool;
  }

  function takeMark(pool, markId) {
    if (!pool[markId]) return false;
    pool[markId] -= 1;
    return true;
  }

  function returnMark(pool, markId) {
    if (!markId) return;
    pool[markId] = (pool[markId] || 0) + 1;
  }

  function emptyJudge() {
    return {
      running: false,
      playAt: 0,
      deadlineAt: 0,
      audioId: null,
      stage: "hold",
      holdMs: 0,
      audioMs: 0,
      seq: 0,
    };
  }

  function createGame({ playerNames, counts, settings }) {
    const names = playerNames.map((n) => String(n || "").trim()).filter(Boolean);
    if (names.length < 3 || names.length > 12) {
      return { error: "玩家人數需為 3 到 12 人" };
    }
    const deckIds = flattenCounts(counts);
    const expected = names.length + 3;
    if (deckIds.length !== expected) {
      return { error: `請選正好 ${expected} 張角色牌（人數 + 3）` };
    }

    const cards = deckIds.map((roleId, i) => ({
      uid: "c" + i,
      roleId,
      revealed: false,
    }));
    const shuffled = shuffle(cards);
    const players = names.map((name, i) => ({
      name,
      card: shuffled[i],
      mark: null,
      artifact: null,
      artifactRevealed: false,
      shielded: false,
    }));
    const center = shuffled.slice(names.length).map((card) => ({ card }));
    if (settings.alphaWolf) {
      center.push({
        alphaSlot: true,
        card: { uid: "alpha-ww", roleId: "werewolf", revealed: false },
      });
    }

    const markPool = emptyMarkPool();
    if (settings.dusk) {
      for (const player of players) {
        if (!takeMark(markPool, "clarity")) {
          return { error: "清白標記數量不足" };
        }
        player.mark = "clarity";
      }
    }

    let artifactDeck = [];
    if (settings.artifacts) {
      const ids = (settings.artifactIds || []).filter((id) => D().ARTIFACT_BY_ID[id]);
      if (!ids.length) return { error: "請至少勾選一種神器" };
      artifactDeck = shuffle(ids);
    }

    const original = snapshotBoard(players, center);

    return {
      error: null,
      game: {
        players,
        center,
        markPool,
        artifactDeck,
        settings: {
          dusk: !!settings.dusk,
          artifacts: !!settings.artifacts,
          shield: !!settings.shield,
          alphaWolf: !!settings.alphaWolf,
          artifactIds: (settings.artifactIds || []).slice(),
        },
        original,
        history: [],
        log: [],
        seatLogs: {},
        copyRoles: {},
        meetAnnounced: {},
        phase: "arrange",
        roleIdsInPlay: flattenCounts(counts).concat(settings.alphaWolf ? ["werewolf"] : []),
        nightStartRoles: null,
        scriptIndex: 0,
        scriptId: null,
        judge: emptyJudge(),
        votes: {},
        voteResult: null,
      },
    };
  }

  function snapshotBoard(players, center) {
    return {
      players: players.map((p) => ({
        name: p.name,
        roleId: p.card.roleId,
        uid: p.card.uid,
        mark: p.mark,
        hasMark: !!p.hasMark || !!p.mark,
        artifact: p.artifact,
        hasArtifact: !!p.hasArtifact || !!p.artifact,
        shielded: p.shielded,
        revealed: !!p.card.revealed,
      })),
      center: center.map((c) => ({
        roleId: c.card.roleId,
        uid: c.card.uid,
        revealed: !!c.card.revealed,
        alphaSlot: !!c.alphaSlot,
      })),
    };
  }

  function censorGame(game, { recap } = {}) {
    if (!game) return null;
    if (recap) {
      const copy = clone(game);
      copy.history = [];
      delete copy.seatLogs;
      delete copy.copyRoles;
      delete copy.meetAnnounced;
      return copy;
    }
    return {
      players: game.players.map((p) => ({
        name: p.name,
        card: {
          uid: p.card.uid,
          roleId: p.card.revealed ? p.card.roleId : null,
          revealed: !!p.card.revealed,
        },
        mark: null,
        hasMark: !!p.mark,
        artifact: null,
        hasArtifact: !!p.artifact,
        artifactRevealed: false,
        shielded: !!p.shielded,
      })),
      center: game.center.map((c) => ({
        alphaSlot: !!c.alphaSlot,
        card: {
          uid: c.card.uid,
          roleId: c.card.revealed ? c.card.roleId : null,
          revealed: !!c.card.revealed,
        },
      })),
      markPool: clone(game.markPool),
      artifactDeck: (game.artifactDeck || []).map(() => null),
      settings: clone(game.settings),
      original: null,
      history: [],
      log: clone(game.log || []),
      phase: game.phase,
      seatIds: (game.seatIds || []).slice(),
      roleIdsInPlay: (game.roleIdsInPlay || []).slice(),
      scriptIndex: game.scriptIndex || 0,
      scriptId: game.scriptId || null,
      judge: (() => {
        const j = game.judge || emptyJudge();
        return {
          running: !!j.running,
          playAt: j.playAt || 0,
          deadlineAt: j.deadlineAt || 0,
          audioId: j.audioId || null,
          stage: j.stage || "hold",
          holdMs: j.holdMs || 0,
          audioMs: j.audioMs || 0,
          seq: j.seq || 0,
        };
      })(),
      voted: votedSeats(game),
      votes: recap ? clone(game.votes || {}) : {},
      voteResult: recap ? clone(game.voteResult) : null,
      cardSeen: clone(game.cardSeen || {}),
    };
  }

  const WOLF_MEET = ["werewolf", "alphawolf", "mysticwolf"];
  const WOLF_FOR_MINION = ["werewolf", "alphawolf", "mysticwolf", "dreamwolf"];
  const VAMP_MEET = ["vampire", "master"];
  const ALIEN_MEET = ["alien", "synthetic"];

  const MEET_BY_STEP = {
    "wolves-wake": {
      label: "狼人",
      wakeRoles: WOLF_MEET,
      seeRoles: WOLF_MEET,
      seeExtra: ["dreamwolf"],
      logPrefix: "認出隊友",
    },
    "wolves-dream-wake": {
      label: "狼人",
      wakeRoles: WOLF_MEET,
      seeRoles: WOLF_MEET,
      seeExtra: ["dreamwolf"],
      logPrefix: "認出隊友",
    },
    "minion-wake": { label: "爪牙", wakeRoles: ["minion"], seeRoles: WOLF_FOR_MINION, logPrefix: "看到狼人" },
    "squire-wake": { label: "侍從", wakeRoles: ["squire"], seeRoles: WOLF_FOR_MINION, logPrefix: "看到狼人" },
    "mason-wake": { label: "守夜人", wakeRoles: ["mason"], seeRoles: ["mason"], logPrefix: "認出隊友" },
    "dusk-vampire-wake": {
      label: "吸血鬼",
      wakeRoles: VAMP_MEET,
      seeRoles: VAMP_MEET,
      logPrefix: "認出隊友",
    },
    "dusk-renfield-wake": {
      label: "血奴",
      wakeRoles: ["renfield"],
      seeRoles: VAMP_MEET,
      logPrefix: "看到吸血鬼",
    },
    "alien-wake": { label: "外星人", wakeRoles: ALIEN_MEET, seeRoles: ALIEN_MEET, logPrefix: "認出隊友" },
    "groobzerb-wake": {
      label: "古伯／澤伯",
      wakeRoles: ["groob", "zerb"],
      seeRoles: ["groob", "zerb"],
      logPrefix: "認出隊友",
    },
    "leader-wake": { label: "領導", wakeRoles: ["leader"], seeRoles: ALIEN_MEET, logPrefix: "看到外星人" },
    "dusk-appassassin-assassin-wake": {
      label: "見習刺客",
      wakeRoles: ["appassassin"],
      seeRoles: ["assassin"],
      logPrefix: "看到刺客",
    },
    "apptanner-wake": {
      label: "見習皮匠",
      wakeRoles: ["apptanner"],
      seeRoles: ["tanner"],
      logPrefix: "看到皮匠",
    },
    "beholder-both-wake": {
      label: "旁觀者",
      wakeRoles: ["beholder"],
      seeRoles: ["seer", "appseer"],
      logPrefix: "看到預言家",
    },
    "beholder-seer-wake": {
      label: "旁觀者",
      wakeRoles: ["beholder"],
      seeRoles: ["seer"],
      logPrefix: "看到預言家",
    },
    "beholder-appseer-wake": {
      label: "旁觀者",
      wakeRoles: ["beholder"],
      seeRoles: ["appseer"],
      logPrefix: "看見習預言家",
    },
    "intern-wake": {
      label: "實習生",
      wakeRoles: ["intern"],
      seeRoles: ["madscientist"],
      logPrefix: "看到瘋狂科學家",
    },
    "dusk-lovers-wake": {
      label: "戀人",
      wakeByMark: "love",
      seeByMark: "love",
      logPrefix: "認出戀人",
    },
  };

  function votedSeats(game) {
    const votes = game.votes || {};
    return Object.keys(votes)
      .map((k) => Number(k))
      .filter((i) => votes[i] != null);
  }

  function lockNightStart(game) {
    if (!game || game.nightStartRoles) return;
    game.nightStartRoles = game.players.map((p) => p.card.roleId);
    if (!game.copyRoles) game.copyRoles = {};
    if (!game.meetAnnounced) game.meetAnnounced = {};
  }

  function effectiveRole(game, seatIndex) {
    if (!game || seatIndex == null || seatIndex < 0) return null;
    if (game.copyRoles && game.copyRoles[seatIndex]) return game.copyRoles[seatIndex];
    if (game.nightStartRoles && game.nightStartRoles[seatIndex]) return game.nightStartRoles[seatIndex];
    const p = game.players[seatIndex];
    return (p && p.card && p.card.roleId) || null;
  }

  function roleLabel(roleId) {
    return D().ROLE_BY_ID[roleId]?.name || roleId || "角色";
  }

  function seatsMatchingRoles(game, roleIds) {
    if (!game || !game.players || !roleIds || !roleIds.length) return [];
    const out = [];
    for (let i = 0; i < game.players.length; i++) {
      const id = effectiveRole(game, i);
      if (id && roleIds.indexOf(id) >= 0) out.push(i);
    }
    return out;
  }

  function seatsWithMark(game, markId) {
    if (!game || !game.players || !markId) return [];
    const out = [];
    for (let i = 0; i < game.players.length; i++) {
      if (game.players[i].mark === markId) out.push(i);
    }
    return out;
  }

  function meetSpecForRole(roleId) {
    if (!roleId) return null;
    if (WOLF_MEET.indexOf(roleId) >= 0) {
      return {
        label: "狼人",
        seeRoles: WOLF_MEET,
        seeExtra: ["dreamwolf"],
        logPrefix: "認出隊友",
      };
    }
    if (roleId === "mason") return { label: "守夜人", seeRoles: ["mason"], logPrefix: "認出隊友" };
    if (roleId === "minion" || roleId === "squire") {
      return { label: roleLabel(roleId), seeRoles: WOLF_FOR_MINION, logPrefix: "看到狼人" };
    }
    if (VAMP_MEET.indexOf(roleId) >= 0) {
      return { label: "吸血鬼", seeRoles: VAMP_MEET, logPrefix: "認出隊友" };
    }
    if (roleId === "renfield") {
      return { label: "血奴", seeRoles: VAMP_MEET, logPrefix: "看到吸血鬼" };
    }
    if (ALIEN_MEET.indexOf(roleId) >= 0) {
      return { label: "外星人", seeRoles: ALIEN_MEET, logPrefix: "認出隊友" };
    }
    if (roleId === "leader") {
      return { label: "領導", seeRoles: ALIEN_MEET, logPrefix: "看到外星人" };
    }
    if (roleId === "groob" || roleId === "zerb") {
      return { label: "古伯／澤伯", seeRoles: ["groob", "zerb"], logPrefix: "認出隊友" };
    }
    if (roleId === "appassassin") {
      return { label: "見習刺客", seeRoles: ["assassin"], logPrefix: "看到刺客" };
    }
    if (roleId === "apptanner") {
      return { label: "見習皮匠", seeRoles: ["tanner"], logPrefix: "看到皮匠" };
    }
    if (roleId === "beholder") {
      return { label: "旁觀者", seeRoles: ["seer", "appseer"], logPrefix: "看到預言家" };
    }
    if (roleId === "intern") {
      return { label: "實習生", seeRoles: ["madscientist"], logPrefix: "看到瘋狂科學家" };
    }
    return null;
  }

  function formatMeetLog(game, seatIndex, spec) {
    if (!spec) return null;
    let others = [];
    if (spec.seeByMark) {
      others = seatsWithMark(game, spec.seeByMark).filter((i) => i !== seatIndex);
    } else {
      others = seatsMatchingRoles(game, spec.seeRoles || []).filter((i) => i !== seatIndex);
    }
    const names = others.map((i) => game.players[i].name);
    let text =
      names.length > 0
        ? (spec.logPrefix || "認出隊友") + "：" + names.join("、")
        : "沒有其他同伴";
    if (spec.seeExtra && spec.seeExtra.length) {
      const extra = seatsMatchingRoles(game, spec.seeExtra).filter((i) => i !== seatIndex);
      if (extra.length) {
        text +=
          "；" +
          extra
            .map((i) => roleLabel(effectiveRole(game, i)) + "：" + game.players[i].name)
            .join("、");
      }
    }
    return text;
  }

  function logMeetOnce(game, seatIndex, stepId, spec) {
    if (!game || seatIndex == null || seatIndex < 0 || !spec) return;
    if (!game.meetAnnounced) game.meetAnnounced = {};
    const key = (stepId || "copy") + ":" + seatIndex;
    if (game.meetAnnounced[key]) return;
    const text = formatMeetLog(game, seatIndex, spec);
    if (!text) return;
    game.meetAnnounced[key] = true;
    pushSeatLog(game, seatIndex, text);
    if (!game.seatIds || !game.seatIds.length) pushSeatLog(game, -1, text);
  }

  function seatWakesForMeet(game, seatIndex, spec) {
    if (!spec) return false;
    if (spec.wakeByMark) {
      const p = game.players[seatIndex];
      return !!(p && p.mark === spec.wakeByMark);
    }
    const eff = effectiveRole(game, seatIndex);
    return !!(eff && spec.wakeRoles && spec.wakeRoles.indexOf(eff) >= 0);
  }

  function announceTurnAndMeet(game, step) {
    if (!game || !step || (game.phase !== "dusk" && game.phase !== "night")) return;
    const spec = MEET_BY_STEP[step.id];
    if (!spec) return;
    for (let i = 0; i < game.players.length; i++) {
      if (!seatWakesForMeet(game, i, spec)) continue;
      logMeetOnce(game, i, step.id, spec);
    }
  }

  function yourTurnForSeat(game, seatIndex) {
    if (!game || (game.phase !== "dusk" && game.phase !== "night")) return null;
    const steps = scriptSteps(game);
    const step = steps[game.scriptIndex || 0];
    if (!step) return null;
    const meet = MEET_BY_STEP[step.id];
    if (meet) {
      if (seatIndex >= 0 && seatWakesForMeet(game, seatIndex, meet)) {
        return { label: meet.label, stepId: step.id };
      }
      return null;
    }
    if (!step.roles || !step.roles.length) return null;
    if (!/-wake$|-lone$|fistout|-look$/.test(step.id)) return null;
    if (seatIndex < 0) return null;
    const start = (game.nightStartRoles && game.nightStartRoles[seatIndex]) || null;
    const eff = effectiveRole(game, seatIndex);
    const matchId =
      start && step.roles.indexOf(start) >= 0 ? start : eff && step.roles.indexOf(eff) >= 0 ? eff : null;
    if (!matchId) return null;
    return { label: roleLabel(matchId), stepId: step.id };
  }

  function yourTurnOffline(game) {
    if (!game || (game.phase !== "dusk" && game.phase !== "night")) return null;
    const steps = scriptSteps(game);
    const step = steps[game.scriptIndex || 0];
    if (!step) return null;
    const meet = MEET_BY_STEP[step.id];
    if (meet) return { label: meet.label, stepId: step.id };
    if (!step.roles || !step.roles.length) return null;
    if (!/-wake$|-lone$|fistout|-look$/.test(step.id)) return null;
    const ids = game.roleIdsInPlay || [];
    const hit = step.roles.find((r) => ids.indexOf(r) >= 0);
    if (!hit) return null;
    return { label: roleLabel(hit), stepId: step.id };
  }

  function visibilityFor(game, seatIndex, startId) {
    const eff = startId || effectiveRole(game, seatIndex);
    if (!eff) return [];
    let kind = "";
    let match = [];
    if (WOLF_MEET.indexOf(eff) >= 0) {
      kind = "wolf";
      match = WOLF_MEET.concat(["dreamwolf"]);
    } else if (eff === "mason") {
      kind = "mason";
      match = ["mason"];
    } else if (eff === "minion" || eff === "squire") {
      kind = "wolf";
      match = WOLF_FOR_MINION;
    } else if (VAMP_MEET.indexOf(eff) >= 0) {
      kind = "vampire";
      match = VAMP_MEET;
    } else if (eff === "renfield") {
      kind = "vampire";
      match = VAMP_MEET;
    } else if (ALIEN_MEET.indexOf(eff) >= 0) {
      kind = "alien";
      match = ALIEN_MEET;
    } else if (eff === "leader") {
      kind = "alien";
      match = ALIEN_MEET;
    } else if (eff === "groob" || eff === "zerb") {
      kind = "pair";
      match = ["groob", "zerb"];
    } else {
      return [];
    }
    const out = [];
    for (let i = 0; i < game.players.length; i++) {
      if (i === seatIndex) continue;
      const id = effectiveRole(game, i);
      if (id && match.indexOf(id) >= 0) {
        out.push({ index: i, name: game.players[i].name, kind: kind });
      }
    }
    return out;
  }

  function applyCopyFromLook(game, actorSeat, targets) {
    if (!game || !Number.isInteger(actorSeat) || actorSeat < 0 || !targets || !targets.length) return;
    const start = game.nightStartRoles && game.nightStartRoles[actorSeat];
    if (!start) return;
    if (!game.copyRoles) game.copyRoles = {};
    let copied = null;
    if (start === "doppelganger") {
      const t = targets.find((x) => x && x.type === "player");
      if (!t) return;
      const card = getCard(game, t);
      if (!card || !card.roleId) return;
      copied = card.roleId;
    } else if (start === "copycat") {
      const t = targets.find((x) => x && x.type === "center");
      if (!t) return;
      const card = getCard(game, t);
      if (!card || !card.roleId) return;
      copied = card.roleId;
    } else {
      return;
    }
    game.copyRoles[actorSeat] = copied;
    pushSeatLog(game, actorSeat, "複製成為：" + roleLabel(copied));
    if (!game.seatIds || !game.seatIds.length) {
      pushSeatLog(game, -1, "複製成為：" + roleLabel(copied));
    }
    const spec = meetSpecForRole(copied);
    if (spec) logMeetOnce(game, actorSeat, "copy:" + copied, spec);
  }

  function seatActions(game, seatIndex) {
    if (!game || !game.seatLogs) return [];
    const key = seatIndex === -1 || seatIndex === "local" ? "local" : String(seatIndex);
    const list = game.seatLogs[key];
    return Array.isArray(list) ? list.slice() : [];
  }

  function privateInfo(game, seatIndex) {
    if (!game || seatIndex == null || seatIndex < 0) {
      return { myCard: null, myMark: null, seen: [], myActions: [], yourTurn: null };
    }
    const p = game.players[seatIndex];
    if (!p) return { myCard: null, myMark: null, seen: [], myActions: [], yourTurn: null };
    if (game.phase === "arrange") {
      return { myCard: null, myMark: null, seen: [], myActions: [], yourTurn: null };
    }
    const startId = (game.nightStartRoles && game.nightStartRoles[seatIndex]) || null;
    const eff = effectiveRole(game, seatIndex);
    if (game.phase === "looking") {
      return {
        myCard: p.card
          ? { uid: p.card.uid, roleId: p.card.roleId, revealed: !!p.card.revealed }
          : null,
        myMark: p.mark || null,
        startRoleId: startId || (p.card && p.card.roleId) || null,
        effectiveRoleId: eff || (p.card && p.card.roleId) || null,
        seen: [],
        myActions: [],
        yourTurn: null,
      };
    }
    return {
      myCard: p.card
        ? { uid: p.card.uid, roleId: p.card.roleId, revealed: !!p.card.revealed }
        : null,
      myMark: p.mark || null,
      startRoleId: startId,
      effectiveRoleId: eff,
      seen: visibilityFor(game, seatIndex, eff),
      myActions: seatActions(game, seatIndex),
      yourTurn: yourTurnForSeat(game, seatIndex),
    };
  }

  function scriptSteps(game) {
    const Script = global.WerewolfScript;
    return Script && Script.stepsFor ? Script.stepsFor(game) : [];
  }

  function moveScript(game, dir, now, syncDelay) {
    if (game.phase !== "dusk" && game.phase !== "night") {
      return { error: "現在不能換字幕" };
    }
    const steps = scriptSteps(game);
    if (!steps.length) return { error: "沒有講稿" };
    const next = Math.max(0, Math.min(steps.length - 1, (game.scriptIndex || 0) + (dir < 0 ? -1 : 1)));
    game.scriptIndex = next;
    game.scriptId = steps[next].id;
    if (game.judge && game.judge.running) {
      enterJudgeStep(game, next, now || Date.now(), syncDelay || 0);
    } else {
      announceTurnAndMeet(game, steps[next]);
    }
    return { error: null };
  }

  function resetScript(game, atNight) {
    const Script = global.WerewolfScript;
    const steps = scriptSteps(game);
    let i = 0;
    if (atNight && Script && Script.firstNightIndex) i = Script.firstNightIndex(game);
    game.scriptIndex = i;
    game.scriptId = steps[i] ? steps[i].id : null;
    stopJudge(game);
  }

  function stopJudge(game) {
    if (!game) return;
    game.judge = emptyJudge();
  }

  // 閉眼／收手勢等：語音播完即可進下一句；醒來句才保留操作時間
  function isBriefJudgeStep(step) {
    if (!step) return false;
    const id = String(step.id || "");
    if (/wake|dawn|lone|option|marks|look|dusk-close/i.test(id) && !/close/i.test(id)) {
      return false;
    }
    return /(-close|-thumb|hands|sleep|fistaway|thumbaway|^dusk-open$|^night-close$)/i.test(id);
  }

  function judgeActionMs(step) {
    const hold = Number(step && step.holdMs) > 0 ? Number(step.holdMs) : 8000;
    const audioMs = Number(step && step.audioMs) > 0 ? Number(step.audioMs) : 0;
    if (isBriefJudgeStep(step)) return 350;
    // holdMs 原本多半 = 語音 + 操作；只對「操作段」再縮 20%
    const action = Math.max(1200, hold - (audioMs > 0 ? audioMs : 0));
    return Math.round(action * 0.8);
  }

  function enterJudgeStep(game, index, now, syncDelay) {
    const steps = scriptSteps(game);
    if (!steps.length) return { error: "沒有講稿" };
    const i = Math.max(0, Math.min(steps.length - 1, index));
    const step = steps[i];
    const delay = Math.max(0, Number(syncDelay) || 0);
    const playAt = (now || Date.now()) + delay;
    const hold = Number(step.holdMs) > 0 ? Number(step.holdMs) : 8000;
    const audioMs =
      Number(step.audioMs) > 0 ? Number(step.audioMs) : Math.max(500, hold - 5000);
    const actionMs = judgeActionMs(step);
    game.scriptIndex = i;
    game.scriptId = step.id;
    if (!game.judge) game.judge = emptyJudge();
    game.judge.running = true;
    game.judge.playAt = playAt;
    game.judge.audioId = step.audio || null;
    // holdMs 改存「語音後的操作／緩衝時間」，避免再等一整段 hold
    game.judge.holdMs = actionMs;
    game.judge.audioMs = audioMs;
    game.judge.seq = (game.judge.seq || 0) + 1;
    if (step.audio && audioMs > 0) {
      game.judge.stage = "audio";
      game.judge.deadlineAt = playAt + audioMs;
    } else {
      game.judge.stage = "hold";
      game.judge.deadlineAt = playAt + actionMs;
    }
    announceTurnAndMeet(game, step);
    return { error: null };
  }

  function startJudge(game, now, syncDelay) {
    if (!game || (game.phase !== "dusk" && game.phase !== "night")) {
      return { error: "現在不能主持" };
    }
    return enterJudgeStep(game, game.scriptIndex || 0, now || Date.now(), syncDelay || 0);
  }

  function advanceJudge(game, now, syncDelay) {
    const steps = scriptSteps(game);
    const i = game.scriptIndex || 0;
    const cur = steps[i];
    if (!steps.length || i >= steps.length - 1 || (cur && cur.id === "dawn") || (game.phase === "dusk" && cur && cur.id === "dusk-close")) {
      stopJudge(game);
      return { error: null, stopped: true };
    }
    return enterJudgeStep(game, i + 1, now || Date.now(), syncDelay || 0);
  }

  function judgeTimeout(game, now, syncDelay) {
    if (!game || !game.judge || !game.judge.running) return { error: "現在沒有在主持" };
    const at = game.judge.deadlineAt || 0;
    const t = now || Date.now();
    if (at && t + 40 < at) return { error: null, waiting: true };
    // 黃昏／黑夜同一套：語音結束後只再等操作段（閉眼句幾乎立刻下一句）
    // 注意：不要動 seq，避免客戶端重播同一句語音
    if (game.judge.stage === "audio") {
      const hold = Number(game.judge.holdMs) > 0 ? Number(game.judge.holdMs) : 350;
      game.judge.stage = "hold";
      game.judge.deadlineAt = t + hold;
      return { error: null, stage: "hold" };
    }
    return advanceJudge(game, t, syncDelay);
  }

  function castVote(game, fromIndex, targetIndex) {
    if (!game || game.phase !== "voting") return { error: "現在不是投票" };
    const n = game.players.length;
    if (fromIndex < 0 || fromIndex >= n) return { error: "找不到你的座位" };
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= n) {
      return { error: "請選一位玩家" };
    }
    if (fromIndex === targetIndex) return { error: "不能投自己" };
    if (!game.votes) game.votes = {};
    game.votes[fromIndex] = targetIndex;
    return { error: null };
  }

  function allVoted(game) {
    if (!game || !game.players) return false;
    const votes = game.votes || {};
    return game.players.every((_, i) => votes[i] != null);
  }

  const ARTIFACT_AS_ROLE = {
    claw: "werewolf",
    brand: "villager",
    cudgel: "tanner",
    princecloak: "prince",
    hunterbow: "hunter",
    guardsword: "bodyguard",
    traitordagger: "traitor",
    vampmist: "vampire",
    alienart: "alien",
  };
  const WOLF_EVIL = ["werewolf", "alphawolf", "mysticwolf", "dreamwolf"];
  const VAMP_EVIL = ["vampire", "master", "count"];
  const ALIEN_EVIL = ["alien", "synthetic", "bodysnatcher", "groob", "zerb"];

  function endRoleOf(game, seat) {
    const p = game.players[seat];
    if (!p) return null;
    if (p.artifact && ARTIFACT_AS_ROLE[p.artifact]) return ARTIFACT_AS_ROLE[p.artifact];
    if (game.copyRoles && game.copyRoles[seat]) return game.copyRoles[seat];
    return (p.card && p.card.roleId) || null;
  }

  function factionOfSeat(game, seat) {
    const role = endRoleOf(game, seat);
    const mark = game.players[seat] && game.players[seat].mark;
    if (mark === "vampire") return "vampire";
    if (!role) return "village";
    if (WOLF_EVIL.indexOf(role) >= 0 || role === "minion" || role === "squire") return "werewolf";
    if (VAMP_EVIL.indexOf(role) >= 0 || role === "renfield") return "vampire";
    if (ALIEN_EVIL.indexOf(role) >= 0) return "alien";
    if (role === "tanner" || role === "apptanner") return "tanner";
    if (role === "assassin" || role === "appassassin") return "assassin";
    if (D().ROLE_BY_ID[role] && D().ROLE_BY_ID[role].team === "villain") return "villain";
    return "village";
  }

  function seatsOfFaction(game, faction) {
    const out = [];
    for (let i = 0; i < game.players.length; i++) {
      if (factionOfSeat(game, i) === faction) out.push(i);
    }
    return out;
  }

  function evilFactionsPresent(game) {
    // 以玩家目前有效角色／標記計；爪牙侍從不算「狼人在場」（狼全在中間時另判）
    const playerSide = {};
    for (let i = 0; i < game.players.length; i++) {
      const role = endRoleOf(game, i);
      const mark = game.players[i].mark;
      if (mark === "vampire" || VAMP_EVIL.indexOf(role) >= 0) playerSide.vampire = true;
      if (WOLF_EVIL.indexOf(role) >= 0) playerSide.werewolf = true;
      if (ALIEN_EVIL.indexOf(role) >= 0) playerSide.alien = true;
    }
    return playerSide;
  }

  function isWerewolfCard(roleId) {
    return WOLF_EVIL.indexOf(roleId) >= 0;
  }

  function voteTiers(counts) {
    const max = counts.reduce((a, b) => Math.max(a, b), 0);
    if (max <= 0) return { first: [], second: [], max: 0, secondMax: 0 };
    const first = [];
    counts.forEach((c, i) => {
      if (c === max) first.push(i);
    });
    let secondMax = 0;
    counts.forEach((c) => {
      if (c < max && c > secondMax) secondMax = c;
    });
    const second = [];
    if (secondMax > 0) {
      counts.forEach((c, i) => {
        if (c === secondMax) second.push(i);
      });
    }
    return { first: first, second: second, max: max, secondMax: secondMax };
  }

  function protectRedirect(game, votes, counts, doomed) {
    // Returns filtered doomed list after prince/master/bodyguard immunities.
    const n = game.players.length;
    const tiers = voteTiers(counts);
    const immune = {};
    doomed.forEach((i) => {
      const role = endRoleOf(game, i);
      if (role === "prince") immune[i] = "prince";
      if (role === "master") {
        const vampVoted = Object.keys(votes).some((k) => {
          const from = Number(k);
          return votes[k] === i && factionOfSeat(game, from) === "vampire" && from !== i;
        });
        if (vampVoted) immune[i] = "master";
      }
    });
    // Bodyguard: vote target is treated as protected (no separate point UI yet)
    for (let i = 0; i < n; i++) {
      if (endRoleOf(game, i) !== "bodyguard") continue;
      const prot = votes[i];
      if (prot != null && doomed.indexOf(prot) >= 0) immune[prot] = "bodyguard";
    }
    let out = doomed.filter((i) => !immune[i]);
    const needSecond = Object.keys(immune).length > 0;
    if (needSecond && tiers.second.length && tiers.first.length === 1) {
      tiers.second.forEach((i) => {
        if (out.indexOf(i) < 0 && !immune[i]) out.push(i);
      });
    }
    return { dead: out, immune: immune };
  }

  function resolveVotes(game) {
    if (!game) return { error: "無效" };
    if (game.phase !== "voting" && game.phase !== "day") return { error: "現在不能開票" };
    const n = game.players.length;
    const votes = game.votes || {};
    const counts = [];
    for (let i = 0; i < n; i++) counts[i] = 0;
    Object.keys(votes).forEach((k) => {
      const t = votes[k];
      if (t != null && t >= 0 && t < n) counts[t] += 1;
    });

    const evils = evilFactionsPresent(game);
    const evilCount = Object.keys(evils).length;
    const tiers = voteTiers(counts);
    let doomed = tiers.first.slice();
    if (evilCount >= 3) {
      // 史詩戰爭：第一與第二高票都出局
      if (tiers.first.length === 1) doomed = tiers.first.concat(tiers.second);
      else doomed = tiers.first.slice();
    }

    const redirected = protectRedirect(game, votes, counts, doomed);
    let eliminated = redirected.dead.slice();

    // 戀人連死（覆蓋免死）
    const loverExtra = [];
    eliminated.forEach((i) => {
      if (game.players[i].mark !== "love") return;
      for (let j = 0; j < n; j++) {
        if (j !== i && game.players[j].mark === "love" && eliminated.indexOf(j) < 0 && loverExtra.indexOf(j) < 0) {
          loverExtra.push(j);
        }
      }
    });
    eliminated = eliminated.concat(loverExtra);

    const hunterChain = [];
    const tryHunter = (list) => {
      list.forEach((i) => {
        if (endRoleOf(game, i) !== "hunter") return;
        const t = votes[i];
        if (t == null || list.indexOf(t) >= 0 || hunterChain.indexOf(t) >= 0) return;
        const roleT = endRoleOf(game, t);
        if (roleT === "prince") return;
        if (roleT === "master") {
          const vampVoted = Object.keys(votes).some((k) => Number(k) !== t && votes[k] === t && factionOfSeat(game, Number(k)) === "vampire");
          if (vampVoted) return;
        }
        for (let b = 0; b < n; b++) {
          if (endRoleOf(game, b) === "bodyguard" && votes[b] === t) return;
        }
        hunterChain.push(t);
      });
    };
    tryHunter(eliminated);
    const dead = eliminated.concat(hunterChain);

    const deadSet = {};
    dead.forEach((i) => {
      deadSet[i] = true;
    });
    const isDead = (i) => !!deadSet[i];
    const anyDeadFaction = (faction) => {
      for (let i = 0; i < n; i++) if (isDead(i) && factionOfSeat(game, i) === faction) return true;
      return false;
    };
    const anyAliveFaction = (faction) => {
      for (let i = 0; i < n; i++) if (!isDead(i) && factionOfSeat(game, i) === faction) return true;
      return false;
    };
    const roleDead = (roleId) => {
      for (let i = 0; i < n; i++) if (isDead(i) && endRoleOf(game, i) === roleId) return true;
      return false;
    };
    const roleAlive = (roleId) => {
      for (let i = 0; i < n; i++) if (!isDead(i) && endRoleOf(game, i) === roleId) return true;
      return false;
    };

    const winners = [];
    const addWin = (id, label) => {
      if (winners.some((w) => w.id === id)) return;
      winners.push({ id: id, label: label });
    };

    // 獨立／標記勝
    const hasTannerSeat = game.players.some((_, i) => endRoleOf(game, i) === "tanner");
    const hasAppTannerSeat = game.players.some((_, i) => endRoleOf(game, i) === "apptanner");
    if (roleDead("tanner")) {
      addWin("tanner", "皮匠");
      if (hasAppTannerSeat) addWin("apptanner", "見習皮匠");
    } else if (!hasTannerSeat && roleDead("apptanner")) {
      addWin("tanner", "見習皮匠（視同皮匠）");
    }

    const markedAssassinDead = dead.some((i) => game.players[i].mark === "assassin");
    if (markedAssassinDead) addWin("assassin", "刺客");
    if (roleDead("assassin") && game.players.some((_, i) => endRoleOf(game, i) === "appassassin")) {
      addWin("appassassin", "見習刺客");
    }

    if (roleAlive("groob") && roleDead("zerb")) addWin("groob", "古伯");
    if (roleAlive("zerb") && roleDead("groob")) addWin("zerb", "澤伯");

    const nobodyDead = dead.length === 0;
    const onlySyntheticDead =
      dead.length > 0 && dead.every((i) => endRoleOf(game, i) === "synthetic");
    if (
      game.players.some((_, i) => endRoleOf(game, i) === "synthetic") &&
      (nobodyDead || onlySyntheticDead)
    ) {
      addWin("synthetic", "合成外星人");
    }

    // 領導：全部外星人（不含合成）投領導 → 外星人贏
    const leaderSeats = [];
    for (let i = 0; i < n; i++) if (endRoleOf(game, i) === "leader") leaderSeats.push(i);
    if (leaderSeats.length) {
      const alienVoters = [];
      for (let i = 0; i < n; i++) {
        const r = endRoleOf(game, i);
        if (r === "alien" || r === "bodysnatcher" || r === "groob" || r === "zerb") alienVoters.push(i);
      }
      if (
        alienVoters.length &&
        alienVoters.every((i) => leaderSeats.indexOf(votes[i]) >= 0) &&
        roleAlive("leader")
      ) {
        addWin("alien", "外星人陣營（全投領導）");
      } else if (roleAlive("leader") && roleAlive("groob") && roleAlive("zerb")) {
        addWin("leader", "領導");
      }
    }

    // 瘟疫：投給病毒傳染者或持瘟疫標記者 → 那些投票者不能贏（從陣營勝剔除時處理）
    const plagueBlocked = {};
    for (let i = 0; i < n; i++) {
      if (endRoleOf(game, i) !== "diseased" && game.players[i].mark !== "plague") continue;
      Object.keys(votes).forEach((k) => {
        if (votes[k] === i) plagueBlocked[Number(k)] = true;
      });
    }

    // 主陣營
    const wolfInPlay = !!evils.werewolf;
    const vampInPlay = !!evils.vampire;
    const alienInPlay = !!evils.alien;

    if (evilCount >= 3) {
      const killedWolf = anyDeadFaction("werewolf");
      const killedVamp = anyDeadFaction("vampire");
      const killedAlien = anyDeadFaction("alien");
      const killedEvils = [killedWolf, killedVamp, killedAlien].filter(Boolean).length;
      if (killedEvils >= 2) addWin("village", "村民陣營");
      if (!killedWolf && (killedVamp || killedAlien)) addWin("werewolf", "狼人陣營");
      if (!killedVamp && (killedWolf || killedAlien)) addWin("vampire", "吸血鬼陣營");
      if (!killedAlien && (killedWolf || killedVamp)) addWin("alien", "外星人陣營");
    } else if (wolfInPlay && !vampInPlay && !alienInPlay) {
      if (anyDeadFaction("werewolf") && !roleDead("tanner") && !(roleDead("apptanner") && !hasTannerCard)) {
        /* village unless only independent wins already */ 
      }
      if (anyDeadFaction("werewolf")) addWin("village", "村民陣營");
      else if (!winners.some((w) => w.id === "tanner" || w.id === "apptanner")) addWin("werewolf", "狼人陣營");
    } else if (vampInPlay && !wolfInPlay && !alienInPlay) {
      if (anyDeadFaction("vampire")) addWin("village", "村民陣營");
      else if (!winners.some((w) => w.id === "tanner" || w.id === "apptanner")) addWin("vampire", "吸血鬼陣營");
    } else if (alienInPlay && !wolfInPlay && !vampInPlay) {
      if (anyDeadFaction("alien") && !winners.some((w) => w.id === "leader" || w.id === "alien")) {
        addWin("village", "村民陣營");
      } else if (!winners.some((w) => w.id === "tanner" || w.id === "apptanner" || w.id === "leader" || w.id === "alien" || w.id === "synthetic" || w.id === "groob" || w.id === "zerb")) {
        addWin("alien", "外星人陣營");
      }
    } else if (!wolfInPlay && !vampInPlay && !alienInPlay) {
      // 邪惡皆在中間：村民無人死則贏；若有爪牙/侍從則特殊
      const minionLike = [];
      for (let i = 0; i < n; i++) {
        const r = endRoleOf(game, i);
        if (r === "minion" || r === "squire") minionLike.push(i);
      }
      if (!minionLike.length) {
        if (nobodyDead) addWin("village", "村民陣營");
      } else {
        const minionAlive = minionLike.some((i) => !isDead(i));
        if (minionAlive && dead.length === 1) addWin("werewolf", "爪牙／侍從");
        else if (nobodyDead) addWin("village", "村民陣營");
      }
    } else {
      // 兩邪對峙：各走單線
      if (wolfInPlay) {
        if (anyDeadFaction("werewolf")) addWin("village", "村民陣營");
        else if (!winners.some((w) => w.id === "tanner")) addWin("werewolf", "狼人陣營");
      }
      if (vampInPlay) {
        if (anyDeadFaction("vampire")) addWin("village", "村民陣營");
        else if (!winners.some((w) => w.id === "tanner" || w.id === "village")) addWin("vampire", "吸血鬼陣營");
      }
      if (alienInPlay) {
        if (anyDeadFaction("alien")) addWin("village", "村民陣營");
        else if (!winners.some((w) => w.id === "tanner" || w.id === "village" || w.id === "leader")) addWin("alien", "外星人陣營");
      }
    }

    // 背叛者標記：原陣營任一人死（非自己）才贏
    for (let i = 0; i < n; i++) {
      if (game.players[i].mark !== "traitor" && endRoleOf(game, i) !== "traitor") continue;
      if (isDead(i)) continue;
      const home = factionOfSeat(game, i);
      if (home === "tanner") continue;
      const mateDead = dead.some((j) => j !== i && factionOfSeat(game, j) === home);
      if (mateDead) addWin("traitor-" + i, game.players[i].name + "（背叛者）");
    }

    if (!winners.length) addWin("village", "村民陣營");

    const winnerLabel = winners.map((w) => w.label).join("、");
    const winner = winners[0] ? winners[0].id : "village";

    game.phase = "recap";
    game.voteResult = {
      counts: counts,
      votes: clone(votes),
      eliminated: eliminated,
      hunterChain: hunterChain,
      dead: dead,
      winners: winners,
      winner: winner,
      winnerLabel: winnerLabel,
      immune: redirected.immune,
      epic: evilCount >= 3,
    };
    pushLog(game, "開票：" + (dead.length ? dead.map((i) => game.players[i].name).join("、") + " 出局" : "無人出局"));
    pushLog(game, "勝負：" + winnerLabel);
    return { error: null };
  }

  function currentSnapshot(game) {
    return snapshotBoard(game.players, game.center);
  }

  function pushHistory(game) {
    game.history.push(
      clone({
        players: game.players,
        center: game.center,
        markPool: game.markPool,
        artifactDeck: game.artifactDeck,
      })
    );
    if (game.history.length > 40) game.history.shift();
  }

  function undo(game) {
    const prev = game.history.pop();
    if (!prev) return false;
    game.players = prev.players;
    game.center = prev.center;
    game.markPool = prev.markPool;
    game.artifactDeck = prev.artifactDeck;
    return true;
  }

  function getSlot(game, target) {
    if (target.type === "player") return game.players[target.index];
    if (target.type === "center") return game.center[target.index];
    return null;
  }

  function getCard(game, target) {
    const slot = getSlot(game, target);
    return slot ? slot.card : null;
  }

  function isShielded(game, target) {
    return target.type === "player" && !!game.players[target.index]?.shielded;
  }

  function sameTarget(a, b) {
    return a && b && a.type === b.type && a.index === b.index;
  }

  function lookBlocked(game, target) {
    return isShielded(game, target);
  }

  function moveBlocked(game, target) {
    return isShielded(game, target);
  }

  function isAlphaCenterTarget(game, target) {
    return !!(
      target &&
      target.type === "center" &&
      game &&
      game.center &&
      game.center[target.index] &&
      game.center[target.index].alphaSlot
    );
  }

  function swapCards(game, a, b) {
    if (sameTarget(a, b)) return { error: "請選兩張不同的牌" };
    if (game.phase === "arrange" && (isAlphaCenterTarget(game, a) || isAlphaCenterTarget(game, b))) {
      return { error: "天黑前不能換中間狼人牌" };
    }
    if (moveBlocked(game, a) || moveBlocked(game, b)) {
      return { error: "有盾牌的牌不能被移動" };
    }
    const slotA = getSlot(game, a);
    const slotB = getSlot(game, b);
    if (!slotA || !slotB) return { error: "選取無效" };
    pushHistory(game);
    const tmp = slotA.card;
    slotA.card = slotB.card;
    slotB.card = tmp;
    return { error: null };
  }

  function flipCard(game, target) {
    if (moveBlocked(game, target) && !getCard(game, target)?.revealed) {
      // 已翻開的可以蓋回去；未翻開且有盾則不能翻
      if (lookBlocked(game, target)) return { error: "有盾牌的牌不能翻看" };
    }
    if (lookBlocked(game, target) && !getCard(game, target)?.revealed) {
      return { error: "有盾牌的牌不能翻看" };
    }
    const card = getCard(game, target);
    if (!card) return { error: "選取無效" };
    pushHistory(game);
    card.revealed = !card.revealed;
    return { error: null };
  }

  function rotatePlayerCards(game, selfIndex, direction) {
    const n = game.players.length;
    if (selfIndex < 0 || selfIndex >= n) return { error: "請先點你自己的座位" };
    const movable = [];
    for (let i = 0; i < n; i++) {
      if (i !== selfIndex && !game.players[i].shielded) movable.push(i);
    }
    if (movable.length < 2) return { error: "可移動的牌不足兩張" };
    pushHistory(game);
    const cards = movable.map((i) => game.players[i].card);
    const rotated =
      direction === 1
        ? [cards[cards.length - 1], ...cards.slice(0, -1)]
        : [...cards.slice(1), cards[0]];
    movable.forEach((i, k) => {
      game.players[i].card = rotated[k];
    });
    return { error: null };
  }

  function placeShield(game, playerIndex) {
    if (!game.settings.shield) return { error: "本局未使用盾牌" };
    if (playerIndex < 0 || playerIndex >= game.players.length) return { error: "選取無效" };
    if (game.players[playerIndex].shielded) return { error: "這位已有盾牌" };
    const used = game.players.filter((p) => p.shielded).length;
    if (used >= 2) return { error: "盾牌用完了" };
    pushHistory(game);
    game.players[playerIndex].shielded = true;
    return { error: null };
  }

  function removeShield(game, playerIndex) {
    if (!game.players[playerIndex]?.shielded) return { error: "這裡沒有盾牌" };
    pushHistory(game);
    game.players[playerIndex].shielded = false;
    return { error: null };
  }

  function placeMark(game, playerIndex, markId) {
    if (!game.settings.dusk) return { error: "本局未使用標記" };
    const player = game.players[playerIndex];
    if (!player) return { error: "選取無效" };
    if (!D().MARK_BY_ID[markId]) return { error: "未知標記" };
    if (!game.markPool[markId]) return { error: "這種標記用完了" };
    pushHistory(game);
    returnMark(game.markPool, player.mark);
    takeMark(game.markPool, markId);
    player.mark = markId;
    return { error: null };
  }

  function swapMarks(game, aIndex, bIndex) {
    if (!game.settings.dusk) return { error: "本局未使用標記" };
    if (aIndex === bIndex) return { error: "請選兩位不同玩家" };
    const a = game.players[aIndex];
    const b = game.players[bIndex];
    if (!a || !b) return { error: "選取無效" };
    pushHistory(game);
    const tmp = a.mark;
    a.mark = b.mark;
    b.mark = tmp;
    return { error: null };
  }

  function placeArtifact(game, playerIndex) {
    if (!game.settings.artifacts) return { error: "本局未使用神器" };
    const player = game.players[playerIndex];
    if (!player) return { error: "選取無效" };
    if (player.shielded) return { error: "有盾牌的牌不能放神器" };
    if (player.artifact) return { error: "這位玩家已經有神器" };
    if (!game.artifactDeck.length) return { error: "神器堆空了" };
    pushHistory(game);
    player.artifact = game.artifactDeck.pop();
    player.artifactRevealed = false;
    return { error: null };
  }

  function defaultCounts() {
    const counts = {};
    for (const role of D().ROLES) counts[role.id] = 0;
    return counts;
  }

  function pushLog(game, text) {
    if (!game || !text) return;
    if (!game.log) game.log = [];
    game.log.push({ phase: game.phase, text: String(text) });
  }

  function pushSeatLog(game, actorSeat, text) {
    if (!game || !text) return;
    if (game.phase !== "dusk" && game.phase !== "night") return;
    let key = null;
    if (actorSeat === -1 || actorSeat === "local") key = "local";
    else if (Number.isInteger(actorSeat) && actorSeat >= 0) key = String(actorSeat);
    if (!key) return;
    if (!game.seatLogs) game.seatLogs = {};
    if (!game.seatLogs[key]) game.seatLogs[key] = [];
    game.seatLogs[key].push({ phase: game.phase, text: String(text) });
  }

  function noteBoardAction(game, action, text) {
    pushLog(game, text);
    if (action) pushSeatLog(game, action.actorSeat, text);
  }

  function seatLabel(game, target) {
    if (!game || !target) return "";
    if (target.type === "center") {
      const c = game.center[target.index];
      if (!c) return "中間牌";
      return c.alphaSlot ? "中間狼人" : "中" + (target.index + 1);
    }
    return game.players[target.index]?.name || "玩家";
  }

  function roleName(roleId) {
    return D().ROLE_BY_ID[roleId]?.name || roleId;
  }

  function applyAction(game, action) {
    if (!game || !action || !action.type) return { error: "無效操作" };
    const roleNm = roleName;

    if (game.phase === "arrange" && action.type !== "swap" && action.type !== "undo" && action.type !== "setPhase") {
      return { error: "現在只能換牌" };
    }
    if (game.phase === "looking" && action.type !== "setPhase") {
      return { error: "看牌中，請等進入夜晚" };
    }
    if ((game.phase === "voting" || game.phase === "recap") && action.type !== "setPhase" && action.type !== "script") {
      return { error: "現在不能動牌" };
    }
    if (action.type === "swap") {
      const r = swapCards(game, action.a, action.b);
      if (!r.error) {
        noteBoardAction(game, action, "換牌：" + seatLabel(game, action.a) + " ↔ " + seatLabel(game, action.b));
      }
      return r;
    }
    if (action.type === "flip") {
      const r = flipCard(game, action.target);
      if (!r.error) {
        const card = getCard(game, action.target);
        noteBoardAction(
          game,
          action,
          (card.revealed ? "翻開：" : "蓋上：") + seatLabel(game, action.target) + "（" + roleNm(card.roleId) + "）"
        );
      }
      return r;
    }
    if (action.type === "rotate") {
      const who = game.players[action.selfIndex]?.name || "";
      const r = rotatePlayerCards(game, action.selfIndex, action.direction);
      if (!r.error) {
        noteBoardAction(
          game,
          action,
          (action.direction === 1 ? "輪轉向右" : "輪轉向左") + "（自己：" + who + "）"
        );
      }
      return r;
    }
    if (action.type === "shield") {
      const r = placeShield(game, action.playerIndex);
      if (!r.error) noteBoardAction(game, action, "放盾牌：" + game.players[action.playerIndex].name);
      return r;
    }
    if (action.type === "placeMark") {
      const player = game.players[action.playerIndex];
      const r = placeMark(game, action.playerIndex, action.markId);
      if (!r.error) noteBoardAction(game, action, "放標記：" + player.name);
      return r;
    }
    if (action.type === "swapMark") {
      const r = swapMarks(game, action.aIndex, action.bIndex);
      if (!r.error) {
        noteBoardAction(
          game,
          action,
          "換標記：" + game.players[action.aIndex].name + " ↔ " + game.players[action.bIndex].name
        );
      }
      return r;
    }
    if (action.type === "placeArtifact") {
      const name = game.players[action.playerIndex]?.name;
      const r = placeArtifact(game, action.playerIndex);
      if (!r.error) noteBoardAction(game, action, "放神器：" + name);
      return r;
    }
    if (action.type === "look") {
      const blocked = (action.targets || []).filter((t) => lookBlocked(game, t));
      if (blocked.length) return { error: "有盾牌的牌不能看" };
      const targets = action.targets || [];
      const where = targets.map((t) => seatLabel(game, t)).join("、");
      const cards = targets
        .map((t) => getCard(game, t))
        .filter(Boolean)
        .map((c) => ({ uid: c.uid, roleId: c.roleId, revealed: !!c.revealed }));
      if (!cards.length) return { error: "選取無效" };
      noteBoardAction(game, action, "看牌：" + where);
      applyCopyFromLook(game, action.actorSeat, targets);
      return { error: null, peek: { kind: "cards", cards: cards } };
    }
    if (action.type === "lookMark") {
      const p = game.players[action.playerIndex];
      if (!p?.mark) return { error: "這位玩家沒有標記" };
      noteBoardAction(game, action, "看標記：" + p.name);
      return { error: null, peek: { kind: "mark", name: p.name, markId: p.mark } };
    }
    if (action.type === "lookArtifact") {
      const p = game.players[action.playerIndex];
      if (!p?.artifact) return { error: "這位玩家沒有神器" };
      noteBoardAction(game, action, "看神器：" + p.name);
      return { error: null, peek: { kind: "artifact", name: p.name, artifactId: p.artifact } };
    }
    if (action.type === "undo") {
      if (!undo(game)) return { error: "沒有可還原的操作" };
      noteBoardAction(game, action, "還原上一步");
      return { error: null };
    }
    if (action.type === "script") {
      return moveScript(game, action.dir, action.now, action.syncDelay);
    }
    if (action.type === "judgeStart") {
      return startJudge(game, action.now, action.syncDelay);
    }
    if (action.type === "judgeTimeout") {
      return judgeTimeout(game, action.now, action.syncDelay);
    }
    if (action.type === "setPhase") {
      const prev = game.phase;
      const next = action.phase;
      if (next === "looking" && prev !== "arrange") {
        return { error: "現在不能開始看牌" };
      }
      if (next === "looking" && prev === "arrange") {
        lockNightStart(game);
        game.cardSeen = {};
      }
      if ((next === "dusk" || next === "night") && (prev === "arrange" || prev === "looking")) {
        lockNightStart(game);
        resetScript(game, next === "night");
      }
      if (next === "night" && prev === "dusk") {
        resetScript(game, true);
      }
      if (next !== "dusk" && next !== "night") {
        stopJudge(game);
      }
      if (next === "voting") {
        if (!game.votes) game.votes = {};
      }
      game.phase = next;
      return { error: null };
    }
    return { error: "未知操作" };
  }

  global.WerewolfGame = {
    shuffle,
    clone,
    selectedCount,
    flattenCounts,
    inferSettings,
    neededCardCount,
    selectedDeckCount,
    createGame,
    snapshotBoard,
    currentSnapshot,
    censorGame,
    privateInfo,
    undo,
    getCard,
    isShielded,
    lookBlocked,
    moveBlocked,
    swapCards,
    isAlphaCenterTarget,
    flipCard,
    rotatePlayerCards,
    placeShield,
    removeShield,
    placeMark,
    swapMarks,
    placeArtifact,
    defaultCounts,
    pushLog,
    pushSeatLog,
    seatActions,
    seatLabel,
    applyAction,
    lockNightStart,
    visibilityFor,
    effectiveRole,
    yourTurnForSeat,
    yourTurnOffline,
    applyCopyFromLook,
    scriptSteps,
    moveScript,
    startJudge,
    stopJudge,
    judgeTimeout,
    emptyJudge,
    castVote,
    allVoted,
    resolveVotes,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
