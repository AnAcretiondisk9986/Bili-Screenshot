# -*- coding: utf-8 -*-
"""打包 Chrome Web Store / Edge Add-ons 发布用 zip（可选同时输出未压缩文件夹）。

用法:
  python tools/build_release.py [版本号]           # 只输出 zip
  python tools/build_release.py [版本号] --dir     # zip + 未压缩文件夹

产物:
  release/bili-screenshot-<version>.zip        （zip 根目录直接包含 manifest.json）
  release/bili-screenshot-<version>/           （--dir 时额外输出，便于本地加载/部署）
"""
import argparse
import json
import os
import shutil
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
    "history/history.html",
    "history/history.css",
    "history/history.js",
    "README.md",
]


def build_zip(version, out_dir):
    out_path = os.path.join(out_dir, "bili-screenshot-%s.zip" % version)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in INCLUDE:
            zf.write(os.path.join(ROOT, p), p)
            print("  +", p)
    print("打包完成:", out_path, "(%d 字节)" % os.path.getsize(out_path))
    return out_path


def build_dir(version, out_dir):
    out_path = os.path.join(out_dir, "bili-screenshot-%s" % version)
    if os.path.exists(out_path):
        shutil.rmtree(out_path)
    os.makedirs(out_path)
    for p in INCLUDE:
        src = os.path.join(ROOT, p)
        dst = os.path.join(out_path, p)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        print("  +", p)
    print("文件夹输出:", out_path)
    return out_path


def main():
    parser = argparse.ArgumentParser(description="打包 Bili Screenshot 发布产物")
    parser.add_argument("version", nargs="?", help="版本号（缺省读 manifest.json）")
    parser.add_argument("--dir", action="store_true", help="同时输出未压缩的发布文件夹")
    args = parser.parse_args()

    version = args.version or json.load(
        open(os.path.join(ROOT, "manifest.json"), encoding="utf-8")
    )["version"]

    out_dir = os.path.join(ROOT, "release")
    os.makedirs(out_dir, exist_ok=True)

    missing = [p for p in INCLUDE if not os.path.exists(os.path.join(ROOT, p))]
    if missing:
        print("缺少文件:", ", ".join(missing))
        sys.exit(1)

    build_zip(version, out_dir)
    if args.dir:
        build_dir(version, out_dir)


if __name__ == "__main__":
    main()
