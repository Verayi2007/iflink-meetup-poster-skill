# 06 · 谁真正出图：三条通道

## 一句话结论

> **Skill 自己不会调用 image2。** 它产出的是「提示词包 + 质检卡」，是一个**可复现的生产规格**，不是一个生图插件。
> 出图那一步，取决于运行这个 Skill 的环境有没有图像生成能力。

这不是能力缺失，而是刻意设计：同一份提示词可以在 ChatGPT、即梦、豆包、Seedream、Gemini 图像之间迁移，换模型不用改 Skill。

## 通道对比

| 通道 | 谁执行 | 需要什么 | 优点 | 缺点 |
| --- | --- | --- | --- | --- |
| **A 手工**（默认） | 人 | 浏览器 + ChatGPT（Image 2） | 零配置、能直接用最强参考图能力 | 每期手动贴一次 |
| **B 宿主工具** | agent | 运行环境暴露了「图像生成」类工具 | 全自动，出图即跑配色闸门 | 取决于宿主装了什么 |
| **C API** | 脚本 | 厂商 API key、额度 | 可批量、可进 CI | 花钱；参考图支持因厂商而异 |

## A · 手工通道（当前最稳）

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
