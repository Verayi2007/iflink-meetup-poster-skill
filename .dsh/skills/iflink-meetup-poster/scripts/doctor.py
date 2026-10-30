#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
doctor.py — 换台电脑先跑这个

检查：Python / Pillow / Node / 中文字体 / 品牌资产 / 桌面可写
用法：python scripts/doctor.py
"""

import os
import shutil
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
sys.path.insert(0, HERE)

OK, BAD, WARN = "✅", "❌", "⚠️"
problems = []


def line(icon, name, detail=""):
    print(f"  {icon} {name:<22}{detail}")


def check_python():
    v = sys.version_info
    if v >= (3, 9):
        line(OK, "Python", f"{v.major}.{v.minor}.{v.micro}")
    else:
        line(BAD, "Python", f"{v.major}.{v.minor}（需要 ≥ 3.9）")
        problems.append("升级 Python 到 3.9+")


def check_pillow():
    try:
        import PIL
        line(OK, "Pillow", PIL.__version__)
    except ImportError:
        line(BAD, "Pillow", "未安装")
        problems.append("pip install pillow")


def check_node():
    exe = shutil.which("node")
    if not exe:
        line(WARN, "Node.js", "未找到（只有生成提示词包需要它）")
        problems.append("装 Node.js 18+，否则 build-prompt.mjs 跑不起来")
        return
    try:
        out = subprocess.run([exe, "-v"], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        out = "?"
    major = 0
    try:
        major = int(out.lstrip("v").split(".")[0])
    except Exception:
        pass
    if major >= 18:
        line(OK, "Node.js", out)
    else:
        line(BAD, "Node.js", f"{out}（需要 ≥ 18）")
        problems.append("升级 Node.js 到 18+")


def check_fonts():
    try:
        from fonts import report

        r = report()
        cjk_name, cjk_path = r["cjk"]
        latin_name, _ = r["latin"]
        if cjk_path:
            line(OK, "中文字体", cjk_name)
        else:
            line(BAD, "中文字体", "未找到")
            problems.append("Linux 装 fonts-noto-cjk；macOS 自带苹方；Windows 自带雅黑")
        line(OK if latin_name else WARN, "拉丁字体", latin_name or "退回中文字体")
    except Exception as e:  # pragma: no cover
        line(BAD, "字体检测", str(e))
        problems.append("检查 scripts/fonts.py")


def check_assets():
    need = ["final-poster.png", "IF.Link_浅色背景.svg", "IF.Link_深色背景.svg", "IF.Link-slogan.png"]
    missing = [n for n in need if not os.path.exists(os.path.join(REF, n))]
    if missing:
        line(BAD, "品牌资产", "缺 " + "、".join(missing))
        problems.append("从仓库重新拉取 assets/reference/")
    else:
        line(OK, "品牌资产", f"{len(need)} 个文件齐全")


def _desktop_from_registry():
    """reg.exe 的输出编码随控制台代码页变，逐个试，用 isdir 校验结果"""
    try:
        raw = subprocess.run(
            [
                "reg",
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
                "/v",
                "Desktop",
            ],
            capture_output=True,
            timeout=10,
        ).stdout
    except Exception:
        return None
    for enc in ("utf-8", "mbcs", "gbk"):
        try:
            text = raw.decode(enc)
        except Exception:
            continue
        for ln in text.splitlines():
            if "Desktop" in ln and "REG_" in ln:
                p = ln.split("REG_SZ")[-1].split("REG_EXPAND_SZ")[-1].strip()
                p = os.path.expandvars(p)
                if p and os.path.isdir(p):
                    return p
    return None


def desktop_path():
    if os.name == "nt":
        p = _desktop_from_registry()
        if p:
            return p
    home = os.path.expanduser("~")
    for name in ("Desktop", "桌面"):
        p = os.path.join(home, name)
        if os.path.isdir(p):
            return p
    return home


def check_desktop():
    d = desktop_path()
    try:
        with tempfile.NamedTemporaryFile(dir=d, prefix=".iflink-write-test-", delete=True):
            pass
        line(OK, "桌面可写", d)
    except Exception as e:
        line(WARN, "桌面可写", f"{d} 不可写（{type(e).__name__}）")
        problems.append("生成包时加 --pack <路径>，指到一个能写的目录")


def main():
    print("─" * 62)
    print("IF.Link Meetup 海报 Skill · 环境自检")
    print("─" * 62)
    check_python()
    check_pillow()
    check_node()
    check_fonts()
    check_assets()
    check_desktop()
    print("─" * 62)
    if problems:
        print(f"{WARN} 还有 {len(problems)} 项要处理：")
        for p in problems:
            print(f"   · {p}")
        sys.exit(1)
    print(f"{OK} 环境齐全，可以用了。下一步：node scripts/build-prompt.mjs <spec.json> --pack")


if __name__ == "__main__":
    main()
