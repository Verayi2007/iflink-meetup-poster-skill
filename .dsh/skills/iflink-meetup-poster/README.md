# IF.Link Meetup 系列活动海报生成 Skill

> 把一次真实生产对话（11 轮交互、6 次整版重生成）沉淀成**可参数化、可校验、可批量**的海报流水线。
> 稳定复现「奶油白画布 + 深黑灰墨块 + 荧光绿 #B1FA63 + 手绘线稿插画」的系列质感。

## 这是什么

一个 DeepSeek Harness Skill（`name: iflink-meetup-poster`）。输入活动信息，输出：

1. **可直接投喂图像模型的整版提示词**（八板块硬约束，含坐标级版式与色彩锁）
2. **6 套局部重绘提示词**（吉祥物 / 单行文字 / 配色回锁 / 版式统一…）
3. **六道闸门质检卡** + 自动化色彩量测报告
4. **批量产出清单**（系列化时视觉段完全复用）

## 安装

DeepSeek Harness 会扫描以下根目录下的 `<name>/SKILL.md`：

| 作用域 | 路径 |
| --- | --- |
| 项目级（推荐） | `<项目根>/.dsh/skills/iflink-meetup-poster/` |
| 用户级 | `~/.dsh/skills/iflink-meetup-poster/` |

把整个 `iflink-meetup-poster/` 目录放到任一位置即可，无需重启（文件监视会热加载）。
本项目已把 Skill 放在 `.dsh/skills/iflink-meetup-poster/`，克隆后即可被识别。

## 快速开始

```bash
# 1) 复制样例，改成本期活动
cp templates/meetup-spec.example.json build/spec.json

# 2) 校验 + 装配提示词
node scripts/build-prompt.mjs build/spec.json --out build/prompt.md

# 3) 把「① 整版提示词」连同参考图、Logo 一起投喂图像模型

# 4) 成图后跑色彩闸门
python scripts/check-palette.py build/poster.png --debug
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
│   ├── 02-input-schema.md         入参字段、校验码、字段→画面映射
│   ├── 03-prompt-playbook.md      三层提示词结构、投喂顺序、反模式
│   ├── 04-qc-rules.md             六道闸门判定标准与纠错机制
│   └── 05-exception-playbook.md   症状→根因→修法→兜底
├── assets/
│   ├── prompt-template.md         提示词母版（脚本读取）
│   └── reference/
│       ├── final-poster.png       定稿基准（1024×1536）
│       ├── IF.Link_浅色背景.svg    浅底用（黑字）
│       └── IF.Link_深色背景.svg    深底用（白字）
├── templates/
│   └── meetup-spec.example.json   原作定稿参数（改字段即可出新一期）
└── scripts/
    ├── build-prompt.mjs           校验 + 提示词装配
    └── check-palette.py           成图色彩锁闸门
```

## 已验证

| 项 | 结果 |
| --- | --- |
| 平台加载 | `.dsh/skills/` 下被正确识别进会话技能目录 |
| 样例装配 | 0 error / 2 warning（长话题提示逐字核对） |
| 负例校验 | 8 项 E* 全部拦截（字母 x、缺时刻、色彩锁被改、slogan 被改、出现"联合主办"…） |
| 色彩闸门·正例 | 定稿 PASS：奶油白 66.3% / 墨色 11.5% / 荧光绿 9.5% / 禁用色 0% |
| 色彩闸门·负例 | 把绿替换成参考图橙红：FAIL，禁用色 9.3%，未归类色 13.6% |

## 版本

`v1.0.0` · 品牌色锁 `#B1FA63` / `#242021` · 画布 1024×1536（2:3）

## 溯源

- 对话原始截图：仓库外的工作区目录 `和chatgpt的对话/`（11 张）
- 品牌规范来源：飞书知识库「品牌组」› 品牌视觉基础规范 / 宣发海报提示词
- 定稿：`最终版海报.png`
