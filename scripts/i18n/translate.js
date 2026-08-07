#!/usr/bin/env node
// Машинний переклад НОВОГО та ЗМІНЕНОГО контенту.
//
// Головне правило: запис зі статусом "human" не перезаписується ніколи.
// Якщо клієнт відредагував джерело під вичитаним перекладом, скрипт лише
// позначає це в звіті — рішення за перекладачем, машина його не затирає.
//
// Білд (src/_data/en.js) у мережу не ходить — лише читає catalog.json.
//
// Використання:
//   node scripts/i18n/translate.js            — перекласти нове й змінене машинне
//   node scripts/i18n/translate.js --dry-run  — лише показати, що буде зроблено
//   node scripts/i18n/translate.js --retranslate-machine
//        — перекласти наново ВСІ машинні записи (вичитаних не чіпає)

const { execFileSync } = require("child_process");
const catalogLib = require("./catalog");
const { collectUnits } = require("./content");
const { STATE } = catalogLib;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const retranslateMachine = args.includes("--retranslate-machine");

const catalog = catalogLib.load();
const index = catalogLib.buildSourceIndex(catalog);
const units = collectUnits();

function sleep(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function translateOnce(text) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=uk&tl=en&dt=t&q=" +
    encodeURIComponent(text);
  const out = execFileSync("curl", ["-sS", "--max-time", "20", url], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const parsed = JSON.parse(out);
  return parsed[0].map((seg) => seg[0]).join("");
}

let added = 0;
let refreshed = 0;
let moved = 0;
let failed = 0;
let skippedHuman = 0;
const staleHuman = [];

for (const { key, source } of units) {
  const r = catalogLib.resolveOne(catalog, index, key, source);

  // Вичитане людиною — недоторканне.
  if (r.state === STATE.HUMAN) {
    skippedHuman++;
    continue;
  }
  if (r.state === STATE.STALE_HUMAN) {
    skippedHuman++;
    staleHuman.push({ key, source, previousSource: r.previousSource, target: r.target });
    continue;
  }

  // Той самий текст уже перекладено під іншим ключем — переносимо без мережі.
  if (r.state === STATE.MOVED) {
    if (!dryRun) {
      catalog.entries[key] = catalogLib.makeEntry({
        source,
        target: r.target,
        status: r.movedFromStatus,
      });
    }
    moved++;
    continue;
  }

  if (r.state === STATE.MACHINE && !retranslateMachine) continue;

  const isNew = r.state === STATE.MISSING;
  if (dryRun) {
    console.log(`${isNew ? "новий" : "оновити"}: ${key}`);
    isNew ? added++ : refreshed++;
    continue;
  }

  try {
    const target = translateOnce(source);
    catalog.entries[key] = catalogLib.makeEntry({
      source,
      target,
      status: catalogLib.MACHINE,
    });
    isNew ? added++ : refreshed++;
    process.stdout.write(".");
    sleep(120);
  } catch (e) {
    failed++;
    process.stderr.write(`\nПомилка перекладу ${key}: ${e.message}\n`);
  }
}

if (!dryRun) catalogLib.save(catalog);

console.log(`\n\nНових перекладів:        ${added}`);
console.log(`Оновлено (машинних):     ${refreshed}`);
console.log(`Перенесено з інших ключів: ${moved}`);
console.log(`Пропущено вичитаних:     ${skippedHuman}`);
console.log(`Помилок:                 ${failed}`);
console.log(`Усього в каталозі:       ${Object.keys(catalog.entries).length}`);

if (staleHuman.length) {
  console.log(
    `\nУВАГА: ${staleHuman.length} вичитаних перекладів мають змінене джерело.`
  );
  console.log("Машина їх не чіпала. Віддайте перекладачу: npm run i18n:export");
  for (const s of staleHuman.slice(0, 10)) console.log(`  ${s.key}`);
  if (staleHuman.length > 10) console.log(`  … ще ${staleHuman.length - 10}`);
}

if (dryRun) console.log("\n(--dry-run: каталог не змінювався)");
if (failed > 0) process.exitCode = 1;
