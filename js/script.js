/* 一夜終極講稿：依本局角色篩選。
 * holdMs ≈ 語音 + 操作；法官倒數只在語音後再等「操作段」，閉眼句播完即進下一句。
 * 操作段另由 game.js 再縮約 20%。 */
(function (global) {
  const DUSK = [
    { id: "dusk-open", text: "所有人，閉上眼睛。", roles: [], audio: "everyone-close.mp3", audioMs: 2717, holdMs: 4217 },
    { id: "dusk-copycat-wake", text: "模仿者，醒來並看中間任何一張牌。你現在是那個角色。當他被呼叫，醒來並執行夜晚行動。", roles: ["copycat"], audio: "copycat-wake.mp3", audioMs: 11938, holdMs: 16938 },
    { id: "dusk-copycat-close", text: "模仿者，閉上眼睛。", roles: ["copycat"], audio: "copycat-close.mp3", audioMs: 2664, holdMs: 3464 },
    { id: "dusk-vampire-wake", text: "吸血鬼，醒來並找尋其他吸血鬼。把吸血鬼標記給任何一個非吸血鬼玩家。", roles: ["vampire", "master"], audio: "vampire-wake.mp3", audioMs: 7523, holdMs: 12523 },
    { id: "dusk-vampire-close", text: "吸血鬼，閉上眼睛。", roles: ["vampire", "master"], audio: "vampire-close.mp3", audioMs: 2586, holdMs: 3386, skipIf: ["renfield"] },
    { id: "dusk-vampire-renfield-close", text: "吸血鬼，指向擁有吸血鬼標記的玩家並閉上眼睛。", roles: ["renfield"], audio: "vampire-renfield-close.mp3", audioMs: 6818, holdMs: 7618, require: ["vampire", "master"], requireAny: true },
    { id: "dusk-count-wake", text: "伯爵，醒來把恐懼標記給任何一個非吸血鬼玩家。", roles: ["count"], audio: "count-wake.mp3", audioMs: 7288, holdMs: 12288 },
    { id: "dusk-count-close", text: "伯爵，閉上眼睛。", roles: ["count"], audio: "count-close.mp3", audioMs: 2168, holdMs: 2968 },
    { id: "dusk-doppelganger-count-wake", text: "化身幽靈，如果你看到伯爵，醒來把恐懼標記給任何一個非吸血鬼玩家。", roles: ["doppelganger"], require: ["count"], audio: "doppelganger-count-wake.mp3", audioMs: 7000, holdMs: 12000 },
    { id: "dusk-renfield-wake", text: "血奴，醒來並找尋吸血鬼，把蝙蝠標記放在自己面前。", roles: ["renfield"], audio: "renfield-wake.mp3", audioMs: 6818, holdMs: 11818 },
    { id: "dusk-renfield-hands", text: "吸血鬼們，收回大拇指。", roles: ["renfield"], audio: "vampire-renfield-handsaway.mp3", audioMs: 2664, holdMs: 3864 },
    { id: "dusk-renfield-close", text: "血奴，閉上眼睛。", roles: ["renfield"], audio: "renfield-close.mp3", audioMs: 2325, holdMs: 3125 },
    { id: "dusk-doppelganger-renfield-wake", text: "化身幽靈，如果你看到血奴，醒來並找尋吸血鬼，把蝙蝠標記放在自己面前。", roles: ["doppelganger"], require: ["renfield"], audio: "doppelganger-renfield-wake.mp3", audioMs: 7000, holdMs: 12000 },
    { id: "dusk-diseased-wake", text: "病毒傳染者，醒來並把瘟疫標記給你左邊或右邊的玩家。", roles: ["diseased"], audio: "diseased-wake.mp3", audioMs: 7784, holdMs: 12784 },
    { id: "dusk-diseased-close", text: "病毒傳染者，閉上眼睛。", roles: ["diseased"], audio: "diseased-close.mp3", audioMs: 3213, holdMs: 4013 },
    { id: "dusk-cupid-wake", text: "邱比特，醒來並給任兩位玩家戀人標記。", roles: ["cupid"], audio: "cupid-wake.mp3", audioMs: 6269, holdMs: 16269 },
    { id: "dusk-cupid-close", text: "邱比特，閉上眼睛。", roles: ["cupid"], audio: "cupid-close.mp3", audioMs: 2560, holdMs: 3360 },
    { id: "dusk-instigator-wake", text: "煽動者，醒來。給任何一位玩家背叛者標記。", roles: ["instigator"], audio: "instigator-wake.mp3", audioMs: 6740, holdMs: 11740 },
    { id: "dusk-instigator-close", text: "煽動者，閉上眼睛。", roles: ["instigator"], audio: "instigator-close.mp3", audioMs: 2717, holdMs: 3517 },
    { id: "dusk-priest-wake", text: "牧師，醒來並給自己清白標記。你可以再給任何一位其他玩家清白標記。", roles: ["priest"], audio: "priest-wake.mp3", audioMs: 8908, holdMs: 18908 },
    { id: "dusk-priest-close", text: "牧師，閉上眼睛。", roles: ["priest"], audio: "priest-close.mp3", audioMs: 2247, holdMs: 3047 },
    { id: "dusk-doppelganger-priest-wake", text: "化身幽靈，如果你看到牧師，醒來並給自己清白標記。你可以再給任何一位其他玩家清白標記。", roles: ["doppelganger"], require: ["priest"], audio: "doppelganger-priest-wake.mp3", audioMs: 8000, holdMs: 13000 },
    { id: "dusk-assassin-wake", text: "刺客，醒來並給任何一位玩家刺殺標記。", roles: ["assassin"], audio: "assassin-wake.mp3", audioMs: 5930, holdMs: 10930, skipIf: ["appassassin"] },
    { id: "dusk-appassassin-assassin-wake", text: "見習刺客，醒來並找尋刺客。如果沒有刺客，你可以給任何一位玩家刺殺標記。", roles: ["appassassin"], audio: "appassassin-assassin-wake.mp3", audioMs: 8594, holdMs: 13594, require: ["assassin"] },
    { id: "dusk-appassassin-wake", text: "見習刺客，醒來並給任何一位玩家刺殺標記。", roles: ["appassassin"], audio: "appassassin-wake.mp3", audioMs: 6426, holdMs: 11426, skipIf: ["assassin"] },
    { id: "dusk-assassin-both-close", text: "刺客和見習刺客，閉上眼睛。", roles: ["assassin"], audio: "assassin-appassassin-close.mp3", audioMs: 3866, holdMs: 4666, require: ["appassassin"] },
    { id: "dusk-assassin-close", text: "刺客，閉上眼睛。", roles: ["assassin"], audio: "assassin-close.mp3", audioMs: 2273, holdMs: 3073, skipIf: ["appassassin"] },
    { id: "dusk-appassassin-close", text: "見習刺客，閉上眼睛。", roles: ["appassassin"], audio: "appassassin-close.mp3", audioMs: 2978, holdMs: 3778, skipIf: ["assassin"] },
    { id: "dusk-doppelganger-assassin-wake", text: "刺客，閉上眼睛。化身幽靈，如果你看到刺客，醒來並給任何一位玩家刺殺標記。", roles: ["doppelganger"], require: ["assassin"], audio: "doppelganger-assassin-wake.mp3", audioMs: 8000, holdMs: 13000 },
    { id: "dusk-doppelganger-appassassin-assassin-wake", text: "見習刺客，閉上眼睛。化身幽靈，如果你看到見習刺客，醒來並找尋刺客。如果沒有刺客，你可以給任何一位玩家刺殺標記。", roles: ["doppelganger"], require: ["appassassin", "assassin"], audio: "doppelganger-appassassin-assassin-wake.mp3", audioMs: 9000, holdMs: 14000 },
    { id: "dusk-doppelganger-appassassin-wake", text: "見習刺客，閉上眼睛。化身幽靈，如果你看到見習刺客，醒來並給任何一位玩家刺殺標記。", roles: ["doppelganger"], require: ["appassassin"], skipIf: ["assassin"], audio: "doppelganger-appassassin-wake.mp3", audioMs: 8000, holdMs: 13000 },
    { id: "dusk-lovers-wake", text: "如果你是戀人，醒來並找尋你的另一半。", roles: ["cupid"], audio: "lovers-wake.mp3", audioMs: 5799, holdMs: 10799 },
    { id: "dusk-lovers-close", text: "戀人，閉上眼睛。", roles: ["cupid"], audio: "lovers-close.mp3", audioMs: 2351, holdMs: 3151 },
    { id: "dusk-close", text: "所有人，醒來並祕密查看你的標記。", roles: [], audio: "everyone-dusk.mp3", audioMs: 4493, holdMs: 5993 },
  ];

  const NIGHT = [
    { id: "night-close", text: "所有人，閉上眼睛。", roles: [], audio: "everyone-close.mp3", audioMs: 2717, holdMs: 4217 },
    { id: "sentinel-wake", text: "哨兵，醒來。你可以放盾牌Token在自己以外一位玩家的牌上。", roles: ["sentinel"], audio: "sentinel-wake.mp3", audioMs: 9744, holdMs: 14744 },
    { id: "sentinel-close", text: "哨兵，閉上眼睛。", roles: ["sentinel"], audio: "sentinel-close.mp3", audioMs: 2377, holdMs: 3177 },
    { id: "doppelganger-wake", text: "化身幽靈，醒來並看一位其他玩家的牌。你現在是那位角色。如果你的新角色有夜晚動作，現在執行。", roles: ["doppelganger"], audio: "doppelganger-wake.mp3", audioMs: 13009, holdMs: 23009 },
    { id: "doppelganger-close", text: "化身幽靈，閉上眼睛。", roles: ["doppelganger"], audio: "doppelganger-close.mp3", audioMs: 3030, holdMs: 3830 },
    // 化身幽靈延後行動（對齊官方 App「如果你看到…」；即時技能仍在上一句執行）
    { id: "doppelganger-minion", text: "化身幽靈，如果你現在是爪牙，睜開眼睛。否則，閉上眼睛。狼人們，豎起大拇指讓化身爪牙找到你。", roles: ["doppelganger"], require: ["minion"], audio: "doppelganger-minion.mp3", audioMs: 6844, holdMs: 11844 },
    { id: "doppelganger-ww-thumb", text: "狼人們，收回大拇指。", roles: ["doppelganger"], require: ["minion"], audio: "minion-thumb.mp3", audioMs: 2821, holdMs: 4021 },
    { id: "doppelganger-squire-wake", text: "化身幽靈，如果你看到侍從，醒來。狼人們，豎起大拇指。化身幽靈，你可以看狼人們的牌。", roles: ["doppelganger"], require: ["squire"], audio: "doppelganger-squire-wake.mp3", audioMs: 9000, holdMs: 14000 },
    { id: "doppelganger-apptanner-wake", text: "化身幽靈，如果你看到見習皮匠，醒來。", roles: ["doppelganger"], require: ["apptanner"], audio: "doppelganger-apptanner-wake.mp3", audioMs: 4000, holdMs: 9000 },
    { id: "doppelganger-leader-wake", text: "化身幽靈，如果你看到領導，醒來。外星人們，豎起大拇指。", roles: ["doppelganger"], require: ["leader"], audio: "doppelganger-leader-wake.mp3", audioMs: 6000, holdMs: 11000 },
    { id: "doppelganger-leader-zerbgroob", text: "澤伯和古伯，如果你們看到彼此，豎起大拇指。化身領導，如果你看到澤伯和古伯，只有他們活著你才會贏。", roles: ["doppelganger"], require: ["leader"], audio: "doppelganger-leader-zerbgroob.mp3", audioMs: 10000, holdMs: 15000 },
    { id: "doppelganger-marksman-wake", text: "化身幽靈，如果你看到神射手，醒來。你可以看一位玩家的標記，和另一位玩家的牌。", roles: ["doppelganger"], require: ["marksman"], audio: "doppelganger-marksman-wake.mp3", audioMs: 8000, holdMs: 13000 },
    { id: "doppelganger-pickpocket-wake", text: "化身幽靈，如果你看到小偷，醒來。你可以和一位其他玩家換標記，之後可以看你的新標記。", roles: ["doppelganger"], require: ["pickpocket"], audio: "doppelganger-pickpocket-wake.mp3", audioMs: 8000, holdMs: 13000 },
    { id: "doppelganger-gremlin-wake", text: "化身幽靈，如果你看到小魔怪，醒來。你可以交換其他兩位玩家的標記。", roles: ["doppelganger"], require: ["gremlin"], audio: "doppelganger-gremlin-wake.mp3", audioMs: 7000, holdMs: 12000 },
    { id: "doppelganger-auraseer", text: "化身幽靈，如果你看到循跡者，醒來。任何有動牌或看牌的人，豎起大拇指。", roles: ["doppelganger"], require: ["auraseer"], audio: "doppelganger-auraseer.mp3", audioMs: 7000, holdMs: 12000 },
    { id: "doppelganger-ev-thumbs", text: "所有人，收回大拇指。", roles: ["doppelganger"], require: ["auraseer"], audio: "doppelganger-ev-thumbs.mp3", audioMs: 3000, holdMs: 4200 },
    { id: "doppelganger-insomniac", text: "化身幽靈，如果你看到失眠者，醒來並看自己的牌。", roles: ["doppelganger"], require: ["insomniac"], audio: "doppelganger-insomniac.mp3", audioMs: 5000, holdMs: 10000 },
    { id: "doppelganger-beholder-both", text: "化身幽靈，如果你看到旁觀者，醒來。預言家和見習預言家，豎起大拇指。化身幽靈，你可以看預言家和見習預言家的牌。", roles: ["doppelganger"], require: ["beholder", "seer", "appseer"], audio: "doppelganger-beholder-seer-appseer-wake.mp3", audioMs: 11000, holdMs: 16000 },
    { id: "doppelganger-beholder-seer", text: "化身幽靈，如果你看到旁觀者，醒來。預言家，豎起大拇指。化身幽靈，你可以看預言家的牌。", roles: ["doppelganger"], require: ["beholder", "seer"], skipIf: ["appseer"], audio: "doppelganger-beholder-seer-wake.mp3", audioMs: 9000, holdMs: 14000 },
    { id: "doppelganger-beholder-appseer", text: "化身幽靈，如果你看到旁觀者，醒來。見習預言家，豎起大拇指。化身幽靈，你可以看見習預言家的牌。", roles: ["doppelganger"], require: ["beholder", "appseer"], skipIf: ["seer"], audio: "doppelganger-beholder-appseer-wake.mp3", audioMs: 9000, holdMs: 14000 },
    { id: "doppelganger-revealer", text: "化身幽靈，如果你看到揭密者，醒來。你可以翻開任一位其他玩家的牌，如果該牌不是村民方，將它翻回去。", roles: ["doppelganger"], require: ["revealer"], audio: "doppelganger-revealer.mp3", audioMs: 9000, holdMs: 14000 },
    { id: "doppelganger-curator", text: "化身幽靈，如果你看到監護人，醒來。除了已經有神器Token的牌，你可以放一個神器Token在任何一位玩家的牌上。", roles: ["doppelganger"], require: ["curator"], audio: "doppelganger-curator.mp3", audioMs: 9000, holdMs: 14000 },
    { id: "doppelganger-cow-wake", text: "化身幽靈，如果你看到牛，伸出拳頭。如果至少一個外星人在化身牛旁邊，一個外星人必須碰化身牛的拳頭。", roles: ["doppelganger"], require: ["cow"], audio: "doppelganger-cow-wake.mp3", audioMs: 9000, holdMs: 14000 },
    { id: "doppelganger-exposer-wake", text: "化身幽靈，如果你看到曝光者，醒來。", roles: ["doppelganger"], require: ["exposer"], audio: "doppelganger-exposer-wake.mp3", audioMs: 4000, holdMs: 9000 },
    { id: "doppelganger-psychic-wake", text: "化身幽靈，如果你看到靈媒，醒來。", roles: ["doppelganger"], require: ["psychic"], audio: "doppelganger-psychic-wake.mp3", audioMs: 4000, holdMs: 9000 },
    { id: "doppelganger-rascal-wake", text: "化身幽靈，如果你看到小淘氣，醒來。", roles: ["doppelganger"], require: ["rascal"], audio: "doppelganger-rascal-wake.mp3", audioMs: 4000, holdMs: 9000 },
    { id: "doppelganger-empath-wake", text: "化身幽靈，如果你看到通靈者，醒來。", roles: ["doppelganger"], require: ["empath"], audio: "doppelganger-empath-wake.mp3", audioMs: 4000, holdMs: 9000 },
    { id: "doppelganger-mortician-wake", text: "化身幽靈，如果你看到禮儀師，醒來。", roles: ["doppelganger"], require: ["mortician"], audio: "doppelganger-mortician-wake.mp3", audioMs: 4000, holdMs: 9000 },
    { id: "doppelganger-bodysnatcher-wake", text: "化身幽靈，如果你看到身體改造者，醒來。", roles: ["doppelganger"], require: ["bodysnatcher"], audio: "doppelganger-bodysnatcher-wake.mp3", audioMs: 4000, holdMs: 9000 },
    { id: "wolves-dream-wake", text: "狼人們，除了貪睡狼，醒來並找尋其他狼人。貪睡狼，豎起大拇指。", roles: ["dreamwolf"], audio: "werewolf-dreamwolf-wake.mp3", audioMs: 9169, holdMs: 14169, require: ["werewolf", "alphawolf", "mysticwolf"], requireAny: true },
    { id: "wolves-wake", text: "狼人們，醒來並找尋其他狼人。", roles: ["werewolf", "alphawolf", "mysticwolf"], audio: "werewolf-wake.mp3", audioMs: 4258, holdMs: 9258, skipIf: ["dreamwolf"] },
    { id: "wolves-dream-thumb", text: "貪睡狼，豎起大拇指。", roles: ["dreamwolf"], audio: "werewolf-dreamwolf-thumb.mp3", audioMs: 3030, holdMs: 4230, require: ["werewolf", "alphawolf", "mysticwolf"], requireAny: true },
    { id: "wolves-lone", text: "如果只有一隻狼人，你可以看中間的一張牌。", roles: ["werewolf", "alphawolf", "mysticwolf"], audio: "werewolf-lonewolf-option.mp3", audioMs: 5590, holdMs: 10590 },
    { id: "wolves-sleep", text: "狼人們，閉上眼睛。", roles: ["werewolf", "alphawolf", "mysticwolf", "dreamwolf"], audio: "werewolf-close.mp3", audioMs: 2351, holdMs: 3151 },
    { id: "alphawolf-wake", text: "阿爾法狼，醒來並用中間的狼人牌和一位其他玩家交換。", roles: ["alphawolf"], audio: "alphawolf-wake.mp3", audioMs: 7915, holdMs: 12915 },
    { id: "alphawolf-close", text: "阿爾法狼，閉上眼睛。", roles: ["alphawolf"], audio: "alphawolf-close.mp3", audioMs: 2821, holdMs: 3621 },
    { id: "mysticwolf-wake", text: "狼先知，醒來。你可以看其他一位玩家的牌。", roles: ["mysticwolf"], audio: "mysticwolf-wake.mp3", audioMs: 6139, holdMs: 11139 },
    { id: "mysticwolf-close", text: "狼先知，閉上眼睛。", roles: ["mysticwolf"], audio: "mysticwolf-close.mp3", audioMs: 2769, holdMs: 3569 },
    { id: "minion-wake", text: "爪牙，醒來。狼人們，豎起大拇指讓爪牙找到你。", roles: ["minion"], audio: "minion-wake.mp3", audioMs: 6844, holdMs: 11844 },
    { id: "minion-thumb", text: "狼人們，收回大拇指。", roles: ["minion"], audio: "minion-thumb.mp3", audioMs: 2821, holdMs: 4021 },
    { id: "minion-close", text: "爪牙，閉上眼睛。", roles: ["minion"], audio: "minion-close.mp3", audioMs: 2220, holdMs: 3020 },
    { id: "mason-wake", text: "守夜人，醒來並找尋其他守夜人。", roles: ["mason"], audio: "mason-wake.mp3", audioMs: 4859, holdMs: 9859 },
    { id: "mason-close", text: "守夜人，閉上眼睛。", roles: ["mason"], audio: "mason-close.mp3", audioMs: 2821, holdMs: 3621 },
    { id: "seer-wake", text: "預言家，醒來。你可以看一位其他玩家的牌，或是中間的兩張牌。", roles: ["seer"], audio: "seer-wake.mp3", audioMs: 8046, holdMs: 13046 },
    { id: "seer-close", text: "預言家，閉上眼睛。", roles: ["seer"], audio: "seer-close.mp3", audioMs: 2638, holdMs: 3438 },
    { id: "appseer-wake", text: "見習預言家，醒來。你可以看中間的一張牌。", roles: ["appseer"], audio: "appseer-wake.mp3", audioMs: 6034, holdMs: 11034 },
    { id: "appseer-close", text: "見習預言家，閉上眼睛。", roles: ["appseer"], audio: "appseer-close.mp3", audioMs: 3265, holdMs: 4065 },
    { id: "pi-wake", text: "靈異偵探，醒來。你可以看最多其他兩位玩家的牌。如果你看到不是村民方的角色，你現在是那位角色，但不會在他被呼叫時醒來。", roles: ["pi"], audio: "pi-wake.mp3", audioMs: 15386, holdMs: 20386 },
    { id: "pi-close", text: "靈異偵探，閉上眼睛。", roles: ["pi"], audio: "pi-close.mp3", audioMs: 2926, holdMs: 3726 },
    { id: "robber-wake", text: "強盜，醒來。你可以和一位玩家換牌，之後可以看你的新牌。", roles: ["robber"], audio: "robber-wake.mp3", audioMs: 8725, holdMs: 13725 },
    { id: "robber-close", text: "強盜，閉上眼睛。", roles: ["robber"], audio: "robber-close.mp3", audioMs: 2325, holdMs: 3125 },
    { id: "witch-wake", text: "女巫，醒來。你可以看中間一張牌。如果你這麼做，你必須用它和任何一位玩家的牌交換。", roles: ["witch"], audio: "witch-wake.mp3", audioMs: 10136, holdMs: 15136 },
    { id: "witch-close", text: "女巫，閉上眼睛。", roles: ["witch"], audio: "witch-close.mp3", audioMs: 2220, holdMs: 3020 },
    { id: "troublemaker-wake", text: "搗蛋鬼，醒來。你可以交換其他兩位玩家的牌。", roles: ["troublemaker"], audio: "troublemaker-wake.mp3", audioMs: 6296, holdMs: 11296 },
    { id: "troublemaker-close", text: "搗蛋鬼，閉上眼睛。", roles: ["troublemaker"], audio: "troublemaker-close.mp3", audioMs: 2664, holdMs: 3464 },
    { id: "vidiot-wake", text: "村莊白癡，醒來。你可以向左或向右移動除了自己以外所有玩家的牌。", roles: ["vidiot"], audio: "vidiot-wake.mp3", audioMs: 9456, holdMs: 19456 },
    { id: "vidiot-close", text: "村莊白癡，閉上眼睛。", roles: ["vidiot"], audio: "vidiot-close.mp3", audioMs: 3056, holdMs: 3856 },
    { id: "drunk-wake", text: "酒鬼，醒來並用自己的牌和中間一張交換。", roles: ["drunk"], audio: "drunk-wake.mp3", audioMs: 5669, holdMs: 10669 },
    { id: "drunk-close", text: "酒鬼，閉上眼睛。", roles: ["drunk"], audio: "drunk-close.mp3", audioMs: 2247, holdMs: 3047 },
    { id: "insomniac-wake", text: "失眠者，醒來並看自己的牌。", roles: ["insomniac"], audio: "insomniac-wake.mp3", audioMs: 4180, holdMs: 9180 },
    { id: "insomniac-close", text: "失眠者，閉上眼睛。", roles: ["insomniac"], audio: "insomniac-close.mp3", audioMs: 2769, holdMs: 3569 },
    { id: "revealer-wake", text: "揭密者，醒來。你可以翻開任一位其他玩家的牌，如果該牌不是村民方，將它翻回去。", roles: ["revealer"], audio: "revealer-wake.mp3", audioMs: 10057, holdMs: 15057 },
    { id: "revealer-close", text: "揭密者，閉上眼睛。", roles: ["revealer"], audio: "revealer-close.mp3", audioMs: 2612, holdMs: 3412 },
    { id: "curator-wake", text: "監護人，醒來。你可以放一個神器Token在任何一位玩家的牌上。", roles: ["curator"], audio: "curator-wake.mp3", audioMs: 9143, holdMs: 14143 },
    { id: "curator-close", text: "監護人，閉上眼睛。", roles: ["curator"], audio: "curator-close.mp3", audioMs: 2560, holdMs: 3360 },
    { id: "thing-wake", text: "魔爪，醒來並碰你左邊或右邊玩家的肩膀。", roles: ["thing"], audio: "thing-wake.mp3", audioMs: 6557, holdMs: 11557 },
    { id: "thing-close", text: "魔爪，閉上眼睛。", roles: ["thing"], audio: "thing-close.mp3", audioMs: 2168, holdMs: 2968 },
    { id: "squire-wake", text: "侍從，醒來。狼人們，豎起大拇指讓侍從找到你。侍從，你可以看狼人們的牌。", roles: ["squire"], audio: "squire-wake.mp3", audioMs: 10057, holdMs: 20057 },
    { id: "squire-thumb", text: "狼人們，收回大拇指。", roles: ["squire"], audio: "squire-ww-thumb.mp3", audioMs: 2821, holdMs: 4021 },
    { id: "squire-close", text: "侍從，閉上眼睛。", roles: ["squire"], audio: "squire-close.mp3", audioMs: 2403, holdMs: 3203 },
    { id: "beholder-both-wake", text: "旁觀者，醒來。預言家和見習預言家，豎起大拇指。旁觀者，你可以看預言家和見習預言家的牌。", roles: ["beholder"], audio: "beholder-seer-appseer-wake.mp3", audioMs: 12617, holdMs: 22617, require: ["seer", "appseer"] },
    { id: "beholder-seer-wake", text: "旁觀者，醒來。預言家，豎起大拇指。旁觀者，你可以看預言家的牌。", roles: ["beholder"], audio: "beholder-seer-wake.mp3", audioMs: 9117, holdMs: 19117, skipIf: ["appseer"], require: ["seer"] },
    { id: "beholder-appseer-wake", text: "旁觀者，醒來。見習預言家，豎起大拇指。旁觀者，你可以看見習預言家的牌。", roles: ["beholder"], audio: "beholder-appseer-wake.mp3", audioMs: 10083, holdMs: 20083, skipIf: ["seer"], require: ["appseer"] },
    { id: "beholder-both-thumb", text: "預言家和見習預言家，收回大拇指。", roles: ["beholder"], audio: "beholder-seer-appseer-thumb.mp3", audioMs: 4728, holdMs: 5928, require: ["seer", "appseer"] },
    { id: "beholder-seer-thumb", text: "預言家，收回大拇指。", roles: ["beholder"], audio: "beholder-seer-thumb.mp3", audioMs: 3004, holdMs: 4204, skipIf: ["appseer"], require: ["seer"] },
    { id: "beholder-appseer-thumb", text: "見習預言家，收回大拇指。", roles: ["beholder"], audio: "beholder-appseer-thumb.mp3", audioMs: 3631, holdMs: 4831, skipIf: ["seer"], require: ["appseer"] },
    { id: "beholder-close", text: "旁觀者，閉上眼睛。", roles: ["beholder"], audio: "beholder-close.mp3", audioMs: 2717, holdMs: 3517 },
    { id: "marksman-wake", text: "神射手，醒來。你可以看一位玩家的標記，和另一位玩家的牌。", roles: ["marksman"], audio: "marksman-wake.mp3", audioMs: 7967, holdMs: 17967 },
    { id: "marksman-close", text: "神射手，閉上眼睛。", roles: ["marksman"], audio: "marksman-close.mp3", audioMs: 2717, holdMs: 3517 },
    { id: "pickpocket-wake", text: "小偷，醒來。你可以和一位其他玩家換標記，之後可以看你的新標記。", roles: ["pickpocket"], audio: "pickpocket-wake.mp3", audioMs: 8490, holdMs: 13490 },
    { id: "pickpocket-close", text: "小偷，閉上眼睛。", roles: ["pickpocket"], audio: "pickpocket-close.mp3", audioMs: 2299, holdMs: 3099 },
    { id: "gremlin-wake", text: "小魔怪，醒來。你可以交換其他兩位玩家的標記。", roles: ["gremlin"], audio: "gremlin-wake.mp3", audioMs: 7027, holdMs: 12027 },
    { id: "gremlin-close", text: "小魔怪，閉上眼睛。", roles: ["gremlin"], audio: "gremlin-close.mp3", audioMs: 2769, holdMs: 3569 },
    { id: "auraseer-wake", text: "循跡者，醒來。任何有動牌或看牌的人，豎起大拇指。", roles: ["auraseer"], audio: "auraseer-wake.mp3", audioMs: 7576, holdMs: 12576 },
    { id: "auraseer-thumbs", text: "所有人，收回大拇指。", roles: ["auraseer"], audio: "auraseer-thumbs.mp3", audioMs: 3030, holdMs: 4230 },
    { id: "auraseer-close", text: "循跡者，閉上眼睛。", roles: ["auraseer"], audio: "auraseer-close.mp3", audioMs: 2691, holdMs: 3491 },
    { id: "apptanner-wake", text: "見習皮匠，醒來。皮匠，豎起大拇指讓見習皮匠找到你。", roles: ["apptanner"], audio: "apptanner-wake.mp3", audioMs: 6949, holdMs: 11949 },
    { id: "apptanner-thumb", text: "皮匠，收回大拇指。", roles: ["apptanner"], audio: "tanner-thumb.mp3", audioMs: 2743, holdMs: 3943 },
    { id: "apptanner-close", text: "見習皮匠，閉上眼睛。", roles: ["apptanner"], audio: "apptanner-close.mp3", audioMs: 3004, holdMs: 3804 },
    { id: "oracle-wake", text: "先知，請睜眼。", roles: ["oracle"], audio: "oracle-wake.mp3", audioMs: 4284, holdMs: 9284 },
    { id: "oracle-close", text: "先知，請閉眼。", roles: ["oracle"], audio: "oracle-close.mp3", audioMs: 2377, holdMs: 3177 },
    { id: "alien-wake", text: "外星人們，醒來並找尋其他外星人。", roles: ["alien", "synthetic"], audio: "alien-wake.mp3", audioMs: 4780, holdMs: 9780 },
    { id: "alien-close", text: "外星人們，閉上眼睛。", roles: ["alien", "synthetic"], audio: "alien-close.mp3", audioMs: 2795, holdMs: 3595 },
    { id: "cow-fistout", text: "牛，伸出拳頭。如果至少一個外星人在牛旁邊，一個外星人必須碰牛的拳頭。", roles: ["cow"], audio: "cow-fistout.mp3", audioMs: 9796, holdMs: 14796 },
    { id: "cow-fistaway", text: "牛，收回拳頭。", roles: ["cow"], audio: "cow-fistaway.mp3", audioMs: 2168, holdMs: 3368 },
    { id: "groobzerb-wake", text: "古伯和澤伯，醒來並找尋彼此。", roles: ["groob", "zerb"], audio: "groobzerb-wake.mp3", audioMs: 4571, holdMs: 9571 },
    { id: "groobzerb-close", text: "古伯和澤伯，閉上眼睛。", roles: ["groob", "zerb"], audio: "groobzerb-close.mp3", audioMs: 3318, holdMs: 4118 },
    { id: "leader-wake", text: "領導，醒來。外星人們，豎起大拇指。", roles: ["leader"], audio: "leader-wake.mp3", audioMs: 4833, holdMs: 9833 },
    { id: "leader-zerbgroob", text: "澤伯和古伯，如果你們看到彼此，豎起大拇指。領導，如果你看到澤伯和古伯，只有他們活著你才會贏。", roles: ["leader"], audio: "leader-zerbgroob.mp3", audioMs: 12852, holdMs: 17852 },
    { id: "leader-close", text: "領導，閉上眼睛。外星人們，收回大拇指。", roles: ["leader"], audio: "leader-close.mp3", audioMs: 5094, holdMs: 5894 },
    { id: "nostradamus-wake", text: "占卜師，請睜眼。", roles: ["nostradamus"], audio: "nostradamus-wake.mp3", audioMs: 16483, holdMs: 21483 },
    { id: "nostradamus-close", text: "占卜師，請閉眼。", roles: ["nostradamus"], audio: "nostradamus-close.mp3", audioMs: 2691, holdMs: 3491 },
    { id: "psychic-wake", text: "靈媒，醒來。", roles: ["psychic"], audio: "psychic-wake.mp3", audioMs: 1907, holdMs: 6907 },
    { id: "psychic-close", text: "靈媒，閉上眼睛。", roles: ["psychic"], audio: "psychic-close.mp3", audioMs: 2273, holdMs: 3073 },
    { id: "rascal-wake", text: "小淘氣，醒來。", roles: ["rascal"], audio: "rascal-wake.mp3", audioMs: 2273, holdMs: 7273 },
    { id: "rascal-close", text: "小淘氣，閉上眼睛。", roles: ["rascal"], audio: "rascal-close.mp3", audioMs: 2821, holdMs: 3621 },
    { id: "exposer-wake", text: "曝光者，醒來。。。", roles: ["exposer"], audio: "exposer-wake.mp3", audioMs: 2142, holdMs: 7142 },
    { id: "exposer-close", text: "曝光者，閉上眼睛。", roles: ["exposer"], audio: "exposer-close.mp3", audioMs: 2638, holdMs: 3438 },
    { id: "empath-wake", text: "通靈者，醒來。", roles: ["empath"], audio: "empath-wake.mp3", audioMs: 2168, holdMs: 7168 },
    { id: "empath-close", text: "所有人，把手收回。通靈者，閉上眼睛。", roles: ["empath"], audio: "empath-close.mp3", audioMs: 5068, holdMs: 5868 },
    { id: "mortician-wake", text: "禮儀師，醒來。", roles: ["mortician"], audio: "mortician-wake.mp3", audioMs: 2168, holdMs: 7168 },
    { id: "mortician-close", text: "禮儀師，閉上眼睛。", roles: ["mortician"], audio: "mortician-close.mp3", audioMs: 2691, holdMs: 3491 },
    { id: "bodysnatcher-wake", text: "身體改造者，請睜眼。", roles: ["bodysnatcher"], audio: "bodysnatcher-wake.mp3", audioMs: 3318, holdMs: 8318 },
    { id: "bodysnatcher-close", text: "身體改造者，請閉眼。", roles: ["bodysnatcher"], audio: "bodysnatcher-close.mp3", audioMs: 3291, holdMs: 4091 },
    { id: "supervillains-wake", text: "惡棍們，請睜眼，確認同伴。", roles: ["mirrorman", "temptress", "drpeeker", "rapscallion", "henchman", "madscientist", "intern"], audio: "supervillains-wake.mp3", audioMs: 9430, holdMs: 14430 },
    { id: "mirrorman-wake", text: "鏡中人，請睜眼。看一張中央牌，你現在是那個角色。", roles: ["mirrorman"], audio: "mirrorman-wake.mp3", audioMs: 10501, holdMs: 15501 },
    { id: "mirrorman-close", text: "鏡中人，請閉眼。", roles: ["mirrorman"], audio: "mirrorman-close.mp3", audioMs: 2273, holdMs: 3073 },
    { id: "temptress-wake", text: "誘惑者，請睜眼。把新惡棍牌與一名非惡棍玩家的牌對調。", roles: ["temptress"], audio: "temptress-wake.mp3", audioMs: 10371, holdMs: 15371 },
    { id: "drpeeker-look", text: "偷看博士，你可以偷看一名其他玩家的牌。", roles: ["drpeeker"], audio: "drpeeker-look.mp3", audioMs: 6269, holdMs: 11269 },
    { id: "rapscallion-wake", text: "惡棍，你可以偷看一張中央牌。", roles: ["rapscallion"], audio: "rapscallion-wake.mp3", audioMs: 8098, holdMs: 13098 },
    { id: "evilometer-fist1", text: "邪惡測定器，伸出拳頭。若旁邊有惡棍，一名惡棍必須碰你的拳頭。", roles: ["evilometer"], audio: "evilometer-fistout-1.mp3", audioMs: 6374, holdMs: 11374 },
    { id: "evilometer-fist2", text: "若旁邊有惡棍，一名惡棍必須碰邪惡測定器的拳頭。", roles: ["evilometer"], audio: "evilometer-fistout-2.mp3", audioMs: 10266, holdMs: 15266 },
    { id: "evilometer-away", text: "邪惡測定器，收回拳頭。", roles: ["evilometer"], audio: "evilometer-fistaway.mp3", audioMs: 2664, holdMs: 3864 },
    { id: "intern-wake", text: "實習生，請睜眼。瘋狂科學家豎起大拇指。", roles: ["intern"], audio: "intern-wake-1.mp3", audioMs: 11572, holdMs: 16572 },
    { id: "intern-close", text: "實習生，請閉眼。", roles: ["intern"], audio: "intern-close.mp3", audioMs: 2247, holdMs: 3047 },
    { id: "annoyinglad-wake", text: "討人厭少年，請睜眼，拍打一名鄰座的肩膀。", roles: ["annoyinglad"], audio: "annoyinglad-wake.mp3", audioMs: 7549, holdMs: 12549 },
    { id: "annoyinglad-close", text: "討人厭少年，請閉眼。", roles: ["annoyinglad"], audio: "annoyinglad-close.mp3", audioMs: 4571, holdMs: 5371 },
    { id: "detector-wake", text: "探測者，請睜眼。你可以看一名玩家的牌，或看兩張中央牌。", roles: ["detector"], audio: "detector-wake.mp3", audioMs: 9509, holdMs: 14509 },
    { id: "detector-close", text: "探測者，請閉眼。", roles: ["detector"], audio: "detector-close.mp3", audioMs: 6792, holdMs: 7592 },
    { id: "roleretriever-wake", text: "角色回收者，請睜眼。你可以偷走一名玩家的牌，換成你原來的牌並觀看。", roles: ["roleretriever"], audio: "roleretriever-wake-1.mp3", audioMs: 10057, holdMs: 15057 },
    { id: "roleretriever-close", text: "角色回收者，請閉眼。", roles: ["roleretriever"], audio: "roleretriever-close.mp3", audioMs: 5904, holdMs: 6704 },
    { id: "voodoolou-wake", text: "巫毒盧，請睜眼。你可以看一張中央牌，並與一名玩家對調。", roles: ["voodoolou"], audio: "voodoolou-wake-1.mp3", audioMs: 7471, holdMs: 12471 },
    { id: "voodoolou-close", text: "巫毒盧，請閉眼。", roles: ["voodoolou"], audio: "voodoolou-close.mp3", audioMs: 2952, holdMs: 3752 },
    { id: "switcheroo-wake", text: "對調者，請睜眼。你可以對調兩名其他玩家的牌，不要看。", roles: ["switcheroo"], audio: "switcheroo-wake.mp3", audioMs: 8647, holdMs: 13647 },
    { id: "switcheroo-close", text: "對調者，請閉眼。", roles: ["switcheroo"], audio: "switcheroo-close.mp3", audioMs: 2299, holdMs: 3099 },
    { id: "selfawarenessgirl-wake", text: "自我意識女孩，請睜眼，看看你現在的牌。", roles: ["selfawarenessgirl"], audio: "selfawarenessgirl-wake.mp3", audioMs: 5721, holdMs: 10721 },
    { id: "selfawarenessgirl-close", text: "自我意識女孩，請閉眼。", roles: ["selfawarenessgirl"], audio: "selfawarenessgirl-close.mp3", audioMs: 5277, holdMs: 6077 },
    { id: "flipper-wake", text: "翻面者，請睜眼。你可以翻開一張牌；若不是英雄則蓋回。", roles: ["flipper"], audio: "flipper-wake.mp3", audioMs: 9378, holdMs: 14378 },
    { id: "flipper-close", text: "翻面者，請閉眼。", roles: ["flipper"], audio: "flipper-close.mp3", audioMs: 2064, holdMs: 2864 },
    { id: "supervillains-close", text: "惡棍們，請閉眼。", roles: ["mirrorman", "temptress", "drpeeker", "rapscallion", "henchman", "madscientist", "intern"], audio: "supervillains-close.mp3", audioMs: 4571, holdMs: 5371 },
    { id: "dawn", text: "所有人，醒來。", roles: [], audio: "everyone-wake.mp3", audioMs: 2168, holdMs: 2568 },
  ];
  function inPlay(game, roleId) {
    const ids = game && game.roleIdsInPlay;
    if (Array.isArray(ids)) return ids.indexOf(roleId) >= 0;
    return false;
  }

  function stepMatches(step, game) {
    if (step.skipIf && step.skipIf.some((id) => inPlay(game, id))) return false;
    if (step.require && step.require.length) {
      const ok = step.requireAny
        ? step.require.some((id) => inPlay(game, id))
        : step.require.every((id) => inPlay(game, id));
      if (!ok) return false;
    }
    if (!step.roles || !step.roles.length) return true;
    return step.roles.some((id) => inPlay(game, id));
  }

  function filterSteps(list, game) {
    return list.filter((step) => stepMatches(step, game));
  }

  function stepsFor(game) {
    const duskOn = !!(game && game.settings && game.settings.dusk);
    const out = [];
    if (duskOn) out.push.apply(out, filterSteps(DUSK, game));
    out.push.apply(out, filterSteps(NIGHT, game));
    return out.length
      ? out
      : [{ id: "dawn", text: "天亮了，開始討論。", roles: [], audio: "everyone-wake.mp3", audioMs: 2168, holdMs: 4000, wait: "audio" }];
  }

  function stepWait(step) {
    if (step && step.wait) return step.wait;
    const id = (step && step.id) || "";
    if (/-wake|-lone|fistout|-look$/.test(id)) return "action";
    return "audio";
  }

  function firstNightIndex(game) {
    const steps = stepsFor(game);
    const i = steps.findIndex((s) => s.id === "night-close");
    return i >= 0 ? i : 0;
  }

  global.WerewolfScript = { DUSK, NIGHT, stepsFor, firstNightIndex, stepWait };
})(typeof globalThis !== "undefined" ? globalThis : this);
