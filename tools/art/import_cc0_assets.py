#!/usr/bin/env python3
"""Bulk import M1 CC0 assets. Designed for the M1 GitHub Actions runner."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path, PurePosixPath
from urllib.request import Request, urlopen
from urllib.parse import quote
import io
import json
import os
import zipfile

REPO = "shorepine/kenney"
REV = "3694c6879e487c108f55677be7dd2ca75b07cc3b"
ROOT = Path("apps/client/public/assets/vendor/kenney")
DOCS = Path("docs/art")
PNG_MAGIC = bytes.fromhex("89504e470d0a1a0a")
MAX_PNG = 2 * 1024 * 1024
PACKS = [
    ("ui-pack-adventure", "ui/UI Pack - Adventure",
     "5e161b772644e90c154c8dc42d17f7a26eafebd8",
     "https://kenney.nl/assets/ui-pack-adventure"),
    ("particle-pack", "2d/Particle Pack",
     "d0a6f8a392d903625a42a536accc9d694454a5f4",
     "https://kenney.nl/assets/particle-pack"),
    ("smoke-particles", "2d/Smoke Particles",
     "3a24ae50597ba6aa2029c1dac9f36e1fc4e592fa",
     "https://kenney.nl/assets/smoke-particles"),
]
PIXEL_UI_URL = "https://opengameart.org/sites/default/files/PixelUIpack.zip"

def fetch(url, api=False):
    headers = {"User-Agent": "Rift-Resonance-M1-CC0-import/1.0"}
    if api:
        headers["Accept"] = "application/vnd.github+json"
        token = os.environ.get("GH_TOKEN")
        if token:
            headers["Authorization"] = "Bearer " + token
    with urlopen(Request(url, headers=headers), timeout=75) as resp:
        return resp.read()

def save(rel, payload):
    dest = ROOT / rel
    if len(payload) > MAX_PNG or not payload.startswith(PNG_MAGIC):
        raise ValueError("Invalid/oversized PNG, possibly LFS pointer: " + str(rel))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(payload)
    return {"path": dest.as_posix(), "bytes": len(payload),
            "sha256": sha256(payload).hexdigest()}

def mirror_import(name, source, sha, official):
    url = "https://api.github.com/repos/" + REPO + "/git/trees/" + sha + "?recursive=1"
    tree = json.loads(fetch(url, api=True))
    if tree.get("truncated"):
        raise ValueError("Truncated upstream tree")
    nodes = []
    for item in tree["tree"]:
        path = item["path"]
        if item["type"] != "blob" or not path.lower().endswith(".png"):
            continue
        if name == "ui-pack-adventure" and "/" in path:
            continue  # use original-size originals, omit 2x duplicates
        if name == "particle-pack" and (
            not path.startswith("PNG (Transparent)/") or "/Rotated/" in path
        ):
            continue
        nodes.append(item)
    if not nodes or len(nodes) > 300:
        raise ValueError("Unexpected upstream PNG count: " + str(len(nodes)))
    print("Fetching", name, len(nodes), "PNGs", flush=True)
    def transfer(item):
        path = item["path"]
        relative = path
        if name == "particle-pack":
            relative = path[len("PNG (Transparent)/"):]
        sub = PurePosixPath(relative)
        if ".." in sub.parts or sub.is_absolute():
            raise ValueError("Unsafe file path")
        url = ("https://raw.githubusercontent.com/" + REPO + "/" + REV + "/"
               + quote(source + "/" + path, safe="/"))
        return save(Path(name) / "png" / Path(*sub.parts), fetch(url))
    with ThreadPoolExecutor(max_workers=8) as pool:
        files = list(pool.map(transfer, nodes))
    return {"name": name, "official": official, "source_repo": REPO,
            "source_commit": REV, "source_path": source,
            "png_count": len(files), "files": sorted(files, key=lambda x:x["path"])}

def pixel_ui_import():
    payload = fetch(PIXEL_UI_URL)
    if len(payload) > 5_000_000:
        raise ValueError("Archive is unexpectedly large")
    files = []
    with zipfile.ZipFile(io.BytesIO(payload)) as arc:
        for info in arc.infolist():
            if info.is_dir() or not info.filename.lower().endswith(".png"):
                continue
            name = PurePosixPath(info.filename.replace("\\", "/"))
            if (name.is_absolute() or ".." in name.parts
                    or info.file_size > MAX_PNG):
                raise ValueError("Unsafe archive member: " + info.filename)
            files.append(save(Path("pixel-ui-pack") / "png" /
                              Path(*name.parts), arc.read(info)))
    if not files:
        raise ValueError("Empty Pixel UI archive")
    return {"name": "pixel-ui-pack",
            "official": "https://kenney.nl/assets/pixel-ui-pack",
            "source_url": PIXEL_UI_URL, "png_count": len(files),
            "files": sorted(files, key=lambda x:x["path"])}

def manifests(packs, errors):
    DOCS.mkdir(parents=True, exist_ok=True)
    manifest = {"schema": 1, "license": "CC0-1.0", "redistributable": True,
                "mirror_commit": REV, "packs": packs, "errors": errors}
    (DOCS / "CC0-IMPORT-REPORT.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8")
    lines = [
        "# M1 免费 CC0 素材来源登记",
        "",
        "已导入的资源为原始 PNG，尚未代表最终场景、美术统一或动画验收。",
        "",
        "| Pack | Official source | PNG imported | Public redistribution |",
        "|---|---|---:|---|",
        "| Tiny Dungeon | https://kenney.nl/assets/tiny-dungeon | 132 | CC0 |",
    ]
    for pack in packs:
        lines.append("| " + pack["name"] + " | " + pack["official"] + " | " +
                     str(pack["png_count"]) + " | CC0 |")
    for err in errors:
        lines.append("| " + err["name"] + " | " + err["official"] +
                     " | 0 (failed) | source page CC0 |")
    lines.extend([
        "| Kaishido Dark World | https://kaishido.itch.io/dark-world "
        "| 0 (pending original download) | source page CC0 |",
        "",
        "Kenney fixed mirror: https://github.com/" + REPO + "/tree/" + REV,
        "",
        "Pixel UI original publication: "
        "https://opengameart.org/content/pixel-ui-pack-750-assets",
        "",
        "CC0 license: https://creativecommons.org/publicdomain/zero/1.0/",
        "",
        "All imported files have SHA-256 hashes in CC0-IMPORT-REPORT.json.",
        "",
        "The Pixel_Poem animated character pack is reference-only: it is "
        "NOT distributed in this public repository.",
        "",
        "AI-generated work is not included in this import.",
    ])
    (DOCS / "ASSET-SOURCES.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8")

def main():
    packs, errors = [], []
    for name, src, sha, official in PACKS:
        try:
            pack = mirror_import(name, src, sha, official)
            packs.append(pack)
            print("OK:", name, pack["png_count"], flush=True)
        except Exception as ex:
            errors.append({"name": name, "official": official,
                           "error": str(ex)})
            print("FAILED:", name, repr(ex), flush=True)
    try:
        pack = pixel_ui_import()
        packs.append(pack)
        print("OK: pixel-ui-pack", pack["png_count"], flush=True)
    except Exception as ex:
        errors.append({"name": "pixel-ui-pack",
                       "official": "https://kenney.nl/assets/pixel-ui-pack",
                       "error": str(ex)})
        print("FAILED: pixel-ui-pack", repr(ex), flush=True)
    manifests(packs, errors)
    if not packs:
        raise SystemExit("All asset downloads failed, not committing")
    print("SUMMARY:", [(p["name"], p["png_count"]) for p in packs])
    print("ERRORS:", errors)

if __name__ == "__main__":
    main()
