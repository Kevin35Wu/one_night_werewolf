/* 一夜終極系列：角色／標記／神器（中文名對齊語音 App） */
(function (global) {
  const TEAMS = {
    village: { id: "village", name: "村民", color: "#5b9dff" },
    werewolf: { id: "werewolf", name: "狼人", color: "#e05656" },
    vampire: { id: "vampire", name: "吸血鬼", color: "#b56bff" },
    alien: { id: "alien", name: "外星人", color: "#2ec4b6" },
    independent: { id: "independent", name: "獨立", color: "#f0c14a" },
    villain: { id: "villain", name: "惡棍", color: "#8b6b5b" },
  };

  const EXPANSIONS = [
    { id: "base", name: "基礎版" },
    { id: "daybreak", name: "破曉" },
    { id: "vampire", name: "吸血鬼" },
    { id: "alien", name: "外星人" },
    { id: "villains", name: "超級惡棍" },
    { id: "bonus", name: "角色擴充" },
  ];

  function role(id, name, expansion, team, emoji, max = 1, extra = {}) {
    return { id, name, expansion, team, emoji, max, ...extra };
  }

  const ROLES = [
    // 基礎版
    role("werewolf", "狼人", "base", "werewolf", "🐺", 2),
    role("minion", "爪牙", "base", "werewolf", "🗡️"),
    role("mason", "守夜人", "base", "village", "🌙", 2),
    role("seer", "預言家", "base", "village", "🔮"),
    role("robber", "強盜", "base", "village", "💰"),
    role("troublemaker", "搗蛋鬼", "base", "village", "🃏"),
    role("drunk", "酒鬼", "base", "village", "🍺"),
    role("insomniac", "失眠者", "base", "village", "😴"),
    role("doppelganger", "化身幽靈", "base", "village", "👥"),
    role("hunter", "獵人", "base", "village", "🏹"),
    role("tanner", "皮匠", "base", "independent", "🧵"),
    role("villager", "村民", "base", "village", "🏡", 3),

    // 破曉
    role("sentinel", "哨兵", "daybreak", "village", "🛡️", 1, { enablesShield: true }),
    role("alphawolf", "阿爾法狼", "daybreak", "werewolf", "🐺", 1, { enablesAlphaWolf: true }),
    role("mysticwolf", "狼先知", "daybreak", "werewolf", "🌕"),
    role("dreamwolf", "貪睡狼", "daybreak", "werewolf", "💤"),
    role("appseer", "見習預言家", "daybreak", "village", "🔍"),
    role("pi", "靈異偵探", "daybreak", "village", "🕵️"),
    role("witch", "女巫", "daybreak", "village", "🧪"),
    role("vidiot", "村莊白癡", "daybreak", "village", "🌀"),
    role("revealer", "揭密者", "daybreak", "village", "☀️"),
    role("curator", "監護人", "daybreak", "village", "📦", 1, { enablesArtifacts: true }),
    role("bodyguard", "保鑣", "daybreak", "village", "🥋"),

    // 吸血鬼（黃昏角色）
    role("copycat", "模仿者", "vampire", "village", "🐱", 1, { dusk: true }),
    role("vampire", "吸血鬼", "vampire", "vampire", "🧛", 2, { dusk: true }),
    role("master", "吸血鬼領主", "vampire", "vampire", "👑", 1, { dusk: true }),
    role("count", "伯爵", "vampire", "vampire", "🕯️", 1, { dusk: true }),
    role("renfield", "血奴", "vampire", "vampire", "🦇", 1, { dusk: true }),
    role("diseased", "病毒傳染者", "vampire", "village", "☣️", 1, { dusk: true }),
    role("cupid", "邱比特", "vampire", "independent", "💘", 1, { dusk: true }),
    role("instigator", "煽動者", "vampire", "independent", "🔥", 1, { dusk: true }),
    role("priest", "牧師", "vampire", "village", "✝️", 1, { dusk: true }),
    role("assassin", "刺客", "vampire", "independent", "⚔️", 1, { dusk: true }),
    role("appassassin", "見習刺客", "vampire", "independent", "🗡️", 1, { dusk: true }),
    role("marksman", "神射手", "vampire", "village", "🎯"),
    role("pickpocket", "小偷", "vampire", "village", "🧤"),
    role("gremlin", "小魔怪", "vampire", "village", "😈"),

    // 外星人
    role("oracle", "先知", "alien", "village", "📡"),
    role("alien", "外星人", "alien", "alien", "👽", 2),
    role("synthetic", "合成外星人", "alien", "alien", "🤖"),
    role("cow", "牛", "alien", "village", "🐮"),
    role("groob", "古伯", "alien", "independent", "🟢"),
    role("zerb", "澤伯", "alien", "independent", "🟣"),
    role("leader", "領導", "alien", "village", "⭐"),
    role("psychic", "靈媒", "alien", "village", "💫"),
    role("rascal", "小淘氣", "alien", "village", "😜"),
    role("exposer", "曝光者", "alien", "village", "💡"),
    role("blob", "變形怪", "alien", "alien", "🫧"),
    role("mortician", "禮儀師", "alien", "village", "⚰️"),

    // 超級惡棍
    role("mirrorman", "鏡中人", "villains", "villain", "🪞"),
    role("temptress", "誘惑者", "villains", "villain", "💋"),
    role("drpeeker", "偷看博士", "villains", "villain", "👀"),
    role("rapscallion", "惡棍", "villains", "villain", "😏"),
    role("henchman", "手下七號", "villains", "villain", "7️⃣"),
    role("evilometer", "邪惡測定器", "villains", "village", "📟"),
    role("madscientist", "瘋狂科學家", "villains", "villain", "🧬"),
    role("intern", "實習生", "villains", "villain", "📎"),
    role("annoyinglad", "討人厭少年", "villains", "independent", "😤"),
    role("detector", "探測者", "villains", "village", "📡"),
    role("roleretriever", "角色回收者", "villains", "village", "🧲"),
    role("voodoolou", "巫毒盧", "villains", "villain", "🧿"),
    role("switcheroo", "對調者", "villains", "villain", "🔄"),
    role("selfawarenessgirl", "自我意識女孩", "villains", "village", "🪞"),
    role("flipper", "翻面者", "villains", "villain", "🔃"),

    // 角色擴充 Bonus 1–4
    role("auraseer", "循跡者", "bonus", "village", "✨"),
    role("prince", "王子", "bonus", "village", "🤴"),
    role("cursed", "受詛咒者", "bonus", "village", "🩸"),
    role("apptanner", "見習皮匠", "bonus", "independent", "🪡"),
    role("thing", "魔爪", "bonus", "village", "🤚"),
    role("squire", "侍從", "bonus", "village", "🛡️"),
    role("beholder", "旁觀者", "bonus", "village", "👁️"),
    role("bodysnatcher", "身體改造者", "bonus", "alien", "🧪"),
    role("nostradamus", "占卜師", "bonus", "village", "📜"),
    role("empath", "通靈者", "bonus", "village", "💗"),
    role("familyman", "家族男人", "bonus", "village", "👨‍👧"),
    role("innocentbystander", "無辜旁觀者", "bonus", "village", "😐"),
    role("thesponge", "海綿", "bonus", "village", "🧽"),
    role("ricochetrhino", "跳彈犀牛", "bonus", "village", "🦏"),
    role("defenderer", "防守者", "bonus", "village", "🛡️"),
    role("windywendy", "風女溫蒂", "bonus", "village", "🌬️"),
  ];

  const MARKS = [
    { id: "clarity", name: "清白", emoji: "⚪", qty: 16, startOnPlayers: true },
    { id: "vampire", name: "吸血鬼", emoji: "🧛", qty: 2 },
    { id: "fear", name: "恐懼", emoji: "😱", qty: 1 },
    { id: "bat", name: "蝙蝠", emoji: "🦇", qty: 1 },
    { id: "plague", name: "瘟疫", emoji: "☣️", qty: 1 },
    { id: "love", name: "戀人", emoji: "💕", qty: 2 },
    { id: "traitor", name: "背叛者", emoji: "🎭", qty: 1 },
    { id: "assassin", name: "刺殺", emoji: "☠️", qty: 1 },
  ];

  const ARTIFACTS = [
    { id: "claw", name: "狼人爪", emoji: "🐾", pack: "daybreak" },
    { id: "brand", name: "村民烙印", emoji: "🏷️", pack: "daybreak" },
    { id: "cudgel", name: "皮匠棍", emoji: "🪵", pack: "daybreak" },
    { id: "void", name: "虛無", emoji: "⚫", pack: "daybreak" },
    { id: "mute", name: "禁言面具", emoji: "😶", pack: "daybreak" },
    { id: "shame", name: "羞恥裹屍布", emoji: "🫣", pack: "daybreak" },
    { id: "princecloak", name: "王子披風", emoji: "🧥", pack: "bonus" },
    { id: "hunterbow", name: "獵人弓", emoji: "🏹", pack: "bonus" },
    { id: "guardsword", name: "保鑣劍", emoji: "⚔️", pack: "bonus" },
    { id: "traitordagger", name: "背叛者匕首", emoji: "🗡️", pack: "bonus" },
    { id: "vampmist", name: "吸血鬼霧", emoji: "🌫️", pack: "bonus" },
    { id: "alienart", name: "外星神器", emoji: "🛸", pack: "bonus" },
  ];

  const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));
  const MARK_BY_ID = Object.fromEntries(MARKS.map((m) => [m.id, m]));
  const ARTIFACT_BY_ID = Object.fromEntries(ARTIFACTS.map((a) => [a.id, a]));

  global.WerewolfData = {
    TEAMS,
    EXPANSIONS,
    ROLES,
    MARKS,
    ARTIFACTS,
    ROLE_BY_ID,
    MARK_BY_ID,
    ARTIFACT_BY_ID,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
