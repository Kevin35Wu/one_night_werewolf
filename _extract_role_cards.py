# Extract role portraits from APK sprite sheets into img/roles/{id}.png
from PIL import Image
import os
import json

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "vendor", "apk-extract-app", "assets")
OUT = os.path.join(ROOT, "img", "roles")
os.makedirs(OUT, exist_ok=True)

# Visual order on each 5x5 sheet (row-major). None = skip (back/token/blank).
SHEETS = {
    "cards.png": [
        "sentinel",
        "doppelganger",
        "werewolf",
        "alphawolf",
        "mysticwolf",
        "minion",
        "mason",
        "seer",
        "appseer",
        "pi",
        "robber",
        "witch",
        "troublemaker",
        "vidiot",
        "drunk",
        "insomniac",
        "revealer",
        "curator",
        "villager",
        "hunter",
        "tanner",
        "dreamwolf",
        "bodyguard",
        None,  # card back
    ],
    "cards2.png": [
        "copycat",
        "vampire",
        "count",
        "master",
        "renfield",
        "diseased",
        "cupid",
        "instigator",
        "priest",
        "assassin",
        "appassassin",
        "marksman",
        "thing",
        "pickpocket",
        "squire",
        "auraseer",
        "gremlin",
        "apptanner",
        "beholder",
        "prince",
        "cursed",
        None,  # love token
        None,  # blank
    ],
    "cards3.png": [
        "oracle",
        "alien",
        "groob",
        "zerb",
        "cow",
        "synthetic",
        "bodysnatcher",
        "nostradamus",  # bonus pack 3 (Leader art not present on this sheet)
        "psychic",
        "rascal",
        "exposer",
        "empath",
        "mortician",
        "blob",
        None,  # unused robot art in APK sheet
    ],
    "cards4.png": [
        "mirrorman",
        "temptress",
        "drpeeker",
        "rapscallion",
        "henchman",
        "evilometer",
        "madscientist",
        "intern",
        "annoyinglad",
        "detector",
        "roleretriever",
        "voodoolou",
        "switcheroo",
        "selfawarenessgirl",
        "flipper",
        None,  # unused promo art
        "_cardback",  # wolf silhouette card back
        "familyman",
        "thesponge",
        "ricochetrhino",
        "innocentbystander",
        "windywendy",
        # defenderer not present on this sheet
    ],
}


def extract_sheet(filename, ids):
    path = os.path.join(ASSETS, filename)
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    cols = rows = 5
    cw, ch = w // cols, h // rows
    written = []
    for idx, role_id in enumerate(ids):
        if not role_id:
            continue
        r, c = divmod(idx, cols)
        if r >= rows:
            break
        cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
        bbox = cell.getbbox()
        if not bbox:
            print("empty", filename, idx, role_id)
            continue
        # keep a little padding around art
        pad = 8
        l = max(0, bbox[0] - pad)
        t = max(0, bbox[1] - pad)
        rr = min(cw, bbox[2] + pad)
        b = min(ch, bbox[3] + pad)
        portrait = cell.crop((l, t, rr, b))
        # normalize to square-ish card face for UI
        side = max(portrait.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        ox = (side - portrait.size[0]) // 2
        oy = (side - portrait.size[1]) // 2
        canvas.paste(portrait, (ox, oy), portrait)
        out_name = "cardback.png" if role_id == "_cardback" else role_id + ".png"
        out_path = os.path.join(OUT, out_name)
        canvas.save(out_path, "PNG")
        written.append(role_id)
    return written


# Also pull classic card back from cards.png last tile
def extract_cardback_fallback():
    path = os.path.join(ASSETS, "cards.png")
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    cw, ch = w // 5, h // 5
    # last occupied face before empty: index 23 is card back on cards.png
    idx = 23
    r, c = divmod(idx, 5)
    cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
    out = os.path.join(OUT, "cardback-classic.png")
    cell.save(out, "PNG")
    return out


all_written = []
for sheet, ids in SHEETS.items():
    got = extract_sheet(sheet, ids)
    print(sheet, len(got), got)
    all_written.extend(got)
extract_cardback_fallback()

# roles.js ids for coverage report
roles_js = open(os.path.join(ROOT, "js", "roles.js"), encoding="utf-8").read()
import re

role_ids = re.findall(r'role\("([a-z0-9]+)"', roles_js)
missing = [r for r in role_ids if r not in all_written]
extra = [r for r in all_written if r not in role_ids]
print("roles.js count", len(role_ids))
print("extracted", len(all_written))
print("missing", missing)
print("extra", extra)
json.dump(
    {"extracted": all_written, "missing": missing, "map": SHEETS},
    open(os.path.join(OUT, "_map.json"), "w", encoding="utf-8"),
    ensure_ascii=False,
    indent=2,
)
print("done ->", OUT)
