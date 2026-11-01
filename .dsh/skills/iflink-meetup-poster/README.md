# IF.Link Meetup 系列活动海报生成 Skill

> 一个**风格引擎**，不是一个活动模板。
> 先选本期配色，再确认活动信息；它会生成提示词包和质检卡。绿、橙、紫为可选活动色，自定义配色需明确 HEX。

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
| 内容层（`spec.json`） | 活动名、时间、地点、嘉宾、话题、福利、插画场景、点缀角色、点缀色、版面 | **每期自由** |
| 适配层（`build-prompt.mjs`） | 按嘉宾数切节距、按场景切插画、按有无点缀角色切白名单/配色表/修复模板 | 自动 |

两个容易误解的点，先说清楚：

0. **新版配色选择**：`theme` 选 `green` / `orange` / `purple` / `custom`，自定义填 `theme_color`。绿、橙、紫色值来自 IF.Land 2026 活动色板，不代表社区通用品牌色已定稿。用户要确认上版信息，并从三版海报中选继续精修的一版。
1. **没有品牌吉祥物**。原作右下角那只黄色小奶龙，是从罗丽老师的话题「如何成为一只会做推送的奶龙」里长出来的点缀角色 —— 换一期没有对应话题，它就不该出现。Skill 里因此是 `decor`（点缀角色）而不是 `mascot`。
2. **经典绿原作**允许小面积点缀色；选橙、紫或自定义主色时，本期不再叠加第四种彩色。以下原作配色数据仅供复盘。

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
node scripts/build-prompt.mjs build/spec.json --pack build/pack   # 出整合包（md + 三张图）
# → build/pack/<活动名>·提示词包.html（双击浏览器打开，带"复制提示词"按钮）
```

**C · 交互 / 骨架 / 直接写 JSON**

```bash
node scripts/new-spec.mjs --out build/spec.json       # 问答式，全部可回车跳过
node scripts/new-spec.mjs --blank --out build/spec.json
node scripts/build-prompt.mjs templates/sample-b-product.json --out build/demo.md   # 看效果
```

依赖：Node ≥ 18（零 npm 依赖）；Python ≥ 3.9 + Pillow。装好后先跑 `python scripts/doctor.py` 自检（字体 / 资产 / 桌面可写）。

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
│   ├── 05-exception-playbook.md   症状→根因→修法→兜底
│   └── 06-image-model-adapter.md  谁真正出图：手工/宿主/API/百炼/渲染 五通道
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
    ├── new-spec.mjs               人话/填表 → spec.json
    ├── build-prompt.mjs           校验 + 出「整合提示词包」（--pack）
    ├── brand-stamp.py             出图后贴官方 Logo / slogan（必跑）
    ├── make-slogan.py             生成规范版 slogan 图
    ├── check-palette.py           配色闸门（主色锁 + 点缀色）
    ├── render-poster.py           确定性渲染（零错字，备选通道）
    └── render-images.mjs          可选：接图像 API（默认 dry-run，不花钱）
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
| 出图通道 | 手工（默认）/ 宿主图像工具 / API / 本机百炼 `bl` / 确定性渲染（见 references/06） |
| 交付物 | 一份整合提示词包（1 md + 3 图），无排法预设、无多份变体 |
| 贴牌 | brand-stamp.py 实测：页眉残留清除、Logo 132×33 @54,40、slogan 363×23 右对齐 |
| 短指令版 | `--compact` 产出 639 字，已用于 qwen-image-2.0 实跑 |

## 版本

`v2.0.0` · 主色锁 `#B1FA63` / `#242021` · 画布 1024×1536（2:3）

- v1.0.0 首版（原作复刻）
- v1.1.0 内容与风格分离：移除模板中的活动硬编码；新增 `new-spec.mjs`（交互 / 填表 / 骨架）、插画场景预设、按嘉宾数自适应版式、`one_liner` 可空
- v2.0.0 可分发：新增 `scripts/doctor.py` 环境自检、`scripts/fonts.py` 跨平台字体（Win/mac/Linux）、LICENSE（代码 MIT / 品牌资产另议）；SKILL.md 新增「0.3 给别人用之前」安装与自检说明
- v1.9.0 改为 agent 引导式交付：SKILL.md 新增「0.2 使用方式」五步话术；`--pack` 不带路径时自动落到**真实桌面**（读注册表 User Shell Folders，兼容桌面重定向）；桌面不可写时自动退回 build/ 并报路径
- v1.8.2 提示词结尾改为"按不同排版给我三版"：一段提示词出 3 版不同构图，挑一版再局部修（不是三份提示词）
- v1.8.1 提示词包改为自包含 HTML：Windows 无 `.md` 关联导致双击只能开 VS Code，改 HTML 后双击即浏览器打开，并在页面内提供一键复制提示词
- v1.8.0 产物收敛：投喂包合并为**一份整合提示词包**（1 个 md + 3 张图），取消 A/B/C 排法变体与规格版外发；排版完全交由 image2 按内容自行决定
- v1.7.1 Slogan 定案：以大写 `Dots`、无句号为准；新增 `make-slogan.py` 生成规范版 slogan 图，品牌库旧图（小写 `dots.`）改名为 legacy 并停用；`brand-stamp.py` 默认贴规范版图
- v1.7.0 Logo 零误差：新增 `brand-stamp.py`（出图后盖掉模型画的 Logo、贴官方 PNG + idiom slogan 文字绘制）；自然版版面段改为「强制 3 种不同排法」并加"灵活排版"；投喂包把贴牌列为出图后第一步
- v1.6.0 提示词分两档：自然版（默认，只学风格/版面自由/配图从嘉宾话题取材）+ 规格版（坐标写死，仅用于精确复刻）；SKILL.md 新增「学风格不学排版」总原则与红线；03 手册补自然版写作配方与风格词库
- v1.5.1 投喂包补齐品牌资产：新增 `03_Slogan.png`（标准图）与 `04_Slogan.txt`（逐字文案 + 大小写规则），上传步骤改为三份品牌资产；文件编号顺延
- v1.5.0 新增确定性渲染通道 `render-poster.py`：不经过任何图像模型，用代码画文字与版式（零错字、配色精确），插画位支持贴当期素材；解决"AI 出的图很丑/文字不可控"的最后一公里
- v1.4.0 版式解绑：提示词拆成「视觉语言（锁死）+ 本期版面（可变）」，新增 5 套版面（A 左文右图 / B 上图下文 / C 中间横带 / D 大图主角 / E 网格卡片）与 `layout: auto`；短指令补拼写警示与头像段落；实测「换版面必须走 t2i，img2img 会锁死版式」
- v1.3.0 打通"直接出图"：`build-prompt.mjs --compact` 产出 600–900 字短指令版（长规范会被生图模型当正文画进画面）；文档补本机百炼 `bl` 通道与四轮实测（v1 参数入画 / v2 旧文案泄漏 / v3 多改点删块 / v4 性别串位）；异常库新增 B5 旧文案泄漏、B6 参数入画、D3 多改点删块
- v1.2.0 概念纠偏：`mascot`（吉祥物）→ `decor`（内容驱动的点缀角色）；配色从"只准荧光绿"放宽为"主色锁 + 单一点缀色 ≤6%"；`check-palette.py` 改为色相分箱量测点缀色；新增出图三通道说明与 `render-images.mjs`

## 溯源

- 对话原始截图：工作区 `和chatgpt的对话/`（11 张，未入库）
- 品牌规范来源：飞书知识库「品牌组」› 品牌视觉基础规范 / 宣发海报提示词
- 定稿：`最终版海报.png`
