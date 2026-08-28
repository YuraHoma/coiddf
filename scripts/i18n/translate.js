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

// Безкоштовний перекладач іноді відповідає 429 — просто тому, що з цієї
// мережі сьогодні вже багато перекладали. Пробуємо ще двічі з паузою,
// перш ніж вважати рядок невдалим.
function translateWithRetry(text) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return translateOnce(text);
    } catch (e) {
      last = e;
      if (attempt < 3) sleep(attempt * 2000);
    }
  }
  throw last;
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
    const target = translateWithRetry(source);
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

// Прибирання сиріт: машинні записи видаленого контенту не потрібні —
// якщо матеріал повернеться, машина перекладе заново (або підхопить
// перенесенням за хешем джерела). Вивірені людиною записи лишаємо:
// це робота перекладача, її не викидаємо ніколи.
const liveKeys = new Set(units.map((u) => u.key));
let pruned = 0;
for (const [key, entry] of Object.entries(catalog.entries)) {
  if (!liveKeys.has(key) && entry.status !== catalogLib.HUMAN) {
    delete catalog.entries[key];
    pruned++;
  }
}

if (!dryRun) catalogLib.save(catalog);

console.log(`\n\nНових перекладів:        ${added}`);
console.log(`Оновлено (машинних):     ${refreshed}`);
console.log(`Перенесено з інших ключів: ${moved}`);
console.log(`Пропущено вичитаних:     ${skippedHuman}`);
console.log(`Помилок:                 ${failed}`);
if (pruned) console.log(`Прибрано сиріт:          ${pruned}`);
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

// Невдалий переклад НЕ валить збірку. Раніше валив — і тоді тимчасовий
// збій зовнішнього сервісу означав, що новина, яку клієнт щойно зберіг
// у CMS, не зʼявиться на сайті взагалі. Сайт натомість збереться, а в
// англійській версії цей фрагмент тимчасово покаже український текст;
// наступний запуск перекладе його автоматично.
if (failed > 0) {
  console.log(
    `\nУВАГА: ${failed} рядків не перекладено — сервіс перекладу не відповів.\n` +
      "Збірку не спиняємо: у цих місцях англійська версія тимчасово покаже\n" +
      "український текст. Наступний деплой спробує ще раз."
  );
}
