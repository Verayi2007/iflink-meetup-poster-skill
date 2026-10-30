# 02 · 入参规范（字段 / 校验 / 示例）

## 一、一句话原则

> **只问 6 个必填，其余全给默认值。** 用户给一段散装中文，由你替他结构化成 `spec.json`，再回读一遍确认 —— 不要让用户填表。

## 二、字段总表

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
| `one_liner` | `和一群有趣的人，一起聊聊 AI 的更多可能` | 单行主张，建议 ≤ 26 字 |
| `guest_section_title` | `分享嘉宾 & 主题` | 区块标 |
| `perks_title` | `小福利` | 笔刷块上的标题 |
| `mascot.enabled` | `true` | 是否放吉祥物 |
| `mascot.name` | `奶龙` | 吉祥物名 |
| `mascot.cup_brand` | `IF.Link` | 杯身竖排文字 |
| `slogan` | `Link the IFs, Connect the Dots` | **锁定**，改动即 E031 |
| `variant` | `cream` | `cream`（原作同款）/ `dark`（黑底变体） |
| `logo_variant` | 随 `variant` 派生 | `light` = 黑字版；`dark` = 白字版。与底色不匹配直接 E042 |
| `canvas` | `1024x1536` | 或 `1536x2304`（印刷 1.5×） |
| `palette` | 无 | 传了也必须等于品牌色，否则 E030 |
| `forbidden_additions` | `[]` | 追加本项目特有的"不许加"元素 |
| `notes` | 空 | 备注，会参与加戏检测 |

## 三、spec.json 骨架

```json
{
  "series": "Meetup",
  "event_name": "IF.Link Meetup",
  "kicker": "AI × 创作 × 交流",
  "one_liner": "和一群有趣的人，一起聊聊 AI 的更多可能",
  "date_time": "10 月 31 日（周六）晚 19:00–21:00",
  "location": "东南大学四牌楼校区梅庵书院 110 室",
  "guest_section_title": "分享嘉宾 & 主题",
  "guests": [
    { "name": "罗丽", "topic": "如何成为一只会做推送的奶龙", "gender": "female", "hair": "黑色长发" }
  ],
  "perks_title": "小福利",
  "perks_text": "到场有好吃好喝茶歇等着你",
  "mascot": { "enabled": true, "name": "奶龙", "cup_brand": "IF.Link" },
  "slogan": "Link the IFs, Connect the Dots",
  "variant": "cream",
  "canvas": "1024x1536"
}
```

可直接复制 `templates/meetup-spec.example.json` 改字段，它就是原作定稿参数。

## 四、校验码表（`scripts/build-prompt.mjs` 实现）

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
| E031 | error | slogan 被改 | 拒绝，回退标准写法 |
| E040 | error | variant 非法 | cream / dark |
| E041 | error | canvas 非法 | 1024x1536 / 1536x2304 |
| E042 | error | Logo 版本与底色不匹配 | 换对应版本 |
| E050 | error | 出现白名单外元素（主办/二维码/…） | 删除该信息 |
| W001 | warn | 话题含易混字 | 人工查证（原作「镣铐」→「镲锜」） |
| W002 | warn | 话题 36–42 字 | 成图后逐字核对 |
| W003 | warn | 主张 > 26 字 | 会换行破坏单行结构 |
| W004 | warn | 嘉宾 > 4 位 | 压缩节距，注意行数 |
| W005 | warn | 主题行无 `×` 或 > 16 字 | 检查分隔符 |
| W006 | warn | 主标题不含「IF.」 | 确认是本系列 |
| W007/W008 | warn | 时间/地点偏长 | 建议压缩 |
| W009 | warn | 发型描述 > 14 字 | 头像只有 96px |
| W010 | warn | spec 里重复声明 palette | 以 SKILL 常量为准 |

**退出码**：`0` 通过（可带 warning）｜`1` 有 error｜`2` 用法或 IO 错误。可直接接进 CI 或批量脚本。

## 五、字段 → 画面映射（改哪里会动到哪里）

| 字段 | 落在画面 | 改动影响 |
| --- | --- | --- |
| `event_name` | y 134–248 绿块 | 字越多色块越宽，> 28 字压到右栏 |
| `kicker` | y 262–362 黑块 | 同上 |
| `one_liner` | y 385 单行 | > 26 字换行，会把时间行往下挤 |
| `date_time` / `location` | y 455 / y 500 | 超长会顶到嘉宾区 |
| `guests[].name` | 绿 chip | > 6 字 chip 溢出 |
| `guests[].topic` | chip 下方 | > 3 行会挤压下一位嘉宾 |
| `perks_text` | y 1330 斜排 | > 24 字超出笔刷块 |
| `variant` | 整张底色 | 会连带切换 Logo 版本 |
