# -*- coding: utf-8 -*-
"""生成 EmbeddedFiles.cs：把扩展文件以 base64 内嵌进安装器 exe（单文件分发）。

用法: python tools/installer/generate_embedded.py [输出路径]
"""
import base64
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

FILES = [
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
]


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        ROOT, "tools", "installer", "_embedded", "EmbeddedFiles.cs"
    )
    version = json.load(open(os.path.join(ROOT, "manifest.json"), encoding="utf-8"))["version"]
    lines = [
        "// 自动生成文件，请勿手动修改。由 tools/installer/generate_embedded.py 生成。",
        "using System;",
        "using System.Collections.Generic;",
        "using System.IO;",
        "",
        "namespace BiliScreenshot",
        "{",
        "    internal static class EmbeddedFiles",
        "    {",
        '        public const string VERSION = "' + version + '";',
        "",
        "        private static readonly Dictionary<string, string> DATA =",
        "            new Dictionary<string, string>()",
        "            {",
    ]
    for rel in FILES:
        with open(os.path.join(ROOT, rel), "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        lines.append('                { "%s", "%s" },' % (rel.replace("\\", "/"), b64))
    lines += [
        "            };",
        "",
        "        public static void WriteAll(string destDir)",
        "        {",
        "            foreach (var kv in DATA)",
        "            {",
        "                string path = Path.Combine(destDir, kv.Key.Replace('/', Path.DirectorySeparatorChar));",
        "                string dir = Path.GetDirectoryName(path);",
        "                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);",
        "                File.WriteAllBytes(path, Convert.FromBase64String(kv.Value));",
        "            }",
        "        }",
        "    }",
        "}",
    ]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("generated %s (%d files, version %s)" % (out, len(FILES), version))


if __name__ == "__main__":
    main()
