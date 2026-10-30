#!/usr/bin/env node
/**
 * build-prompt.mjs — IF.Link Meetup 海报提示词装配器（纯入参驱动，不含任何具体活动内容）
 *
 * 职责：
 *   1. 校验 spec.json（主色锁 / 内容完整性 / 版式风险 / 点缀色合规）
 *   2. 把 spec 渲染进 assets/prompt-template.md
 *   3. 输出一份可直接投喂图像模型的提示词包，并打印校验报告
 *
 * 用法：
 *   node scripts/build-prompt.mjs build/spec.json --out build/prompt.md
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
  divider: "#DCEFC0",
  white: "#FFFFFF",
  slogan: "Link the IFs, Connect the Dots",
});

const CANVAS_ALLOWED = ["1024x1536", "1536x2304"];
const FORBIDDEN_ALWAYS = ["联合主办", "主办单位", "承办单位", "赞助", "二维码", "报名链接", "票务"];
const CONFUSABLES = ["镲", "锜", "镶", "铑", "镴"];
const GENDERS = ["female", "male", "other"];
const ILLUSTRATION_SCENES = ["sit-around", "whiteboard", "collab", "none", "custom"];
const DECOR_PRESETS = ["none", "topic", "custom"];
const LAYOUTS = ["auto", "classic", "stack", "band", "hero", "grid"];

const GENDER_LABEL = { female: "女", male: "男", other: "不限" };
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/* ────────────────────────────── 版式库（视觉语言共享，分区可变） ────────────────────────────── */

const LAYOUT_DEFS = {
  classic: {
    label: "A · 左文右图",
    body: [
      "· 左侧 50–55% 是信息栏：标题组 → 时间地点 → 嘉宾纵向列表 → 左下角福利笔刷块。",
      "· 右侧 45–50% 是一整幅手绘叙事插画，可以溢出到画布边缘。",
      "· 标题组（绿色主标题块 + 深黑副标题块）横跨左上，不进入右侧插画区。",
      "· 这是最稳的版式，适合 3–4 位嘉宾。",
    ],
  },
  stack: {
    label: "B · 上图下文",
    body: [
      "· 上 45–55% 是整宽的插画场景带：插画横向铺满，标题组以绿块+黑块的形式压在插画图上或紧贴其下缘。",
      "· 下 45% 是信息区：时间地点一行两列，嘉宾做成 2 列网格（左列 1/2 位，右列 3/4 位），每格「圆头像 + 绿 chip 姓名 + 一行话题」。",
      "· 福利笔刷块放在右下角，与插画区对角呼应。",
      "· 适合 5 位嘉宾、信息量偏大的一期。",
    ],
  },
  band: {
    label: "C · 中间插画横带",
    body: [
      "· 上 30%：页眉 + 标题组（绿块主标题、黑块副标题）。",
      "· 中 28–32%：一整条横向插画带，左右顶到安全边距，带子上下各留一条明显空白。",
      "· 下 35%：时间地点 + 嘉宾（单列或双列）+ 福利。",
      "· 视觉动线是「上—中—下」三段式，插画带是全身的呼吸口。",
      "· 适合嘉宾 2–3 位、想要更松弛气质的一期。",
    ],
  },
  hero: {
    label: "D · 大图主角",
    body: [
      "· 手绘插画铺满整张画布（或占 75% 以上），构图饱满、有人物互动。",
      "· 信息不排版成独立区域，而是**叠在大图上**：标题组压在画面中上部，时间/地点/嘉宾/福利以奶油白 #F6F6F1 的实心块或紧凑文本块压在画面下三分之一，保证可读性。",
      "· 这些奶油白块也要是直角或笔刷边缘，不能做成毛玻璃/半透明卡片。",
      "· 适合 1–2 位嘉宾、主题强、想要海报感更强的一期。",
    ],
  },
  grid: {
    label: "E · 网格卡片",
    body: [
      "· 标题组照常占顶部；时间地点压成一行。",
      "· 嘉宾做成 2×2 或 2×3 的卡片网格：每格一张圆形头像 + 绿 chip 姓名 + 话题，格子之间用极浅绿细线分隔。",
      "· 插画缩到右上角或右下角约 30% 的区域内，作为点缀而非主体。",
      "· 适合 4–6 位嘉宾、需要强调「阵容」的一期。",
    ],
  },
};

const LAYOUT_AUTO = {
  // 依据嘉宾数与信息密度自动挑一个，保证不开天窗
  pick(spec) {
    const n = spec.guests.length;
    if (spec.illustration.scene === "none") return "grid";
    if (n <= 2) return "hero";
    if (n <= 4) return "classic";
    if (n === 5) return "stack";
    return "grid";
  },
};

/* ────────────────────────────── 校验 ────────────────────────────── */

const issues = [];
const add = (level, code, field, msg) => issues.push({ level, code, field, msg });
const err = (code, field, msg) => add("error", code, field, msg);
const warn = (code, field, msg) => add("warn", code, field, msg);

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const len = (v) => [...(v ?? "")].length;

function normalize(raw) {
  const d = raw.decor ?? {};
  const decorPreset = d.preset ?? "none";

  const spec = {
    series: raw.series ?? "Meetup",
    event_name: raw.event_name ?? "",
    kicker: raw.kicker ?? "",
    one_liner: raw.one_liner ?? "",
    date_time: raw.date_time ?? "",
    location: raw.location ?? "",
    guest_section_title: raw.guest_section_title ?? "分享嘉宾 & 主题",
    guests: Array.isArray(raw.guests) ? raw.guests : [],
    perks_title: raw.perks_title ?? "小福利",
    perks_text: raw.perks_text ?? "",
    illustration: {
      scene: raw.illustration?.scene ?? "sit-around",
      description: raw.illustration?.description ?? "",
    },
    // 点缀角色：来自内容（嘉宾话题里的意象）或自定义，绝不是"品牌吉祥物"
    decor: {
      preset: decorPreset,                       // none | topic | custom
      from_guest: d.from_guest ?? "",
      description: d.description ?? "",
      accent_color: d.accent_color ?? "",
      props: d.props ?? "",
    },
    layout: raw.layout ?? "auto",                // auto | classic | stack | band | hero | grid
    layout_note: raw.layout_note ?? "",
    slogan: raw.slogan ?? BRAND.slogan,
    allow_slogan_override: raw.allow_slogan_override === true,
    variant: raw.variant ?? "cream",
    canvas: raw.canvas ?? "1024x1536",
    logo_variant: raw.logo_variant ?? null,
    palette: raw.palette ?? null,
    forbidden_additions: Array.isArray(raw.forbidden_additions) ? raw.forbidden_additions : [],
    notes: raw.notes ?? "",
  };

  if (!spec.logo_variant) spec.logo_variant = spec.variant === "dark" ? "dark" : "light";
  return spec;
}

function validate(spec) {
  /* —— 必填 —— */
  for (const [k, label] of [
    ["event_name", "活动名称"],
    ["kicker", "主题行"],
    ["date_time", "活动时间"],
    ["location", "活动地点"],
    ["perks_text", "福利文案"],
  ]) {
    if (!isStr(spec[k])) err("E001", k, `缺少${label} ${k}`);
  }

  /* —— 主标题 —— */
  if (isStr(spec.event_name)) {
    if (len(spec.event_name) > 28) err("E002", "event_name", `主标题 ${len(spec.event_name)} 字，超过 28 字会导致色块溢出`);
    if (!/IF\./.test(spec.event_name)) warn("W006", "event_name", "主标题未包含「IF.」，请确认这是 IF.Link 系列活动");
  }

  /* —— 主题行 —— */
  if (isStr(spec.kicker)) {
    if (!/×/.test(spec.kicker) && /[xX]/.test(spec.kicker)) {
      err("E003", "kicker", "主题行里用了字母 x，必须用乘号「×」");
    }
    if (!/[×xX·／|\/]/.test(spec.kicker)) warn("W005", "kicker", "主题行没有分隔符（原作固定用乘号 × 连接关键词）");
    if (len(spec.kicker) > 16) warn("W005", "kicker", `主题行 ${len(spec.kicker)} 字，超过 16 字会压不住 64px 字号`);
  }

  /* —— 时间 —— */
  if (isStr(spec.date_time)) {
    if (!/\d{1,2}\s*月\s*\d{1,2}\s*日/.test(spec.date_time)) err("E004", "date_time", "时间缺少「X 月 X 日」，模型无法稳定排版");
    if (!/\d{1,2}:\d{2}/.test(spec.date_time)) err("E004", "date_time", "时间缺少「HH:MM」具体时刻");
    if (len(spec.date_time) > 30) warn("W007", "date_time", "时间文案偏长（>30 字），建议压缩到一行");
  }

  /* —— 地点 —— */
  if (isStr(spec.location)) {
    if (len(spec.location) < 6) err("E005", "location", "地点少于 6 字，请补全校区/楼宇/房间");
    if (len(spec.location) > 30) warn("W008", "location", "地点超过 30 字，建议只留到房间号");
  }

  /* —— 一句话主张（可选） —— */
  if (isStr(spec.one_liner) && len(spec.one_liner) > 26) {
    warn("W003", "one_liner", `一句话主张 ${len(spec.one_liner)} 字，超过 26 字会换行破坏单行结构`);
  }

  /* —— 嘉宾 —— */
  if (spec.guests.length === 0) err("E010", "guests", "至少需要 1 位嘉宾");
  if (spec.guests.length > 6) err("E010", "guests", "嘉宾超过 6 位，2:3 画布放不下，请拆成两张或改用合集页");
  if (spec.guests.length === 5 || spec.guests.length === 6) {
    warn("W004", "guests", `${spec.guests.length} 位嘉宾：头像缩小到 76px、话题限 2 行，成图后重点检查是否挤压`);
  }
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
        warn("W001", `${at}.topic`, `话题含易混字「${[...new Set(hits)].join("、")}」，请人工查证是否为正确字`);
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

  /* —— 插画 —— */
  if (!ILLUSTRATION_SCENES.includes(spec.illustration.scene)) {
    err("E060", "illustration.scene", `场景只能是 ${ILLUSTRATION_SCENES.join(" / ")}`);
  }
  if (spec.illustration.scene === "custom" && !isStr(spec.illustration.description)) {
    err("E061", "illustration.description", "scene=custom 时必须给出 description（自定插画场景）");
  }
  if (len(spec.illustration.description) > 200) {
    warn("W011", "illustration.description", "自定义插画描述超过 200 字，模型会抓不住重点，建议压到 120 字内");
  }

  /* —— 点缀角色（来自内容，不是品牌吉祥物） —— */
  const dec = spec.decor;
  if (!DECOR_PRESETS.includes(dec.preset)) {
    err("E062", "decor.preset", `点缀角色 preset 只能是 ${DECOR_PRESETS.join(" / ")}`);
  }
  if (dec.preset === "custom" && !isStr(dec.description)) {
    err("E063", "decor.description", "preset=custom 时必须描述这个角色/物件长什么样");
  }
  if (dec.preset === "topic") {
    if (!isStr(dec.from_guest)) {
      err("E064", "decor.from_guest", "preset=topic 时必须指定 from_guest（从哪位嘉宾的话题里取意象）");
    } else if (!spec.guests.some((g) => g.name === dec.from_guest)) {
      warn("W013", "decor.from_guest", `from_guest「${dec.from_guest}」不在嘉宾名单里，请确认姓名拼写`);
    }
  }
  if (isStr(dec.accent_color) && !HEX_RE.test(dec.accent_color)) {
    err("E065", "decor.accent_color", "accent_color 必须是 #RRGGBB 形式");
  }
  if (dec.preset !== "none" && !isStr(dec.accent_color) && dec.preset === "custom") {
    warn("W012", "decor.accent_color", "自定义角色没指定点缀色 HEX，模型容易自由发挥；建议写明如 #FED754");
  }

  /* —— 版式 —— */
  if (!LAYOUTS.includes(spec.layout)) {
    err("E070", "layout", `版式只能是 ${LAYOUTS.join(" / ")}`);
  }
  if (spec.layout === "hero" && spec.illustration.scene === "none") {
    err("E071", "layout", "layout=hero 需要插画，但 illustration.scene=none，二者冲突");
  }
  if (spec.layout === "hero" && spec.guests.length >= 5) {
    warn("W014", "layout", "hero 版式叠字区域小，5 位以上嘉宾信息会挤，建议改用 stack 或 grid");
  }
  if (spec.layout === "classic" && spec.guests.length >= 5) {
    warn("W015", "layout", "classic 版式单列嘉宾放 5 位以上会偏挤，建议改用 stack/grid");
  }
  if (len(spec.layout_note) > 80) {
    warn("W016", "layout_note", "版式补充说明超过 80 字，建议只写一句构图要求");
  }

  /* —— 色彩锁 —— */
  if (spec.palette) {
    const ok = typeof spec.palette === "object" && spec.palette.green === BRAND.green && spec.palette.ink === BRAND.ink;
    if (!ok) err("E030", "palette", `主色锁被修改。本系列固定 荧光绿 ${BRAND.green} + 深黑灰 ${BRAND.ink}，不得覆盖`);
    else warn("W010", "palette", "spec 里的 palette 与主色锁一致，已忽略（颜色由 SKILL 常量决定）");
  }

  /* —— Slogan —— */
  if (spec.slogan !== BRAND.slogan && !spec.allow_slogan_override) {
    err(
      "E031",
      "slogan",
      `slogan 被改成「${spec.slogan}」。品牌 slogan 固定为「${BRAND.slogan}」；` +
        "确需改写请在 spec 里加 \"allow_slogan_override\": true，并注明授权来源。",
    );
  }

  /* —— 变体 / 画布 / Logo —— */
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

/* ────────────────────────────── 渲染用派生文案 ────────────────────────────── */

function pad(n) {
  return String(n).padStart(2, "0");
}

function nowStamp() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())} ${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

const guestLines = (spec) =>
  spec.guests.map((g, i) => `  ${i + 1}. ${g.name}（${GENDER_LABEL[g.gender]}）｜${g.topic}`).join("\n");

function guestLayout(spec) {
  const n = spec.guests.length;
  if (n <= 2) {
    return `${n} 位嘉宾（疏排：头像直径约画布宽 11%、姓名 chip 32px 级、话题最多 3 行）：`;
  }
  if (n <= 4) {
    return `${n} 位嘉宾（标准：头像约 9.5%、姓名 chip 30px 级、话题最多 3 行）：`;
  }
  return `${n} 位嘉宾（紧凑：头像约 7.5%、姓名 chip 26px 级、话题最多 2 行，禁止挤压重叠）：`;
}

/** 解析实际使用的版式（auto 按嘉宾数与插画有无自动选） */
function resolveLayout(spec) {
  if (spec.layout !== "auto") return spec.layout;
  return LAYOUT_AUTO.pick(spec);
}

function layoutBlock(spec) {
  const key = resolveLayout(spec);
  const def = LAYOUT_DEFS[key];
  const lines = [...def.body];
  if (key === "stack" || key === "grid") {
    lines.push(`· 本图共 ${spec.guests.length} 位嘉宾，网格排布要留足空隙，姓名 chip 不得压到相邻卡片。`);
  }
  if (isStr(spec.layout_note)) lines.push(`· 补充构图要求：${spec.layout_note}`);
  return lines.join("\n");
}

function oneLinerBlock(spec) {
  if (!isStr(spec.one_liner)) {
    return "本图不设一句话主张：主标题带与时间行之间保持 70px 留白，禁止补任何文字或装饰。";
  }
  return `一句话主张（y 385）：「${spec.one_liner}」，34px，字重 500，墨黑色，单行不换行。`;
}

function peopleMix(spec) {
  const female = spec.guests.filter((g) => g.gender === "female").length;
  const male = spec.guests.filter((g) => g.gender === "male").length;
  return [male ? `${male} 男` : "", female ? `${female} 女` : ""].filter(Boolean).join(" ") || "性别不限";
}

function illustration(spec) {
  const n = spec.guests.length;
  const mix = peopleMix(spec);
  const common =
    "人物一律手绘线稿：4–5px 纯黑描边，点眼 + 弧线嘴，微笑交谈姿态；" +
    "服装以白与墨黑为主，每人身上只出现一处荧光绿 #B1FA63（卫衣、帽子或袖口）。" +
    "禁止：写实人脸、照片质感、3D、复杂背景、渐变肤色、真实品牌 Logo。";

  const scenes = {
    "sit-around": [
      `画面为 ${n} 位年轻人围坐交流（与嘉宾性别构成一致：${mix}）。`,
      "中间立一块微微倾斜 2–3° 的白板，绿色边框、白板面，板上手写两行与活动名相关的简短字样，要手写感不要印刷体；",
      "桌面上有一台打开的笔记本电脑与几杯饮品；白板旁画三道手绘速度线。",
      common,
    ],
    whiteboard: [
      `画面为 ${n} 人：一人站在白板前讲解（手持马克笔），其余 ${Math.max(n - 1, 1)} 人坐着聆听/举手互动（性别构成与嘉宾一致：${mix}）。`,
      "白板略倾斜 2–3°，绿色边框，板上有手写的简单图示（箭头、方框、圈）；",
      "地面画一条绿色笔刷阴影把人物「垫」起来。",
      common,
    ],
    collab: [
      `画面为 ${n} 位年轻人围着一张桌子协作（性别构成与嘉宾一致：${mix}）。`,
      "桌上有笔记本电脑、平板、摊开的笔记本与几杯饮品，几只手正指向屏幕；",
      "周围散落 2–3 个手绘涂鸦（问号、箭头、闪光），表现「头脑风暴」。",
      common,
    ],
    none: [
      "本图不放叙事插画。右侧信息区保持留白，只在右中部放 2–3 个荧光绿手绘涂鸦（四角星、短箭头、感叹号）作呼吸点。",
      "禁止在右侧塞任何人物、照片或第二组文字。",
    ],
  };

  if (spec.illustration.scene === "custom") {
    return `按以下自定场景绘制插画：${spec.illustration.description}。${common}`;
  }
  return (scenes[spec.illustration.scene] ?? scenes["sit-around"]).join("");
}

/** 点缀角色：默认不画；topic 模式从嘉宾话题取意象，custom 模式按描述画 */
function decorBlock(spec) {
  const d = spec.decor;
  if (d.preset === "none") {
    return "本图不设点缀角色：右下角留白，用 2–3 个荧光绿四角星涂鸦收尾，禁止补任何角色或 IP。";
  }
  const accent = isStr(d.accent_color) ? `主色 ${d.accent_color}（这是本图唯一允许的非品牌点缀色）` : "配色从描述里取，但只能出现一种非品牌色";
  const props = isStr(d.props) ? `；道具：${d.props}` : "";

  if (d.preset === "custom") {
    return (
      `右下角画一个与本期内容呼应的小角色/小物件：${d.description}；${accent}${props}；` +
      "手绘线稿、4–5px 墨黑描边、坐姿；身下垫一片边缘毛糙的荧光绿 #B1FA63 笔刷水洼；旁边可配绿色手写拟声词。"
    );
  }

  const guest = spec.guests.find((g) => g.name === d.from_guest);
  const topic = guest?.topic ?? "";
  const hint = isStr(d.description) ? `参考意象：${d.description}。` : "";
  return (
    `右下角画一个**从内容里长出来的**小角色：取材自「${d.from_guest}」的分享主题「${topic}」。` +
    `从这句标题里挑一个最具体的名词意象（人物、动物、物件都行），画成圆润可爱的简笔小角色，让人一看就懂这是在呼应这场分享。${hint}` +
    `${accent}${props}；手绘线稿、4–5px 墨黑描边、坐姿；身下垫一片边缘毛糙的荧光绿 #B1FA63 笔刷水洼；旁边配绿色手写拟声词。` +
    "禁止：把角色做成品牌吉祥物、加腮红以外的细节、写实化、加毛发、加 3D 光影。"
  );
}

function elementRepair(spec) {
  const d = spec.decor;
  if (d.preset === "none") {
    return (
      "请只重绘右侧叙事插画，保持它的位置、尺寸与整体构图不变。\n" +
      illustration(spec) +
      "\n除插画区外，其余一律保持不动。"
    );
  }
  return (
    `请只重绘右下角那个小角色，保持它的位置、尺寸、朝向与所在绿色笔刷水洼不变。\n` +
    `它的设定：${d.preset === "custom" ? d.description : `取材自嘉宾「${d.from_guest}」的分享主题「${spec.guests.find((g) => g.name === d.from_guest)?.topic ?? ""}」`}` +
    `${isStr(d.accent_color) ? `；主色 ${d.accent_color}（唯一允许的非品牌色）` : ""}` +
    `${isStr(d.props) ? `；道具：${d.props}` : ""}。\n` +
    "禁止：改变主色、拉长身形、写实化、加毛发、加 3D 光影。"
  );
}

function whitelist(spec) {
  const parts = ["页眉（Logo + slogan）", "主标题带", "副标题带", "时间", "地点", "嘉宾区", "福利区"];
  if (isStr(spec.one_liner)) parts.splice(3, 0, "一句话主张");
  if (spec.illustration.scene !== "none") parts.push("右侧插画");
  if (spec.decor.preset !== "none") parts.push("右下角点缀角色");
  parts.push("装饰涂鸦");
  return parts.join("、");
}

function accentLine(spec) {
  const d = spec.decor;
  if (d.preset === "none" && !isStr(d.accent_color)) {
    return "本图不使用点缀色：全图只有上面的五个主色，不得引入任何第六种颜色";
  }
  const hex = isStr(d.accent_color) ? d.accent_color : "由角色描述决定";
  return (
    `点缀色 ${hex} —— 全图只允许这一种非品牌色，面积 ≤ 6%，` +
    "只能用在右下角角色/道具与 2–3 个小涂鸦上；禁止用于文字、标题带、副标题带、姓名 chip、图标底"
  );
}

function render(template, spec, meta) {
  const logoColor = spec.logo_variant === "dark" ? "白色" : "墨黑 #242021";
  const logoFile = spec.logo_variant === "dark" ? "IF.Link_深色背景.svg" : "IF.Link_浅色背景.svg";

  const vars = {
    EVENT_NAME: spec.event_name,
    KICKER: spec.kicker,
    ONE_LINER_BLOCK: oneLinerBlock(spec),
    ONE_LINER_COPY: isStr(spec.one_liner) ? `一句话：${spec.one_liner}` : "一句话：（本图不设此栏）",
    DATE_TIME: spec.date_time,
    LOCATION: spec.location,
    GUEST_SECTION_TITLE: spec.guest_section_title,
    GUEST_COUNT: String(spec.guests.length),
    GUESTS_BLOCK: guestLines(spec),
    GUEST_LAYOUT: guestLayout(spec),
    LAYOUT_NAME: LAYOUT_DEFS[resolveLayout(spec)].label,
    LAYOUT_LABEL: `${LAYOUT_DEFS[resolveLayout(spec)].label}${spec.layout === "auto" ? "（auto 自动选）" : ""}`,
    LAYOUT_BODY: layoutBlock(spec),
    PERKS_TITLE: spec.perks_title,
    PERKS_TEXT: spec.perks_text,
    SLOGAN: spec.slogan,
    CANVAS: spec.canvas,
    VARIANT_LABEL: spec.variant === "dark" ? "深色版（黑底白字）" : "浅色版（奶油白底）",
    LOGO_FILE: logoFile,
    LOGO_COLOR: logoColor,
    ILLUSTRATION: illustration(spec),
    ILLUSTRATION_HEADING:
      spec.illustration.scene === "none"
        ? "右侧留白处理（x 545–1010，y 615–1215）"
        : "右侧叙事插画（x 545–1010，y 615–1215）",
    AVATAR_STYLE: avatarStyle(spec),
    DECOR: decorBlock(spec),
    DECOR_HEADING:
      spec.decor.preset === "none"
        ? "右下角留白处理（x 620–1000，y 1230–1520）"
        : "右下角点缀角色（x 620–1000，y 1230–1520）",
    ACCENT_LINE: accentLine(spec),
    ACCENT_NOTE:
      spec.decor.preset === "none" && !isStr(spec.decor.accent_color)
        ? "本图没有点缀色，不要出现第六种颜色。"
        : `点缀色只允许出现在右下角角色与 2–3 个小涂鸦上。`,
    ELEMENT_REPAIR: elementRepair(spec),
    WHITELIST: whitelist(spec),
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

function avatarStyle(spec) {
  const withHair = spec.guests.filter((g) => isStr(g.hair));
  const base = "手绘线稿半身像，形象必须与嘉宾性别一致（female 画女性、male 画男性），衣服用荧光绿 #B1FA63";
  if (withHair.length === 0) return base;
  const detail = withHair.map((g) => `${g.name}：${GENDER_LABEL[g.gender]}，${g.hair}`).join("；");
  return `${base}。各人头像特征：${detail}`;
}

/* ────────────────────────────── 短指令版提示词 ────────────────────────────── */

/**
 * 有些模型（qwen-image / 即梦 / 豆包）吃不下 3000+ 字的规范文档，
 * 会把"40px""5.3%"这类参数当正文画进画面。给它们一份 600–900 字的内容型短指令。
 */
function compactPrompt(spec) {
  const g = spec.guests
    .map(
      (guest, i) =>
        `· ${guest.name}｜${guest.topic}`,
    )
    .join("\n");

  const lines = [
    "借用这张海报的画风、配色与字体气质，做一张全新的活动海报。版面可以按下面的方案重新组织，不必照抄参考图的分区；但画风（手绘线稿、粗黑块面、荧光绿点缀）和文字的层级关系必须保持一致。",
    "",
    `【本期版式：${LAYOUT_DEFS[resolveLayout(spec)].label}】`,
    ...LAYOUT_DEFS[resolveLayout(spec)].body.map((l) => l.replace(/^·\s*/, "· ")),
  ];
  if (isStr(spec.layout_note)) lines.push(`· ${spec.layout_note}`);
  lines.push(
    "",
    "【必须逐字出现的文字】",
    `· 左上角：${spec.event_name.includes("IF.") ? "IF.Link" : spec.event_name}`,
    `· 右上角一行小字：${spec.slogan}`,
    `· 绿色色块上的大标题：${spec.event_name}`,
    `· 黑色色块上的副标题：${spec.kicker}`,
  );
  if (isStr(spec.one_liner)) lines.push(`· 副标题下方一行小字：${spec.one_liner}`);
  lines.push(
    `· 时间：${spec.date_time}`,
    `· 地点：${spec.location}`,
    `· 栏目标题：${spec.guest_section_title}（嘉宾逐条列出，不要写「嘉宾1」「嘉宾2」这类序号前缀）`,
    g,
    `· 左下角：${spec.perks_title} —— ${spec.perks_text}`,
  );

  const avatarLine = spec.guests
    .map(
      (guest) =>
        `${guest.name} 画${GENDER_LABEL[guest.gender] === "不限" ? "中性" : GENDER_LABEL[guest.gender] + "性"}${guest.hair ? `（${guest.hair}）` : ""}`,
    )
    .join("；");
  lines.push("", "【头像要求（只用于画人，不要把这些字写上画面）】", avatarLine + "。");
  lines.push(
    "",
    "【拼写警示】品牌名写作 IF.Link —— 字母 IF，一个英文句点「.」，再跟 Link；不是 IF-Link、不是 IF Link。",
    `页面左上的 Logo 与右上的 slogan 必须和上传的标准图完全一致：不重绘、不描边、不改字重字距与颜色；slogan 逐字为「${spec.slogan}」，IFs 是复数、Dots 首字母大写。`,
    "",
    "【画风】手绘线稿、粗黑块面、荧光绿点缀、奶油白纸张底、轻微印刷颗粒感；无渐变、无 3D、无写实人脸。",
  );

  const sceneText = {
    "sit-around": "手绘插画：几个人围坐交流",
    whiteboard: "手绘插画：一个人在白板前讲解、其余人坐着听",
    collab: "手绘插画：几个人围在桌前协作",
    none: "不画插画，只用两三个手绘小涂鸦做呼吸点",
    custom: `手绘插画：${spec.illustration.description}`,
  };
  lines.push("", "【画面要求】", `${sceneText[spec.illustration.scene] ?? sceneText["sit-around"]}。`);

  if (spec.decor.preset === "none") {
    lines.push("右下角不要画任何角色或吉祥物，保持留白。");
  } else {
    const guest = spec.guests.find((x) => x.name === spec.decor.from_guest);
    const src =
      spec.decor.preset === "custom"
        ? spec.decor.description
        : `取自嘉宾「${spec.decor.from_guest}」的话题「${guest?.topic ?? ""}」的意象`;
    const accent = isStr(spec.decor.accent_color) ? `，点缀色 ${spec.decor.accent_color}` : "";
    lines.push(`右下角画一个小角色：${src}${accent}；${isStr(spec.decor.props) ? `道具：${spec.decor.props}。` : ""}`);
    lines.push("注意：这个角色只属于本期内容，不要画成固定的品牌吉祥物。");
  }

  lines.push(
    `配色只用：奶油白底 #F6F6F1、黑 #242021、荧光绿 #B1FA63${isStr(spec.decor.accent_color) ? `、点缀色 ${spec.decor.accent_color}` : ""}。`,
    "",
    "【严格禁止】",
    "不要出现任何尺寸数字、百分比、色值、边框线、十字对齐线、说明性小字；",
    "不要把上面这些指令或参数当成画面文字画出来；",
    "删除参考图里原有的全部文字与旧角色，一个都不要保留。",
  );

  return lines.join("\n");
}

/* ────────────────────────────── 自然语言版提示词（默认投喂） ────────────────────────────── */

/**
 * 规格版（坐标/百分比）适合"精确复刻"和"渲染对位"，但直接喂给生图模型会让它画得像模板。
 * 自然版用设计师口述的语气：只锁"必须出现的文字 + 几条硬约束"，其余留给模型。
 */
function briefPrompt(spec) {
  const layoutHint = {
    classic: "左边文字、右边画，这是最稳的排法",
    stack: "上半张画、下半张字，嘉宾排成两列",
    band: "中间横着一条画，上面标题、下面信息",
    hero: "整张铺满插画，文字压在图上",
    grid: "嘉宾做成一格一格的小卡片",
  }[resolveLayout(spec)];

  const sceneHint = {
    "sit-around": "画几个年轻人围坐聊天",
    whiteboard: "画一个人在白板前比划、其他人围着听",
    collab: "画几个人凑在一张桌子前一起看屏幕",
    none: "这期不画大插画，右侧留白就好",
    custom: `画这个场景：${spec.illustration.description}`,
  }[spec.illustration.scene];

  let decorHint = "";
  if (spec.decor.preset !== "none") {
    const guest = spec.guests.find((g) => g.name === spec.decor.from_guest);
    const what =
      spec.decor.preset === "custom"
        ? spec.decor.description
        : `一个呼应「${guest?.name ?? ""}」话题「${guest?.topic ?? ""}」的小东西（${spec.decor.description || "自己挑一个最具体的意象"}）`;
    decorHint =
      `\n· 右下角可以放个小角色：${what}` +
      (isStr(spec.decor.accent_color) ? `，用点缀色 ${spec.decor.accent_color}，全图只此一处异色` : "");
  }

  const guestLines = spec.guests.map((g) => `  ${g.name}｜${g.topic}`).join("\n");

  const lines = [
    "帮我做一张活动海报，竖版 2:3。",
    "",
    "气质：手绘的、社区气的，像学生社团自己做的那种，不是商业模板。奶油白纸底，黑色粗字，荧光绿用来压重点；",
    "要有手写和涂鸦的痕迹，脏一点、野一点没关系，别干净得像 PPT。",
    "附的参考图只借它的气质和笔触，不要照抄它的分区。",
    "",
    "必须出现的文字（逐字，别改、别无中生有）：",
    `· 页眉左：IF.Link　　页眉右：${spec.slogan}`,
    `· 大标题：${spec.event_name}`,
    `· 副标题：${spec.kicker}`,
  ];
  if (isStr(spec.one_liner)) lines.push(`· 一句话：${spec.one_liner}`);
  lines.push(
    `· 时间：${spec.date_time}`,
    `· 地点：${spec.location}`,
    `· 嘉宾 ${spec.guests.length} 位（姓名 + 各自的话题，一条不落）：`,
    guestLines,
    `· 福利：${spec.perks_text}`,
    "",
    spec.layout === "auto"
      ? "版式：你自己挑一个最合适的，别做成四平八稳的模板。硬要求只有一个 —— 活动名最醒目，信息按「活动名 > 时间地点 > 嘉宾 > 福利」的轻重走，留白别抠门。"
      : `版式：${layoutHint}，具体怎么摆你定；硬要求是活动名最醒目、信息按「活动名 > 时间地点 > 嘉宾 > 福利」的轻重走，留白别抠门。`,
    `插画：${sceneHint}，人物保持线稿，别画写实脸。${decorHint.replace(/\n· /, "另外，")}`,
    "",
    "几条硬要求：",
    "· 颜色只用：奶油白 #F6F6F1、黑 #242021、荧光绿 #B1FA63" +
      (isStr(spec.decor.accent_color) && spec.decor.preset !== "none" ? `，外加那一个点缀色 ${spec.decor.accent_color}` : ""),
    "  —— 不要橙红（#FE7733 尤其不要），不要渐变、不要 3D、不要投影光效。",
    "· Logo 和 slogan 是现成的图形，别重画、别改字重字距；slogan 里 IFs 是复数、Dots 首字母大写。",
    "· 除了上面列的文字，一个字都别加：不要主办方、不要二维码、不要报名链接、不要联系方式。",
    "",
    "先给我 2–3 个不同版式的方案，画风保持一致，我挑一个。",
  );
  return lines.join("\n");
}

/* ────────────────────────────── Image 2 投喂包 ────────────────────────────── */

/** 从渲染好的提示词包里抽出「① 整版提示词」那段，供直接粘贴 */
function extractMainPrompt(rendered) {
  const start = rendered.indexOf("## ① 整版提示词");
  const fence = rendered.indexOf("```text", start);
  const bodyStart = rendered.indexOf("\n", fence) + 1;
  const end = rendered.indexOf("```", bodyStart);
  return rendered.slice(bodyStart, end).trim();
}

function repairScripts(spec) {
  const guestList = spec.guests.map((g) => `${g.name}（${GENDER_LABEL[g.gender]}）｜${g.topic}`).join("\n");
  return [
    "# 返修话术（一次只贴一条，改完再改下一条）",
    "",
    "## ① 有字写错 / 漏字 / 被裁切",
    "```text",
    "请只重画下面这一行文字，字号、字重、颜色、位置、对齐方式完全保持现状，其他区域一个像素都不要动。",
    "正确文字（逐字、含标点）：",
    "  <把出问题的那一行原文贴在这里>",
    "不要重排版式，不要改动这一行以外的任何内容。",
    "```",
    "",
    "## ② 配色跑偏（绿变草绿/黄绿，或冒出橙红）",
    "```text",
    "整张海报的强调色出现偏移。请把所有不属于 #B1FA63 的绿色统一校正为荧光绿 #B1FA63；",
    "黑色块与文字统一为 #242021；底色为 #F6F6F1。",
    `若画面中出现任何橙红（如 #FE7733），全部替换为荧光绿 #B1FA63。`,
    spec.decor.preset !== "none" && isStr(spec.decor.accent_color)
      ? `点缀色只允许出现在右下角角色与 2–3 个小涂鸦上，色值为 ${spec.decor.accent_color}，面积不超过画面 6%。`
      : "本图不应出现任何非品牌色，全部收回到上述三色。",
    "除颜色外，其余一律保持不动。",
    "```",
    "",
    "## ③ 多出了没要求的东西（主办方 / 二维码 / 旧文案）",
    "```text",
    "请删除画面中所有不在下面清单里的文字与信息块，只保留：活动名称、主题行、时间、地点、嘉宾、福利、页眉 Logo 与 slogan。",
    "不得出现主办/联合主办/承办/二维码/报名链接/赞助商；删除参考图里原有的全部文字与旧角色。",
    "删除后留白，不要补任何新内容。",
    "```",
    "",
    "## ④ 头像性别 / 发型不对",
    "```text",
    "请只修改嘉宾头像，其余文字与元素保持不动。正确的人物形象：",
    guestList,
    "只改头像，不要改姓名、话题、字号与位置。",
    "```",
    "",
    "## ⑤ 右下角角色崩了（变色 / 变形）",
    "```text",
    `请只重绘右下角那个小角色，位置、尺寸、朝向与其下的绿色笔刷阴影保持不变。`,
    `它的设定：${spec.decor.preset === "custom" ? spec.decor.description : `取自嘉宾「${spec.decor.from_guest}」话题「${spec.guests.find((g) => g.name === spec.decor.from_guest)?.topic ?? ""}」的意象`}`,
    spec.decor.preset !== "none" && isStr(spec.decor.accent_color) ? `主色 ${spec.decor.accent_color}（本图唯一允许的非品牌色）。` : "配色从描述里取，只允许一种非品牌色。",
    "手绘线稿、4–5px 墨黑描边；禁止写实化、加毛发、加 3D 光影、加渐变。",
    "```",
    "",
    "## ⑥ slogan 写错（大小写 / 单词 / 标点）",
    "```text",
    `请只重画页眉右上角那一行 slogan，字号、字重、位置、颜色保持现状`,
    `正确文字（逐字、含标点、区分大小写）：${spec.slogan}`,
    "注意：IFs 是复数，Dots 首字母大写，中间英文逗号，结尾不加句号。只改这一行，其他不动。",
    "```",
    "",
    "## ⑦ 整体太散 / 字体乱",
    "```text",
    "请基于现有海报精修，保持构图与信息不变，只修这四件事：",
    "1. 统一字体：全图只用思源黑体系，标题 900、副标题 800、正文 500，行距一致。",
    "2. 统一对齐：所有元素咬住同一个左边距，嘉宾条目等距。",
    "3. 提升层级：活动名最醒目，时间地点次之，嘉宾信息整齐排列。",
    "4. 清理瑕疵：边缘错位、留白不均、色块毛刺、残影、重复元素。",
    "不要改动任何文字内容。",
    "```",
  ].join("\n");
}

async function writeImage2Pack(dir, { rendered, spec }) {
  const { copyFile } = await import("node:fs/promises");
  const out = path.resolve(dir);
  await mkdir(out, { recursive: true });

  const refDir = path.join(SKILL_ROOT, "assets", "reference");
  await copyFile(path.join(refDir, "final-poster.png"), path.join(out, "01_参考图.png"));
  const logoFile = spec.logo_variant === "dark" ? "IF.Link_深色背景.svg" : "IF.Link_浅色背景.svg";
  await copyFile(path.join(refDir, logoFile), path.join(out, "02_Logo.svg"));

  // slogan 标准图（品牌资产，和 Logo 一样属于"不可重绘"的图形）
  let hasSloganImg = false;
  try {
    await copyFile(path.join(refDir, "IF.Link-slogan.png"), path.join(out, "03_Slogan.png"));
    hasSloganImg = true;
  } catch {
    /* 没有就跳过，不影响其余文件 */
  }

  await writeFile(
    path.join(out, "04_Slogan.txt"),
    [
      `# Slogan（逐字使用，大小写不可改）`,
      "",
      spec.slogan,
      "",
      "写作要点：",
      "- `IFs` 是复数，不是 IF。",
      "- `Dots` 首字母大写，connect 小写。",
      "- 位置固定在页眉右上，右对齐，30px 级加粗，与左侧 Logo 同一水平线。",
      "- 这是品牌文案，不是标语创作：不要改写、不要翻译、不要加句号。",
      "",
      hasSloganImg
        ? "配套标准图：`03_Slogan.png`（可直接作为参考图上传，让模型照着字形画）"
        : "（本次未附带标准图，按上面的文字逐字写出即可）",
    ].join("\n"),
    "utf8",
  );

  const main = extractMainPrompt(rendered);
  await writeFile(
    path.join(out, "05_提示词_自然版（先试这个）.txt"),
    [
      `# ${spec.event_name} · ${spec.kicker}`,
      `# 用法：传完 01_参考图.png、02_Logo.svg${hasSloganImg ? "、03_Slogan.png" : ""}，把下面整段粘进去。`,
      "# 这一版像设计师口述需求，只锁文字和几条硬约束，版式交给模型 —— 出来的东西更活。",
      "",
      briefPrompt(spec),
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    path.join(out, "05b_提示词_规格版（要精确复刻时用）.txt"),
    [
      `# ${spec.event_name} · ${spec.kicker}`,
      "# 这一版把版式、字号、边距都写死了，适合「要和上一期分毫不差」或「要拿去做后期对位」的场景。",
      "# 直接喂给生图模型会偏死板，先试 05_自然版。",
      "",
      main,
    ].join("\n"),
    "utf8",
  );

  await writeFile(path.join(out, "06_返修话术.txt"), repairScripts(spec), "utf8");

  await writeFile(
    path.join(out, "00_怎么用.md"),
    [
      `# ${spec.event_name} 海报 · Image 2 投喂包`,
      "",
      "## 两步",
      "",
      "1. 打开 ChatGPT（用 Image 2），**先传三份品牌资产**：`01_参考图.png`、`02_Logo.svg`、`03_Slogan.png`。",
      "2. 打开 `05_提示词_自然版（先试这个）.txt`，整段复制，粘进去，发。",
      "",
      "**先试自然版**（像设计师口述：只锁文字和几条硬约束，版式交给模型）。它出来的东西更活。",
      "如果要求「和上一期分毫不差」，再换 `05b_提示词_规格版` —— 那版把版式、字号、边距都写死了，但喂给模型容易画出模板感。",
      "",
      "> 不用再额外补任何话 —— 「Logo / slogan 禁止重绘、slogan 逐字为 " + spec.slogan + "（IFs 复数、Dots 大写）」",
      "> 这条已经写进提示词的「▍品牌资产（锁死）」段落里了。",
      "> 传图是为了给模型「照字形」的参考，不是必须；只上传参考图也能跑。",
      "",
      "## 出图之后",
      "",
      "- 按 `07_质检卡.md` 逐项打勾；任何一项不对，就从 `06_返修话术.txt` 里挑对应的一条贴进去。",
      "- **一次只修一处**，修完再修下一处；不要让它整版重来（越改越乱就是这个原因）。",
      "- 想要多挑一挑，可以追加一句：**「用同样的内容，再给我 3 个不同版式方案，画风保持一致」**。",
      "",
      "## 常见坑",
      "",
      "| 现象 | 原因 | 怎么办 |",
      "| --- | --- | --- |",
      "| 冒出一整句参考图里的旧文案 | 参考图内容泄漏 | 用返修话术 ③ |",
      "| 绿得发黄 / 发暗 | 模型对「荧光绿」理解漂移 | 用返修话术 ② |",
      "| 嘉宾序号「嘉宾1」被画上去 | 提示词里的结构被当成文字 | 用返修话术 ① |",
      "| 文字糊成一团 | 版式太密 | 换一个版面重跑，或减少一位嘉宾信息量 |",
      "",
      "## 兜底",
      "",
      "如果文字怎么修都不对，用 `python scripts/render-poster.py build/spec.json --out build/poster.png` 出文字层，",
      "把 AI 图里的插画抠出来贴上去 —— 文字零错字，插画保留手绘质感。",
      "",
      `> 版式：${LAYOUT_DEFS[resolveLayout(spec)].label} ｜ 画布：${spec.canvas} ｜ 主色锁 #B1FA63 / #242021 / #F6F6F1`,
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    path.join(out, "07_质检卡.md"),
    [
      `# ${spec.event_name} · 质检卡`,
      "",
      "| 闸门 | 检查项 | 通过标准 | ✔ |",
      "| --- | --- | --- | --- |",
      `| G1 | 活动名 | 逐字等于「${spec.event_name}」 | ☐ |`,
      `| G1 | 主题行 | 逐字等于「${spec.kicker}」，× 是乘号 | ☐ |`,
      `| G1 | 时间 | 逐字等于「${spec.date_time}」 | ☐ |`,
      `| G1 | 地点 | 逐字等于「${spec.location}」 | ☐ |`,
      `| G1 | 嘉宾 | ${spec.guests.length} 位，姓名与话题逐字一致 | ☐ |`,
      `| G1 | 福利 | 逐字等于「${spec.perks_title} —— ${spec.perks_text}」 | ☐ |`,
      `| G1 | Slogan | 逐字等于「${spec.slogan}」 | ☐ |`,
      "| G2 | 三色占比 | 奶油白 65–75% / 墨色 8–12% / 荧光绿 8–12% | ☐ |",
      "| G2 | 无外来色 | 无橙红；点缀色 ≤6% 且只有一种 | ☐ |",
      "| G3 | 层级 | 缩到手机 1/3，第一眼是活动名 | ☐ |",
      "| G3 | 留白 | 有大留白，元素不互相压字 | ☐ |",
      "| G4 | 字体 | 无衬线、同族、层级清晰 | ☐ |",
      "| G5 | 图形语言 | 直角块、粗描边、手绘感、无渐变/3D | ☐ |",
      "| G6 | Logo | 未变形、版本正确、未重绘 | ☐ |",
      "",
      "出图后也可以跑一次配色量测：",
      "",
      "```bash",
      `python scripts/check-palette.py <成图.png> --debug`,
      "```",
    ].join("\n"),
    "utf8",
  );

  return out;
}

/* ────────────────────────────── CLI ────────────────────────────── */

function parseArgs(argv) {
  const opts = { spec: null, out: "build/prompt.md", checkOnly: false, emitSpec: null, compact: null, image2Pack: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" || a === "-o") opts.out = argv[++i];
    else if (a === "--check-only") opts.checkOnly = true;
    else if (a === "--emit-spec") opts.emitSpec = argv[++i];
    else if (a === "--compact") opts.compact = argv[++i];
    else if (a === "--image2-pack") opts.image2Pack = argv[++i];
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
  const decorLabel =
    spec.decor.preset === "none"
      ? "无"
      : spec.decor.preset === "topic"
        ? `取材于「${spec.decor.from_guest}」`
        : "自定义";

  console.log(line);
  console.log("IF.Link Meetup 海报 · 规格校验");
  console.log(`活动：${spec.event_name} ｜ ${spec.kicker}`);
  console.log(`时间：${spec.date_time}`);
  console.log(`地点：${spec.location}`);
  console.log(`嘉宾：${spec.guests.length} 位 ｜ 画布：${spec.canvas} ｜ 变体：${spec.variant}`);
  console.log(
    `插画：${spec.illustration.scene} ｜ 点缀角色：${decorLabel} ｜ 主张行：${isStr(spec.one_liner) ? "有" : "无"}`,
  );
  console.log(`版式：${LAYOUT_DEFS[resolveLayout(spec)].label}（spec: ${spec.layout}）`);
  console.log(`主色锁：${BRAND.green} / ${BRAND.ink} / ${BRAND.cream}  [已锁定]`);
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
    console.log("用法：node scripts/build-prompt.mjs <spec.json> [--out build/prompt.md] [--check-only] [--emit-spec build/spec.normalized.json]");
    console.log("提示：还没有 spec？先跑 node scripts/new-spec.mjs，或复制 templates/spec.minimal.json 手填。");
    process.exit(opts.help ? 0 : 2);
  }

  const specPath = path.resolve(opts.spec);
  if (!existsSync(specPath)) {
    console.error(`✖ 找不到 spec 文件：${specPath}`);
    process.exit(2);
  }

  let raw;
  try {
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

  if (opts.image2Pack) {
    const packDir = await writeImage2Pack(opts.image2Pack, { rendered, spec });
    console.log(`✅ Image 2 投喂包：${path.relative(process.cwd(), packDir)}/`);
    console.log("   含：00_怎么用 / 01_参考图 / 02_Logo / 03_Slogan.png / 04_Slogan.txt / 05_整版提示词 / 06_返修话术 / 07_质检卡");
  }

  if (opts.compact) {
    const cp = path.resolve(opts.compact);
    await mkdir(path.dirname(cp), { recursive: true });
    const text = compactPrompt(spec);
    await writeFile(cp, text, "utf8");
    console.log(`✅ 短指令版已生成：${path.relative(process.cwd(), cp)}（${text.length} 字，给吃不下长规范的模型用）`);
  }

  if (!opts.quiet) {
    console.log(`   下一步：上传 assets/reference/final-poster.png 与 ${spec.logo_variant === "dark" ? "IF.Link_深色背景.svg" : "IF.Link_浅色背景.svg"}`);
    console.log("   然后粘贴「① 整版提示词」，成图后跑：python scripts/check-palette.py <成图.png>");
  }
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(2);
});
