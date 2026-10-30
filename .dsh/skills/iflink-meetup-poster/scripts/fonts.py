#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
fonts.py — 跨平台字体查找（Windows / macOS / Linux）

三个脚本共用：先按优先级找可用的中文字体，找不到就给出可执行的修复建议。
"""

import os
import sys

# 中文字体（标题/正文）：文件名 → 展示名
CJK_CANDIDATES = [
    ("C:/Windows/Fonts/msyhbd.ttc", "微软雅黑 Bold"),
    ("C:/Windows/Fonts/msyh.ttc", "微软雅黑"),
    ("C:/Windows/Fonts/simhei.ttf", "黑体"),
    ("/System/Library/Fonts/PingFang.ttc", "苹方"),
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", "冬青黑体"),
    ("/Library/Fonts/Arial Unicode.ttf", "Arial Unicode"),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "Noto Sans CJK Bold"),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK"),
    ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "文泉驿正黑"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu Sans（无中文）"),
]

# 拉丁字体（slogan 用）：优先接近 Inter 的字形
LATIN_CANDIDATES = [
    ("C:/Windows/Fonts/segoeuib.ttf", "Segoe UI Bold"),
    ("C:/Windows/Fonts/arialbd.ttf", "Arial Bold"),
    ("/System/Library/Fonts/Helvetica.ttc", "Helvetica"),
    ("/Library/Fonts/Arial Bold.ttf", "Arial Bold"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVu Sans Bold"),
]


def _first_existing(candidates):
    for path, name in candidates:
        if os.path.exists(path):
            return path, name
    return None, None


def cjk_font(size):
    """返回 (ImageFont, 字体路径)。找不到中文字体时抛 RuntimeError 并给出修复建议。"""
    from PIL import ImageFont

    path, name = _first_existing(CJK_CANDIDATES)
    if path is None:
        raise RuntimeError(
            "找不到可用的中文字体。\n"
            "  Windows：系统自带 msyhbd.ttc，请确认 C:/Windows/Fonts 可读\n"
            "  macOS：自带 PingFang.ttc\n"
            "  Linux：apt install fonts-noto-cjk（或 fonts-wqy-zenhei）"
        )
    return ImageFont.truetype(path, size), path


def latin_font(size):
    """slogan 用；没有拉丁字体就退回中文字体（大部分中文字体带拉丁字形）。"""
    from PIL import ImageFont

    path, name = _first_existing(LATIN_CANDIDATES)
    if path is None:
        f, p = cjk_font(size)
        return f, p
    return ImageFont.truetype(path, size), path


def report():
    """给 doctor 用：列出检测到的字体"""
    cjk_path, cjk_name = _first_existing(CJK_CANDIDATES)
    latin_path, latin_name = _first_existing(LATIN_CANDIDATES)
    return {
        "cjk": (cjk_name, cjk_path),
        "latin": (latin_name, latin_path),
    }


if __name__ == "__main__":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    r = report()
    print("中文字体：", r["cjk"][0] or "未找到", r["cjk"][1] or "")
    print("拉丁字体：", r["latin"][0] or "未找到", r["latin"][1] or "")
