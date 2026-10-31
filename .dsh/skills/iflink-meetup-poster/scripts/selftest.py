#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
selftest.py — 仓库自检：防止"自家样张过不了自家闸门"这类问题复发

检查四件事：
  1. 模板 spec 能通过 build-prompt 校验（0 error）
  2. 参考基准图在 baseline 档能过（旧色板产物，只看主色）
  3. 渲染通道产物在 draft 档能过，且墨色/荧光绿/奶油都在区间
  4. 色板闸门判定正确：暖橙/淡紫 PASS，色板外青 FAIL

用法：python scripts/selftest.py
退出码：0 全过 / 1 有失败
"""

import glob
import os
import subprocess
import sys
import tempfile

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
REF = os.path.join(SKILL, "assets", "reference")
TEMPLATES = os.path.join(SKILL, "templates")
NODE = "node"
OK, BAD = "✅", "❌"

fails = []


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def check(name, cond, detail=""):
    print(f"  {OK if cond else BAD} {name:<34}{detail}")
    if not cond:
        fails.append(name)


def check_specs(tmp):
    print("\n[1] 模板 spec 校验")
    for f in sorted(glob.glob(os.path.join(TEMPLATES, "*.json"))):
        if "minimal" in f:      # 空白骨架本来就该报错
            continue
        r = sh([NODE, os.path.join(HERE, "build-prompt.mjs"), f, "--check-only"])
        out = (r.stdout or "") + (r.stderr or "")
        zero_err = "0 error" in out
        check(os.path.basename(f), zero_err, "0 error" if zero_err else "见输出")


def check_baseline():
    print("\n[2] 参考基准（baseline 档）")
    p = os.path.join(REF, "final-poster.png")
    r = sh([sys.executable, os.path.join(HERE, "check-palette.py"), p, "--profile", "baseline"])
    out = (r.stdout or "") + (r.stderr or "")
    check("定稿在 baseline 档不判 FAIL", r.returncode == 0, "exit=%d" % r.returncode)
    check("提示为参考基准（不参与合规）", "参考基准" in out or "不参与配色合规" in out)


def check_render(tmp):
    print("\n[3] 渲染通道（draft 档）")
    for spec in ("sample-a-original.json", "sample-b-product.json"):
        sp = os.path.join(TEMPLATES, spec)
        if not os.path.exists(sp):
            continue
        out_png = os.path.join(tmp, spec.replace(".json", ".png"))
        r = sh([sys.executable, os.path.join(HERE, "render-poster.py"), sp, "--out", out_png])
        if r.returncode != 0 or not os.path.exists(out_png):
            check(spec + " 渲染", False, "渲染失败")
            continue
        g = sh([sys.executable, os.path.join(HERE, "check-palette.py"), out_png, "--profile", "draft"])
        txt = (g.stdout or "") + (g.stderr or "")
        ink_ok = "深黑灰墨色" in txt and "✅ 深黑灰墨色" in txt
        check(spec, g.returncode == 0 and ink_ok, "墨色达标" if ink_ok else "墨色不达标")


def _recolor(src, dst, hexv):
    from PIL import Image

    im = Image.open(src).convert("RGB")
    px = im.load()
    tgt = tuple(int(hexv[i:i + 2], 16) for i in (1, 3, 5))
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            if r > 230 and 180 < g < 235 and b < 120:   # 原图那只暖黄小角色
                px[x, y] = tgt
    im.save(dst)


def check_palette_profiles(tmp):
    print("\n[4] 色板判定（final 档）")
    src = os.path.join(REF, "final-poster.png")
    cases = [("暖橙 #FE7733", "#FE7733", 0), ("淡紫 #B2A1FF", "#B2A1FF", 0), ("板外青 #7FD1C1", "#7FD1C1", 1)]
    for label, hexv, want in cases:
        p = os.path.join(tmp, "accent-" + hexv.replace("#", "") + ".png")
        _recolor(src, p, hexv)
        r = sh([sys.executable, os.path.join(HERE, "check-palette.py"), p, "--profile", "final"])
        check(label, r.returncode == want, "exit=%d (期望 %d)" % (r.returncode, want))


def main():
    print("─" * 62)
    print("IF.Link Meetup 海报 Skill · 仓库自检")
    print("─" * 62)
    with tempfile.TemporaryDirectory() as tmp:
        check_specs(tmp)
        check_baseline()
        check_render(tmp)
        check_palette_profiles(tmp)
    print("─" * 62)
    if fails:
        print(f"{BAD} {len(fails)} 项未通过：" + "、".join(fails))
        sys.exit(1)
    print(f"{OK} 全部通过")


if __name__ == "__main__":
    main()
