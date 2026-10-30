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
cp templates/meetup-spec.example.json build/spec.json   # 改成本期活动
node scripts/build-prompt.mjs build/spec.json --out build/prompt.md
python scripts/check-palette.py build/poster.png --debug
```

## 设计要点

1. **色彩锁**：`#B1FA63` 荧光绿 / `#242021` 深黑灰 / `#F6F6F1` 奶油白，占比 7:1:1，禁用参考图橙红 `#FE7733`。
2. **版式锁**：左基准线 x=54、绿块与黑块紧贴、左信息右插画，坐标级写进提示词。
3. **内容锁**：文案逐字清单 + 元素白名单，禁止模型加戏（主办/二维码/赞助）。
4. **闸门制**：G1 内容 / G2 色彩 / G3 版式 / G4 字体 / G5 图形 / G6 品牌资产，任一 FAIL 不交付。
5. **锁区域迭代**：每轮只改一处，禁止整版重生成 —— 原作"越改越乱"的根因就在这里。

## 溯源

- 原始对话截图（11 张）与飞书品牌规范摘录，见工作区 `和chatgpt的对话/`、`logo&slogan/04_文字与字体规范/`
- 未入库项：对话截图（含个人信息）、138 MB 字体包（请从品牌库获取）

## 本机推送说明

本机 `github.com:443` 直连不通，且 git 的 schannel 后端在本环境报 `SEC_E_NO_CREDENTIALS`。
推送请走本地代理 + openssl 后端：

```powershell
pwsh -File tools/push-to-github.ps1              # 默认代理 127.0.0.1:7897，分支 main
```

脚本运行时才从 `gh auth token` 取凭证，不落盘、不入库。

---
v1.0.0 · 2026-10 · IF.Link 品牌组
