# 工程说明：安装、运行、验证与沿革

> 这份文档给"要把这个 Skill 装到别的机器上、或者接手维护"的人看。
> 只想知道怎么用，读 `SKILL.md` 的「0.2 使用方式」就够，不用看这里。

## 定位

一个**风格引擎**，不是一个活动模板。输入活动信息，输出提示词包 + 质检卡；视觉体系（色彩、字号、图形语言）锁死，内容全部来自入参。

四段式流水线：**规格落库 → 提示词装配 → 生成 → 六道闸门质检**。

## 安装

Agent Skills 标准只要求目录里有 `SKILL.md`，把整个 `iflink-meetup-poster/` 目录放进去即可。

| 工具 | 用户级 | 项目级 |
| --- | --- | --- |
| Codex / Kimi Code / DeepSeek Harness | `~/.agents/skills/iflink-meetup-poster/` | `<项目>/.agents/skills/` |
| Claude Code | `~/.claude/skills/iflink-meetup-poster/` | `<项目>/.claude/skills/` |

```bash
mkdir -p ~/.agents/skills
cp -R <本仓库>/海报/iflink-meetup-poster ~/.agents/skills/
```

放好后跑一次自检，全绿再往下：

```bash
cd ~/.agents/skills/iflink-meetup-poster
python scripts/doctor.py
```

```
✅ Python 3.12  ✅ Pillow 12.3  ✅ Node v22
✅ 中文字体（Win 雅黑 / mac 苹方 / Linux Noto CJK）
✅ 品牌资产 4 个齐全
✅ 桌面可写 <真实桌面路径>
```

常见三项红灯的修法：

| 症状 | 修法 |
| --- | --- |
| 找不到中文字体 | Linux：`apt install fonts-noto-cjk`；macOS 自带苹方；Windows 自带雅黑 |
| 桌面不可写 | 出包时加 `--pack <路径>` 指到能写的地方 |
| `node: command not found` | 只影响出提示词包；装 Node 18+ 即可 |

## 三种入参方式

**A · 直接说人话（默认）**

> "11 月 14 号周五晚七点半，九龙湖纪忠楼 206，产品设计复盘专场，两位嘉宾：周予安讲校园二手小程序，林知远讲 AI 生成内容的边界，到场有奶茶。"

由 agent 结构化成 `spec.json` → 回读确认 → 出包。

**B · 填表**

```bash
cp templates/intake-form.md build/intake.md          # 用中文填
node scripts/new-spec.mjs --from build/intake.md --out build/spec.json
node scripts/build-prompt.mjs build/spec.json --pack build/pack
```

**C · 骨架 / 交互 / 直接写 JSON**

```bash
node scripts/new-spec.mjs --out build/spec.json       # 问答式，全部可回车跳过
node scripts/new-spec.mjs --blank --out build/spec.json
node scripts/build-prompt.mjs templates/sample-b-product.json --out build/demo.md   # 看效果
```

## 30 秒上手

```bash
python scripts/doctor.py                       # 1) 环境自检
node scripts/build-prompt.mjs spec.json --pack # 2) 出投喂包，默认落桌面
```

然后：打开桌面上的 `<活动名> 投喂包/` → 双击 HTML → 上传三张图 + 点「复制提示词」→ 拿 3 版挑一版。

投喂包结构：

```text
IF.Link Meetup #17 投喂包/
├── IF.Link Meetup #17·提示词包.html   ← 唯一要打开的：上传清单 + 一键复制提示词
├── 01_参考图.png                      ← 只借画风，不借排版
├── 02_Logo.svg
└── 03_Slogan.png
```

## 目录

```text
iflink-meetup-poster/
├── SKILL.md                       主控：触发条件 + 五步引导 + 六阶段 SOP + 红线
├── references/
│   ├── 00-methodology.md          原对话全链路复盘 → 四条方法论
│   ├── 01-visual-system.md        视觉体系反拆（坐标级 / 取色级）
│   ├── 02-input-schema.md         入参字段、3 种录入方式、校验码表
│   ├── 03-prompt-playbook.md      三层提示词结构、投喂顺序、反模式
│   ├── 04-qc-rules.md             六道闸门判定标准与纠错机制
│   ├── 05-exception-playbook.md   症状→根因→修法→兜底
│   ├── 06-image-model-adapter.md  谁真正出图：手工/宿主/API/百炼/渲染 五通道
│   └── 07-engineering.md          本文件：安装、运行、验证、沿革
├── assets/
│   ├── prompt-template.md         提示词母版（纯占位符，无活动内容）
│   └── reference/                 品牌资产，见其 README
│       ├── final-poster.png       定稿基准（1024×1536）
│       ├── IF.Link_浅色背景.svg/.png  浅底用 Logo（黑字）
│       ├── IF.Link_深色背景.svg/.png  深底用 Logo（白字）
│       ├── IF.Link-slogan.png     规范版 slogan（大写 Dots）
│       └── IF.Link-slogan-legacy-lowercase.png  ⚠️ 旧图，勿用
├── templates/
│   ├── intake-form.md             中文填表
│   ├── spec.minimal.json          空白骨架
│   ├── sample-a-original.json     样例 A：原作定稿
│   └── sample-b-product.json      样例 B：另一场活动
└── scripts/
    ├── new-spec.mjs               人话/填表/骨架 → spec.json
    ├── build-prompt.mjs           22 项校验 + 出整合投喂包（--pack）
    ├── brand-stamp.py             出图后贴官方 Logo / slogan（必跑）
    ├── make-slogan.py             生成规范版 slogan 图
    ├── check-palette.py           配色闸门（主色锁 + 点缀色）
    ├── doctor.py                  环境自检
    ├── fonts.py                   跨平台字体（Win 雅黑 / mac 苹方 / Linux Noto CJK）
    ├── render-poster.py           确定性渲染（零错字，备选通道）
    └── render-images.mjs          可选：接图像 API（默认 dry-run，不花钱）
```

## 环境要求

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| Node.js | ≥ 18 | 出提示词包（零 npm 依赖） |
| Python | ≥ 3.9 + Pillow | 贴牌 / 验色 / 渲染 / 自检 |
| 一个图像模型 | — | ChatGPT Image 2（推荐）或 API |

## 核心设计：内容与风格彻底分离

| 层 | 内容 | 可变性 |
| --- | --- | --- |
| 视觉层（`assets/prompt-template.md` + SKILL 常量） | 画布、主色锁、字号层级、图形语言、闸门 | **锁死**，全系列一致 |
| 内容层（`spec.json`） | 活动名、时间、地点、嘉宾、话题、福利、插画场景、点缀角色、点缀色、版面 | **每期自由** |
| 适配层（`build-prompt.mjs`） | 按嘉宾数切节距、按场景切插画、按有无点缀角色切白名单/配色表/修复模板 | 自动 |

两个容易误解的点：

1. **没有品牌吉祥物**。原作右下角那只黄色小奶龙，是从嘉宾话题「如何成为一只会做推送的奶龙」里长出来的点缀角色 —— 换一期没有对应话题，它就不该出现。所以字段叫 `decor`（点缀角色）而不是 `mascot`。
2. **不是只准荧光绿**。主色锁是 `#B1FA63` / `#242021` / `#F6F6F1`，但允许**一种点缀色 ≤6%**（那只奶龙的暖黄占 3.0%）。正是这点异色让画面不发闷。

## 11 轮对话换来的 7 条规矩

| 翻车 | 后来怎么写进规则 |
| --- | --- |
| 整版被参考图的橙红带跑 | 色彩锁 + 橙红限定为"只能做点缀、≤6%" + 脚本量测占比 |
| 擅自加了"联合主办" | 元素白名单：不在清单里的一个字都不许加 |
| 标题从「AI × 创作 × 交流」缩成「AI × 交流」 | 逐字清单 + 成图后逐字核对 |
| 「戴着镣铐跳舞」被写成「镲锜」 | 中文固定搭配进校验，生僻字单独提示 |
| 男嘉宾被画成女性 | `gender` 设为必填字段，直接进提示词 |
| 小角色被改成荧光绿、越改越丑 | 角色走局部重绘，且**不参与整版重生成** |
| 每改一处就崩一片 | 锁区域迭代：一轮只改一处，其余冻结 |

最后一条最值钱：**"保持整体不变，只修改这一处"** —— 把 6 次全盘推翻压成了 1 次定向修复。

## 已验证

| 项 | 结果 |
| --- | --- |
| 加载 | 放入技能目录后被正确识别进会话技能列表 |
| 样例 A（4 嘉宾 + 取自话题的点缀角色 / 暖黄点缀色） | `0 error / 1 warning` |
| 样例 B（2 嘉宾 / 白板 / 无点缀角色 / 无主张行） | `0 error / 0 warning`，输出中无样例 A 的任何残留 |
| 填表 → spec → 提示词 全链路 | 通过（含 HTML 注释自动清洗） |
| 负例校验 | 8 项 E* 全部拦截（字母 x、缺时刻、色彩锁被改、slogan 被改、出现"联合主办"…） |
| 配色闸门·正例 | 定稿 PASS：奶油白 66.3% / 墨色 11.5% / 荧光绿 9.5% / 点缀色 3.1% |
| 配色闸门·负例 | 绿替换成参考图橙红 → FAIL（橙红 9.9%、荧光绿 0%） |
| 出图通道 | 手工（默认）/ 宿主图像工具 / API / 本机百炼 `bl` / 确定性渲染 |
| 贴牌 | Logo 132×33 @54,40、slogan 363×23 右对齐、页眉残留清除 |
| 短指令版 | `--compact` 产出 639 字，已用于 qwen-image-2.0 实跑 |

## 版本沿革

当前 `v2.0.0` · 主色锁 `#B1FA63` / `#242021` · 画布 1024×1536（2:3）

| 版本 | 变化 |
| --- | --- |
| 2.0.0 | 可分发：环境自检、跨平台字体、LICENSE |
| 1.9.0 | agent 引导式交付；包默认落真实桌面 |
| 1.8.x | 产物收敛为一份整合 HTML 包；提示词改"一次给 3 版" |
| 1.7.x | Logo 贴牌；slogan 定案（大写 Dots） |
| 1.6.0 | 提示词分两档：学风格 vs 写死坐标 |
| 1.5.x | 投喂包补齐品牌资产；新增确定性渲染通道 |
| 1.4.0 | 版式解绑：视觉语言锁死 + 5 套版面 + `layout: auto` |
| 1.3.0 | 打通"直接出图"：`--compact` 短指令版 |
| 1.2.0 | `mascot` → `decor`；配色放宽为"主色锁 + 单一点缀色" |
| 1.0.0 | 从 11 轮对话里蒸馏出第一版 |

## 溯源与分发注意

- 对话原始截图：工作区 `和chatgpt的对话/`（11 张，未入库）
- 品牌规范来源：飞书知识库「品牌组」› 品牌视觉基础规范 / 宣发海报提示词
- 定稿基准：`assets/reference/final-poster.png`（1024×1536）

`assets/reference/` 里是 IF.Link 品牌资产。对外分发之前确认对方有使用权限，或换成占位素材；代码部分 MIT，品牌素材不随代码许可授权。
