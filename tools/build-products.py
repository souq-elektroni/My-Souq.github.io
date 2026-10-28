#!/usr/bin/env python3
"""Builds products.json from products/*.md so the store loads every product in ONE request
(no GitHub API, no rate limit). Run automatically by .github/workflows/build-products.yml."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDIR = os.path.join(ROOT, "products")

files = []
for name in sorted(os.listdir(PDIR)):
    if not name.lower().endswith(".md"):
        continue
    with open(os.path.join(PDIR, name), "r", encoding="utf-8") as f:
        files.append({"name": name, "text": f.read()})

out = {"version": 1, "count": len(files), "files": files}
with open(os.path.join(ROOT, "products.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    f.write("\n")
print("products.json built:", len(files), "product file(s)")
