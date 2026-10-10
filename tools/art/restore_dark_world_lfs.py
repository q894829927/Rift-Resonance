#!/usr/bin/env python3
"""Restore byte-identical original Dark World PNGs from temporary base64 transit.
A run only completes if all 20 source-file SHA256 hashes match.
Do not resize, optimize, modify or re-encode the source artwork.
"""
from pathlib import Path
import base64, hashlib, json

ROOT=Path("apps/client/public/assets/vendor/kaishido/dark-world-v1")
TRANSIT=Path(".github/asset-bootstrap")
EXPECTED={
"Character/character_sheet.png":"3e60e7287f64b5b0f55abfbfb3c712c8e27bb347f6516df03b7a91554d2ba63c",
"Environment/mushrooms.png":"8f75e77512f7c1ce2338938c20671a7684ebc5e73ea9b89fb71938121d7fe523",
"Environment/rock.png":"a9a9458305c8338d1646850c79ffc72c7ea5fac02b2d191047bbd2711507fc5d",
"Environment/tileset.png":"0ee52697209b6d5a5c725e6d2a0cf60b3de4f89b1834d9dde6e7133d71e5eb19",
"Environment/tree.png":"980812060e1f786bc3b617a2c7635ef0595b3c6c24558a06ac173fec19153614",
"Inventory/inventory_bag_frame.png":"503435a1dc43487146c5201027ef977ff2ecad3d6cd8b082dd608905e72f4a42",
"Inventory/inventory_item_apple.png":"7bfa064fab0455432645e28c47662875c83ac03f77891d12d07bd1ab87ea0fe5",
"Inventory/inventory_item_berries.png":"abed033348487da2983cc6f964811d90e61f9f15489c1fbeeb91f92b3aeeadfa",
"Inventory/inventory_item_leaves.png":"accf83045f6ec9b99997318dffa6a17cc39188fc75bc0bc408be9b8c8ed07cb7",
"Inventory/inventory_item_mushroom.png":"1e377055daac98126f92783dd20874a9d201c6c3e3108f0ddee391502c72ac8c",
"Inventory/inventory_item_nectar_large.png":"a8b4a5aa5554c47ffcd82cbb6a86ef323193d03b6e0d53a6dfeca247a4579c38",
"Inventory/inventory_item_nectar_small.png":"823e1a0565d7c3522fb41459bf9a80f7852a8530a841545452a36fa4e5854dc1",
"Inventory/inventory_item_orb.png":"1f3d26f46d369641ba8ca9d3f3642742d2d91520f03c5455dabeecccde76dbbf",
"Inventory/inventory_layout_single_slot.png":"6e524012239a1c7177eb2abd916a5a5e5e7ffe466566dfe75e598713a6b5453f",
"Inventory/inventory_slot_1x1.png":"91843fda0b1439a120901b1789e0f19662268840c22fe35faeaec2c7e28041de",
"Inventory/inventory_slot_1x2.png":"6551e9678415194a8344ccf238906c36f735cd381fd92cb33673bbec02a46931",
"Inventory/inventory_slot_2x2.png":"f0f4907be78ab35366dbbc1a206c22f3805bf61859699a6b4f3af1303645c8a5",
"Inventory/inventory_slot_elbow.png":"bec00a978ba56260131616bd387f03639abecd2d53fa20174fd83aba9e781b49",
"Inventory/inventory_slot_layout.png":"c2c7ce6cd93a0cbcb0e65008b9bf3fc9ca49bd97a13b3323c20b08ba350fa1bf",
"Inventory/inventory_slot_mushroom.png":"1c66e6eeb72a6af3498e765ffdb24d74943bc4b19a44a79d9c583fe77d734abb"
}
def main():
    files={}
    for part in range(1,5):
        for line in (TRANSIT/f"dark-world-{part:02}.b64.txt").read_text().splitlines():
            path,payload=line.split("\t",1)
            if path in files or path not in EXPECTED or path.startswith("/") or ".." in Path(path).parts:
                raise ValueError("Unexpected asset: "+path)
            data=base64.b64decode(payload,validate=True)
            if not data.startswith(bytes.fromhex("89504e470d0a1a0a")):
                raise ValueError("Invalid PNG: "+path)
            if hashlib.sha256(data).hexdigest()!=EXPECTED[path]:
                raise ValueError("SHA mismatch: "+path)
            files[path]=data
    if set(files)!=set(EXPECTED):
        raise ValueError("Missing or extra files "+str(set(EXPECTED)^set(files)))
    manifest=[]
    for path,data in sorted(files.items()):
        output=ROOT/path
        output.parent.mkdir(parents=True,exist_ok=True)
        output.write_bytes(data)
        manifest.append({"path":str(output),"size":len(data),"sha256":EXPECTED[path]})
    (ROOT/"manifest.json").write_text(json.dumps({
       "name":"Kaishido Dark World Free Asset Pack v1.0",
       "license":"CC0-1.0",
       "source":"https://kaishido.itch.io/dark-world",
       "note":"byte-identical originals; tracked with Git LFS",
       "png_count":len(files),"files":manifest
    },indent=2,ensure_ascii=False)+"\n")
    print("RESTORED",len(files),"byte-identical original PNGs")
if __name__=="__main__":main()
