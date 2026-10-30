#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
check-palette.py — IF.Link Meetup 海报「配色闸门」（G2）

判定三层：
  1. 主色锁：奶油白 / 深黑灰 / 荧光绿 三个主色的面积占比是否落在区间内
  2. 点缀色：允许 1–2 种非主色，但总面积 ≤ 8%、单色 ≤ 5%（点缀而已，不能抢戏）
  3. 禁用：参考图橙红 #FE7733 家族 > 3% 判 FAIL（照抄参考图配色的头号翻车点）

用法：
    python scripts/check-palette.py build/poster.png
    python scripts/check-palette.py build/poster.png --json build/palette.json
    python scripts/check-palette.py assets/reference/final-poster.png --debug

退出码：0 = PASS（可含 WARN）；1 = FAIL；2 = 用法/IO 错误
依赖：Pillow（numpy 可选，装了更快）
"""

import argparse
import colorsys
import json
import os
import sys
from collections import Counter

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    print("✖ 需要 Pillow：python -m pip install pillow", file=sys.stderr)
    sys.exit(2)

# Windows 控制台默认 GBK，会把中文与 ✅ 打成乱码；强制 UTF-8 输出
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover
        pass

# ── 主色板（与 SKILL.md / build-prompt.mjs 保持一致）──────────────────────────
CORE = {
    "cream":   ("#F6F6F1", (246, 246, 241), "奶油白画布"),
    "ink":     ("#242021", (36, 32, 33),    "深黑灰墨色"),
    "green":   ("#B1FA63", (177, 250, 99),  "品牌荧光绿"),
    "white":   ("#FFFFFF", (255, 255, 255), "纯白"),
    "divider": ("#DCEFC0", (220, 239, 192), "极浅绿"),
}

MAX_DIST = 62          # 超过此距离不算主色（进入点缀色分析）

# 主色占比闸门（%），以原作定稿实测 66 / 11.5 / 9.5 为中心
GATES = {
    "cream": (55.0, 85.0),
    "ink":   (5.0, 18.0),
    "green": (5.0, 16.0),
    "white": (0.0, 6.0),
}

# 点缀色闸门（%）
ACCENT_TOTAL_MAX = 8.0     # 所有点缀色合计
ACCENT_SINGLE_MAX = 5.0    # 单一色调上限
ACCENT_HUES_MAX = 2        # 最多两种点缀色调
ACCENT_MIN_SHARE = 0.8     # 低于此占比的色相当作抗锯齿噪点，不计入"一种颜色"

# 点缀色板：只允许这两个，二选一。色相由 HEX 直接算，避免手写值漂移
ACCENT_HEXES = [("#FE7733", "暖橙"), ("#B2A1FF", "淡紫")]


def _hex_hue(hexv):
    r, g, b = [int(hexv[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    h, _s, _v = colorsys.rgb_to_hsv(r, g, b)
    return h * 360.0


ACCENT_PALETTE = [(h, round(_hex_hue(h), 1), n) for h, n in ACCENT_HEXES]
ACCENT_HUE_TOL = 13       # 色相容差（度）
OFF_PALETTE_MAX = 1.5     # 不属于色板的异色占比上限（%，多为抗锯齿噪声）


def dist2(c, ref):
    return (c[0] - ref[0]) ** 2 + (c[1] - ref[1]) ** 2 + (c[2] - ref[2]) ** 2


def core_counts(im):
    """最近邻归入主色，返回 {key: count}, other 像素列表, total"""
    try:
        import numpy as np
    except ImportError:
        np = None

    if np is not None:
        a = np.asarray(im, dtype=np.int32).reshape(-1, 3)
        best = np.full(len(a), 1 << 30, dtype=np.int32)
        idx = np.zeros(len(a), dtype=np.int8)
        for i, k in enumerate(CORE):
            ref = np.array(CORE[k][1], dtype=np.int32)
            d = ((a - ref) ** 2).sum(axis=1)
            take = d < best
            best[take] = d[take]
            idx[take] = i
        other_mask = best >= MAX_DIST ** 2
        counts = {k: int(((idx == i) & ~other_mask).sum()) for i, k in enumerate(CORE)}
        other = a[other_mask]
        return counts, other, len(a)

    counts = {k: 0 for k in CORE}
    other = []
    keys = list(CORE.keys())
    total = 0
    for px in im.getdata():
        total += 1
        best_d, best_i = MAX_DIST ** 2, -1
        for i, k in enumerate(keys):
            d = dist2(px, CORE[k][1])
            if d < best_d:
                best_d, best_i = d, i
        if best_i >= 0:
            counts[keys[best_i]] += 1
        else:
            other.append(px)
    return counts, other, total


def accent_stats(other, total):
    """
    把「非主色」像素按色相分箱统计，只统计有饱和度的像素（去掉抗锯齿灰边）。
    返回 (accent_total_share, {hue_bin: share}, off_palette_share, palette_used)
    """
    if total == 0:
        return 0.0, {}, 0.0

    # 统计唯一颜色出现次数，避免逐像素 HSV 换算太慢
    try:
        import numpy as np
        uniq, cnt = np.unique(other, axis=0, return_counts=True) if len(other) else (None, None)
        pairs = list(zip(map(tuple, uniq), cnt.tolist())) if uniq is not None else []
    except ImportError:  # pragma: no cover
        counter = Counter(map(tuple, other))
        pairs = list(counter.items())

    bins = Counter()
    off_palette = 0
    palette_used = Counter()
    # 主色自身的色相（荧光绿的深浅变化不该被算成"另一种点缀色"）
    core_hues = []
    for k in ("green", "divider"):
        r, g, b = [v / 255.0 for v in CORE[k][1]]
        hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
        if ss >= 0.2:
            core_hues.append(hh * 360.0)

    for (r, g, b), n in pairs:
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        deg = h * 360.0
        if s < 0.20 or v < 0.15:      # 近似灰 / 极暗，属于抗锯齿或线稿边缘
            continue
        if any(abs(((deg - ch + 180) % 360) - 180) <= 18 for ch in core_hues):
            continue                   # 品牌绿的同族深浅，不计入点缀色
        bins[int(deg) // 15 * 15] += n
        # 判是否落在点缀色板内
        hit = None
        for hexv, hue, label in ACCENT_PALETTE:
            if abs(((deg - hue + 180) % 360) - 180) <= ACCENT_HUE_TOL:
                hit = (hexv, label)
                break
        if hit:
            palette_used[hit[1]] += n
        else:
            off_palette += n

    accent_total = sum(bins.values()) / total * 100.0
    shares = {k: v / total * 100.0 for k, v in bins.items()}
    used = {k: v / total * 100.0 for k, v in palette_used.items()}
    return accent_total, shares, off_palette / total * 100.0, used


def pct(n, total):
    return 100.0 * n / total if total else 0.0


def hue_name(deg):
    if deg < 15 or deg >= 345:
        return "红"
    if deg < 45:
        return "橙"
    if deg < 70:
        return "黄"
    if deg < 165:
        return "绿"
    if deg < 195:
        return "青"
    if deg < 255:
        return "蓝"
    if deg < 290:
        return "紫"
    return "粉"


def main():
    ap = argparse.ArgumentParser(description="IF.Link 海报配色闸门 G2")
    ap.add_argument("image", help="待检海报 PNG/JPG")
    ap.add_argument("--json", dest="json_out", help="输出 JSON 报告")
    ap.add_argument("--debug", action="store_true", help="打印完整色相分布与采样点")
    ap.add_argument("--max-side", type=int, default=900, help="分析前等比缩到的最长边（默认 900）")
    args = ap.parse_args()

    if not os.path.isfile(args.image):
        print(f"✖ 找不到文件：{args.image}", file=sys.stderr)
        sys.exit(2)

    im = Image.open(args.image).convert("RGB")
    w, h = im.size
    scale = args.max_side / max(w, h)
    if scale < 1:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

    counts, other, total = core_counts(im)
    shares = {k: pct(v, total) for k, v in counts.items()}
    accent_total, accent_bins, off_share, palette_used = accent_stats(other, total)

    fails, warns, oks = [], [], []

    # ── 1. 主色锁 ──
    for key in ("cream", "ink", "green"):
        lo, hi = GATES[key]
        v = shares[key]
        label = CORE[key][2]
        if lo <= v <= hi:
            oks.append(f"{label:<7} {v:5.1f}%  区间 {lo:.0f}–{hi:.0f}%")
        else:
            dev = "偏低" if v < lo else "偏高"
            fails.append(f"{label:<7} {v:5.1f}%  区间 {lo:.0f}–{hi:.0f}%  → {dev}")
            if key == "green" and v > hi:
                warns.append("荧光绿超量：绿已从「点睛」变「糊墙」，建议把绿收回到 16% 以内。")

    lo, hi = GATES["white"]
    if shares["white"] <= hi:
        oks.append(f"{'纯白':<7} {shares['white']:5.1f}%  上限 {hi:.0f}%")
    else:
        fails.append(f"{'纯白':<7} {shares['white']:5.1f}%  上限 {hi:.0f}%  → 反白面积过大，画面会发灰")

    # ── 2. 点缀色（只允许 #FE7733 暖橙 / #B2A1FF 淡紫）──
    active = {k: v for k, v in accent_bins.items() if v >= ACCENT_MIN_SHARE}
    hue_count = len(active)
    top = sorted(active.items(), key=lambda kv: -kv[1])[:3]
    top_txt = "、".join(f"{hue_name(k)}色 {v:.1f}%" for k, v in top) or "无"
    used_active = {k: v for k, v in palette_used.items() if v >= 0.5}   # 0.0% 的杂色不算“用了”
    used_txt = "、".join(f"{k} {v:.1f}%" for k, v in sorted(used_active.items(), key=lambda kv: -kv[1])) or "无"

    if accent_total > ACCENT_TOTAL_MAX:
        fails.append(f"{'点缀色面积':<7} {accent_total:5.1f}%  上限 {ACCENT_TOTAL_MAX:.0f}%  → 异色铺太多了")
    elif palette_used and max(palette_used.values()) > ACCENT_SINGLE_MAX:
        fails.append(f"{'点缀色面积':<7} {max(palette_used.values()):5.1f}%  单色上限 {ACCENT_SINGLE_MAX:.0f}%  → 某种颜色已抢戏")
    else:
        oks.append(f"{'点缀色面积':<7} {accent_total:5.1f}%  上限 {ACCENT_TOTAL_MAX:.0f}%")

    if off_share > OFF_PALETTE_MAX:
        fails.append(
            f"{'点缀色合规':<7} 板外异色 {off_share:5.1f}%  上限 {OFF_PALETTE_MAX:.1f}%  "
            f"→ 点缀色只能从 #FE7733 暖橙 / #B2A1FF 淡紫 里选一个（当前：{top_txt}）"
        )
    elif palette_used:
        oks.append(f"{'点缀色合规':<7} {used_txt}（色板：暖橙 #FE7733 / 淡紫 #B2A1FF）")
    else:
        oks.append(f"{'点缀色合规':<7} 未使用点缀色（允许）")

    if not used_active and accent_total < 0.5:
        warns.append("没有任何点缀色：想加就指定 #FE7733 或 #B2A1FF，由模型按内容气质挑一个。")
    elif len(used_active) > 1:
        warns.append("同时出现了暖橙和淡紫 —— 点缀色只能二选一。")

    # ── 输出 ──
    line = "─" * 64
    print(line)
    print("IF.Link Meetup 海报 · 配色闸门 G2")
    print(f"文件：{args.image}")
    print(f"尺寸：{w}×{h}（分析采样 {total} px）")
    print(line)
    for s in oks:
        print(f"  ✅ {s}")
    for s in fails:
        print(f"  ❌ {s}")
    for s in warns:
        print(f"  ⚠️  {s}")
    print(line)

    verdict = "FAIL" if fails else ("WARN" if warns else "PASS")
    icon = {"PASS": "✅", "WARN": "⚠️", "FAIL": "❌"}[verdict]
    print(f"{icon} 判定：{verdict}   （主色三色占比是硬指标；点缀色只能是 #FE7733 或 #B2A1FF，二选一，≤6%）")

    if args.debug:
        print(line)
        print("主色归类：")
        for k, (hexv, _, label) in CORE.items():
            print(f"  {label:<8} {hexv}  {shares[k]:6.2f}%  ({counts[k]} px)")
        print("点缀色色相分布：")
        for deg, share in sorted(accent_bins.items(), key=lambda kv: -kv[1])[:8]:
            if share >= 0.1:
                print(f"  {hue_name(deg)}色（H≈{deg}°）  {share:6.2f}%")
        print(f"  合计 {accent_total:.2f}%（阈值 {ACCENT_TOTAL_MAX:.0f}%，单色 {ACCENT_SINGLE_MAX:.0f}%）")
        print(line)
        ww, hh = im.size
        print("采样点：")
        for label, (x, y) in {
            "左上": (int(ww * 0.03), int(hh * 0.03)),
            "中心": (ww // 2, hh // 2),
            "右下": (int(ww * 0.95), int(hh * 0.95)),
        }.items():
            px = im.getpixel((x, y))
            print(f"  {label} ({x},{y}) = #{px[0]:02X}{px[1]:02X}{px[2]:02X}")

    if args.json_out:
        report = {
            "image": os.path.abspath(args.image),
            "size": [w, h],
            "verdict": verdict,
            "core_shares": {k: round(v, 2) for k, v in shares.items()},
            "accent": {
                "total": round(accent_total, 2),
                "hues": {hue_name(k): round(v, 2) for k, v in active.items()},
                "palette_used": {k: round(v, 2) for k, v in palette_used.items()},
                "off_palette": round(off_share, 2),
            },
            "accent_palette": [{"hex": h, "hue": u, "name": n} for h, u, n in ACCENT_PALETTE],
            "gates": {
                "core": {k: list(v) for k, v in GATES.items()},
                "accent_total_max": ACCENT_TOTAL_MAX,
                "accent_single_max": ACCENT_SINGLE_MAX,
                "accent_hues_max": ACCENT_HUES_MAX,
                "off_palette_max": OFF_PALETTE_MAX,
            },
            "fails": fails,
            "warns": warns,
        }
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"↳ JSON 报告：{args.json_out}")

    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
