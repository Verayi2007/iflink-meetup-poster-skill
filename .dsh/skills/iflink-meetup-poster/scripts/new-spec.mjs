#!/usr/bin/env node
/**
 * new-spec.mjs — 活动信息采集器：把「人话」变成 build-prompt.mjs 能吃的 spec.json
 *
 * 三种用法：
 *   1) 空白骨架      node scripts/new-spec.mjs --blank
 *   2) 填表转化      node scripts/new-spec.mjs --from build/intake.md --out build/spec.json
 *   3) 交互问答      node scripts/new-spec.mjs --out build/spec.json
 *
 * 设计原则：配色先选；活动事实必须填写，选填字段采用安全默认值。
 * 零依赖，Node >= 18。
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(HERE, "..");

const GENDER_ALIAS = {
  女: "female", 女性: "female", female: "female", f: "female",
  男: "male", 男性: "male", male: "male", m: "male",
  不限: "other", other: "other",
};

const SCENE_ALIAS = {
  "sit-around": "sit-around", 围坐: "sit-around", 围坐交流: "sit-around", 圆桌: "sit-around",
  whiteboard: "whiteboard", 白板: "whiteboard", 白板分享: "whiteboard",
  collab: "collab", 协作: "collab", 桌上协作: "collab",
  none: "none", 无: "none", 不要插画: "none",
  custom: "custom", 自定义: "custom",
};

const DECOR_ALIAS = {
  topic: "topic", 取自话题: "topic", 内容: "topic", 从内容来: "topic",
  custom: "custom", 自定义: "custom",
  none: "none", 无: "none", 不要: "none", 不画: "none",
};

/* ────────────────────────────── 空白骨架 ────────────────────────────── */

function blankSpec() {
  return {
    _说明: "填完这个文件后跑：node scripts/build-prompt.mjs build/spec.json",
    series: "Meetup",
    theme: "green",
    theme_color: "",
    event_name: "",
    kicker: "",
    one_liner: "",
    date_time: "",
    location: "",
    guest_section_title: "分享嘉宾 & 主题",
    guests: [
      { name: "", topic: "", gender: "female", hair: "" },
    ],
    perks_title: "小福利",
    perks_text: "",
    illustration: { scene: "sit-around", description: "" },
    decor: { preset: "none", from_guest: "", description: "", accent_color: "", props: "" },
    slogan: "Link the IFs, Connect the Dots",
    variant: "cream",
    canvas: "1024x1536",
    notes: "",
  };
}

/* ────────────────────────────── 填表解析 ────────────────────────────── */

const KEY_MAP = {
  配色: "theme", 主色: "theme", 主题色: "theme", theme: "theme",
  主色色值: "theme_color", 主题色色值: "theme_color", theme_color: "theme_color",
  活动名称: "event_name", 名称: "event_name", 活动名: "event_name", event: "event_name", event_name: "event_name",
  主题行: "kicker", 副标题: "kicker", 主题: "kicker", kicker: "kicker",
  一句话: "one_liner", 一句话主张: "one_liner", 主张: "one_liner", one_liner: "one_liner",
  时间: "date_time", 活动时间: "date_time", date: "date_time", date_time: "date_time",
  地点: "location", 活动地点: "location", location: "location",
  嘉宾区标题: "guest_section_title", guest_section_title: "guest_section_title",
  福利标题: "perks_title", perks_title: "perks_title",
  福利: "perks_text", 小福利: "perks_text", perks: "perks_text", perks_text: "perks_text",
  插画场景: "illustration_scene", 场景: "illustration_scene", scene: "illustration_scene",
  插画描述: "illustration_desc", illustration: "illustration_desc",
  点缀角色: "decor", 小角色: "decor", 点缀: "decor", decor: "decor",
  角色来源: "decor_guest", 取自嘉宾: "decor_guest", from_guest: "decor_guest",
  点缀色: "accent_color", 强调色: "accent_color", accent: "accent_color", accent_color: "accent_color",
  角色道具: "decor_props", 道具: "decor_props", props: "decor_props",
  变体: "variant", variant: "variant",
  备注: "notes", notes: "notes",
};

function splitKV(line) {
  const m = line.match(/^\s*[-*]?\s*([^：:]{1,14})[：:]\s*(.*)$/);
  if (!m) return null;
  return [m[1].trim(), clean(m[2])];
}

/** 清掉 HTML 注释、行尾标记与多余空白，避免注释被当成字段值 */
function clean(v) {
  return v
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/^["'「”]+|["'」”]+$/g, "")
    .trim();
}

/** 用户常用的"这里不填"写法统一视为空 */
function emptyish(v) {
  return !v || /^[（(]?\s*(空|无|不填|none|null|n\/a|—|-|–)\s*[)）]?$/i.test(v.trim());
}

function parseGuestLine(line) {
  const raw = clean(line.replace(/^\s*[-*·]\s*/, ""));
  if (!raw) return null;
  const parts = raw.split(/\s*[｜|]\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const guest = { name: parts[0], topic: "", gender: "other", hair: "" };
  if (parts.length === 1) return guest;

  // 依次识别：性别 → 剩下的第一段当 topic，再后面当发型
  let rest = [];
  for (const p of parts.slice(1)) {
    const g = GENDER_ALIAS[p.toLowerCase()];
    if (g && guest.gender === "other") guest.gender = g;
    else rest.push(p);
  }
  guest.topic = rest[0] ?? "";
  guest.hair = rest[1] ?? "";
  return guest;
}

async function parseIntake(file) {
  const text = (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
  const spec = blankSpec();
  delete spec._说明;
  spec.guests = [];

  let inGuests = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^#/.test(line)) {
      if (/^#+\s*(嘉宾|分享嘉宾)/.test(line)) inGuests = true;
      continue;
    }

    // 「嘉宾：」单独一行 → 进入嘉宾列表模式
    if (/^(嘉宾|分享嘉宾|guests)[：:]?\s*$/.test(line)) {
      inGuests = true;
      continue;
    }

    if (inGuests && /^[-*·]/.test(line)) {
      const g = parseGuestLine(line);
      if (g) spec.guests.push(g);
      continue;
    }
    if (inGuests && /^[-*·]/.test(line) === false && !line.includes("：") && !line.includes(":")) continue;

    const kv = splitKV(line);
    if (!kv) continue;
    const [k, v] = kv;
    const field = KEY_MAP[k] ?? KEY_MAP[k.replace(/\s/g, "")];
    if (!field) continue;

    if (field === "theme") {
      const v0 = v.toLowerCase();
      spec.theme = /橙|orange/.test(v0) ? "orange" : /紫|purple/.test(v0) ? "purple" : /自定义|黄|custom/.test(v0) ? "custom" : "green";
    } else if (field === "theme_color") spec.theme_color = v.toUpperCase();
    else if (field === "illustration_scene") spec.illustration.scene = SCENE_ALIAS[v] ?? v;
    else if (field === "illustration_desc") spec.illustration.description = v;
    else if (field === "decor") {
      const preset = DECOR_ALIAS[v] ?? "custom";
      spec.decor.preset = preset;
      if (preset === "custom" && !spec.decor.description) spec.decor.description = v;
    } else if (field === "decor_guest") {
      spec.decor.from_guest = v;
      if (spec.decor.preset === "none") spec.decor.preset = "topic";
    } else if (field === "accent_color") {
      spec.decor.accent_color = emptyish(v) ? "" : /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : v;
    } else if (field === "decor_props") spec.decor.props = v;
    else if (field === "variant") spec.variant = /dark|深|黑/.test(v) ? "dark" : "cream";
    else spec[field] = emptyish(v) ? "" : v;
    inGuests = false;
  }

  if (spec.guests.length === 0) spec.guests.push({ name: "", topic: "", gender: "other", hair: "" });
  if (!spec.decor.preset) spec.decor.preset = "none";
  // 只写了点缀色、没写角色 → 视为自定义角色（只要求一个色点）
  if (spec.decor.preset === "none" && spec.decor.accent_color) {
    spec.decor.preset = "custom";
    spec.decor.description = spec.decor.description || "一个与本期主题相关的小物件";
  }

  return spec;
}

/* ────────────────────────────── 交互问答 ────────────────────────────── */

async function interactive(outPath) {
  const rl = createInterface({ input, output });
  const ask = async (q, def = "") => {
    const suffix = def ? `（默认：${def}）` : "（可留空）";
    const ans = (await rl.question(`${q} ${suffix}：`)).trim();
    return ans || def;
  };
  const askRequired = async (q) => {
    while (true) {
      const ans = (await rl.question(`${q}（必填）：`)).trim();
      if (ans) return ans;
      console.log("这项会出现在海报上，请填写或退出后改用草稿模式。");
    }
  };

  try {
    console.log("\nIF.Link Meetup 海报 · 活动信息采集（上版信息请按实际填写）\n");

    const spec = blankSpec();
    delete spec._说明;

    console.log("先选这期的主色。绿 / 橙 / 紫来自规范页的 IF.Land 2026 活动色板。\n");
    const themes = {"1":"green","2":"orange","3":"purple","4":"custom",green:"green",orange:"orange",purple:"purple",custom:"custom",绿:"green",橙:"orange",紫:"purple"};
    let themeAnswer;
    do {
      themeAnswer = (await ask("配色（1 经典绿 / 2 暖橙 / 3 淡紫 / 4 自定义，黑色文字共用）", "1")).toLowerCase();
      if (!themes[themeAnswer]) console.log("请选择 1–4，或输入绿 / 橙 / 紫 / 自定义。");
    } while (!themes[themeAnswer]);
    spec.theme = themes[themeAnswer];
    if (spec.theme === "custom") {
      do {
        spec.theme_color = (await askRequired("自定义主色 HEX（#RRGGBB）")).toUpperCase();
        if (!/^#[0-9A-F]{6}$/.test(spec.theme_color)) console.log("请填写准确的 #RRGGBB 色值。");
      } while (!/^#[0-9A-F]{6}$/.test(spec.theme_color));
    }
    console.log("\n接下来填写活动信息。\n");
    spec.event_name = await askRequired("① 活动名称");
    spec.kicker = await askRequired("② 主题行（用 × 连接关键词）");
    spec.date_time = await askRequired("③ 活动时间");
    spec.location = await askRequired("④ 活动地点");
    spec.one_liner = await ask("⑤ 一句话主张（可空，空了就不放这一行）", "");

    console.log("\n⑥ 分享嘉宾（留空姓名结束录入）");
    spec.guests = [];
    for (let i = 1; i <= 6; i++) {
      const name = i === 1 ? await askRequired("   嘉宾 1 姓名") : await ask(`   嘉宾 ${i} 姓名`, "");
      if (!name) break;
      const genderRaw = await ask("      性别（男/女/不限）", "不限");
      const topic = await askRequired("      分享主题");
      const hair = await ask("      发型/配饰（用于头像，可空）", "");
      spec.guests.push({
        name,
        topic,
        gender: GENDER_ALIAS[genderRaw] ?? "other",
        hair,
      });
    }
    spec.perks_title = await ask("⑦ 福利区标题", "小福利");
    spec.perks_text = await askRequired("⑧ 福利一句话");

    const scene = await ask("⑨ 右侧插画场景（围坐/白板/协作/无/自定义）", "围坐");
    spec.illustration.scene = SCENE_ALIAS[scene] ?? "sit-around";
    if (spec.illustration.scene === "custom") {
      spec.illustration.description = await ask("      自定插画描述", "");
    }

    console.log("\n⑩ 点缀角色（右下角那个小角色/小物件，不是品牌吉祥物）");
    const decorChoice = await ask("   要画吗？（取自话题/自定义/无）", "无");
    const decorPreset = DECOR_ALIAS[decorChoice] ?? "custom";
    spec.decor = { preset: decorPreset, from_guest: "", description: "", accent_color: "", props: "" };
    if (decorPreset === "topic") {
      spec.decor.from_guest = await ask("   从哪位嘉宾的话题里取意象（填姓名）", spec.guests[0]?.name ?? "");
      spec.decor.description = await ask("   想画成什么（可空，模型自行取材）", "");
    } else if (decorPreset === "custom") {
      spec.decor.description =
        DECOR_ALIAS[decorChoice] ? await ask("   长什么样", "") : decorChoice;
    }
    if (decorPreset !== "none") {
      if (spec.theme === "green") spec.decor.accent_color = await ask("   点缀色 HEX（只选 #FE7733 或 #B2A1FF，可空）", "");
      spec.decor.props = await ask("   道具（可空）", "");
    }

    await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await writeFile(path.resolve(outPath), JSON.stringify(spec, null, 2) + "\n", "utf8");
    console.log(`\n✅ 已生成 ${outPath}`);
    console.log(`   下一步：node scripts/build-prompt.mjs ${outPath} --out build/prompt.md`);
  } finally {
    rl.close();
  }
}

/* ────────────────────────────── CLI ────────────────────────────── */

async function main() {
  const argv = process.argv.slice(2);
  const flags = { blank: false, from: null, out: "build/spec.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--blank") flags.blank = true;
    else if (a === "--from") flags.from = argv[++i];
    else if (a === "--out" || a === "-o") flags.out = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log("用法：node scripts/new-spec.mjs [--blank | --from intake.md] [--out build/spec.json]");
      process.exit(0);
    } else throw new Error(`未知参数：${a}`);
  }

  if (flags.blank) {
    await mkdir(path.dirname(path.resolve(flags.out)), { recursive: true });
    await writeFile(path.resolve(flags.out), JSON.stringify(blankSpec(), null, 2) + "\n", "utf8");
    console.log(`✅ 空白骨架已生成：${flags.out}（填完跑 build-prompt.mjs）`);
    return;
  }

  if (flags.from) {
    if (!existsSync(flags.from)) throw new Error(`找不到填表文件：${flags.from}`);
    const spec = await parseIntake(flags.from);
    await mkdir(path.dirname(path.resolve(flags.out)), { recursive: true });
    await writeFile(path.resolve(flags.out), JSON.stringify(spec, null, 2) + "\n", "utf8");
    console.log(`✅ 已从 ${flags.from} 解析出 ${spec.guests.length} 位嘉宾 → ${flags.out}`);
    console.log(`   下一步：node scripts/build-prompt.mjs ${flags.out} --out build/prompt.md`);
    return;
  }

  await interactive(flags.out);
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(2);
});
