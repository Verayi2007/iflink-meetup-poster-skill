#!/usr/bin/env node
/**
 * render-images.mjs — 可选通道 C：把提示词包接到图像 API
 *
 * 默认只打印请求（dry-run，不花钱、不需要 key）；加 --execute 才真正发请求。
 *
 * 用法：
 *   node scripts/render-images.mjs build/prompt.md --ref assets/reference/final-poster.png
 *   node scripts/render-images.mjs build/prompt.md \
 *        --ref assets/reference/final-poster.png \
 *        --ref assets/reference/IF.Link_浅色背景.svg \
 *        --size 1024x1536 --out build/out --execute
 *
 * 环境变量：
 *   IMAGE_API_KEY / OPENAI_API_KEY   必填（仅 --execute）
 *   IMAGE_BASE_URL                   默认 https://api.openai.com/v1
 *   IMAGE_MODEL                      默认 gpt-image-1
 *
 * 说明：这里只实现 OpenAI 兼容的 /images/edits（带参考图）。其它厂商（即梦、豆包、通义万相、
 * Gemini 图像）接口形状不同，改 buildRequest() 即可，其余流程不变。
 * 该脚本未在任何真实 key 下验证过，请先用 --execute 打一张小样确认。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PROVIDERS = {
  openai: {
    label: "OpenAI 兼容（/images/edits）",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-image-1",
    path: "/images/edits",
  },
};

function parseArgs(argv) {
  const o = { promptFile: null, refs: [], size: "1024x1536", out: "build/out", execute: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ref") o.refs.push(argv[++i]);
    else if (a === "--size") o.size = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--execute") o.execute = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a.startsWith("-")) throw new Error(`未知参数：${a}`);
    else o.promptFile = a;
  }
  return o;
}

/** 从提示词包里抽出「① 整版提示词」那段 ```text 代码块 */
function extractPrompt(markdown) {
  const start = markdown.indexOf("## ① 整版提示词");
  if (start < 0) throw new Error("提示词包里找不到「① 整版提示词」段落");
  const fence = markdown.indexOf("```text", start);
  if (fence < 0) throw new Error("「① 整版提示词」后面没有 ```text 代码块");
  const bodyStart = markdown.indexOf("\n", fence) + 1;
  const end = markdown.indexOf("```", bodyStart);
  if (end < 0) throw new Error("代码块没有闭合");
  return markdown.slice(bodyStart, end).trim();
}

/** 图像 API 对尺寸有限制，把 1536×2304 之类映射到最接近的合法档 */
function normalizeSize(size) {
  const allowed = ["1024x1024", "1024x1536", "1536x1024", "auto"];
  if (allowed.includes(size)) return size;
  const [w, h] = size.split("x").map(Number);
  return h > w ? "1024x1536" : "1024x1024";
}

function buildRequest({ provider, prompt, refs, size, apiKey }) {
  const p = PROVIDERS[provider];
  const base = (process.env.IMAGE_BASE_URL ?? p.baseUrl).replace(/\/$/, "");
  const model = process.env.IMAGE_MODEL ?? p.model;
  return {
    method: "POST",
    url: `${base}${p.path}`,
    headers: { Authorization: `Bearer ${apiKey ? "<your-key>" : "<IMAGE_API_KEY>"}` },
    fields: {
      model,
      prompt,
      size: normalizeSize(size),
      n: "1",
      quality: "high",
    },
    files: refs,
  };
}

function printDryRun(req, prompt) {
  const line = "─".repeat(64);
  console.log(line);
  console.log("通道 C · 图像 API 请求预览（dry-run，未发送、不产生费用）");
  console.log(line);
  console.log(`${req.method} ${req.url}`);
  console.log(`Authorization: ${req.headers.Authorization}`);
  console.log("Content-Type: multipart/form-data");
  console.log("");
  for (const [k, v] of Object.entries(req.fields)) {
    if (k === "prompt") continue;
    console.log(`  ${k} = ${v}`);
  }
  console.log(`  prompt = ${prompt.length} 字符`);
  req.files.forEach((f) => console.log(`  image[] = ${f}`));
  console.log("");
  console.log("curl 等价写法：");
  const form = Object.entries(req.fields)
    .filter(([k]) => k !== "prompt")
    .map(([k, v]) => ` -F "${k}=${v}"`)
    .join("");
  const files = req.files.map((f) => ` -F "image[]=@${f}"`).join("");
  console.log(
    `  curl ${req.url} \\\n    -H "Authorization: Bearer $IMAGE_API_KEY" \\${form}${files} \\\n    -F "prompt=<build/prompt.md 里的①整版提示词>"`,
  );
  console.log(line);
  console.log("要真正发送：加 --execute，并设置 IMAGE_API_KEY（或 OPENAI_API_KEY）。");
  console.log("注意：生成模型对中文文字仍不可靠，出图后必须过 G1 文字闸门。");
}

async function execute(req, outDir) {
  const apiKey = process.env.IMAGE_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("未设置 IMAGE_API_KEY / OPENAI_API_KEY，无法 --execute");

  const form = new FormData();
  for (const [k, v] of Object.entries(req.fields)) form.append(k, v);
  for (const f of req.files) {
    const buf = await readFile(f);
    form.append("image[]", new Blob([buf]), path.basename(f));
  }

  console.log(`→ POST ${req.url}（model=${req.fields.model}, size=${req.fields.size}, refs=${req.files.length}）`);
  const res = await fetch(req.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(240000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API ${res.status}：${text.slice(0, 500)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`返回不是 JSON：${text.slice(0, 200)}`);
  }

  const item = json.data?.[0];
  if (!item) throw new Error("返回里没有 data[0]");

  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const outPath = path.join(outDir, `poster-${stamp}.png`);

  if (item.b64_json) {
    await writeFile(outPath, Buffer.from(item.b64_json, "base64"));
  } else if (item.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(120000) });
    if (!img.ok) throw new Error(`下载图片失败：${img.status}`);
    await writeFile(outPath, Buffer.from(await img.arrayBuffer()));
  } else {
    throw new Error("返回里既没有 b64_json 也没有 url");
  }

  console.log(`✅ 已保存：${outPath}`);
  console.log(`   下一步：python scripts/check-palette.py "${outPath}" --debug`);
  return outPath;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.promptFile) {
    console.log("用法：node scripts/render-images.mjs <prompt.md> [--ref img] [--size 1024x1536] [--out build/out] [--execute]");
    process.exit(o.help ? 0 : 2);
  }
  if (!existsSync(o.promptFile)) throw new Error(`找不到 ${o.promptFile}`);

  const md = await readFile(o.promptFile, "utf8");
  const prompt = extractPrompt(md);

  for (const f of o.refs) {
    if (!existsSync(f)) throw new Error(`参考图不存在：${f}`);
  }

  const provider = process.env.IMAGE_PROVIDER ?? "openai";
  if (!PROVIDERS[provider]) throw new Error(`未知 provider：${provider}（支持 ${Object.keys(PROVIDERS).join(", ")}）`);

  const apiKey = process.env.IMAGE_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const req = buildRequest({ provider, prompt, refs: o.refs, size: o.size, apiKey });

  if (!o.execute) {
    printDryRun(req, prompt);
    return;
  }
  await execute(req, o.out);
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(2);
});
