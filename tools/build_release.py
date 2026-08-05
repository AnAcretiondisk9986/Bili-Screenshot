# -*- coding: utf-8 -*-
"""打包 Chrome Web Store / Edge Add-ons 发布用 zip。

用法: python tools/build_release.py [版本号]
产物: release/bili-screenshot-<version>.zip（zip 根目录直接包含 manifest.json）
"""
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 发布包包含的文件（相对项目根）
INCLUDE = [
    "manifest.json",
    "background.js",
    "content.js",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "options/options.html",
    "options/options.css",
    "options/options.js",
    "popup/popup.html",
    "popup/popup.css",
    "popup/popup.js",
    "README.md",
]

def main():
    version = sys.argv[1] if len(sys.argv) > 1 else json.load(
        open(os.path.join(ROOT, "manifest.json"), encoding="utf-8")
    )["version"]
    out_dir = os.path.join(ROOT, "release")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "bili-screenshot-%s.zip" % version)

    missing = [p for p in INCLUDE if not os.path.exists(os.path.join(ROOT, p))]
    if missing:
        print("缺少文件:", ", ".join(missing))
        sys.exit(1)

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in INCLUDE:
            zf.write(os.path.join(ROOT, p), p)
            print("  +", p)
    print("打包完成:", out_path, "(%d 字节)" % os.path.getsize(out_path))


if __name__ == "__main__":
    main()
