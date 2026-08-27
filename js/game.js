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
        phase: "viewCards",
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
        artifact: p.artifact,
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

  function swapCards(game, a, b) {
    if (sameTarget(a, b)) return { error: "請選兩張不同的牌" };
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

    if (action.type === "swap") {
      const r = swapCards(game, action.a, action.b);
      if (!r.error) pushLog(game, "換牌：" + seatLabel(game, action.a) + " ↔ " + seatLabel(game, action.b));
      return r;
    }
    if (action.type === "flip") {
      const r = flipCard(game, action.target);
      if (!r.error) {
        const card = getCard(game, action.target);
        pushLog(
          game,
          (card.revealed ? "翻開：" : "蓋上：") + seatLabel(game, action.target) + "（" + roleNm(card.roleId) + "）"
        );
      }
      return r;
    }
    if (action.type === "rotate") {
      const who = game.players[action.selfIndex]?.name || "";
      const r = rotatePlayerCards(game, action.selfIndex, action.direction);
      if (!r.error) {
        pushLog(game, (action.direction === 1 ? "輪轉向右" : "輪轉向左") + "（自己：" + who + "）");
      }
      return r;
    }
    if (action.type === "shield") {
      const r = placeShield(game, action.playerIndex);
      if (!r.error) pushLog(game, "放盾牌：" + game.players[action.playerIndex].name);
      return r;
    }
    if (action.type === "placeMark") {
      const player = game.players[action.playerIndex];
      const old = player?.mark ? D().MARK_BY_ID[player.mark] : null;
      const neu = D().MARK_BY_ID[action.markId];
      const r = placeMark(game, action.playerIndex, action.markId);
      if (!r.error) {
        pushLog(
          game,
          "放標記：" +
            player.name +
            " ← " +
            (neu ? neu.name : action.markId) +
            (old ? "（原為" + old.name + "）" : "")
        );
      }
      return r;
    }
    if (action.type === "swapMark") {
      const r = swapMarks(game, action.aIndex, action.bIndex);
      if (!r.error) {
        pushLog(
          game,
          "換標記：" + game.players[action.aIndex].name + " ↔ " + game.players[action.bIndex].name
        );
      }
      return r;
    }
    if (action.type === "placeArtifact") {
      const name = game.players[action.playerIndex]?.name;
      const r = placeArtifact(game, action.playerIndex);
      if (!r.error) {
        const art = D().ARTIFACT_BY_ID[game.players[action.playerIndex].artifact];
        pushLog(game, art ? "放神器：" + name + " ← " + art.name : "放神器：" + name);
      }
      return r;
    }
    if (action.type === "look") {
      const blocked = (action.targets || []).filter((t) => lookBlocked(game, t));
      if (blocked.length) return { error: "有盾牌的牌不能看" };
      const where = (action.targets || []).map((t) => seatLabel(game, t)).join("、");
      const seen = (action.targets || [])
        .map((t) => getCard(game, t))
        .filter(Boolean)
        .map((c) => roleNm(c.roleId))
        .join("、");
      pushLog(game, "看牌：" + where + " → " + seen);
      return { error: null };
    }
    if (action.type === "lookMark") {
      const p = game.players[action.playerIndex];
      if (!p?.mark) return { error: "這位玩家沒有標記" };
      const info = D().MARK_BY_ID[p.mark];
      pushLog(game, "看標記：" + p.name + " → " + (info ? info.name : p.mark));
      return { error: null };
    }
    if (action.type === "lookArtifact") {
      const p = game.players[action.playerIndex];
      if (!p?.artifact) return { error: "這位玩家沒有神器" };
      const info = D().ARTIFACT_BY_ID[p.artifact];
      pushLog(game, "看神器：" + p.name + " → " + (info ? info.name : p.artifact));
      return { error: null };
    }
    if (action.type === "undo") {
      if (!undo(game)) return { error: "沒有可還原的操作" };
      pushLog(game, "還原上一步");
      return { error: null };
    }
    if (action.type === "setPhase") {
      game.phase = action.phase;
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
    undo,
    getCard,
    isShielded,
    lookBlocked,
    moveBlocked,
    swapCards,
    flipCard,
    rotatePlayerCards,
    placeShield,
    removeShield,
    placeMark,
    swapMarks,
    placeArtifact,
    defaultCounts,
    pushLog,
    seatLabel,
    applyAction,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
