---
name: iflink-meetup-poster
description: IF.Link Meetup 系列活动海报的标准化生成与质检工作流。把活动信息（时间/地点/嘉宾/福利）规范化后，产出可直接投喂图像模型的整版提示词、局部重绘提示词、质检报告与批量清单，稳定复现「奶油白画布 + 深黑灰墨块 + 荧光绿 #B1FA63 + 手绘线稿插画」的原作质感。当用户要做 Meetup / 线下分享会 / 沙龙活动海报，要复刻这张绿黑手绘风海报，或要把系列活动海报批量标准化产出时使用。
whenToUse: 用户提到「Meetup 海报」「活动海报」「分享会海报」「IF.Link 海报」「复刻这张海报」「批量出海报」，或直接给出活动时间/地点/嘉宾/福利并要求出海报时。
license: MIT
compatibility: >-
  Requires Node.js 18+ (zero npm deps) and Python 3.9+ with Pillow. Needs an image
  model (ChatGPT Image 2 recommended, or an image API) for final rendering.
  Fonts: Windows/macOS built-in, Linux needs fonts-noto-cjk. Brand assets in
  assets/reference/ are IF.Link internal only and not covered by the MIT license.
metadata:
  author: Verayi2007
  maintainer: Verayi2007
  brand: IF.Link
  version: "2.1.0"
  status: beta
  updated: "2026-10-31"
  canvas: "1024x1536 (2:3)"
  palette: "#B1FA63 / #242021 / #F6F6F1"
  upstream: ChatGPT Image 2
---

# IF.Link Meetup 系列活动海报生成 Skill

> 本 Skill 是一次真实生产对话（11 轮交互、6 次整版重生成）的结晶。它把"靠感觉调"的过程固化为**可参数化、可校验、可批量**的四段式流水线：**规格落库 → 提示词装配 → 生成 → 六道闸门质检**。

## 0. 这个 Skill 解决什么

> **先明确一件事：这个 Skill 里没有任何一场具体活动的内容。**
> 模板、脚本、母版里只有占位符与视觉规则；活动名、时间、地点、嘉宾、福利全部来自用户的入参。
> `templates/sample-*.json` 只是两个填法样例（A＝原作定稿，B＝另一场完全不同的活动），拿来对照格式，不是默认值。

### 0.1 总原则：学风格，不学排版（最重要的一条）

参考图提供的是**"干净、利落的手绘风"**这一层质感 —— 平涂色块、粗黑描边、大留白、荧光绿点睛；
**它不提供版式**。左边文字右边配图只是其中一种排法，反过来、上下分、网格、标题压图中间都成立。

| 锁死的（决定"一眼是同一套"） | 放开的（每期都可以不一样） |
| --- | --- |
| 三主色 + 单一点缀色、占比 | 分区与构图（左/右/上/下、单栏/双栏/网格） |
| 绿块压黑字、黑块压白字的色块语法 | 插画占多大、压不压字 |
| 字号层级（相对画布高度的百分比） | 嘉宾横排还是竖排、几列 |
| 手绘线稿质感：4–5px 描边、收口略抖、平涂无光影 | 留白的具体位置与比例 |
| 信息层级：活动名 > 时间地点 > 嘉宾 > 福利 | 配图的内容（从嘉宾话题里取材，不套固定角色） |

**这条原则直接决定提示词写法**：自然版提示词里出现"第 1 行、左侧 x=54、占 45–50%"这类位置描述，
就必须删掉 —— 那是规格版的活，不是给生图模型看的。

| 问题 | 本 Skill 的做法 |
| --- | --- |
| 每次生成风格都不一样 | 视觉语言锁死（配色 / 色块语法 / 字号层级 / 描边质感），版面放开 |
| 一锁就死板、像模板 | 默认投**自然版**提示词：只给风格描述 + 文字清单 + 硬约束，版面交给模型 |
| 模型把品牌绿画成参考图的橙红 | **色彩锁**：三主色给定 HEX + 占比区间，点缀色限定双色板，脚本量测成图 |
| 文字被模型写错、写漏、写变形 | 内容锁：逐字清单 + 中文固定搭配校验 + 生成后 OCR 式比对 |
| 加戏（多出"联合主办"、多出没要求的信息块） | 元素白名单：**只允许出现清单内的元素** |
| 每期活动人数、场景都不一样 | 版式**按嘉宾数自适应**，插画场景与右下角点缀角色都可切换或关闭 |
| 想放一个呼应本期内容的小角色 | **点缀角色**：默认不画；可从某位嘉宾的话题里取意象（原作的黄色小奶龙就是这么来的），位置大小由模型定 |
| 整张只有荧光绿太单调 | **点缀色**：`#FE7733` 暖橙 / `#B2A1FF` 淡紫 **二选一**（模型按主题挑），≤6%，只落在小角色与涂鸦上 |
| 小角色/头像被画崩 | 单独走「局部重绘」提示词，不参与整版重生成 |
| 改一处崩全部 | **锁区域迭代**：每轮只允许改动指定区域 |

## 0.2 使用方式：agent 引导式（默认，也是唯一推荐的方式）

> 用户不需要读任何文档、也不需要跑命令。**你（agent）带着他走完五步**，全程只问一次问题。

### 第 0 步 · 开场（一句话，别解释技术细节）

> 我做 IF.Link 的系列海报。你把这期活动信息发我就行，我会给你一个包，扔给 ChatGPT 就能出图。
> 需要：活动名、主题行、时间、地点、嘉宾（姓名 + 各自讲什么）、福利。

### 第 1 步 · 一次性收集信息（只问这一轮）

把下面这张表发过去，让用户随手填；**用户散装回答也可以，你来结构化**：

```
活动名：
主题行（用 × 连接，例：AI × 创作 × 交流）：
时间（例：12 月 19 日 周五 19:00–21:00）：
地点：
嘉宾（姓名｜讲什么｜性别，一人一行）：
福利一句话：
```

规则：
- 用户没给的字段**用默认值**（一句话主张可空、点缀角色默认不画、配色默认奶油白），不要追问第二遍。
- 用户只给了一段话，就自己拆，拆完回读确认，别让他填表。
- 姓名用字要问一句（中文名容易打错字），**性别必问**——它决定头像。

### 第 2 步 · 回读确认（一条消息，别分几条）

```
确认一下这期：
· IF.Link Meetup #16 ｜ 游戏 × 叙事 × 独立开发
· 1 月 9 日（周六）14:00–16:30 ｜ 九龙湖校区教三 305
· 4 位嘉宾：白露 / 程野 / 苏木 / 韩亦
· 福利：送一份 Game Jam 手册
有要改的吗？没有我就开始做。
```

### 第 3 步 · 跑 Skill，把包放到**桌面**

```bash
node scripts/build-prompt.mjs build/spec-16.json --pack
```

- `--pack` 不带路径时，默认写到 `~/Desktop/<活动名> 投喂包/`
- 若桌面不可写（沙箱/权限），脚本会自动退到 `build/`，**你要把真实路径告诉用户**，并说一句"想放桌面的话我可以再拷一份"
- 跑完把输出的「📦 投喂包已生成」那段原样转给用户

### 第 4 步 · 引导用户去 ChatGPT（三句话，别写命令）

> 1. 打开这个文件夹，双击里面的 HTML
> 2. 把 `01_参考图.png`、`02_Logo.svg`、`03_Slogan.png` 三张图传给 ChatGPT，再点页面上的「复制提示词」粘进去
> 3. 它会给你 3 版不同排法的海报，挑一版发回来，我帮你贴 Logo、验色

### 第 5 步 · 用户回图之后

1. `brand-stamp.py` 贴正 Logo 与 slogan（模型画不准，必须重贴）
2. `check-palette.py` 验色，报三色占比 + 点缀色是否落在色板内
3. 逐字核对嘉宾姓名（单字名、生僻字是重灾区），给结论：**能用 / 哪一句要修 / 要不要再来一版**
4. 需要修就给一句"只改这一处"的话术（`references/05-exception-playbook.md`）

### 不要做的事

- 不要一上来讲架构、目录、脚本名
- 不要要求用户自己跑命令、自己改 JSON
- 不要一次抛 8 个问题
- 不要在用户还没确认信息时就生成包
## 0.3 给别人用之前（30 秒自检）

别人拿到这个 Skill，只需要三样东西：**Node ≥ 18、Python ≥ 3.9 + Pillow、一个能生图的模型**。
先跑自检，把环境问题挡在前面：

```bash
python scripts/doctor.py
```

输出全绿就能用：

```
✅ Python 3.12  ✅ Pillow 12.3  ✅ Node v22
✅ 中文字体（Win 雅黑 / mac 苹方 / Linux Noto CJK）
✅ 品牌资产 4 个齐全
✅ 桌面可写 <真实桌面路径>
```

红了就按提示修，最常见三项：

| 症状 | 修法 |
| --- | --- |
| 找不到中文字体 | Linux：`apt install fonts-noto-cjk`；macOS 自带苹方；Windows 自带雅黑 |
| 桌面不可写 | 生成包时加 `--pack <路径>` 指到能写的地方 |
| `node: command not found` | 只影响出提示词包；装 Node 18+ 即可 |

**安装到别人机器上**（DeepSeek Harness 会扫描这些根目录）：

```bash
git clone <repo> 
mkdir -p <项目根>/.dsh/skills
cp -r <repo>/.dsh/skills/iflink-meetup-poster <项目根>/.dsh/skills/
# 或放到用户级：~/.dsh/skills/
```

放好即生效（热加载，无需重启）。然后用 `references/02-input-schema.md` 里的字段填一条 spec，或直接让 agent 引导。

> **分发注意**：`assets/reference/` 里有 IF.Link 品牌资产（Logo / slogan / 定稿），对外发之前确认对方有使用权限，或换成占位素材。代码部分是 MIT（见仓库 LICENSE）。
## 1. 触发与适用边界

**触发**：用户要出 Meetup / 线下分享会 / 沙龙 / 开放麦活动海报；或说"照这张海报的风格再做一张"；或要批量产出一整个系列的活动物料。

**适用**：竖版 2:3 单页海报（1024×1536 基准，可 1.5× 到 1536×2304 印刷）。

**不适用**：横版 Banner、H5 长图、PPT 封面、需要真实人像摄影的作品 —— 请明确告知用户并建议其他通道。

## 2. 快速开始：任选一种入参方式

### 方式 A · 直接说人话（最省事，推荐）

用户随口给一段中文就行：「11 月 14 号周五晚七点半，九龙湖纪忠楼，聊聊产品复盘，两位嘉宾……」
→ **由你把这段话结构化成 spec.json**（字段见 `references/02-input-schema.md`），回读一遍确认，然后走方式 C 的第 2 步。

### 方式 B · 填表

```bash
cp templates/intake-form.md build/intake.md     # 用中文填「活动名称：…」这种行
node scripts/new-spec.mjs --from build/intake.md --out build/spec.json
```

### 方式 C · 命令行 / 骨架 / 交互

```bash
node scripts/new-spec.mjs --out build/spec.json        # 交互问答，全部可回车跳过
node scripts/new-spec.mjs --blank --out build/spec.json # 生成空白骨架自己填
# 或者复制 templates/spec.minimal.json 手填

node scripts/build-prompt.mjs build/spec.json --out build/prompt.md   # 校验 + 装配
python scripts/check-palette.py build/poster.png                       # 成图后量测配色
```

第 2 步输出的 `build/prompt.md` 即为投喂给图像模型（ChatGPT Image 2 / 同类）的**成品提示词**，含整版提示词、局部重绘提示词、负向清单与质检卡。

## 3. 用户入参（极简版）

只问**必填 6 项**，其余全部给默认值，绝不追问。

| # | 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `event_name` | ✅ | — | 主标题，逐字上版 |
| 2 | `kicker` | ✅ | — | 黑底白字副标题，含 `×` |
| 3 | `date_time` | ✅ | — | 例：`10 月 31 日（周六）晚 19:00–21:00` |
| 4 | `location` | ✅ | — | 校区 + 楼宇 + 房间号 |
| 5 | `guests[]` | ✅ | — | 1–6 位，`name` + `topic` + `gender` |
| 6 | `perks_text` | ✅ | — | 福利一句话 |

**选填（有安全默认值，通常不用问）**：

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `one_liner` | 空 | 一句话主张；留空则整行不出，标题带下方留 70px 呼吸 |
| `guest_section_title` | `分享嘉宾 & 主题` | 嘉宾区块标 |
| `perks_title` | `小福利` | 笔刷块标题 |
| `illustration.scene` | `sit-around` | `sit-around` 围坐 / `whiteboard` 白板 / `collab` 协作 / `none` 不放 / `custom` |
| `illustration.description` | — | `custom` 时必填 |
| `decor.preset` | `none` | 右下角点缀角色：`none` 不画 / `topic` 从嘉宾话题取意象 / `custom` 自定义 |
| `decor.from_guest` | — | `preset: topic` 时必填，填嘉宾姓名 |
| `decor.accent_color` | 空 | 全图唯一允许的非品牌色（HEX），面积 ≤6% |
| `decor.props` | 空 | 道具，如「白色纸杯，杯身竖排 IF.Link」 |
| `layout` | `auto` | 版面 6 选 1：`classic` 左文右图 / `stack` 上图下文 / `band` 中间横带 / `hero` 大图主角 / `grid` 网格卡片 / `auto` 自动 |
| `slogan` | `Link the IFs, Connect the Dots` | 锁定；改需 `allow_slogan_override` |
| `variant` | `cream` | 奶油白底 / `dark` 黑底（自动切 Logo 版本） |
| `canvas` | `1024x1536` | 或 `1536x2304` |

字段全表、22 个校验码、字段→画面映射见 **[references/02-input-schema.md](references/02-input-schema.md)**。

> 用户只给一段散装中文时，**由你替他结构化**成 spec.json，再回读一遍确认，不要反问十个问题。

## 4. 执行 SOP

### Phase 0 · 需求解析（禁止跳过）

1. 从用户输入中抽取 6 个必填项；缺失字段用默认值或向用户索要**一次**（合并成一个清单问，不要逐条追问）。
2. 判断 `variant`：默认 `cream`（奶油白画布，原作同款）。只有用户明确要"暗色 / 黑底版"才用 `dark`。
3. 判断 `logo_variant`：`cream` → `logo-light-background`（黑字版）；`dark` → `logo-dark-background`（白字版）。**深浅背景必须配对应 Logo**，这是品牌规范的硬要求。
4. **事实校验**：逐位确认嘉宾姓名用字、性别、职称；话题里的成语/固定搭配（如「戴着镣铐跳舞」）必须查证，禁止形近字（原作曾在「镣铐」处被写成「镲锜」）。
5. 若话题/福利文案为空或明显是占位符，回问用户，不要自己编。

### Phase 1 · 规格落库

把结果写成 `build/spec.json`（字段定义见 `references/02-input-schema.md`）。**这一份 JSON 是后续所有环节的唯一事实源**：改版只改它，不直接改提示词。

### Phase 2 · 提示词装配

```bash
# 产出「一份整合提示词包」：1 个 md + 3 张要上传的图
node scripts/build-prompt.mjs build/spec.json --out build/prompt.md --pack build/pack
```

- 脚本先做 **P0 级校验**（必填、色彩锁、嘉宾数、字数上限、禁用词、版式合法性），再产出**一份整合包**：
  - `<活动名>·提示词包.html`：上传清单 + 唯一一段可粘贴提示词 + 出图后两条命令 + 返修话术 + 质检卡，**全部并入这一个文件**；双击用浏览器打开（Windows 没有 `.md` 关联，md 只能靠 VS Code 打开），页面顶部带「复制提示词」按钮
  - `01_参考图.png` / `02_Logo.svg` / `03_Slogan.png`：要上传的三张图
- **不再产出多份变体**（A/B/C 排法、规格版坐标）。排版交给模型，包只留一份。`build/prompt.md` 里的规格版仅供渲染器/后期对位参考。
- 校验报错必须修到 0 错误再往下走；warning 可以带走。

### Phase 3 · 首轮生成

投喂顺序（对 ChatGPT Image 2 有效，其他模型同理）：

1. 上传包里那三张：`01_参考图.png`、`02_Logo.svg`、`03_Slogan.png`。
2. 粘贴 md 里「二、把下面整段粘进去」的**唯一一段**提示词。
3. 模型会一次给 **3 版不同排法**，挑一版；再 `brand-stamp.py` 贴正 Logo 与 slogan，进 Phase 4 质检。

> 参考图的作用是**提供"干净利落的手绘风"这一层质感**，不是提供分区。**绝对不要在提示词里指定"左边嘉宾、右边配图"这类位置** —— 一旦指定，模型必然画成模板。

### Phase 4 · 可选自检（G1–G6，不强制）

**默认不拦。** 图看着没问题就直接交付，不用逐项打勾。
只有出现下面这些明显症状时，才按对应项目查一遍：

| 症状 | 查哪一项 |
| --- | --- |
| 有字写错 / 漏字 / 名字不对 | G1 内容 |
| 整版发黄、发灰，或冒出别的颜色 | G2 配色（`--profile final`） |
| 缩小后第一眼不是活动名 | G3 层级 |
| 标题和正文一样粗、字体混了 | G4 字体 |
| 出现渐变 / 3D / 照片感 | G5 图形语言 |
| Logo 糊了或变了形 | G6 品牌资产（重新贴一次即可） |

> 这张表的用途是"出问题时快速定位"，不是"交付前的关卡"。别为了打勾反过来折腾已经能用的图。

| 闸门 | 检查内容 | 判定方式 |
| --- | --- | --- |
| **G1 内容锁** | 活动名/时间/地点/嘉宾名/话题/福利，逐字比对 | 肉眼逐字读，重点看生僻字 |
| **G2 色彩锁** | 三色体系 + 占比 + 无外来色 | 脚本量测 + 肉眼 |
| **G3 版式骨架** | 分区顺序、左对齐边线、留白均衡 | 叠参考图比对 |
| **G4 字体层级** | 无衬线、标题最粗、层级不打架 | 肉眼 |
| **G5 图形语言** | 粗描边、圆角 chip、笔刷块、速度线、无渐变/无阴影/无 3D | 肉眼 |
| **G6 品牌资产** | Logo 未变形、slogan 大小写正确、方位正确 | 放大到 200% 看 |

```bash
python scripts/check-palette.py build/poster.png --profile final   # G2（交付图）
```

详细判定标准、阈值与判例见 **[references/04-qc-rules.md](references/04-qc-rules.md)**。

### Phase 5 · 锁区域精修（最多 3 轮）

**铁律：每轮只改一个区域，其余全部保持不变。** 原作之所以越改越乱，就是因为每轮整版重生成。

修复提示词一律用这个句式开头：

> 请基于现有海报进行精修，保持整体构图、视觉风格、活动信息和版式结构不变。**只修改以下部分，其他区域一个像素都不要动**：……

按闸门选修复模板：

- G1 文字错 → 【局部位改文案】模板
- G2 跑色 → 【配色回锁】模板
- G3/G4 版式散 → 【字体与版式统一】6 条模板（原作验证有效）
- G5 风格漂（出现渐变/3D/写实）→ 【风格回锁】模板
- G6 Logo/头像/点缀角色崩 → 【单元素局部重绘】模板

所有模板见 **[references/03-prompt-playbook.md](references/03-prompt-playbook.md)**，症状 → 根因 → 修法对照见 **[references/05-exception-playbook.md](references/05-exception-playbook.md)**。

### Phase 6 · 贴牌 → 交付

**这两步由你（agent）执行，不要把它们写进给用户的提示词包** —— 用户的包只有「上传 → 粘贴 → 挑一版发回来」。**拿到成图的第一件事不是验收，是贴 Logo**：

```bash
python scripts/brand-stamp.py <成图.png> --out <成图-branded.png>
```

- 生图模型画不准 Logo（字重、字距、比例总偏），所以**不让它画**：脚本用画面底色盖掉页眉那条，再贴官方 PNG。
- 自动按底色选深浅版；Logo 高 = 画布高 2.16%、左边距 5.27%；slogan 右对齐、与 Logo 垂直居中。
- slogan 默认用文字绘制，大小写按规范（`IFs` 复数、`Dots` 大写）—— 品牌库那张标准图里是小写 `dots.`，与规范不一致，故不默认使用。

贴完再进质检。

1. 命名：`IFLink-Meetup_<YYYYMMDD>_<主题关键词>_v<终版号>.png`，例：`IFLink-Meetup_20261031_AI创作交流_v6.png`。
2. 同时留档：`spec.json`、`prompt.md`、`check-palette.py` 报告、终稿 PNG。四件套齐全才算交付。
3. 输出交付摘要：活动信息确认表 + 六道闸门结果 + 与参考图的差异点说明。

## 5. 风格校验速查（生成前后各看一遍）

**能出现的颜色**（只有这 6 个）：

```
#F6F6F1  奶油白画布      占比 65–75%
#242021  深黑灰（墨色）  占比 8–12%
#B1FA63  荧光绿          占比 8–12%
#FFFFFF  白（反白文字/杯子）
#DCEFC0  极浅绿（分隔线）
+ 点缀色（#FE7733 暖橙 / #B2A1FF 淡紫 二选一，≤6%，只用于点缀角色与小涂鸦）
```

**禁止**：色板外的任何彩色（第三种颜色）、任何渐变、任何投影、任何金属/霓虹/赛博/3D 质感、任何衬线字体。

**点缀色的分寸**（这条是原作验证过的）：主色负责"这是 IF.Link"，点缀色负责"这是这一期"。一点点异色让画面有呼吸感；超过 6% 或用于文字/色块，立刻变"配色脏"。

**版式**：全部左对齐于 x=5.3% 的基准线；绿色标题带与黑色副标题带**上下紧贴**（间距 ≤ 14px）；右侧留给插画，左侧留给信息，**不得交叉**。

**字号**（以 1024×1536 为基准，等比缩放）：

```
主标题 118  ·  副标题 64  ·  区块标题 40  ·  一句主张 34
条目名 32   ·  条目标题 28  ·  元信息 26  ·  页眉 logo 44
```

## 6. 异常处理速查

| 症状 | 首选动作 |
| --- | --- |
| 绿色跑成橙/黄绿 | 重新强调 HEX + 占比，并在负向清单指名 `#FE7733`；跑两次仍偏 → 后期校色 |
| 文字糊/错/多字 | 不重生成整版，用局部重绘只重画那行字；仍不行 → 后期替换文字层 |
| 多出没要求的元素 | 白名单外一律删；提示词加"只允许出现清单内元素，不得新增任何信息块" |
| 点缀角色变丑/变色 | 局部重绘模板里写死体型、主色 HEX、道具与姿态 |
| 点缀色抢戏（面积超了） | 把异色收回到小角色+2–3 个涂鸦，重新量测；仍超就把角色缩小 |
| 头像性别/发型错 | 按 `gender` 字段写进提示词，并在局部重绘里指定发型与服装 |
| 整体"AI 味"重 | 加"手绘线稿、粗描边、印刷颗粒、轻微错位感"，减去渐变与高光 |
| 版式全散 | 退回参考图，按分区坐标逐条重下指令 |

完整症状库见 **[references/05-exception-playbook.md](references/05-exception-playbook.md)**。

## 7. 目录与资源

```
iflink-meetup-poster/
├── SKILL.md                          # 主控（本文件）
├── README.md                         # 工程说明 / 安装 / 版本
├── references/
│   ├── 00-methodology.md             # 原对话全链路复盘与定稿决策点
│   ├── 01-visual-system.md           # 视觉体系反拆（坐标级）
│   ├── 02-input-schema.md            # 入参清单、校验规则、JSON 结构
│   ├── 03-prompt-playbook.md         # 整版 / 局部 / 精修提示词全集
│   ├── 04-qc-rules.md                # 六道闸门判定标准与阈值
│   └── 05-exception-playbook.md      # 症状库：症状→根因→修法
├── assets/
│   ├── prompt-template.md            # 提示词母版（脚本读取）
│   └── reference/
│       ├── final-poster.png          # 定稿视觉基准（1024×1536）
│       ├── IF.Link_浅色背景.svg       # 浅底用 Logo（黑字）
│       ├── IF.Link-slogan.png         # slogan 标准图（品牌资产，随投喂包一起上传）
│       └── IF.Link_深色背景.svg       # 深底用 Logo（白字）
├── templates/
│   ├── intake-form.md                # 中文填表（粘给 new-spec.mjs 即可）
│   ├── spec.minimal.json             # 空白骨架
│   ├── sample-a-original.json        # 样例 A：原作定稿（4 位嘉宾 + 取自话题的点缀角色）
│   └── sample-b-product.json         # 样例 B：另一场活动（2 位嘉宾、白板、无点缀角色、无主张行）
└── scripts/
    ├── new-spec.mjs                  # 人话/填表 → spec.json（交互 / --from / --blank）
    ├── build-prompt.mjs              # 校验 + 提示词装配（零依赖 Node）
    ├── check-palette.py              # 成图配色闸门（Pillow）
    ├── render-poster.py              # 确定性渲染：代码画文字与版式，零错字
    └── render-images.mjs             # 可选：把提示词接到图像 API（默认只打印请求）
```

## 8. 批量产出（系列化）

一次活动会话可批量出 N 期：

1. 建 `build/series/`，每期一个 `spec-<YYYYMMDD>.json`（可以全部用 `new-spec.mjs` 从填表批量生成）。
2. 循环跑 `build-prompt.mjs` 生成 N 份提示词；整版提示词的**视觉段落完全一致**，只有【活动信息】段不同 —— 这是系列统一感的来源。
3. 成图后逐张跑 `check-palette.py`，全部 PASS 才算收工。
4. 汇总成 `build/series/index.md`：日期 / 主题 / 终稿文件名 / 闸门结果。

> 批量时唯一需要人盯的是**嘉宾人数变化**：2 位走疏排、3–4 位走标准、5–6 位走紧凑，`build-prompt.mjs` 会自动切换节距与字号（W004 会提醒 5–6 位的挤压风险）。

## 9. 硬性红线（任何情况下不破）

1. **主色锁**：`#B1FA63` 荧光绿 + `#242021` 深黑灰 + `#F6F6F1` 奶油白 是系列活动的主色，不得被参考图、模型偏好或用户临时的"换个色试试"污染。
2. **点缀色色板**：只有 `#FE7733` 暖橙 与 `#B2A1FF` 淡紫 两个，二选一、面积 ≤6%，只用于点缀角色/道具与 2–3 个小涂鸦；不得用于文字、色块、chip、图标底。出现第三种彩色即判 FAIL。
3. **Logo 锁**：Logo 是定制图形，只做等比放置，不重绘、不描边、不换字重字距、不反色。多种 Logo 并排时高度必须一致。
4. **Slogan 锁**：`Link the IFs, Connect the Dots` —— `IFs` 复数、`Dots` 大写 D、无结尾句号。**以规范文档与定稿为准**；品牌库那张 `IF.Link-slogan-light.png` 写的是小写 `dots.`，已标记为 legacy，不再使用（规范版图由 `scripts/make-slogan.py` 生成）。
5. **内容锁**：姓名、时间、地点、话题一字不改，不替用户"优化"表达；**也不要拿任何一期的内容当默认值写进模板**。
6. **点缀角色不是品牌吉祥物**：它必须从本期内容里长出来（某位嘉宾的话题意象）或由用户自定义；没有内容依据就不要画。
7. **元素白名单**：只允许出现 页眉 / 标题带 / 副标题带 / 一句主张 / 时间地点 / 嘉宾区 / 福利区 / 插画 / 点缀角色。没有联合主办就不要有联合主办。
8. **版面不是死的**：系列感来自色彩、色块标题语法、字号层级、手绘质感这四样，不来自分区。换版面可以，换这四样不行。
9. **自然版提示词里不许出现位置词**（左 / 右 / 上 / 下 / 右下角 / 坐标 / 百分比）。参考图只提供"干净利落的手绘风"，不提供分区；配图必须从嘉宾话题里取材，不得套固定角色。
10. **可复现**：任何时候拿到 `spec.json`，都应能重建同一张海报。

## 10. 谁来真正出图（重要）

**交付物是一份整合提示词包**（1 个 md + 3 张图），排版交给模型自己决定。**这个 Skill 不会自己调用 image2。** 它产出的是提示词包（含参考图与 Logo 的投喂顺序）；真正把图生出来的是：

| 通道 | 谁执行 | 需要什么 |
| --- | --- | --- |
| **A 手工**（默认，任何环境可用） | 人 | 一键出包：`node scripts/build-prompt.mjs build/spec.json --pack build/pack` → `build/pack/<活动名>·提示词包.md` + 三张图。md 里是：上传清单、**唯一一段可粘贴提示词**、出图后的两条命令、返修话术、质检卡 |
| **B 宿主有图像工具** | agent | 运行环境暴露了图像生成工具时，直接调用（提示词取①段、参考图传 `final-poster.png`），出图后自动跑 `check-palette.py` |
| **C API 自动化** | 脚本 | 自己的 key：`node scripts/render-images.mjs build/prompt.md --ref assets/reference/final-poster.png --execute`（不带 `--execute` 只打印请求，不花钱） |
| **D 本机百炼**（已可用） | `bl` CLI | 本机已配置 DashScope key：`bl image edit --image assets/reference/final-poster.png --prompt "$(cat build/prompt-compact.txt)" --size "1024*1536" --no-prompt-extend --out-dir build/out` |
| **R 确定性渲染**（推荐做终稿） | `render-poster.py` | `python scripts/render-poster.py build/spec.json --out build/poster.png --illustration build/illust.png`：文字由代码绘制，**零错字、颜色版式精确**；插画位贴 AI 生成的素材 |

生成短指令版（吃不下长规范的模型必须用它，否则会把 `40px`/`5.3%` 画进画面）：
`node scripts/build-prompt.mjs build/spec.json --out build/prompt.md`（规格版，仅供渲染器对位，不外发）

实测结论、四轮对比与混合打法见 **[references/06-image-model-adapter.md](references/06-image-model-adapter.md)**。
无论走哪条通道，**G1 文字闸门都还是要人眼过一遍** —— 生成模型至今不稳定地写对中文。
