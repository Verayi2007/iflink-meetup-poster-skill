#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
make-readme-assets.py — 生成 README 用的品牌图

输出到 docs/：
    banner.png    1280×420   首屏横幅
    pipeline.png  1280×300   流程图
    gates.png     1280×260   六道闸门

用法：python tools/make-readme-assets.py
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs")

CREAM = (246, 246, 241)
INK = (36, 32, 33)
GREEN = (177, 250, 99)
MUTED = (107, 103, 95)
LINE = (220, 239, 192)
ORANGE = (254, 119, 51)
PURPLE = (178, 161, 255)

FONT_BOLD = ["C:/Windows/Fonts/msyhbd.ttc", "/System/Library/Fonts/PingFang.ttc"]
FONT_LATIN = ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]
FONT_REG = ["C:/Windows/Fonts/msyh.ttc", "/System/Library/Fonts/PingFang.ttc"]


def load(cands, size):
    for p in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def tw(d, s, f):
    b = d.textbbox((0, 0), s, font=f)
    return b[2] - b[0]


def rounded(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def grain(img, amount=6):
    """轻微颗粒，避免大色块太平"""
    import random

    px = img.load()
    w, h = img.size
    random.seed(42)
    for _ in range(w * h // 90):
        x, y = random.randrange(w), random.randrange(h)
        r, g, b = px[x, y]
        k = random.randint(-amount, amount)
        px[x, y] = (max(0, min(255, r + k)), max(0, min(255, g + k)), max(0, min(255, b + k)))


def banner():
    W, H = 1280, 420
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)

    # 点阵底纹
    for gx in range(0, W, 26):
        for gy in range(0, H, 26):
            d.point((gx, gy), fill=(228, 228, 218))

    # 右下角淡绿斜块，做一点层次
    d.polygon([(W - 520, H), (W, H - 210), (W, H)], fill=(238, 246, 226))

    f_label = load(FONT_LATIN, 22)
    f_title = load(FONT_BOLD, 86)
    f_sub = load(FONT_REG, 27)
    f_meta = load(FONT_REG, 20)

    d.text((70, 62), "IF.LINK  ·  POSTER TOOLING", font=f_label, fill=MUTED)

    # 标题：文字 + 绿色块衬底
    title = "Meetup 海报 Skill"
    bx, by, bh = 66, 104, 104
    d.rectangle([bx, by, bx + tw(d, title, f_title) + 44, by + bh], fill=GREEN)
    d.text((bx + 22, by + 8), title, font=f_title, fill=INK)

    d.text((70, 240), "把一场活动，变成一张能发的海报。", font=f_sub, fill=INK)
    d.text((70, 282), "Lock the look. Free the layout. Ship the poster.", font=f_meta, fill=MUTED)

    # 版本标签
    f_pill = load(FONT_LATIN, 18)
    pill = "v2.0.0   ·   MIT   ·   Node 18+   ·   Win / macOS / Linux"
    pw = tw(d, pill, f_pill) + 44
    rounded(d, [70, 320, 70 + pw, 358], 19, fill=None, outline=INK, width=2)
    d.text((92, 329), pill, font=f_pill, fill=INK)

    # 色板：右上角五块小方
    chips = [CREAM, INK, GREEN, ORANGE, PURPLE]
    cx0 = W - 84 - len(chips) * 30
    for i, rgb in enumerate(chips):
        rounded(d, [cx0 + i * 30, 56, cx0 + i * 30 + 22, 78], 5, fill=rgb, outline=INK, width=2)

    # 右侧：定稿缩略图（微旋转 + 投影）
    poster_path = os.path.join(ROOT, "最终版海报.png")
    if os.path.exists(poster_path):
        p = Image.open(poster_path).convert("RGB")
        ph = 300
        pw = int(p.width * ph / p.height)
        p = p.resize((pw, ph), Image.LANCZOS)
        frame = Image.new("RGB", (pw + 16, ph + 16), CREAM)
        ImageDraw.Draw(frame).rectangle([0, 0, pw + 15, ph + 15], outline=INK, width=3)
        frame.paste(p, (8, 8))
        rotated = frame.rotate(2.2, expand=True, fillcolor=CREAM, resample=Image.BICUBIC)
        px0 = W - rotated.width - 70
        py0 = (H - rotated.height) // 2 - 4
        img.paste(rotated, (px0, py0))

    grain(img)
    return img


def pipeline():
    W, H = 1280, 300
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    f_step = load(FONT_BOLD, 24)
    f_lab = load(FONT_REG, 17)
    f_no = load(FONT_LATIN, 18)

    steps = [
        ("01", "说清活动", "6 项信息\nagent 引导"),
        ("02", "规格校验", "22 个错误码\n不过不出包"),
        ("03", "生成投喂包", "桌面 + HTML\n一键复制"),
        ("04", "Image 2", "一次 3 版排法\n挑一版"),
        ("05", "贴牌 & 验色", "官方 Logo\n三色占比"),
    ]
    n = len(steps)
    gap = 26
    bw = (W - 2 * 60 - gap * (n - 1)) // n
    bh = 132
    y = 96

    for i, (no, name, desc) in enumerate(steps):
        x = 60 + i * (bw + gap)
        filled = i in (2, 4)
        rounded(d, [x, y, x + bw, y + bh], 12, fill=GREEN if filled else (255, 255, 255), outline=INK, width=3)
        d.text((x + 18, y + 12), no, font=f_no, fill=MUTED)
        d.text((x + 18, y + 38), name, font=f_step, fill=INK)
        for j, line in enumerate(desc.split("\n")):
            d.text((x + 18, y + 78 + j * 24), line, font=f_lab, fill=MUTED)
        if i < n - 1:
            ax = x + bw + 4
            ay = y + bh // 2
            d.line([ax, ay, ax + gap - 8, ay], fill=INK, width=3)
            d.polygon([(ax + gap - 8, ay - 6), (ax + gap - 8, ay + 6), (ax + gap - 2, ay)], fill=INK)

    d.text((60, 44), "从一句话到一张海报", font=f_step, fill=INK)
    d.text((60, 250), "人的动作只有三次：说清活动 · 挑一版图 · 把图发回来", font=f_lab, fill=MUTED)
    grain(img)
    return img


def gates():
    W, H = 1280, 250
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    f_g = load(FONT_LATIN, 22)
    f_t = load(FONT_BOLD, 21)
    f_d = load(FONT_REG, 16)

    items = [
        ("G1", "内容", "逐字核对"),
        ("G2", "配色", "脚本量测"),
        ("G3", "层级", "缩到 1/3 看"),
        ("G4", "字体", "同族不倒挂"),
        ("G5", "图形", "无渐变 3D"),
        ("G6", "资产", "Logo 未变形"),
    ]
    n = len(items)
    gap = 18
    bw = (W - 2 * 60 - gap * (n - 1)) // n
    y = 76
    for i, (g, t, desc) in enumerate(items):
        x = 60 + i * (bw + gap)
        rounded(d, [x, y, x + bw, y + 108], 10, fill=(255, 255, 255), outline=LINE, width=3)
        d.rectangle([x, y, x + 6, y + 108], fill=GREEN)
        d.text((x + 20, y + 16), g, font=f_g, fill=MUTED)
        d.text((x + 20, y + 44), t, font=f_t, fill=INK)
        d.text((x + 20, y + 76), desc, font=f_d, fill=MUTED)
    d.text((60, 36), "六道闸门：任一 FAIL 不出图", font=f_t, fill=INK)
    grain(img)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("banner.png", banner), ("pipeline.png", pipeline), ("gates.png", gates)):
        p = os.path.join(OUT, name)
        fn().save(p, "PNG")
        print("saved", p)


if __name__ == "__main__":
    main()
