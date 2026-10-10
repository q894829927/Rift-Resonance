#!/usr/bin/env python3
"""Import the author-provided Kaishido Dark World v1.0 ZIP without changing pixels.

Usage:
  python tools/art/import_dark_world.py "/path/to/Dark World - Free Asset Pack - v1.0.zip"

The archive has 20 PNGs and no LICENSE file; provenance is the author's CC0
page https://kaishido.itch.io/dark-world (license checked 2026-10-10).
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
import sys

DEST = Path("apps/client/public/assets/vendor/kaishido/dark-world-v1")
SOURCE_URL = "https://kaishido.itch.io/dark-world"
EXPECTED = {
    "Character/character_sheet.png": (128, 192),
    "Environment/mushrooms.png": (80, 64),
    "Environment/rock.png": (48, 32),
    "Environment/tileset.png": (80, 48),
    "Environment/tree.png": (80, 96),
    "Inventory/inventory_bag_frame.png": (214, 171),
    "Inventory/inventory_item_apple.png": (12, 12),
    "Inventory/inventory_item_berries.png": (36, 34),
    "Inventory/inventory_item_leaves.png": (12, 12),
    "Inventory/inventory_item_mushroom.png": (51, 35),
    "Inventory/inventory_item_nectar_large.png": (11, 31),
    "Inventory/inventory_item_nectar_small.png": (12, 12),
    "Inventory/inventory_item_orb.png": (35, 35),
    "Inventory/inventory_layout_single_slot.png": (20, 20),
    "Inventory/inventory_slot_1x1.png": (20, 20),
    "Inventory/inventory_slot_1x2.png": (20, 43),
    "Inventory/inventory_slot_2x2.png": (43, 43),
    "Inventory/inventory_slot_elbow.png": (43, 43),
    "Inventory/inventory_slot_layout.png": (158, 112),
    "Inventory/inventory_slot_mushroom.png": (66, 43),
}
MAGIC = b"\x89PNG\r\n\x1a\n"


def main(archive_path: str) -> None:
    path = Path(archive_path)
    if not path.is_file():
        raise SystemExit("Input ZIP not found: " + str(path))
    imported = []
    with ZipFile(path) as archive:
        entries = {}
        for member in archive.infolist():
            if member.is_dir() or not member.filename.lower().endswith(".png"):
                continue
            parts = member.filename.replace("\\", "/").split("/")
            if ".." in parts or any(not p for p in parts):
                raise ValueError("Unsafe ZIP path")
            rel = "/".join(parts[1:])
            if rel in entries:
                raise ValueError("Duplicate asset: " + rel)
            if rel not in EXPECTED:
                raise ValueError("Unexpected asset, verify original ZIP: " + rel)
            entries[rel] = member
        if set(entries) != set(EXPECTED):
            missing = sorted(set(EXPECTED) - set(entries))
            raise ValueError("Wrong Dark World pack (missing): " + str(missing))
        for rel in sorted(entries):
            data = archive.read(entries[rel])
            width = int.from_bytes(data[16:20], "big") if len(data) >= 24 else 0
            height = int.from_bytes(data[20:24], "big") if len(data) >= 24 else 0
            if not data.startswith(MAGIC) or (width, height) != EXPECTED[rel]:
                raise ValueError("Invalid PNG or dimensions: " + rel)
            if len(data) > 2 * 1024 * 1024:
                raise ValueError("Unexpected large asset: " + rel)
            target = DEST / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            imported.append({
                "path": target.as_posix(),
                "width": width, "height": height,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            })
    manifest = {
        "package": "Kaishido Dark World - Free Asset Pack v1.0",
        "source": SOURCE_URL,
        "license": "CC0-1.0",
        "redistribution": "allowed",
        "original_archive_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "asset_count": len(imported),
        "assets": imported,
    }
    (DEST / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Imported", len(imported), "PNG assets to", DEST)
    print("Generated", DEST / "manifest.json")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python tools/art/import_dark_world.py <original-zip-path>")
    main(sys.argv[1])
