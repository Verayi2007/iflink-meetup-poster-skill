#!/usr/bin/env node
/**
 * new-spec.mjs — 活动信息采集器：把「人话」变成 build-prompt.mjs 能吃的 spec.json
 *
 * 三种用法：
 *   1) 空白骨架      node scripts/new-spec.mjs --blank
 *   2) 填表转化      node scripts/new-spec.mjs --from build/intake.md --out build/spec.json
 *   3) 交互问答      node scripts/new-spec.mjs --out build/spec.json
 *
 * 设计原则：所有字段都能留空，留空就落到「安全默认值」，绝不因为用户没填而中断。
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

const MASCOT_ALIAS = {
  nailong: "nailong", 奶龙: "nailong",
  custom: "custom", 自定义: "custom",
  none: "none", 无: "none", 不要: "none",
};

/* ────────────────────────────── 空白骨架 ────────────────────────────── */

function blankSpec() {
  return {
    _说明: "填完这个文件后跑：node scripts/build-prompt.mjs build/spec.json",
    series: "Meetup",
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
    mascot: { preset: "none", name: "", cup_brand: "", description: "" },
    slogan: "Link the IFs, Connect the Dots",
    variant: "cream",
    canvas: "1024x1536",
    notes: "",
  };
}

/* ────────────────────────────── 填表解析 ────────────────────────────── */

const KEY_MAP = {
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
  吉祥物: "mascot", mascot: "mascot",
  杯身字: "cup_brand", cup_brand: "cup_brand",
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

    if (field === "illustration_scene") spec.illustration.scene = SCENE_ALIAS[v] ?? v;
    else if (field === "illustration_desc") spec.illustration.description = v;
    else if (field === "mascot") {
      const preset = MASCOT_ALIAS[v] ?? "custom";
      spec.mascot.preset = preset;
      if (preset === "custom") spec.mascot.description = v;
    } else if (field === "cup_brand") spec.mascot.cup_brand = v;
    else if (field === "variant") spec.variant = /dark|深|黑/.test(v) ? "dark" : "cream";
    else spec[field] = v;
    inGuests = false;
  }

  // 吉祥物名称：preset=nailong 时默认奶龙
  if (spec.mascot.preset === "nailong") {
    spec.mascot.name = spec.mascot.name || "奶龙";
    spec.mascot.cup_brand = spec.mascot.cup_brand || "IF.Link";
  }
  if (spec.guests.length === 0) spec.guests.push({ name: "", topic: "", gender: "other", hair: "" });
  if (!spec.mascot.preset) spec.mascot.preset = "none";

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

  try {
    console.log("\nIF.Link Meetup 海报 · 活动信息采集（全部可留空，回车跳过）\n");

    const spec = blankSpec();
    delete spec._说明;

    spec.event_name = await ask("① 活动名称", "IF.Link Meetup");
    spec.kicker = await ask("② 主题行（用 × 连接关键词）", "AI × 创作 × 交流");
    spec.date_time = await ask("③ 活动时间", "11 月 14 日（周五）晚 19:00–21:00");
    spec.location = await ask("④ 活动地点", "东南大学九龙湖校区纪忠楼 2 楼");
    spec.one_liner = await ask("⑤ 一句话主张（可空，空了就不放这一行）", "");

    console.log("\n⑥ 分享嘉宾（留空姓名结束录入）");
    spec.guests = [];
    for (let i = 1; i <= 6; i++) {
      const name = await ask(`   嘉宾 ${i} 姓名`, "");
      if (!name) break;
      const genderRaw = await ask("      性别（男/女/不限）", "不限");
      const topic = await ask("      分享主题", "");
      const hair = await ask("      发型/配饰（用于头像，可空）", "");
      spec.guests.push({
        name,
        topic,
        gender: GENDER_ALIAS[genderRaw] ?? "other",
        hair,
      });
    }
    if (spec.guests.length === 0) spec.guests.push({ name: "", topic: "", gender: "other", hair: "" });

    spec.perks_title = await ask("⑦ 福利区标题", "小福利");
    spec.perks_text = await ask("⑧ 福利一句话", "到场有好吃好喝茶歇等着你");

    const scene = await ask("⑨ 右侧插画场景（围坐/白板/协作/无/自定义）", "围坐");
    spec.illustration.scene = SCENE_ALIAS[scene] ?? "sit-around";
    if (spec.illustration.scene === "custom") {
      spec.illustration.description = await ask("      自定插画描述", "");
    }

    const mascot = await ask("⑩ 吉祥物（奶龙/无/自定义描述）", "无");
    if (MASCOT_ALIAS[mascot] === "nailong") {
      spec.mascot = { preset: "nailong", name: "奶龙", cup_brand: "IF.Link", description: "" };
    } else if (MASCOT_ALIAS[mascot]) {
      spec.mascot = { preset: "none", name: "", cup_brand: "", description: "" };
    } else {
      spec.mascot = { preset: "custom", name: "吉祥物", cup_brand: "", description: mascot };
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
