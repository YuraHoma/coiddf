#!/usr/bin/env node
// Одноразова міграція: старий cache.json (плоска мапа "українською" -> "English")
// у catalog.json зі стабільними ключами й статусами.
//
// Усі наявні переклади машинні за походженням, тому переносяться як "machine".
// Записи, що вже є в каталозі, НЕ чіпаються — скрипт можна запускати повторно
// без ризику затерти роботу перекладача.
//
// Використання: node scripts/i18n/migrate-cache.js

const fs = require("fs");
const path = require("path");
const catalogLib = require("./catalog");
const { collectUnits } = require("./content");

const CACHE_PATH = path.join(__dirname, "cache.json");

if (!fs.existsSync(CACHE_PATH)) {
  console.error("cache.json не знайдено — мігрувати нема чого.");
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
const catalog = catalogLib.load();
const units = collectUnits();

let migrated = 0;
let kept = 0;
const notInCache = [];

for (const { key, source } of units) {
  if (catalog.entries[key]) {
    kept++;
    continue;
  }
  const target = cache[source];
  if (target === undefined) {
    notInCache.push({ key, source });
    continue;
  }
  catalog.entries[key] = catalogLib.makeEntry({
    source,
    target,
    status: catalogLib.MACHINE,
  });
  migrated++;
}

// Записи кешу, на які не вказує жодне місце в контенті. Найчастіше це
// UI-рядки шаблонів: їх свого часу переклали в кеш, але шаблони врешті
// отримали англійські варіанти прямо в розмітці, і кеш ними не користується.
const usedSources = new Set(units.map((u) => u.source));
const orphans = Object.keys(cache).filter((s) => !usedSources.has(s));

catalogLib.save(catalog);

console.log(`Перенесено з кешу:        ${migrated}`);
console.log(`Вже було в каталозі:      ${kept}`);
console.log(`Немає перекладу в кеші:   ${notInCache.length}`);
console.log(`Записів кешу без ужитку:  ${orphans.length}`);
console.log(`Усього в каталозі:        ${Object.keys(catalog.entries).length}`);

if (notInCache.length) {
  console.log("\nБез перекладу (потрібен запуск translate.js):");
  for (const u of notInCache.slice(0, 20)) {
    console.log(`  ${u.key}\n    ${u.source.slice(0, 80)}`);
  }
  if (notInCache.length > 20) console.log(`  … ще ${notInCache.length - 20}`);
}
