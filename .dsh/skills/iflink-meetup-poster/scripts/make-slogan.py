#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
make-slogan.py — 生成规范版 slogan 条（大写 Dots、无句号、透明底）

背景：品牌库里的 `IF.Link-slogan-light.png` 写的是「Link the IFs, Connect the dots.」
（小写 dots + 句号），与《Logo 字重与大小写规则》和定稿海报不一致。
以**规范文档 + 定稿**为准：`Link the IFs, Connect the Dots`。
本脚本用同一句话重新生成一张标准图，供投喂与贴牌使用。

用法：
    python scripts/make-slogan.py                      # 写入 assets/reference/
    python scripts/make-slogan.py --out build/slogan.png
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANONICAL = "Link the IFs, Connect the Dots"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fonts import latin_font


def load_font(size):
    font, path = latin_font(size)
    return font, os.path.basename(path)


def main():
    ap = argparse.ArgumentParser(description="生成规范版 slogan 图")
    ap.add_argument("--text", default=CANONICAL)
    ap.add_argument("--height", type=int, default=192)
    ap.add_argument("--color", default="#242021")
    ap.add_argument("--out", default=os.path.join(SKILL_ROOT, "assets", "reference", "IF.Link-slogan.png"))
    args = ap.parse_args()

    font_size = int(args.height * 1.02)
    font, font_name = load_font(font_size)
    probe = Image.new("RGBA", (10, 10))
    d = ImageDraw.Draw(probe)
    box = d.textbbox((0, 0), args.text, font=font)
    w = int((box[2] - box[0]) * 1.06) + 24   # 留一点字距
    h = args.height

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    rgb = tuple(int(args.color[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    draw.text((12 - box[0], (h - (box[3] - box[1])) // 2 - box[1]), args.text, font=font, fill=rgb)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    img.save(args.out, "PNG")
    print(f"✅ 已生成 {args.out}")
    print(f"   文案：{args.text}")
    print(f"   尺寸：{w}×{h}｜字体：{font_name}")
    print("   注意：这是**规范版**（大写 Dots、无句号），不是品牌库那张小写 dots. 的旧图")


if __name__ == "__main__":
    main()
