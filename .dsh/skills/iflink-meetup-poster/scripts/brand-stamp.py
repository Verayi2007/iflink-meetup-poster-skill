#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
brand-stamp.py — 出图后把官方 Logo / Slogan 贴回去（品牌资产零误差）

生图模型画不准 Logo：字重、字距、比例总会偏。做法是**不让它画**——
盖掉它画的那块，再用官方文件贴上去。

用法：
    python scripts/brand-stamp.py build/out/poster.png --out build/out/poster-branded.png
    python scripts/brand-stamp.py 成图.png --logo 深色            # 强制用深色背景版
    python scripts/brand-stamp.py 成图.png --no-slogan            # 只贴 Logo

默认行为：
    · 按左上角背景亮度自动选 Logo 版本（浅底用黑字版，深底用白字版）
    · 用画面底色盖掉模型画的 Logo / slogan 区域
    · 贴官方 PNG，尺寸与定稿同比例（Logo 高 = 画布高 2.16%，slogan 宽 = 画布宽 35.4%）
"""

import argparse
import os
import sys
from collections import Counter

from PIL import Image

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(SKILL_ROOT, "assets", "reference")

# 定稿实测比例（1024×1536）：Logo 高 33px / 边距 54px / slogan 宽 363px / 右边界 971px
RATIO = {
    "logo_h": 33 / 1536,
    "margin_x": 54 / 1024,
    "logo_y": 40 / 1536,
    "slogan_w": 363 / 1024,
    "right": 971 / 1024,
}


def background_color(img, band_h=None):
    """取顶部横带里出现最多的浅色，作为画布底色"""
    w, h = img.size
    band_h = band_h or max(40, int(h * 0.05))
    crop = img.crop((0, 0, w, band_h)).convert("RGB")
    small = crop.resize((min(w, 400), max(1, int(band_h / 4))), Image.LANCZOS)
    counter = Counter(small.getdata())
    for color, _ in counter.most_common(20):
        r, g, b = color
        if r > 200 and g > 200 and b > 190:      # 奶油白一类
            return color
    return counter.most_common(1)[0][0]


def scaled_size(asset_path, target_h=None, target_w=None):
    """只算尺寸，不贴图"""
    asset = Image.open(asset_path).convert("RGBA")
    aw, ah = asset.size
    scale = (target_w / aw) if target_w else (target_h / ah)
    return max(1, int(aw * scale)), max(1, int(ah * scale))


def paste_scaled(canvas, asset_path, target_h=None, target_w=None, xy=None):
    asset = Image.open(asset_path).convert("RGBA")
    aw, ah = asset.size
    if target_w:
        scale = target_w / aw
    else:
        scale = target_h / ah
    nw, nh = max(1, int(aw * scale)), max(1, int(ah * scale))
    asset = asset.resize((nw, nh), Image.LANCZOS)
    x, y = xy
    canvas.alpha_composite(asset, (int(x), int(y)))
    return nw, nh


def main():
    ap = argparse.ArgumentParser(description="贴官方 Logo / Slogan")
    ap.add_argument("image")
    ap.add_argument("--out", default=None)
    ap.add_argument("--logo", choices=["auto", "浅色", "深色"], default="auto",
                    help="浅色=黑字版（用于奶油白底），深色=白字版（用于黑底）")
    ap.add_argument("--no-slogan", action="store_true")
    ap.add_argument("--no-erase", action="store_true", help="不盖掉模型画的 Logo（调试用）")
    ap.add_argument("--slogan-text", default="Link the IFs, Connect the Dots", help="slogan 文案（默认按规范：IFs 复数、Dots 大写）")
    ap.add_argument("--slogan-text-mode", action="store_true", help="不用 PNG，改为用字体绘制 slogan")
    args = ap.parse_args()

    src = Image.open(args.image).convert("RGBA")
    w, h = src.size
    bg = background_color(src)
    bright = sum(bg) / 3

    variant = args.logo
    if variant == "auto":
        variant = "浅色" if bright > 140 else "深色"
    logo_path = os.path.join(REF, "IF.Link_浅色背景.png" if variant == "浅色" else "IF.Link_深色背景.png")
    if not os.path.exists(logo_path):
        # 兼容素材只在品牌库里的情况
        alt = os.path.join(SKILL_ROOT, "..", "..", "..", "logo&slogan", "02_IF.Link_Logo_PNG")
        cand = os.path.join(alt, f"IF.Link_{'浅色' if variant == '浅色' else '深色'}背景.png")
        if os.path.exists(cand):
            logo_path = cand
        else:
            print(f"✖ 找不到 Logo 文件：{logo_path}", file=sys.stderr)
            sys.exit(2)
    slogan_path = os.path.join(REF, "IF.Link-slogan.png")

    logo_h = int(h * RATIO["logo_h"])
    mx = int(w * RATIO["margin_x"])
    ly = int(h * RATIO["logo_y"])
    slogan_w = int(w * RATIO["slogan_w"])
    right = int(w * RATIO["right"])

    # 1) 盖掉模型画的品牌区
    if not args.no_erase:
        # 整条页眉带全部盖掉：模型画的 Logo、slogan、下划线、虚线一律清除
        band_bottom = ly + logo_h + int(h * 0.016)
        Image.Image.paste(src, Image.new("RGB", (w, band_bottom), bg), (0, 0))

    # 2) 贴 Logo
    lw, lh = paste_scaled(src, logo_path, target_h=logo_h, xy=(mx, ly))

    # 3) slogan
    sw = sh = 0
    if not args.no_slogan:
        if not args.slogan_text_mode and os.path.exists(slogan_path):
            sw, sh = scaled_size(slogan_path, target_w=slogan_w)
            sx, sy = right - sw, ly + (lh - sh) // 2
            paste_scaled(src, slogan_path, target_w=slogan_w, xy=(sx, sy))
        else:
            from PIL import ImageDraw
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from fonts import latin_font
            fsize = int(h * 0.0195)
            font, _ = latin_font(fsize)
            d = ImageDraw.Draw(src)
            txt = args.slogan_text
            box = d.textbbox((0, 0), txt, font=font)
            sw, sh = box[2] - box[0], box[3] - box[1]
            sx = right - sw
            sy = ly + (lh - sh) // 2 - box[1]
            d.text((sx, sy), txt, font=font, fill=(36, 32, 33, 255))

    out = args.out or os.path.splitext(args.image)[0] + "-branded.png"
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    src.convert("RGB").save(out, "PNG")

    print(f"✅ 已贴品牌资产：{out}")
    print(f"   画布 {w}×{h}｜底色 #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}｜Logo 版本：{variant}（{lw}×{lh} @ {mx},{ly}）")
    if sw:
        print(f"   Slogan：{sw}×{sh} @ {sx},{sy}（右边界 {right}）")
    if args.no_erase:
        print("   ⚠️ 已按 --no-erase 跳过遮盖，模型画的旧 Logo 会残留")
    print("   下一步：python scripts/check-palette.py " + out + " --debug")


if __name__ == "__main__":
    main()
