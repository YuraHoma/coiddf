#!/usr/bin/env node
// Імпорт вичитаного перекладачем файлу назад у каталог.
//
// Що вважається роботою людини:
//   * approved = так/yes/y/x/+/1  -> статус "human";
//   * english змінили порівняно з каталогом -> теж "human" (перекладач
//     явно втрутився в текст; втратити цю правку через незаповнену
//     галочку було б гірше, ніж зайвий раз позначити запис вичитаним).
//
// Використання:
//   node scripts/i18n/import-csv.js [шлях.csv] [--dry-run]

const fs = require("fs");
const path = require("path");
const catalogLib = require("./catalog");
const { collectUnits } = require("./content");
const csv = require("./csv");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fileArg = args.find((a) => !a.startsWith("--"));
const FILE = fileArg || path.join(__dirname, "translations.csv");

if (!fs.existsSync(FILE)) {
  console.error(`Файл не знайдено: ${FILE}`);
  process.exit(1);
}

const rows = csv.parse(fs.readFileSync(FILE, "utf8"));
if (!rows.length) {
  console.error("Порожній файл.");
  process.exit(1);
}

const header = rows[0].map((h) => h.trim().toLowerCase());
const col = (name) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`У файлі немає стовпця "${name}". Експортуйте шаблон наново.`);
  return i;
};
const iKey = col("key");
const iEnglish = col("english");
const iApproved = col("approved");
const iNote = header.indexOf("note");
const iHash = header.indexOf("source_hash");

const catalog = catalogLib.load();
const liveSource = new Map(collectUnits().map((u) => [u.key, u.source]));

const APPROVED = /^(так|yes|y|x|\+|1|true|✓)$/i;

let approved = 0;
let edited = 0;
let unchanged = 0;
let emptyTarget = 0;
const unknownKeys = [];
const staleRows = [];

for (const row of rows.slice(1)) {
  const key = (row[iKey] || "").trim();
  if (!key) continue;

  const source = liveSource.get(key);
  if (source === undefined) {
    // Ключ зник із контенту, поки перекладач працював (клієнт видалив блок
    // чи перейменував файл). Мовчки створювати запис не можна — він ніколи
    // не використається і замаскує проблему.
    unknownKeys.push(key);
    continue;
  }

  // Excel іноді додає апостроф-префікс до комірок, що починаються з = + - @.
  const target = (row[iEnglish] || "").replace(/^'/, "").trim();
  if (!target) {
    emptyTarget++;
    continue;
  }

  // Джерело змінилось після експорту — переклад робили не з того тексту.
  if (iHash !== -1 && row[iHash] && row[iHash].trim() !== catalogLib.hash(source)) {
    staleRows.push(key);
    continue;
  }

  const entry = catalog.entries[key];
  const isApproved = APPROVED.test((row[iApproved] || "").trim());
  const changed = !entry || entry.target !== target;

  if (!isApproved && !changed) {
    unchanged++;
    continue;
  }

  if (!dryRun) {
    catalog.entries[key] = catalogLib.makeEntry({
      source,
      target,
      status: catalogLib.HUMAN,
      note: iNote !== -1 ? (row[iNote] || "").trim() : entry && entry.note,
    });
  }
  if (changed) edited++;
  else approved++;
}

if (!dryRun) catalogLib.save(catalog);

console.log(`Змінено текст перекладу:  ${edited}`);
console.log(`Підтверджено без правок:  ${approved}`);
console.log(`Без змін (пропущено):     ${unchanged}`);
console.log(`Порожній english:         ${emptyTarget}`);
console.log(`Усього вичитано в каталозі: ${
  Object.values(catalog.entries).filter((e) => e.status === catalogLib.HUMAN).length
} з ${liveSource.size}`);

if (staleRows.length) {
  console.log(`\nУВАГА: ${staleRows.length} рядків пропущено — український оригінал змінився`);
  console.log("після експорту. Зробіть npm run i18n:export і передайте файл наново:");
  for (const k of staleRows.slice(0, 10)) console.log(`  ${k}`);
}
if (unknownKeys.length) {
  console.log(`\nУВАГА: ${unknownKeys.length} невідомих ключів пропущено (контент змінився):`);
  for (const k of unknownKeys.slice(0, 10)) console.log(`  ${k}`);
}
if (dryRun) console.log("\n(--dry-run: каталог не змінювався)");
