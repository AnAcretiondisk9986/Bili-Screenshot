# -*- coding: utf-8 -*-
"""生成扩展图标（纯标准库，无第三方依赖）。
图案：B 站蓝圆角方块 + 白色相机镜头（同心圆）。
用法: python tools/gen_icons.py
"""
import math
import os
import struct
import zlib

BG = (0x00, 0xA1, 0xD6)   # B 站蓝
FG = (255, 255, 255)      # 白色


def make_png(size, path):
    px = bytearray()
    cx = cy = (size - 1) / 2.0
    r_body = size * 0.44          # 圆角主体半径
    corner = size * 0.16          # 圆角
    r_lens = size * 0.20          # 镜头外圈
    r_dot = size * 0.08           # 镜头中心点
    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            # 圆角方块内判断
            qx = max(abs(dx) - (r_body - corner), 0.0)
            qy = max(abs(dy) - (r_body - corner), 0.0)
            in_body = (qx * qx + qy * qy) <= corner * corner
            if not in_body:
                px += bytes((0, 0, 0, 0))
                continue
            d = math.hypot(dx, dy)
            if d <= r_dot:
                px += bytes(BG + (255,))
            elif d <= r_lens:
                px += bytes(FG + (255,))
            else:
                px += bytes(BG + (255,))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(
        b"\x00" + px[y * size * 4:(y + 1) * size * 4] for y in range(size)
    )
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("generated", path, size, "x", size)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "icons")
    os.makedirs(out, exist_ok=True)
    for s in (16, 48, 128):
        make_png(s, os.path.join(out, "icon%d.png" % s))
