#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
check-palette.py — IF.Link Meetup 海报「色彩锁」闸门（G2）

把成图逐像素归类到品牌六色，输出面积占比，并对三件事下判决：
  1. 三主色占比是否落在区间内（奶油白 / 墨色 / 荧光绿）
  2. 是否出现禁用色（橙红 #FE7733 家族、第二强调色）
  3. 是否混入渐变/照片质感（表现为大量"无法归类"的中间色）

用法：
    python scripts/check-palette.py build/poster.png
    python scripts/check-palette.py build/poster.png --json build/palette.json
    python scripts/check-palette.py assets/reference/final-poster.png --debug

退出码：0 = PASS（可含 WARN）；1 = FAIL；2 = 用法/IO 错误
依赖：Pillow（numpy 可选，装了会快很多）
"""

import argparse
import json
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    print("✖ 需要 Pillow：python -m pip install pillow", file=sys.stderr)
    sys.exit(2)

# Windows 控制台默认 GBK，会把中文与 ✅ 打成乱码；强制 UTF-8 输出
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover - 老版本 Python 或已重定向的流
        pass

# ── 品牌色板（与 SKILL.md / build-prompt.mjs 保持一致）────────────────────────
BRAND = {
    "cream":   ("#F6F6F1", (246, 246, 241), "奶油白画布"),
    "ink":     ("#242021", (36, 32, 33),    "深黑灰墨色"),
    "green":   ("#B1FA63", (177, 250, 99),  "品牌荧光绿"),
    "white":   ("#FFFFFF", (255, 255, 255), "纯白"),
    "mascot":  ("#FED754", (254, 215, 84),  "吉祥物黄"),
    "divider": ("#DCEFC0", (220, 239, 192), "极浅绿分隔线"),
}

# 成图容差：模型输出几乎不会给出精确 HEX，用最近邻归类而不是精确匹配
MAX_DIST = 62          # 超过此距离判为"无法归类"
MIN_DIST = 4           # 精确命中阈值（用于 --debug）

# 面积占比闸门（%）。以原作定稿实测 69 / 10.9 / 9.3 为中心放宽
GATES = {
    "cream":   (55.0, 85.0),
    "ink":     (5.0, 18.0),
    "green":   (5.0, 16.0),
    "mascot":  (0.0, 5.0),
    "other":   (0.0, 12.0),   # 无法归类像素上限：过高说明有渐变/照片/外来色
}

# 禁用色家族：橙红及其邻域
BANNED = [
    ("#FE7733", (254, 119, 51), "参考图橙红"),
    ("#FF8A3D", (255, 138, 61), "暖橙"),
    ("#FF6B35", (255, 107, 53), "南瓜橙"),
]
BANNED_MAX_SHARE = 0.6     # 占全图 0.6% 即判 FAIL（一张海报上橙红几乎不可能是误判）
BANNED_DIST = 45           # 与禁用色的 RGB 欧氏距离阈值（橙红家族识别半径）


def dist2(c, ref):
    return (c[0] - ref[0]) ** 2 + (c[1] - ref[1]) ** 2 + (c[2] - ref[2]) ** 2


def classify(pixels):
    """返回 {name: count} 与 total；pixels 为 (r,g,b) 可迭代序列。"""
    keys = list(BRAND.keys())
    refs = [BRAND[k][1] for k in keys]
    banned_refs = [b[1] for b in BANNED]
    counts = {k: 0 for k in keys}
    counts["other"] = 0
    counts["banned"] = 0
    maxd2 = MAX_DIST ** 2
    band2 = BANNED_DIST ** 2

    total = 0
    for px in pixels:
        total += 1
        best_i, best_d = -1, maxd2
        for i, ref in enumerate(refs):
            d = dist2(px, ref)
            if d < best_d:
                best_d, best_i = d, i
        if best_i >= 0:
            counts[keys[best_i]] += 1
        else:
            counts["other"] += 1
            # 无法归类的像素里，有多少落在禁用色邻域
            for bref in banned_refs:
                if dist2(px, bref) < band2:
                    counts["banned"] += 1
                    break
    return counts, total


def classify_numpy(im):
    try:
        import numpy as np
    except ImportError:
        return None
    a = np.asarray(im, dtype=np.int32).reshape(-1, 3)
    keys = list(BRAND.keys())

    # 逐色累加最小距离，避免一次性开 (N, 6, 3) 的大数组
    best = np.full(len(a), 1 << 30, dtype=np.int32)
    idx = np.zeros(len(a), dtype=np.int8)
    for i, k in enumerate(keys):
        ref = np.array(BRAND[k][1], dtype=np.int32)
        d = ((a - ref) ** 2).sum(axis=1)
        take = d < best
        best[take] = d[take]
        idx[take] = i

    other = best >= MAX_DIST ** 2
    counts = {k: int(((idx == i) & ~other).sum()) for i, k in enumerate(keys)}
    counts["other"] = int(other.sum())
    counts["banned"] = 0
    if counts["other"]:
        sub = a[other]
        best_b = np.full(len(sub), 1 << 30, dtype=np.int32)
        for _, ref_tuple, _ in BANNED:
            d = ((sub - np.array(ref_tuple, dtype=np.int32)) ** 2).sum(axis=1)
            best_b = np.minimum(best_b, d)
        counts["banned"] = int((best_b < BANNED_DIST ** 2).sum())
    return counts, len(a)


def pct(n, total):
    return 100.0 * n / total if total else 0.0


def main():
    ap = argparse.ArgumentParser(description="IF.Link 海报色彩锁闸门")
    ap.add_argument("image", help="待检海报 PNG/JPG")
    ap.add_argument("--json", dest="json_out", help="输出 JSON 报告")
    ap.add_argument("--debug", action="store_true", help="打印色块分布与采样点")
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

    res = classify_numpy(im)
    if res is None:
        res = classify(im.getdata())
    counts, total = res

    shares = {k: pct(v, total) for k, v in counts.items()}

    # ── 判定 ──
    fails, warns, oks = [], [], []

    for key in ("cream", "ink", "green"):
        lo, hi = GATES[key]
        v = shares[key]
        label = BRAND[key][2]
        if lo <= v <= hi:
            oks.append(f"{label:<8} {v:5.1f}%  目标 {lo:.0f}–{hi:.0f}%")
        else:
            dev = "偏低" if v < lo else "偏高"
            fails.append(f"{label:<8} {v:5.1f}%  目标 {lo:.0f}–{hi:.0f}%  → {dev}")
            if key == "green" and v > hi:
                warns.append("荧光绿超量：绿已从「点睛」变「糊墙」，超过 16% 会显土。")

    lo, hi = GATES["mascot"]
    v = shares["mascot"]
    if lo <= v <= hi:
        oks.append(f"{'吉祥物黄':<8} {v:5.1f}%  上限 {hi:.0f}%")
    else:
        fails.append(f"{'吉祥物黄':<8} {v:5.1f}%  上限 {hi:.0f}%  → 吉祥物面积过大")

    lo, hi = GATES["other"]
    v = shares["other"]
    if v <= hi:
        oks.append(f"{'未归类色':<8} {v:5.1f}%  上限 {hi:.0f}%")
    else:
        fails.append(f"{'未归类色':<8} {v:5.1f}%  上限 {hi:.0f}%  → 存在渐变/照片质感/外来色")
        warns.append("未归类色偏高：优先怀疑渐变、投影、写实质感或第二强调色。")

    banned_share = shares["banned"]
    if banned_share > BANNED_MAX_SHARE:
        fails.append(f"{'禁用色':<8} {banned_share:5.1f}%  上限 {BANNED_MAX_SHARE}%  → 出现橙红家族（原作头号翻车点）")
    else:
        oks.append(f"{'禁用色':<8} {banned_share:5.1f}%  上限 {BANNED_MAX_SHARE}%")

    # ── 输出 ──
    line = "─" * 64
    print(line)
    print("IF.Link Meetup 海报 · 色彩锁闸门 G2")
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
    print(f"{icon} 判定：{verdict}   （奶油白 / 墨色 / 荧光绿 三色占比为硬指标）")

    if args.debug:
        print(line)
        print("色板归类明细：")
        for k, (hexv, _, label) in BRAND.items():
            print(f"  {label:<10} {hexv}  {shares[k]:6.2f}%  ({counts[k]} px)")
        print(f"  {'禁用色家族':<10} {'#FE7733':>7}  {banned_share:6.2f}%  ({counts['banned']} px)")
        print(f"  {'未归类':<10} {'-':>7}  {shares['other']:6.2f}%  ({counts['other']} px)")
        print(line)
        print("采样点（左上 / 中心 / 右下）：")
        ww, hh = im.size
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
            "shares": {k: round(v, 2) for k, v in shares.items()},
            "targets": {k: list(v) for k, v in GATES.items()},
            "fails": fails,
            "warns": warns,
        }
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"↳ JSON 报告：{args.json_out}")

    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
