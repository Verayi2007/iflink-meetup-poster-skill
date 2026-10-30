#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
render-poster.py — 确定性渲染通道（R）

不经过任何图像模型：用代码把 spec.json 画成一张 1024×1536 的海报。
· 文字 100% 正确、版式精确、颜色精确
· 插画与点缀角色是"占位图形"，导出后可替换为当期 AI 生成的素材

用法：
    python scripts/render-poster.py build/spec.json --out build/rendered.png
    python scripts/render-poster.py build/spec.json --out build/rendered.png --illustration-assets

依赖：Pillow
"""

import argparse
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

W, H = 1024, 1536
MARGIN_X = 54
CREAM = (246, 246, 241)
INK = (36, 32, 33)
GREEN = (177, 250, 99)
WHITE = (255, 255, 255)
DIVIDER = (220, 239, 192)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fonts import cjk_font

_cache = {}


def font(size, bold=True):
    """同一字号只加载一次；bold 目前用同一套中文字体（多数自带 Bold 字形）"""
    key = size
    if key not in _cache:
        _cache[key] = cjk_font(size)[0]
    return _cache[key]


F_BOLD = lambda s: font(s)   # noqa: E731
F_REG = lambda s: font(s)    # noqa: E731


def text_w(draw, txt, f):
    box = draw.textbbox((0, 0), txt, font=f)
    return box[2] - box[0]


def wrap(draw, txt, f, max_w):
    lines, cur = [], ""
    for ch in txt:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        if text_w(draw, cur + ch, f) <= max_w:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def rounded(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def icon_calendar(d, x, y, s, color=INK):
    """在 s×s 的方块里画一个极简日历"""
    rounded(d, [x + s * 0.16, y + s * 0.24, x + s * 0.84, y + s * 0.84], s * 0.08, outline=color, width=max(2, int(s * 0.07)))
    d.line([x + s * 0.16, y + s * 0.42, x + s * 0.84, y + s * 0.42], fill=color, width=max(2, int(s * 0.07)))
    d.line([x + s * 0.34, y + s * 0.14, x + s * 0.34, y + s * 0.3], fill=color, width=max(2, int(s * 0.07)))
    d.line([x + s * 0.66, y + s * 0.14, x + s * 0.66, y + s * 0.3], fill=color, width=max(2, int(s * 0.07)))


def icon_pin(d, x, y, s, color=INK):
    r = s * 0.26
    cx, cy = x + s / 2, y + s * 0.4
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=max(2, int(s * 0.07)))
    d.polygon([(cx - r * 0.82, cy + r * 0.5), (cx + r * 0.82, cy + r * 0.5), (cx, y + s * 0.86)], fill=color)
    d.ellipse([cx - r * 0.34, cy - r * 0.34, cx + r * 0.34, cy + r * 0.34], fill=(255, 255, 255))


def avatar(d, cx, cy, r, gender="other", hair=""):
    """圆框线稿头像：白底 + 墨线 + 绿衣 + 极简五官"""
    layer = Image.new("RGBA", (int(r * 2 + 8), int(r * 2 + 8)), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    c = r + 4
    # 白底圆
    ld.ellipse([c - r, c - r, c + r, c + r], fill=WHITE)
    # 衣服（底部绿）
    ld.ellipse([c - r * 0.92, c + r * 0.34, c + r * 0.92, c + r * 1.55], fill=GREEN, outline=INK, width=3)
    # 脖子
    ld.rectangle([c - r * 0.18, c + r * 0.2, c + r * 0.18, c + r * 0.48], fill=WHITE, outline=INK, width=2)
    # 脸
    ld.ellipse([c - r * 0.44, c - r * 0.34, c + r * 0.44, c + r * 0.46], fill=WHITE, outline=INK, width=3)
    # 头发
    if gender == "female":
        ld.chord([c - r * 0.52, c - r * 0.46, c + r * 0.52, c + r * 0.1], 180, 360, fill=INK)
        ld.rounded_rectangle([c - r * 0.56, c - r * 0.2, c - r * 0.34, c + r * 0.5], radius=r * 0.1, fill=INK)
        ld.rounded_rectangle([c + r * 0.34, c - r * 0.2, c + r * 0.56, c + r * 0.5], radius=r * 0.1, fill=INK)
    else:
        ld.chord([c - r * 0.52, c - r * 0.5, c + r * 0.52, c + r * 0.08], 180, 360, fill=INK)
    # 眼睛与嘴
    ld.ellipse([c - r * 0.2, c + r * 0.02, c - r * 0.1, c + r * 0.12], fill=INK)
    ld.ellipse([c + r * 0.1, c + r * 0.02, c + r * 0.2, c + r * 0.12], fill=INK)
    ld.arc([c - r * 0.12, c + r * 0.1, c + r * 0.12, c + r * 0.28], 20, 160, fill=INK, width=3)
    # 外圈
    ld.ellipse([c - r, c - r, c + r, c + r], outline=INK, width=3)

    mask = Image.new("L", layer.size, 0)
    ImageDraw.Draw(mask).ellipse([4, 4, 4 + 2 * r, 4 + 2 * r], fill=255)
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.paste(layer, (0, 0), mask)
    d._image.paste(out, (int(cx - r - 4), int(cy - r - 4)), out)


def brush_block(d, box, color=GREEN, tooth=3):
    """毛边笔刷块：用轻微不规则的多边形模拟马克笔痕"""
    x0, y0, x1, y1 = box
    pts = []
    steps = 26
    for i in range(steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = y0 + math.sin(i * 1.7) * tooth * 0.5
        pts.append((x, y))
    for i in range(steps + 1):
        x = x1 - (x1 - x0) * i / steps
        y = y1 + math.sin(i * 2.1 + 1.3) * tooth * 0.5
        pts.append((x, y))
    d.polygon(pts, fill=color)


def draw_camera_decor(img, box, accent):
    """点缀角色占位：一台长了眼睛的小相机（呼应影像主题）"""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    w = x1 - x0
    # 底座阴影与腿（先画，垫在最下面）
    d.ellipse([x0 + w * 0.10, y1 - w * 0.12, x1 - w * 0.10, y1 + w * 0.02], fill=GREEN)
    d.line([x0 + w * 0.3, y1 - w * 0.10, x0 + w * 0.3, y1 + w * 0.05], fill=INK, width=6)
    d.line([x0 + w * 0.7, y1 - w * 0.10, x0 + w * 0.7, y1 + w * 0.05], fill=INK, width=6)
    body = [x0 + w * 0.08, y0 + w * 0.18, x1 - w * 0.08, y1 - w * 0.06]
    d.rounded_rectangle(body, radius=w * 0.09, fill=accent, outline=INK, width=5)
    # 取景器
    d.rounded_rectangle([x0 + w * 0.18, y0 + w * 0.06, x0 + w * 0.4, y0 + w * 0.22], radius=6, fill=accent, outline=INK, width=5)
    # 镜头
    cx, cy, r = x0 + w * 0.5, y0 + w * 0.62, w * 0.19
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE, outline=INK, width=5)
    d.ellipse([cx - r * 0.62, cy - r * 0.62, cx + r * 0.62, cy + r * 0.62], outline=INK, width=4)
    # 眼睛（画在机身上方，不在镜头里）
    ey = y0 + w * 0.30
    d.ellipse([cx - w * 0.13, ey - w * 0.045, cx - w * 0.085, ey], fill=INK)
    d.ellipse([cx + w * 0.085, ey - w * 0.045, cx + w * 0.13, ey], fill=INK)
    # 微笑
    d.arc([cx - w * 0.06, ey + w * 0.02, cx + w * 0.06, ey + w * 0.11], 20, 160, fill=INK, width=4)
    # 闪光灯与快门
    d.rounded_rectangle([x0 + w * 0.66, y0 + w * 0.10, x0 + w * 0.80, y0 + w * 0.20], radius=4, fill=WHITE, outline=INK, width=4)
    d.ellipse([x0 + w * 0.18, y0 + w * 0.10, x0 + w * 0.28, y0 + w * 0.20], fill=GREEN, outline=INK, width=4)



def paste_illustration(img, box, path):
    """把当期插画按 cover 方式贴进插画位，裁切居中"""
    x0, y0, x1, y1 = [int(v) for v in box]
    bw, bh = x1 - x0, y1 - y0
    src = Image.open(path).convert("RGB")
    scale = max(bw / src.width, bh / src.height)
    nw, nh = int(src.width * scale), int(src.height * scale)
    src = src.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - bw) // 2, (nh - bh) // 2
    img.paste(src.crop((left, top, left + bw, top + bh)), (x0, y0))


def render(spec, illustration=None):
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    # 点缀色：spec 没填时，从色板里按活动名哈希确定性挑一个（每期不同，可复现）
    palette = ["#FE7733", "#B2A1FF"]
    pick = spec.get("decor", {}).get("accent_color") or palette[sum(map(ord, spec.get("event_name", ""))) % 2]
    accent = pick
    accent = tuple(int(accent[i:i + 2], 16) for i in (1, 3, 5))

    # ── 页眉 ──
    logo_f = F_BOLD(40)
    d.text((MARGIN_X, 40), "IF.Link", font=logo_f, fill=INK)
    slogan_f = F_BOLD(24)
    sl = "Link the IFs, Connect the Dots"
    d.text((W - MARGIN_X - text_w(d, sl, slogan_f), 52), sl, font=slogan_f, fill=INK)

    # ── 标题组 ──
    t1, t2 = spec["event_name"], spec["kicker"]
    f1 = F_BOLD(88)
    f2 = F_BOLD(52)
    pad_x = 22
    w1 = text_w(d, t1, f1) + pad_x * 2
    h1 = 112
    y1 = 118
    d.rectangle([MARGIN_X, y1, MARGIN_X + w1, y1 + h1], fill=GREEN)
    d.text((MARGIN_X + pad_x, y1 + (h1 - 88 * 1.18) / 2 + 2), t1, font=f1, fill=INK)

    w2 = text_w(d, t2, f2) + pad_x * 2
    h2 = 86
    y2 = y1 + h1 + 12
    d.rectangle([MARGIN_X, y2, MARGIN_X + w2, y2 + h2], fill=INK)
    d.text((MARGIN_X + pad_x, y2 + (h2 - 52 * 1.2) / 2), t2, font=f2, fill=WHITE)

    # ── 一句话 ──
    y = y2 + h2 + 30
    if spec.get("one_liner"):
        f3 = F_REG(30)
        d.text((MARGIN_X, y), spec["one_liner"], font=f3, fill=INK)
        y += 62

    # ── 时间 / 地点 ──
    f_lab = F_REG(25)
    f_val = F_BOLD(25)
    for label, value, icon in (("活动时间", spec["date_time"], icon_calendar),
                               ("活动地点", spec["location"], icon_pin)):
        s = 34
        rounded(d, [MARGIN_X, y, MARGIN_X + s, y + s], 7, fill=GREEN)
        icon(d, MARGIN_X, y, s)
        d.text((MARGIN_X + s + 14, y + (s - 25 * 1.25) / 2), label, font=f_lab, fill=INK)
        xv = MARGIN_X + s + 14 + text_w(d, label, f_lab) + 16
        d.text((xv, y + (s - 25 * 1.25) / 2), value, font=f_val, fill=INK)
        y += s + 12

    # ── 嘉宾区 ──
    y += 30
    f_sec = F_BOLD(32)
    sec = spec.get("guest_section_title", "分享嘉宾 & 主题")
    wsec = text_w(d, sec, f_sec) + 40
    d.rectangle([MARGIN_X, y, MARGIN_X + wsec, y + 52], fill=GREEN)
    d.text((MARGIN_X + 20, y + 8), sec, font=f_sec, fill=INK)
    y += 52 + 26

    guests = spec.get("guests", [])
    r_av = 46 if len(guests) <= 3 else 38
    f_name = F_BOLD(27)
    f_topic = F_REG(22)
    col_x = MARGIN_X + r_av * 2 + 26

    for g in guests:
        avatar(d, MARGIN_X + r_av, y + r_av, r_av, g.get("gender"), g.get("hair", ""))
        # 姓名 chip
        wn = text_w(d, g["name"], f_name) + 24
        rounded(d, [col_x, y + 6, col_x + wn, y + 6 + 40], 8, fill=GREEN)
        d.text((col_x + 12, y + 12), g["name"], font=f_name, fill=INK)
        # 话题
        ty = y + 52
        for line in wrap(d, g["topic"], f_topic, 380)[:3]:
            d.text((col_x, ty), line, font=f_topic, fill=INK)
            ty += 32
        y = max(y + r_av * 2 + 30, ty + 26)
        # 分隔线
        d.line([col_x, y - 6, col_x + 380, y - 6], fill=DIVIDER, width=2)

    # ── 插画占位（右侧，classic 版） ──
    ix0, iy0, ix1, iy1 = 560, 585, 985, 1185
    if illustration:
        paste_illustration(img, (ix0, iy0, ix1, iy1), illustration)
    else:
        d.rounded_rectangle([ix0, iy0, ix1, iy1], radius=10, outline=DIVIDER, width=3)
        f_ph = F_REG(20)
        for i, line in enumerate(["插画位", "（此处贴当期 AI 插画）"]):
            d.text((ix0 + (ix1 - ix0 - text_w(d, line, f_ph)) / 2,
                    iy0 + (iy1 - iy0) / 2 - 20 + i * 30), line, font=f_ph, fill=(180, 190, 170))

    # ── 福利笔刷块 ──
    y_perks = H - 330
    f_perks = F_BOLD(34)
    pt = spec.get("perks_title", "小福利")
    brush_block(d, [MARGIN_X - 6, y_perks, MARGIN_X + text_w(d, pt, f_perks) + 60, y_perks + 56])
    d.text((MARGIN_X + 22, y_perks + 8), pt, font=f_perks, fill=INK)
    f_pt = F_REG(24)
    d.text((MARGIN_X + 8, y_perks + 68), spec["perks_text"], font=f_pt, fill=INK)

    # ── 点缀角色 ──
    if spec.get("decor", {}).get("preset") != "none":
        draw_camera_decor(img, [700, H - 400, 975, H - 120], accent)

    return img


def main():
    ap = argparse.ArgumentParser(description="确定性海报渲染（零错字）")
    ap.add_argument("spec")
    ap.add_argument("--out", default="build/rendered.png")
    ap.add_argument("--illustration", help="当期插画 PNG/JPG；不给则输出空插画位")
    args = ap.parse_args()

    spec = json.loads(open(args.spec, encoding="utf-8-sig").read())
    img = render(spec, args.illustration)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    img.save(args.out, "PNG")
    print(f"✅ 已渲染：{args.out}（{W}×{H}）")
    print("   文字由代码绘制，零错字；插画位与点缀角色为占位图形，可后期替换")


if __name__ == "__main__":
    main()
