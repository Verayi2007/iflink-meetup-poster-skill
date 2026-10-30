#!/usr/bin/env node
/**
 * build-prompt.mjs — IF.Link Meetup 海报提示词装配器（纯入参驱动，不含任何具体活动内容）
 *
 * 职责：
 *   1. 校验 spec.json（品牌色彩锁 / 内容完整性 / 版式风险）
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
  mascot: "#FED754",
  divider: "#DCEFC0",
  white: "#FFFFFF",
  slogan: "Link the IFs, Connect the Dots",
});

const CANVAS_ALLOWED = ["1024x1536", "1536x2304"];
const FORBIDDEN_ALWAYS = ["联合主办", "主办单位", "承办单位", "赞助", "二维码", "报名链接", "票务"];
const CONFUSABLES = ["镲", "锜", "镶", "铑", "镴"];
const GENDERS = ["female", "male", "other"];
const ILLUSTRATION_SCENES = ["sit-around", "whiteboard", "collab", "none", "custom"];
const MASCOT_PRESETS = ["nailong", "custom", "none"];

const GENDER_LABEL = { female: "女", male: "男", other: "不限" };

/* ────────────────────────────── 校验 ────────────────────────────── */

const issues = [];
const add = (level, code, field, msg) => issues.push({ level, code, field, msg });
const err = (code, field, msg) => add("error", code, field, msg);
const warn = (code, field, msg) => add("warn", code, field, msg);

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const len = (v) => [...(v ?? "")].length;

function normalize(raw) {
  const mascotRaw = raw.mascot ?? {};
  const preset = mascotRaw.preset ?? (mascotRaw.enabled === false ? "none" : "nailong");

  const spec = {
    series: raw.series ?? "Meetup",
    event_name: raw.event_name ?? "",
    kicker: raw.kicker ?? "",
    one_liner: raw.one_liner ?? "",          // 可选：空则不出这一行
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
    mascot: {
      preset,                                  // nailong | custom | none
      enabled: preset !== "none",
      name: mascotRaw.name ?? (preset === "nailong" ? "奶龙" : ""),
      cup_brand: mascotRaw.cup_brand ?? "",
      description: mascotRaw.description ?? "",
      accessory: mascotRaw.accessory ?? "白色纸杯，杯身竖排黑字「{CUP}」，插一根吸管",
    },
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
      if (hits.length) warn("W001", `${at}.topic`, `话题含易混字「${[...new Set(hits)].join("、")}」，请人工查证是否为正确字`);
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

  /* —— 吉祥物 —— */
  if (!MASCOT_PRESETS.includes(spec.mascot.preset)) {
    err("E062", "mascot.preset", `吉祥物 preset 只能是 ${MASCOT_PRESETS.join(" / ")}`);
  }
  if (spec.mascot.preset === "custom" && !isStr(spec.mascot.description)) {
    err("E063", "mascot.description", "preset=custom 时必须描述吉祥物长相（形状 / 主色 / 描边 / 五官 / 道具）");
  }
  if (spec.mascot.preset !== "none" && !isStr(spec.mascot.name)) {
    err("E064", "mascot.name", "有吉祥物时必须给 name");
  }
  if (spec.mascot.preset === "custom" && spec.mascot.description && !/#[0-9A-Fa-f]{6}/.test(spec.mascot.description)) {
    warn("W012", "mascot.description", "自定义吉祥物没给主色 HEX，模型很容易自由发挥；建议写明如 #FED754");
  }

  /* —— 色彩锁 —— */
  if (spec.palette) {
    const ok = typeof spec.palette === "object" && spec.palette.green === BRAND.green && spec.palette.ink === BRAND.ink;
    if (!ok) err("E030", "palette", `色彩锁被修改。本系列固定 荧光绿 ${BRAND.green} + 深黑灰 ${BRAND.ink}，不得覆盖`);
    else warn("W010", "palette", "spec 里的 palette 与品牌锁一致，已忽略（颜色由 SKILL 常量决定）");
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
    return `${n} 位嘉宾纵向排列（疏排版式：单条节距 ≥ 180px、头像直径 112px、姓名 chip 32px、话题 29px 最多 3 行）：`;
  }
  if (n <= 4) {
    return `${n} 位嘉宾纵向排列（标准版式：单条节距 140–190px、头像直径 96px、姓名 chip 30px、话题 27px 最多 3 行，节距随话题行数自适应）：`;
  }
  return `${n} 位嘉宾纵向排列（紧凑版式：单条节距 110–140px、头像直径 76px、姓名 chip 26px、话题 24px 最多 2 行，禁止挤压重叠）：`;
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

function mascotBlock(spec) {
  const m = spec.mascot;
  if (m.preset === "none") {
    return "本图不放吉祥物：福利区右侧留白，用 2–3 个荧光绿四角星涂鸦收尾，禁止补任何角色。";
  }
  const accessory = m.cup_brand
    ? m.accessory.replace("{CUP}", m.cup_brand)
    : "无固定道具，手部自然摆放（不要强行加杯子）";
  if (m.preset === "custom") {
    return (
      `坐在地上的吉祥物${m.name}：${m.description}；道具：${accessory}；` +
      "身下垫一片边缘毛糙的荧光绿 #B1FA63 笔刷水洼；旁边可配绿色手写拟声词与一段 C 形涂鸦。"
    );
  }
  return (
    `坐在地上的吉祥物${m.name}：圆润梨形、头身一体无脖子、宽度略大于高度、软乎乎；` +
    `身体主色为暖黄 #FED754（不是荧光绿），5px 墨黑描边；一只黑豆眼带白色高光点，另一只是「>」形笑眼，橙色椭圆小嘴；` +
    `双手捧一只${accessory}；` +
    "身下垫一片边缘毛糙的荧光绿 #B1FA63 笔刷水洼；右侧配绿色手写「Hi!」与一段 C 形涂鸦。"
  );
}

function elementRepair(spec) {
  const m = spec.mascot;
  if (m.preset === "none") {
    return (
      "请只重绘右侧叙事插画，保持它的位置、尺寸与整体构图不变。\n" +
      illustration(spec) +
      "\n除插画区外，其余一律保持不动。"
    );
  }
  const accessory = m.cup_brand
    ? m.accessory.replace("{CUP}", m.cup_brand)
    : "无固定道具，手部自然摆放（不要强行加杯子）";
  if (m.preset === "custom") {
    return (
      `请只重绘右下角的吉祥物${m.name}，保持它的位置、尺寸、朝向与所在绿色笔刷水洼不变。\n` +
      `${m.name}的准确形象：${m.description}；道具：${accessory}。\n` +
      "禁止：改变主色、拉长身形、写实化、加毛发、加 3D 光影。"
    );
  }
  return (
    `请只重绘右下角的吉祥物${m.name}，保持它的位置、尺寸、朝向与所在绿色笔刷水洼不变。\n` +
    `${m.name}的准确形象：圆润梨形身体、头身一体没有脖子、宽度略大于高度；身体主色为暖黄 #FED754（不是荧光绿）；` +
    `5px 墨黑描边；一只黑豆眼带白色高光点，另一只眼睛是「>」形笑眼；橙色椭圆小嘴；双手捧一只${accessory}；` +
    "旁边保留绿色手写「Hi!」与 C 形涂鸦。\n" +
    "禁止：改变颜色、拉长身形、写实化、加腮红以外的细节、加毛发、加 3D 光影。"
  );
}

function whitelist(spec) {
  const parts = ["页眉（Logo + slogan）", "主标题带", "副标题带", "时间", "地点", "嘉宾区", "福利区"];
  if (isStr(spec.one_liner)) parts.splice(3, 0, "一句话主张");
  if (spec.illustration.scene !== "none") parts.push("右侧插画");
  if (spec.mascot.preset !== "none") parts.push("吉祥物");
  parts.push("装饰涂鸦");
  return parts.join("、");
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
    MASCOT: mascotBlock(spec),
    MASCOT_HEADING:
      spec.mascot.preset === "none"
        ? "右下角留白处理（x 620–1000，y 1230–1520）"
        : "吉祥物（x 620–1000，y 1230–1520）",
    MASCOT_NAME: spec.mascot.name || "（无）",
    CUP_BRAND: spec.mascot.cup_brand || "",
    ELEMENT_REPAIR: elementRepair(spec),
    WHITELIST: whitelist(spec),
    PALETTE_MASCOT_LINE:
      spec.mascot.preset === "none"
        ? "#FED754 吉祥物黄 —— 本图不使用吉祥物，该色不得出现在画面中"
        : spec.mascot.preset === "custom"
          ? "#FED754 吉祥物黄 —— 仅当自定义吉祥物描述里用到时才出现"
          : "#FED754 吉祥物黄 —— 仅吉祥物身体",
    MASCOT_COLOR_NOTE:
      spec.mascot.preset === "none"
        ? "吉祥物身体色 #FED754 不存在于本图。"
        : spec.mascot.preset === "custom"
          ? "吉祥物配色严格按本规格中的描述，不得额外引入第二种强调色。"
          : "吉祥物身体固定 #FED754。",
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
  console.log("IF.Link Meetup 海报 · 规格校验");
  console.log(`活动：${spec.event_name} ｜ ${spec.kicker}`);
  console.log(`时间：${spec.date_time}`);
  console.log(`地点：${spec.location}`);
  console.log(`嘉宾：${spec.guests.length} 位 ｜ 画布：${spec.canvas} ｜ 变体：${spec.variant}`);
  console.log(
    `插画：${spec.illustration.scene} ｜ 吉祥物：${spec.mascot.preset === "none" ? "无" : spec.mascot.name} ｜ 主张行：${isStr(spec.one_liner) ? "有" : "无"}`,
  );
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
  if (!opts.quiet) {
    console.log(`   下一步：上传 assets/reference/final-poster.png 与 ${spec.logo_variant === "dark" ? "IF.Link_深色背景.svg" : "IF.Link_浅色背景.svg"}`);
    console.log("   然后粘贴「① 整版提示词」，成图后跑：python scripts/check-palette.py <成图.png>");
  }
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(2);
});
