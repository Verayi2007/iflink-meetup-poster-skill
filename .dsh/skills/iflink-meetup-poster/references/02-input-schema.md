# 02 · 入参规范（字段 / 校验 / 示例）

## 一、一句话原则

> **只问 6 个必填，其余全给默认值。** 用户给一段散装中文，由你替他结构化成 `spec.json`，再回读一遍确认 —— 不要让用户填表。
> **模板里没有任何一场具体活动的信息**，所有内容都从入参来。

## 二、三种录入方式

| 方式 | 适用 | 命令 |
| --- | --- | --- |
| **说人话** | 用户随手一段中文 | 由 agent 直接产出 spec.json（本文件第二节就是字段对照） |
| **填表** | 用户想自己写清楚 | `cp templates/intake-form.md build/intake.md` → 填 → `node scripts/new-spec.mjs --from build/intake.md --out build/spec.json` |
| **交互 / 骨架** | 想一步步来 | `node scripts/new-spec.mjs --out build/spec.json`／`--blank`／改 `templates/spec.minimal.json` |

填表格式（脚本按「键：值」解析，`<!-- -->` 注释会被自动忽略）：

```markdown
活动名称：IF.Link Meetup #12
主题行：产品 × 设计 × 复盘
时间：11 月 14 日（周五）晚 19:30–21:00
地点：东南大学九龙湖校区纪忠楼 2 楼 206
一句话：（可空，空了就不放这一行）

嘉宾：
- 周予安｜女｜从 0 到 1 做一个校园二手交易小程序｜齐肩短发
- 林知远｜男｜AI 生成内容的产品化边界｜短发戴黑框眼镜

福利标题：到场福利
福利：人手一杯奶茶，先到先得
插画场景：白板
点缀角色：无
```

## 三、字段总表

### 必填（6）

| 字段 | 类型 | 说明 | 示例 | 校验规则 |
| --- | --- | --- | --- | --- |
| `event_name` | string | 主标题，压在绿块上 | `IF.Link Meetup` | 非空；≤ 28 字；含「IF.」否则 W006 |
| `kicker` | string | 副标题，压在黑块上 | `AI × 创作 × 交流` | 非空；必须用乘号 `×`，用字母 `x` 直接 E003；建议 ≤ 16 字 |
| `date_time` | string | 时间行 | `10 月 31 日（周六）晚 19:00–21:00` | 必须同时含「X 月 X 日」与「HH:MM」；≤ 30 字 |
| `location` | string | 地点行 | `东南大学四牌楼校区梅庵书院 110 室` | ≥ 6 字；≤ 30 字 |
| `guests[]` | array | 嘉宾 1–6 位 | 见下 | 非空；≤ 6；每位含 `name`/`topic`/`gender` |
| `perks_text` | string | 福利一句话 | `到场有好吃好喝茶歇等着你` | 4–24 字（超出笔刷块宽度） |

### 嘉宾对象

| 字段 | 类型 | 必填 | 说明 | 校验 |
| --- | --- | --- | --- | --- |
| `name` | string | ✅ | 嘉宾姓名 | ≤ 6 字（chip 宽度） |
| `topic` | string | ✅ | 分享主题 | 4–42 字；>36 字警告（3 行上限） |
| `gender` | enum | ✅ | `female` / `male` / `other` | 决定头像形象，**原作曾把男嘉宾画成女性** |
| `hair` | string | ⭕ | 发型/配饰描述，用于头像一致性 | ≤ 14 字 |

### 选填（有默认值，通常不用问）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `one_liner` | **空** | 单行主张；**留空则整行不出**，标题带下方留 70px 呼吸。建议 ≤ 26 字 |
| `guest_section_title` | `分享嘉宾 & 主题` | 区块标 |
| `perks_title` | `小福利` | 笔刷块上的标题 |
| `illustration.scene` | `sit-around` | 右侧插画场景，见下 |
| `illustration.description` | 空 | `scene: custom` 时必填（E061） |
| `decor.preset` | `none` | 右下角点缀角色：`none` / `topic`（从嘉宾话题取意象）/ `custom`。它不是品牌吉祥物 |
| `decor.from_guest` | 空 | `preset: topic` 时必填（E064），填嘉宾姓名 |
| `decor.description` | 空 | `preset: custom` 时必填（E063）；`topic` 时可作为补充提示 |
| `decor.accent_color` | 空 | **只能 `#FE7733` 暖橙 或 `#B2A1FF` 淡紫**（E066）；不填则由模型按本期气质二选一 |
| `layout` | `auto` | **只影响代码渲染器**（`render-poster.py`），提示词不再指定排版。可选 classic/stack/band/hero/grid/auto |
| `layout_note` | 空 | 版面补充一句话（≤80 字），如"插画占满上半版" |
| `decor.props` | 空 | 道具描述，如「白色纸杯，杯身竖排 IF.Link」 |
| `slogan` | `Link the IFs, Connect the Dots` | **锁定**，改动即 E031（除非 `allow_slogan_override: true`） |
| `allow_slogan_override` | `false` | 显式授权后才允许改 slogan |
| `variant` | `cream` | `cream`（原作同款）/ `dark`（黑底变体） |
| `logo_variant` | 随 `variant` 派生 | `light` = 黑字版；`dark` = 白字版。与底色不匹配直接 E042 |
| `canvas` | `1024x1536` | 或 `1536x2304`（印刷 1.5×） |
| `palette` | 无 | 传了也必须等于品牌色，否则 E030 |
| `forbidden_additions` | `[]` | 追加本项目特有的"不许加"元素 |
| `notes` | 空 | 备注，会参与加戏检测 |

### 插画场景（`illustration.scene`）

| 值 | 画面 | 适合 |
| --- | --- | --- |
| `sit-around` | 围坐 + 白板 + 笔电 + 饮品（原作场景） | 通用分享会 |
| `whiteboard` | 一人白板前讲解，其余人聆听/举手 | 技术分享、教学型 Meetup |
| `collab` | 围桌协作、多双手指向屏幕 | 工作坊、共创会 |
| `none` | 不放插画，右侧留白 + 涂鸦呼吸 | 嘉宾多、信息重时 |
| `custom` | 用 `description` 自定义（≤ 200 字） | 特殊主题 |

### 点缀角色（`decor.preset`）

> IF.Link **没有**品牌吉祥物。右下角那个小角色是"本期内容的可视化"：原作那只黄色小奶龙就来自罗丽老师的话题「如何成为一只会做推送的奶龙」，换个主题它就不该出现。

| 值 | 行为 |
| --- | --- |
| `topic` | 提示词里写死"取材自「某嘉宾」的话题「某标题」"，指令模型自己挑一个最具体的名词意象画成简笔角色；可选 `description` 补一句参考形象 |
| `custom` | 完全按 `description` 画（建议写形状 / 主色 HEX / 描边 / 五官 / 道具）；未给 `accent_color` 会 W012 |
| `none` | 不画角色：右下角留白 + 2–3 个荧光绿涂鸦；白名单、配色表、修复模板自动去掉该元素 |

**点缀色色板**：`decor.accent_color` 只能填 `#FE7733` 暖橙 或 `#B2A1FF` 淡紫（E066），面积 ≤6%，只能落在角色/道具与涂鸦上；不填则由模型按本期气质二选一。

## 四、spec.json 骨架

```json
{
  "series": "Meetup",
  "event_name": "IF.Link Meetup #12",
  "kicker": "产品 × 设计 × 复盘",
  "one_liner": "",
  "date_time": "11 月 14 日（周五）晚 19:30–21:00",
  "location": "东南大学九龙湖校区纪忠楼 2 楼 206",
  "guest_section_title": "本期分享",
  "guests": [
    { "name": "周予安", "topic": "从 0 到 1 做一个校园二手交易小程序", "gender": "female", "hair": "齐肩短发" }
  ],
  "perks_title": "到场福利",
  "perks_text": "人手一杯奶茶，先到先得",
  "illustration": { "scene": "whiteboard", "description": "" },
  "decor": { "preset": "none", "from_guest": "", "description": "", "accent_color": "", "props": "" },
  "slogan": "Link the IFs, Connect the Dots",
  "variant": "cream",
  "canvas": "1024x1536"
}
```

完整可跑样例：`templates/sample-a-original.json`（原作）、`templates/sample-b-product.json`（另一场活动）。

## 五、校验码表（`scripts/build-prompt.mjs` 实现）

| 码 | 级别 | 含义 | 处理 |
| --- | --- | --- | --- |
| E001 | error | 必填缺失 | 补齐后再生成 |
| E002 | error | 主标题 > 28 字 | 压缩文案，色块会溢出 |
| E003 | error | 主题行用了字母 x | 改成乘号 `×` |
| E004 | error | 时间缺「X 月 X 日」或「HH:MM」 | 补全，否则模型排版不稳定 |
| E005 | error | 地点 < 6 字 | 补到房间号 |
| E010 | error | 嘉宾 0 位或 > 6 位 | 调整数量或拆图 |
| E011 | error | 嘉宾姓名缺失或 > 6 字 | chip 溢出 |
| E012 | error | 话题 < 4 字或 > 42 字 | 会被模型截断 |
| E013 | error | `gender` 非法 | 必须是 female/male/other |
| E020 | error | 福利文案越界 | 4–24 字 |
| E030 | error | 有人改色彩锁 | 拒绝，品牌色不可覆盖 |
| E031 | error | slogan 被改 | 拒绝；确需改要 `allow_slogan_override` |
| E040 | error | variant 非法 | cream / dark |
| E041 | error | canvas 非法 | 1024x1536 / 1536x2304 |
| E042 | error | Logo 版本与底色不匹配 | 换对应版本 |
| E050 | error | 出现白名单外元素（主办/二维码/…） | 删除该信息 |
| E060 | error | 插画场景非法 | 见场景表 |
| E061 | error | `scene: custom` 但没描述 | 补 `illustration.description` |
| E062 | error | 点缀角色 preset 非法 | none / topic / custom |
| E063 | error | `preset: custom` 但没描述 | 补 `decor.description` |
| E064 | error | `preset: topic` 但没给 `from_guest` | 补嘉宾姓名 |
| E065 | error | `decor.accent_color` 不是 #RRGGBB | 改正 HEX |
| E066 | error | 点缀色不在色板内 | 换成 #FE7733 或 #B2A1FF |
| E070 | error | `layout` 非法 | auto/classic/stack/band/hero/grid |
| E071 | error | `layout: hero` 但没有插画 | 换版面或打开插画 |
| W001 | warn | 话题含易混字 | 人工查证（原作「镣铐」→「镲锜」） |
| W002 | warn | 话题 36–42 字 | 成图后逐字核对 |
| W003 | warn | 主张 > 26 字 | 会换行破坏单行结构 |
| W004 | warn | 嘉宾 5–6 位 | 紧凑版式，注意挤压 |
| W005 | warn | 主题行无分隔符或 > 16 字 | 检查 |
| W006 | warn | 主标题不含「IF.」 | 确认是本系列 |
| W007/W008 | warn | 时间/地点偏长 | 建议压缩 |
| W009 | warn | 发型描述 > 14 字 | 头像只有 96px |
| W010 | warn | spec 里重复声明 palette | 以 SKILL 常量为准 |
| W011 | warn | 自定义插画描述 > 200 字 | 压到 120 字内 |
| W012 | warn | 自定义角色没给点缀色 HEX | 补 HEX，否则模型自由发挥 |
| W013 | warn | `from_guest` 不在嘉宾名单里 | 检查姓名拼写 |

**退出码**：`0` 通过（可带 warning）｜`1` 有 error｜`2` 用法或 IO 错误。可直接接进 CI 或批量脚本。

## 六、字段 → 画面映射（改哪里会动到哪里）

| 字段 | 落在画面 | 改动影响 |
| --- | --- | --- |
| `event_name` | y 134–248 绿块 | 字越多色块越宽，> 28 字压到右栏 |
| `kicker` | y 262–362 黑块 | 同上 |
| `one_liner` | y 385 单行 | 空 → 整行消失、留 70px；> 26 字换行会挤时间行 |
| `date_time` / `location` | y 455 / y 500 | 超长会顶到嘉宾区 |
| `guests[].name` | 绿 chip | > 6 字 chip 溢出 |
| `guests[].topic` | chip 下方 | > 3 行会挤压下一位嘉宾（5–6 位时上限 2 行） |
| `guests.length` | 整段节距 | 2 位疏排 / 3–4 位标准 / 5–6 位紧凑，字号与头像同步缩放 |
| `illustration.scene` | 右侧 x 545–1010 | `none` 时整块变留白 |
| `decor.preset` | 右下 x 620–1000 | `none` 时变留白 + 涂鸦 |
| `decor.accent_color` | 角色与涂鸦 | 决定全图唯一的非品牌色 |
| `perks_text` | y 1330 斜排 | > 24 字超出笔刷块 |
| `variant` | 整张底色 | 会连带切换 Logo 版本 |
