# IF.Link Meetup 海报 Skill · 工程仓库

IF.Link 社区 Meetup 系列活动的**海报生产工程**：从一次真实生产对话蒸馏出的标准化 Skill，锁定品牌色、版式坐标与提示词结构，让同系列海报可批量、可校验、可复现。

## 一句话

> 给它 6 项活动信息，还你一份「零跑色、零漏字、版式一致」的图像模型提示词包 + 六道质检卡。

## 仓库内容

| 路径 | 说明 |
| --- | --- |
| [`.dsh/skills/iflink-meetup-poster/`](.dsh/skills/iflink-meetup-poster/) | **Skill 本体**，DeepSeek Harness 直接可加载 |
| [`最终版海报.png`](最终版海报.png) | 原作定稿（1024×1536），视觉基准 |
| [`logo&slogan/`](logo&slogan/) | 官方 Logo（SVG/PNG）与品牌字体规范 |

Skill 内部结构见 [`.dsh/skills/iflink-meetup-poster/README.md`](.dsh/skills/iflink-meetup-poster/README.md)。

## 30 秒上手

```bash
cd ".dsh/skills/iflink-meetup-poster"

# ① 录活动信息（三选一：交互问答 / 填表 / 空白骨架）
node scripts/new-spec.mjs --out build/spec.json
# cp templates/intake-form.md build/intake.md && node scripts/new-spec.mjs --from build/intake.md --out build/spec.json

# ② 装配提示词（校验 + 渲染）
node scripts/build-prompt.mjs build/spec.json --out build/prompt.md

# ③ 成图后量测品牌色
python scripts/check-palette.py build/poster.png --debug
```

> 模板里**没有任何具体活动内容**：活动名、时间、地点、嘉宾、福利全部来自 `spec.json`。
> `templates/sample-a-original.json`（原作）与 `sample-b-product.json`（另一场活动）只是填法样例。

## 设计要点

1. **主色锁 + 点缀色**：`#B1FA63` 荧光绿 / `#242021` 深黑灰 / `#F6F6F1` 奶油白 占比 7:1:1；允许 1 种点缀色 ≤6%（原作那点暖黄就是）；禁用参考图橙红 `#FE7733`。
2. **版式锁**：左基准线 x=54、绿块与黑块紧贴、左信息右插画，坐标级写进提示词；嘉宾 2 / 3–4 / 5–6 位自动切节距与字号。
3. **内容锁**：文案逐字清单 + 元素白名单，禁止模型加戏（主办/二维码/赞助）。
4. **闸门制**：G1 内容 / G2 色彩 / G3 版式 / G4 字体 / G5 图形 / G6 品牌资产，任一 FAIL 不交付。
5. **锁区域迭代**：每轮只改一处，禁止整版重生成 —— 原作"越改越乱"的根因就在这里。
6. **可选视觉钩子**：插画场景（围坐/白板/协作/无/自定义）与右下角点缀角色（取自嘉宾话题/自定义/无）都按场次切换，缺省即关闭。角色来自内容，不是品牌吉祥物。

## 溯源

- 原始对话截图（11 张）与飞书品牌规范摘录，见工作区 `和chatgpt的对话/`、`logo&slogan/04_文字与字体规范/`
- 未入库项：对话截图（含个人信息）、138 MB 字体包（请从品牌库获取）

## 本机推送说明

本机 `github.com:443` 直连不通，且 git 的 schannel 后端在本环境报 `SEC_E_NO_CREDENTIALS`。
推送请走本地代理 + openssl 后端：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\push-to-github.ps1   # 或 pwsh -File（若已装 PowerShell 7）
```

脚本运行时才从 `gh auth token` 取凭证，不落盘、不入库。

---
v1.2.0 · 2026-10 · IF.Link 品牌组
