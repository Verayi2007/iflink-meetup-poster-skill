# IF.Link Meetup 系列活动海报生成 Skill

> 一个**风格引擎**，不是一个活动模板。
> 你给活动信息，它给提示词包 + 质检卡；视觉体系（色彩、版式、字号、图形语言）是锁死的，内容全部来自入参。

## 这是什么

DeepSeek Harness Skill（`name: iflink-meetup-poster`）。输入任意一场 Meetup 的活动信息，输出：

1. **可直接投喂图像模型的整版提示词**（八板块硬约束，含坐标级版式与色彩锁）
2. **按入参生成的局部重绘提示词**（文字 / 配色 / 版式 / 插画 / 吉祥物）
3. **六道闸门质检卡** + 自动化色彩量测报告
4. **批量产出能力**（系列化时视觉段完全复用，只换文案段）

### 关键设计：内容与风格彻底分离

| 层 | 内容 | 可变性 |
| --- | --- | --- |
| 视觉层（`assets/prompt-template.md` + SKILL 常量） | 画布、主色锁、版式坐标、字号层级、图形语言、闸门 | **锁死**，全系列一致 |
| 内容层（`spec.json`） | 活动名、时间、地点、嘉宾、话题、福利、插画场景、点缀角色、点缀色 | **每期自由** |
| 适配层（`build-prompt.mjs`） | 按嘉宾数切节距、按场景切插画、按有无点缀角色切白名单/配色表/修复模板 | 自动 |

两个容易误解的点，先说清楚：

1. **没有品牌吉祥物**。原作右下角那只黄色小奶龙，是从罗丽老师的话题「如何成为一只会做推送的奶龙」里长出来的点缀角色 —— 换一期没有对应话题，它就不该出现。Skill 里因此是 `decor`（点缀角色）而不是 `mascot`。
2. **不是只准荧光绿**。主色锁仍是 `#B1FA63` / `#242021` / `#F6F6F1`，但允许**一种点缀色 ≤6%**（比如那只奶龙的暖黄就占了 3.0%）。正是这点异色让画面不发闷。

`templates/sample-*.json` 只是两个填法样例（A＝原作定稿，B＝一场完全不同的活动、无点缀角色），**不是默认值**。

## 安装

DeepSeek Harness 扫描以下根目录下的 `<name>/SKILL.md`：

| 作用域 | 路径 |
| --- | --- |
| 项目级（推荐） | `<项目根>/.dsh/skills/iflink-meetup-poster/` |
| 用户级 | `~/.dsh/skills/iflink-meetup-poster/` |

放好即生效（文件监视热加载），无需重启。

## 三种用法

**A · 直接说人话**

> "11 月 14 号周五晚七点半，九龙湖纪忠楼 206，产品设计复盘专场，两位嘉宾：周予安讲校园二手小程序，林知远讲 AI 生成内容的边界，到场有奶茶。"

agent 把它结构化成 `spec.json` → 回读确认 → 出提示词。

**B · 填表**

```bash
cp templates/intake-form.md build/intake.md          # 用中文填
node scripts/new-spec.mjs --from build/intake.md --out build/spec.json
node scripts/build-prompt.mjs build/spec.json --out build/prompt.md
python scripts/check-palette.py build/poster.png --debug
```

**C · 交互 / 骨架 / 直接写 JSON**

```bash
node scripts/new-spec.mjs --out build/spec.json       # 问答式，全部可回车跳过
node scripts/new-spec.mjs --blank --out build/spec.json
node scripts/build-prompt.mjs templates/sample-b-product.json --out build/demo.md   # 看效果
```

依赖：Node ≥ 18（零 npm 依赖）；Python 3 + Pillow（仅色彩闸门需要）。

## 目录

```
iflink-meetup-poster/
├── SKILL.md                       主控：触发条件 + 六阶段 SOP + 红线
├── README.md                      本文件
├── references/
│   ├── 00-methodology.md          原对话全链路复盘 → 四条方法论
│   ├── 01-visual-system.md        视觉体系反拆（坐标级 / 取色级）
│   ├── 02-input-schema.md         入参字段、3 种录入方式、校验码表
│   ├── 03-prompt-playbook.md      三层提示词结构、投喂顺序、反模式
│   ├── 04-qc-rules.md             六道闸门判定标准与纠错机制
│   └── 05-exception-playbook.md   症状→根因→修法→兜底
├── assets/
│   ├── prompt-template.md         提示词母版（纯占位符，无活动内容）
│   └── reference/
│       ├── final-poster.png       定稿基准（1024×1536）
│       ├── IF.Link_浅色背景.svg    浅底用（黑字）
│       └── IF.Link_深色背景.svg    深底用（白字）
├── templates/
│   ├── intake-form.md             中文填表
│   ├── spec.minimal.json          空白骨架
│   ├── sample-a-original.json     样例 A：原作定稿
│   └── sample-b-product.json      样例 B：另一场活动
└── scripts/
    ├── new-spec.mjs               人话/填表 → spec.json
    ├── build-prompt.mjs           校验 + 提示词装配
    ├── check-palette.py           成图配色闸门（主色锁 + 点缀色）
    └── render-images.mjs          可选：接图像 API（默认 dry-run）
```

## 已验证

| 项 | 结果 |
| --- | --- |
| 平台加载 | `.dsh/skills/` 下被正确识别进会话技能目录 |
| 样例 A（4 嘉宾 + 取自话题的点缀角色 / 暖黄点缀色） | `0 error / 1 warning` |
| 样例 B（2 嘉宾 / 白板 / 无点缀角色 / 无主张行） | `0 error / 0 warning`，且输出中**无样例 A 的任何残留** |
| 填表 → spec → 提示词 全链路 | 通过（含 HTML 注释自动清洗） |
| 负例校验 | 8 项 E* 全部拦截（字母 x、缺时刻、色彩锁被改、slogan 被改、出现"联合主办"…） |
| 配色闸门·正例 | 定稿 PASS：奶油白 66.3% / 墨色 11.5% / 荧光绿 9.5% / 点缀色 3.1%（1 种，暖黄）/ 橙红 0% |
| 配色闸门·负例 | 绿替换成参考图橙红 → FAIL（橙红 9.9%、荧光绿 0%、单色点缀 9.7% 抢戏） |
| 出图通道 | 手工（默认）/ 宿主图像工具 / API；`render-images.mjs` dry-run 已验，真实调用未验（无 key） |

## 版本

`v1.2.0` · 主色锁 `#B1FA63` / `#242021` · 画布 1024×1536（2:3）

- v1.0.0 首版（原作复刻）
- v1.1.0 内容与风格分离：移除模板中的活动硬编码；新增 `new-spec.mjs`（交互 / 填表 / 骨架）、插画场景预设、按嘉宾数自适应版式、`one_liner` 可空
- v1.2.0 概念纠偏：`mascot`（吉祥物）→ `decor`（内容驱动的点缀角色）；配色从"只准荧光绿"放宽为"主色锁 + 单一点缀色 ≤6%"；`check-palette.py` 改为色相分箱量测点缀色；新增出图三通道说明与 `render-images.mjs`

## 溯源

- 对话原始截图：工作区 `和chatgpt的对话/`（11 张，未入库）
- 品牌规范来源：飞书知识库「品牌组」› 品牌视觉基础规范 / 宣发海报提示词
- 定稿：`最终版海报.png`
