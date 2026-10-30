# 06 · 谁真正出图：四条通道

## 一句话结论

> **Skill 本身不调用 image2。** 它产出的是「提示词包 + 质检卡」，是一个**可复现的生产规格**，不是生图插件。
> 但如果你手上有可用的图像服务（本机已配置阿里百炼 key），这条链路可以被打通 —— 见通道 D 的实测。

## 通道对比

| 通道 | 谁执行 | 需要什么 | 优点 | 缺点 |
| --- | --- | --- | --- | --- |
| **A 手工**（默认） | 人 | 浏览器 + ChatGPT（Image 2） | 零配置、指令遵循与中文最强 | 每期手动贴一次 |
| **B 宿主工具** | agent | 运行环境暴露了「图像生成」类工具 | 全自动 | 取决于宿主装了什么 |
| **C API** | 脚本 | OpenAI 兼容 key | 可批量、可进 CI | 花钱；参考图支持因厂商而异 |
| **D 本机百炼**（已可用） | `bl` CLI | `~/.bailian/config.json` 里的 DashScope key | 7 秒/张、约 ¥0.2–0.3/张、命令极简 | 成片率低，需 2–4 轮修 + 文字后期 |

## D · 本机百炼 `bl`（实测过，最快的一条）

```bash
bl auth status        # 确认已登录（本机：已配置 api-key）

# 以定稿为参考生成新一期（短指令版，639 字）
bl image edit \
  --image assets/reference/final-poster.png \
  --prompt "$(cat build/demo-prompt-compact.txt)" \
  --size "1024*1536" --no-prompt-extend \
  --out-dir build/out --out-prefix "meetup-20261121"

python scripts/check-palette.py build/out/meetup-20261121.png --debug
```

**生成短指令版**（长规范会被模型当正文画进画面）：

```bash
node scripts/build-prompt.mjs build/spec.json --out build/prompt.md --compact build/prompt-compact.txt
```

### 实测记录（2026-10-30，qwen-image-2.0，1024×1536）

同一场活动（Meetup #13 · AI × 硬件 × 造物），四种提示词策略的结果：

| 轮次 | 提示词 | 结果 | 主要问题 |
| --- | --- | --- | --- |
| v1 | ①整版提示词原文（3414 字，规范体） | ❌ 不可用 | 把 `40px`、`43%`、`5.3%`、`65-70%` 当成海报文字画了出来；嘉宾名全部错字；沿用旧角色 |
| v2 | 手写短指令（约 800 字，内容体） | ⚠️ 可作草稿 | 文字全对、插画合理、配色闸门 PASS；但多出一行参考图里的旧文案，头像性别错 |
| v3 | 在 v2 上做局部修（4 处一起改） | ❌ 反向翻车 | 让"删一行"，它把副标题 + 时间地点整块删了；但角色与性别改对了 |
| v4 | `--compact` 生成（639 字，内容体） | ⚠️ 可作草稿 | 版式最干净、文字全对；但性别互换、旧角色回潮 |

**结论（重要）**：

1. **别把规范文档直接喂给生图模型**。qwen-image 这类模型会把尺寸/百分比/色值当成画面文字。→ 用 `--compact` 那份。
2. **参考图会泄漏旧内容**。它会继承参考图里的一整句话或旧角色，即使你的清单里没有。→ 提示词末尾必须写「删除参考图里原有的全部文字与旧角色」。
3. **一次只改一处**这条铁律在 API 上同样成立（v3 就是反例）。
4. 当前 qwen-image-2.0 的**成片率约 1/4**（指不用人工兜底的程度）。它适合出**构图草稿**和**插画/角色素材**，不适合直接出终稿。
5. 想要一次成片，仍建议 **ChatGPT Image 2** 走通道 A —— 原对话那 11 轮就是它跑出来的。

### 混合打法（推荐给要量产的团队）

```
qwen-image / 即梦  →  出构图草稿 + 插画/角色素材（快、便宜、可批量试）
        ↓
人工在 Figma / 设计工具里把文字层重排一遍（中文零错字）
        ↓
check-palette.py 过闸门 + 眼睛过 G1
```

原因很实在：**所有生成模型的中文都不可靠**，而这张海报里文字就是主体。把文字交给排版工具，反而最快达到"可发布"。

## A · 手工通道（质量天花板）

```
① 打开 ChatGPT（Image 2 或更高）
② 上传 assets/reference/final-poster.png（视觉基准）
③ 上传对应版本的 Logo SVG
④ 补一句：Logo 是定制图形，禁止重绘/改字重/改字距/改色
⑤ 粘贴 build/prompt.md 里的【① 整版提示词】
⑥ 出图后：python scripts/check-palette.py <成图> --debug → 过 G1–G6
```

## B · 宿主有图像工具时

若当前会话的工具清单里有图像生成/编辑类工具，agent 应按这个顺序做：

1. 先跑 `build-prompt.mjs` 拿到 `build/prompt.md`（不要自己临场编提示词）。
2. 从 md 里取【① 整版提示词】原文，**不要精简、不要翻译**。
3. 把 `assets/reference/final-poster.png` 作为参考图传入（若工具支持多图，再传 Logo）。
4. 出图保存到 `build/poster.png`。
5. 立刻跑 `check-palette.py`；FAIL 就按闸门选修复模板，**只改一处**再生成。
6. 最后人眼过 G1（文字）。

> 判断方法：看工具清单里有没有 `image` 关键字的能力。没有就是没有 —— 直接告诉用户走通道 A，不要假装能生成。

## C · API 通道

```bash
# 只打印请求，不发、不花钱（安全预览）
node scripts/render-images.mjs build/prompt.md --ref assets/reference/final-poster.png

# 真发：需要 key
$env:IMAGE_API_KEY="sk-..."          # PowerShell
node scripts/render-images.mjs build/prompt.md \
     --ref assets/reference/final-poster.png \
     --size 1024x1536 --out build/out --execute

python scripts/check-palette.py build/out/poster-*.png --debug
```

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `IMAGE_API_KEY` / `OPENAI_API_KEY` | — | 必填（仅 `--execute`） |
| `IMAGE_BASE_URL` | `https://api.openai.com/v1` | 换成兼容网关即可 |
| `IMAGE_MODEL` | `gpt-image-1` | 换成你的模型 id |
| `IMAGE_PROVIDER` | `openai` | 目前只实现了 OpenAI 兼容的 `/images/edits` |

**接入其它厂商**：只用改 `render-images.mjs` 里的 `buildRequest()` / `execute()` 两处（端点、字段名、返回结构）。流程、闸门、命名都不用动。

> 这个脚本未在真实 key 下验证过 —— 第一次用请先打一张小样，确认尺寸与返回结构对得上。

## 模型差异与对策

| 现象 | 常见于 | 对策 |
| --- | --- | --- |
| 中文写不对/漏字 | 所有生成模型 | 接受，后期把文字层重排（最省事的工业化做法） |
| 参考图配色被照抄 | 参考图权重高的模型 | 提示词里点名禁 `#FE7733`，并用闸门量测 |
| 不支持多参考图 | 部分 API | Logo 事后覆盖，只把基准图当参考 |
| 尺寸档位受限 | 多数 API | `render-images.mjs` 会把 1536×2304 映射到 `1024x1536`，再放大 |

## 一句话给用户

> "这个 Skill 负责把'这场活动该怎么画'讲清楚到像素级；真正按快门的是你手上的图像模型。
> 你给我 API key 或一个能生图的工具，我就能把它接成全自动；没有的话，我把提示词和参考图打包好，你贴过去即可。"
