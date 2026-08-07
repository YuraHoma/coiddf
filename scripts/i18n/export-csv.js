#!/usr/bin/env node
// Вивантаження робочого файлу для перекладача.
//
// Відкривається у Excel і Google Sheets. Перекладач редагує лише два
// стовпці — english і approved — після чого файл імпортують назад
// командою npm run i18n:import.
//
// Використання:
//   node scripts/i18n/export-csv.js                 — усе, що потребує уваги
//   node scripts/i18n/export-csv.js --all           — весь контент, включно з готовим
//   node scripts/i18n/export-csv.js --excel         — роздільник ';' для Excel
//   node scripts/i18n/export-csv.js --out шлях.csv

const fs = require("fs");
const path = require("path");
const catalogLib = require("./catalog");
const { collectUnits } = require("./content");
const csv = require("./csv");
const { STATE, LABEL } = catalogLib;

const args = process.argv.slice(2);
const all = args.includes("--all");
const delimiter = args.includes("--excel") ? ";" : ",";
const outArg = args.indexOf("--out");
const OUT = outArg !== -1 ? args[outArg + 1] : path.join(__dirname, "translations.csv");

const catalog = catalogLib.load();
const index = catalogLib.buildSourceIndex(catalog);
const units = collectUnits();

const HEADER = [
  "key",
  "status",
  "source_uk",
  "previous_uk",
  "english",
  "approved",
  "note",
  "source_hash",
];

const rows = [HEADER];
let included = 0;

for (const { key, source } of units) {
  const r = catalogLib.resolveOne(catalog, index, key, source);
  // Готове й незмінене показуємо лише на вимогу — щоб перекладач бачив
  // у файлі саме свою чергу роботи, а не 272 рядки щоразу.
  if (!all && r.state === STATE.HUMAN) continue;

  const entry = catalog.entries[key];
  rows.push([
    key,
    LABEL[r.state],
    source,
    r.previousSource || "",
    r.target === source && r.state === STATE.MISSING ? "" : r.target,
    r.state === STATE.HUMAN ? "так" : "",
    (entry && entry.note) || "",
    catalogLib.hash(source),
  ]);
  included++;
}

// BOM — без нього Excel відкриває UTF-8 кирилицю як «крякозябри».
fs.writeFileSync(OUT, "﻿" + csv.stringify(rows, delimiter), "utf8");

console.log(`Записано ${included} рядків у ${OUT}`);
console.log(`Роздільник: "${delimiter}"${delimiter === "," ? " (для Excel: --excel)" : ""}`);
if (!all && included === 0) {
  console.log("Усе вичитано людиною. Повний перелік: --all");
}
console.log("\nПерекладач редагує стовпці english та approved, решту не чіпає.");
