# 品牌资产清单（assets/reference）

> 生成海报时会被脚本自动取用。**改这里的文件等于改全系列**，动手前先确认。

| 文件 | 用途 | 谁在用 |
| --- | --- | --- |
| `final-poster.png` | **风格基准**（只借画风与版式，不抄分区）。它的点缀色是暖黄 `#FED754`，属于定稿时的历史配色 —— 参考图不参与配色合规判定，新图仍按现行双色板（暖橙/淡紫）执行。要量测它请用 `--profile baseline` | 投喂包 `01_参考图.png` |
| `IF.Link_浅色背景.svg` | 浅底用 Logo（黑字），矢量 | 投喂包 `02_Logo.svg`；规格版提示词 |
| `IF.Link_深色背景.svg` | 深底用 Logo（白字），矢量 | 深色变体 |
| `IF.Link_浅色背景.png` | 同上的位图版（1600×400） | `brand-stamp.py` 贴牌 |
| `IF.Link_深色背景.png` | 深底位图版 | `brand-stamp.py` 贴牌 |
| `IF.Link-slogan.png` | **规范版** slogan 图（大写 `Dots`、无句号），由 `make-slogan.py` 生成 | 投喂包 `03_Slogan.png`；`brand-stamp.py` |
| `IF.Link-slogan-legacy-lowercase.png` | ⚠️ **legacy，勿用**：品牌库原图，写的是 `Link the IFs, Connect the dots.`（小写 + 句号） | 仅留档对照 |

## Slogan 口径（2026-10 定案）

```
Link the IFs, Connect the Dots
```

- `IFs` 是复数，不是 `IF`；
- `Dots` 首字母大写，不是 `dots`；
- 结尾不加句号；
- 中间是英文逗号。

**为什么换图**：品牌库那张标准图写的是小写 `dots.`，与《Logo 字重与大小写规则》和定稿海报都不一致。
经确认以**规范文档 + 定稿**为准，因此用 `scripts/make-slogan.py` 重新生成了一张，旧图改名留档。

## 重新生成 slogan 图

```bash
python scripts/make-slogan.py            # 覆盖 IF.Link-slogan.png
python scripts/make-slogan.py --text "..." --height 192
```

## 贴牌

```bash
python scripts/brand-stamp.py <成图.png> --out <成图-branded.png>
```

会用画面底色盖掉页眉整条（模型画歪的 Logo、slogan、下划线一起清掉），再贴官方 PNG。
