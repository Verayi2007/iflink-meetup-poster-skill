#!/usr/bin/env node
/**
 * build-prompt.mjs — IF.Link Meetup 海报提示词装配器
 *
 * 职责：
 *   1. 校验 spec.json（品牌色彩锁 / 内容完整性 / 版式风险）
 *   2. 把 spec 渲染进 assets/prompt-template.md
 *   3. 输出一份可直接投喂图像模型的提示词包，并打印校验报告
 *
 * 用法：
 *   node scripts/build-prompt.mjs templates/meetup-spec.example.json --out build/prompt.md
 *   node scripts/build-prompt.mjs build/spec.json --check-only
 *   node scripts/build-prompt.mjs build/spec.json --out build/prompt.md --emit-spec build/spec.normalized.json
 *
 * 退出码：0 = 通过（可能有 warning）；1 = 存在 error；2 = 用法/IO 错误
 * 零依赖，Node >= 18。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(HERE, "..");

/* ────────────────────────────── 品牌常量（不可被 spec 覆盖） ────────────────────────────── */

const BRAND = Object.freeze({
  green: "#B1FA63",
  ink: "#242021",
  cream: "#F6F6F1",
  mascot: "#FED754",
  divider: "#DCEFC0",
  white: "#FFFFFF",
});

const SLOGAN_LOCKED = "Link the IFs, Connect the Dots";
const CANVAS_ALLOWED = ["1024x1536", "1536x2304"];
const FORBIDDEN_ALWAYS = ["联合主办", "主办单位", "承办单位", "赞助", "二维码", "报名链接", "票务"];
// 易错形近字黑名单：命中即提示人工核对。原作曾把「镣铐」错成「镲锜」，实测模型对生僻搭配极不可靠。
// 扩表即可覆盖你自己的高频错字。
const CONFUSABLES = ["镲", "锜", "镶", "铑", "镴"];
const GENDERS = ["female", "male", "other"];

const GENDER_LABEL = { female: "女", male: "男", other: "不限定" };

/* ────────────────────────────── 校验 ────────────────────────────── */

/** @typedef {{level:'error'|'warn', code:string, field:string, msg:string}} Issue */

const issues = [];
const add = (level, code, field, msg) => issues.push({ level, code, field, msg });
const err = (code, field, msg) => add("error", code, field, msg);
const warn = (code, field, msg) => add("warn", code, field, msg);

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const len = (v) => [...(v ?? "")].length; // 按字素近似计数，中文按 1 计

function normalize(raw) {
  const spec = {
    series: raw.series ?? "Meetup",
    event_name: raw.event_name ?? "",
    kicker: raw.kicker ?? "",
    one_liner: raw.one_liner ?? "和一群有趣的人，一起聊聊 AI 的更多可能",
    date_time: raw.date_time ?? "",
    location: raw.location ?? "",
    guest_section_title: raw.guest_section_title ?? "分享嘉宾 & 主题",
    guests: Array.isArray(raw.guests) ? raw.guests : [],
    perks_title: raw.perks_title ?? "小福利",
    perks_text: raw.perks_text ?? "",
    mascot: {
      enabled: raw.mascot?.enabled !== false,
      name: raw.mascot?.name ?? "奶龙",
      cup_brand: raw.mascot?.cup_brand ?? "IF.Link",
    },
    slogan: raw.slogan ?? SLOGAN_LOCKED,
    variant: raw.variant ?? "cream",
    canvas: raw.canvas ?? "1024x1536",
    logo_variant: raw.logo_variant ?? null,
    palette: raw.palette ?? null,
    forbidden_additions: Array.isArray(raw.forbidden_additions) ? raw.forbidden_additions : [],
    notes: raw.notes ?? "",
  };

  // 派生：Logo 版本必须跟着底色走（品牌规范硬要求）
  if (!spec.logo_variant) spec.logo_variant = spec.variant === "dark" ? "dark" : "light";
  return spec;
}

function validate(spec) {
  /* —— 必填 —— */
  if (!isStr(spec.event_name)) err("E001", "event_name", "缺少活动名称 event_name");
  if (!isStr(spec.kicker)) err("E001", "kicker", "缺少主题行 kicker");
  if (!isStr(spec.date_time)) err("E001", "date_time", "缺少活动时间 date_time");
  if (!isStr(spec.location)) err("E001", "location", "缺少活动地点 location");
  if (!isStr(spec.perks_text)) err("E001", "perks_text", "缺少福利文案 perks_text");

  /* —— 主标题 —— */
  if (isStr(spec.event_name)) {
    if (len(spec.event_name) > 28) err("E002", "event_name", `主标题 ${len(spec.event_name)} 字，超过 28 字会导致色块溢出`);
    if (!/IF\./.test(spec.event_name)) warn("W006", "event_name", "主标题未包含「IF.」，请确认这是 IF.Link 系列活动");
  }

  /* —— 主题行 —— */
  if (isStr(spec.kicker)) {
    if (!/[×xX]/.test(spec.kicker)) warn("W005", "kicker", "主题行没有「×」分隔符，原作固定用乘号 × 连接关键词");
    if (/[xX]/.test(spec.kicker) && !/×/.test(spec.kicker)) err("E003", "kicker", "主题行里用了字母 x，必须用乘号「×」");
    if (len(spec.kicker) > 16) warn("W005", "kicker", `主题行 ${len(spec.kicker)} 字，超过 16 字会压不住 64px 字号`);
  }

  /* —— 时间 —— */
  if (isStr(spec.date_time)) {
    const hasDate = /\d{1,2}\s*月\s*\d{1,2}\s*日/.test(spec.date_time);
    const hasClock = /\d{1,2}:\d{2}/.test(spec.date_time);
    if (!hasDate) err("E004", "date_time", "时间缺少「X 月 X 日」，模型无法稳定排版");
    if (!hasClock) err("E004", "date_time", "时间缺少「HH:MM」具体时刻");
    if (len(spec.date_time) > 30) warn("W007", "date_time", "时间文案偏长（>30 字），建议压缩到一行");
  }

  /* —— 地点 —— */
  if (isStr(spec.location)) {
    if (len(spec.location) < 6) err("E005", "location", "地点少于 6 字，请补全校区/楼宇/房间");
    if (len(spec.location) > 30) warn("W008", "location", "地点超过 30 字，建议只留到房间号");
  }

  /* —— 一句话主张 —— */
  if (isStr(spec.one_liner) && len(spec.one_liner) > 26) {
    warn("W003", "one_liner", `一句话主张 ${len(spec.one_liner)} 字，超过 26 字会换行破坏单行结构`);
  }

  /* —— 嘉宾 —— */
  if (spec.guests.length === 0) err("E010", "guests", "至少需要 1 位嘉宾");
  if (spec.guests.length > 6) err("E010", "guests", "嘉宾超过 6 位，2:3 画布放不下，请拆成两张或改用合集页");
  if (spec.guests.length > 4) warn("W004", "guests", `嘉宾 ${spec.guests.length} 位，超过 4 位需压缩节距，注意话题行数`);
  spec.guests.forEach((g, i) => {
    const at = `guests[${i}]`;
    if (!isStr(g?.name)) err("E011", `${at}.name`, "嘉宾缺少姓名");
    else if (len(g.name) > 6) err("E011", `${at}.name`, `姓名 ${len(g.name)} 字，chip 内会溢出（建议 ≤ 6 字）`);
    if (!isStr(g?.topic)) err("E012", `${at}.topic`, "嘉宾缺少分享主题");
    else {
      if (len(g.topic) < 4) err("E012", `${at}.topic`, "分享主题少于 4 字");
      if (len(g.topic) > 42) err("E012", `${at}.topic`, `分享主题 ${len(g.topic)} 字，超过 42 字会被模型截断（最多 3 行 × 14 字）`);
      else if (len(g.topic) > 36) warn("W002", `${at}.topic`, `分享主题 ${len(g.topic)} 字，接近 3 行上限，成图后务必逐字核对`);
      const hits = [...g.topic].filter((c) => CONFUSABLES.includes(c));
      if (hits.length) {
        warn("W001", `${at}.topic`, `话题含易混字「${[...new Set(hits)].join("、")}」，请人工查证是否为正确字（原作「镣铐」曾被写成「镲锜」）`);
      }
    }
    if (!GENDERS.includes(g?.gender)) err("E013", `${at}.gender`, `gender 必须是 ${GENDERS.join(" / ")}，它决定头像形象`);
    if (isStr(g?.hair) && len(g.hair) > 14) warn("W009", `${at}.hair`, "发型描述过长，头像只有 96px，建议 ≤ 14 字");
  });

  /* —— 福利 —— */
  if (isStr(spec.perks_text)) {
    if (len(spec.perks_text) > 24) err("E020", "perks_text", `福利文案 ${len(spec.perks_text)} 字，超过 24 字会超出笔刷块`);
    if (len(spec.perks_text) < 4) err("E020", "perks_text", "福利文案少于 4 字，信息不成立");
  }

  /* —— 色彩锁 —— */
  if (spec.palette) {
    const p = spec.palette;
    const ok = typeof p === "object" && p.green === BRAND.green && p.ink === BRAND.ink;
    if (!ok) {
      err("E030", "palette", `色彩锁被修改。本系列固定 荧光绿 ${BRAND.green} + 深黑灰 ${BRAND.ink}，不得覆盖`);
    } else {
      warn("W010", "palette", "spec 里的 palette 与品牌锁一致，已忽略（颜色由 SKILL 常量决定）");
    }
  }

  /* —— Slogan 锁 —— */
  if (spec.slogan !== SLOGAN_LOCKED) {
    err(
      "E031",
      "slogan",
      `slogan 被改动：「${spec.slogan}」。品牌 slogan 固定为「${SLOGAN_LOCKED}」（IFs 复数、Dots 大写 D）。` +
        "如需临时改写，请先确认品牌组授权，并同步更新 SKILL.md 红线。",
    );
  }

  /* —— 变体 / 画布 —— */
  if (!["cream", "dark"].includes(spec.variant)) err("E040", "variant", "variant 只能是 cream 或 dark");
  if (!CANVAS_ALLOWED.includes(spec.canvas)) err("E041", "canvas", `canvas 只能是 ${CANVAS_ALLOWED.join(" / ")}`);
  if (spec.variant === "dark" && spec.logo_variant !== "dark") {
    err("E042", "logo_variant", "深色变体必须使用深色背景版 Logo（白字），否则 Logo 会消失");
  }
  if (spec.variant === "cream" && spec.logo_variant !== "light") {
    err("E042", "logo_variant", "浅色变体必须使用浅色背景版 Logo（黑字），这是品牌规范硬要求");
  }

  /* —— 加戏检测 —— */
  const blob = JSON.stringify({
    one_liner: spec.one_liner,
    guest_section_title: spec.guest_section_title,
    perks_text: spec.perks_text,
    notes: spec.notes,
  });
  [...FORBIDDEN_ALWAYS, ...spec.forbidden_additions].forEach((word) => {
    if (word && blob.includes(word)) {
      err("E050", "spec", `检测到「${word}」：该元素不在白名单内，本次海报不应出现`);
    }
  });

  return issues;
}

/* ────────────────────────────── 渲染 ────────────────────────────── */

function pad(n) {
  return String(n).padStart(2, "0");
}

function nowStamp() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())} ${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

function guestLines(spec) {
  return spec.guests
    .map((g, i) => `  ${i + 1}. ${g.name}（${GENDER_LABEL[g.gender]}）｜${g.topic}`)
    .join("\n");
}

function illustration(spec) {
  const female = spec.guests.filter((g) => g.gender === "female").length;
  const male = spec.guests.filter((g) => g.gender === "male").length;
  const n = Math.max(spec.guests.length, 2);
  const mix = [male ? `${male} 男` : "", female ? `${female} 女` : ""].filter(Boolean).join(" ") || "性别不限";

  return [
    `画面为 ${n} 位年轻人围坐交流（与嘉宾性别构成一致：${mix}）。`,
    "中间立一块微微倾斜 2–3° 的白板，绿色边框、白板面，板上手写两行「IF.Link / Meetup」，字要手写感、不要印刷体；",
    "桌面上有一台打开的笔记本电脑与几杯奶茶；白板旁画三道手绘速度线。",
    "人物一律手绘线稿：4–5px 纯黑描边，点眼 + 弧线嘴，微笑交谈姿态；",
    "服装以白与墨黑为主，每人身上只出现一处荧光绿 #B1FA63（卫衣、帽子或袖口）。",
    "禁止：写实人脸、照片质感、3D、复杂背景、渐变肤色、真实品牌电脑 Logo。",
  ].join("");
}

function avatarStyle(spec) {
  const withHair = spec.guests.filter((g) => isStr(g.hair));
  if (withHair.length === 0) {
    return "手绘线稿半身像，形象与每位嘉宾的性别一致（female 画女性、male 画男性），衣服用荧光绿 #B1FA63";
  }
  const detail = withHair
    .slice(0, 6)
    .map((g) => `${g.name}：${GENDER_LABEL[g.gender]}，${g.hair}`)
    .join("；");
  return (
    "手绘线稿半身像，形象必须与嘉宾性别一致（female 画女性、male 画男性），衣服用荧光绿 #B1FA63。" +
    `各人头像特征：${detail}`
  );
}

function mascotBlock(spec) {
  if (!spec.mascot.enabled) {
    return "本图不放吉祥物，福利区右侧留白，用 2–3 个荧光绿四角星涂鸦收尾。";
  }
  const m = spec.mascot;
  return (
    `坐在地上的吉祥物${m.name}：圆润梨形、头身一体无脖子、宽度略大于高度、软乎乎；` +
    `身体主色为暖黄 #FED754（不是荧光绿），5px 墨黑描边；一只黑豆眼带白色高光点，另一只是「>」形笑眼，橙色椭圆小嘴；` +
    `双手捧一只白色纸杯，杯身竖排黑字「${m.cup_brand}」，插一根吸管；` +
    "身下垫一片边缘毛糙的荧光绿 #B1FA63 笔刷水洼；右侧配绿色手写「Hi!」与一段 C 形涂鸦。"
  );
}

function render(template, spec, meta) {
  const logoColor = spec.logo_variant === "dark" ? "白色" : "墨黑 #242021";
  const logoFile =
    spec.logo_variant === "dark" ? "IF.Link_深色背景.svg" : "IF.Link_浅色背景.svg";

  const vars = {
    EVENT_NAME: spec.event_name,
    KICKER: spec.kicker,
    ONE_LINER: spec.one_liner,
    DATE_TIME: spec.date_time,
    LOCATION: spec.location,
    GUEST_SECTION_TITLE: spec.guest_section_title,
    GUEST_COUNT: String(spec.guests.length),
    GUESTS_BLOCK: guestLines(spec),
    PERKS_TITLE: spec.perks_title,
    PERKS_TEXT: spec.perks_text,
    SLOGAN: spec.slogan,
    CANVAS: spec.canvas,
    VARIANT_LABEL: spec.variant === "dark" ? "深色版（黑底白字）" : "浅色版（奶油白底）",
    LOGO_FILE: logoFile,
    LOGO_COLOR: logoColor,
    ILLUSTRATION: illustration(spec),
    AVATAR_STYLE: avatarStyle(spec),
    MASCOT: mascotBlock(spec),
    MASCOT_NAME: spec.mascot.name,
    CUP_BRAND: spec.mascot.cup_brand,
    GENERATED_AT: meta.generatedAt,
  };

  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }

  const leftovers = [...out.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]);
  if (leftovers.length) {
    throw new Error(`模板存在未替换的占位符：${[...new Set(leftovers)].join(", ")}`);
  }
  return out;
}

/* ────────────────────────────── CLI ────────────────────────────── */

function parseArgs(argv) {
  const opts = { spec: null, out: "build/prompt.md", checkOnly: false, emitSpec: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" || a === "-o") opts.out = argv[++i];
    else if (a === "--check-only") opts.checkOnly = true;
    else if (a === "--emit-spec") opts.emitSpec = argv[++i];
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a.startsWith("-")) throw new Error(`未知参数：${a}`);
    else opts.spec = a;
  }
  return opts;
}

function printReport(spec, list) {
  const errors = list.filter((i) => i.level === "error");
  const warns = list.filter((i) => i.level === "warn");
  const line = "─".repeat(60);

  console.log(line);
  console.log(`IF.Link Meetup 海报 · 规格校验`);
  console.log(`活动：${spec.event_name} ｜ ${spec.kicker}`);
  console.log(`时间：${spec.date_time}`);
  console.log(`地点：${spec.location}`);
  console.log(`嘉宾：${spec.guests.length} 位 ｜ 画布：${spec.canvas} ｜ 变体：${spec.variant}`);
  console.log(`色彩锁：${BRAND.green} / ${BRAND.ink} / ${BRAND.cream}  [已锁定]`);
  console.log(line);

  if (errors.length === 0 && warns.length === 0) {
    console.log("✅ 全部校验通过（0 error / 0 warning）");
  }
  for (const i of errors) console.log(`❌ [${i.code}] ${i.field} — ${i.msg}`);
  for (const i of warns) console.log(`⚠️  [${i.code}] ${i.field} — ${i.msg}`);
  console.log(line);
  console.log(`结果：${errors.length} error / ${warns.length} warning`);
  return errors.length === 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.spec) {
    console.log(`用法：node scripts/build-prompt.mjs <spec.json> [--out build/prompt.md] [--check-only] [--emit-spec build/spec.normalized.json]`);
    process.exit(opts.help ? 0 : 2);
  }

  const specPath = path.resolve(opts.spec);
  if (!existsSync(specPath)) {
    console.error(`✖ 找不到 spec 文件：${specPath}`);
    process.exit(2);
  }

  let raw;
  try {
    // Windows 编辑器和 PowerShell 常写出带 BOM 的 UTF-8，先剥掉再解析
    const text = (await readFile(specPath, "utf8")).replace(/^\uFEFF/, "");
    raw = JSON.parse(text);
  } catch (e) {
    console.error(`✖ spec 不是合法 JSON：${e.message}`);
    process.exit(2);
  }

  const spec = normalize(raw);
  const list = validate(spec);
  const ok = printReport(spec, list);

  if (opts.emitSpec) {
    const p = path.resolve(opts.emitSpec);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(spec, null, 2) + "\n", "utf8");
    console.log(`↳ 归一化 spec：${path.relative(process.cwd(), p)}`);
  }

  if (!ok) {
    console.error("✖ 存在阻断级错误，未生成提示词。请先修正上述 E* 项。");
    process.exit(1);
  }
  if (opts.checkOnly) process.exit(0);

  const tplPath = path.join(SKILL_ROOT, "assets", "prompt-template.md");
  const template = await readFile(tplPath, "utf8");
  const rendered = render(template, spec, { generatedAt: nowStamp() });

  const outPath = path.resolve(opts.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, rendered, "utf8");

  console.log(`✅ 提示词包已生成：${path.relative(process.cwd(), outPath)}`);
  if (!opts.quiet) {
    console.log(`   下一步：上传 assets/reference/final-poster.png 与 ${spec.logo_variant === "dark" ? "IF.Link_深色背景.svg" : "IF.Link_浅色背景.svg"}`);
    console.log(`   然后粘贴「① 整版提示词」，成图后跑：python scripts/check-palette.py <成图.png>`);
  }
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(2);
});
