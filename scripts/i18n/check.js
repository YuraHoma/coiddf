#!/usr/bin/env node
// Звіт про стан перекладу + код виходу для CI.
//
// Той самий розрахунок, що й у білді (src/_data/en.js), але окремою
// командою — щоб бачити картину, не чекаючи повної збірки.
//
// Використання:
//   node scripts/i18n/check.js                  — звіт, падає за I18N_STRICT/CI
//   I18N_STRICT=1 node scripts/i18n/check.js    — примусово суворо
//   I18N_REQUIRE=human node scripts/i18n/check.js — вимагати вичитку людиною

const catalogLib = require("./catalog");
const { buildContent } = require("./content");
const { STATE, LABEL } = catalogLib;

const catalog = catalogLib.load();
const resolver = catalogLib.createResolver(catalog);
buildContent(resolver.translate);

const { counts, issues } = resolver;
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const level = catalogLib.requireLevel();
const strict = catalogLib.isStrict();

console.log(`Перекладних рядків на сайті: ${total}\n`);
for (const state of Object.values(STATE)) {
  if (counts[state]) console.log(`  ${String(counts[state]).padStart(4)}  ${LABEL[state]}`);
}

const blocking = issues.filter((i) => catalogLib.BLOCKING[level].includes(i.state));

if (blocking.length) {
  console.log(`\nПроблемних записів за рівнем I18N_REQUIRE=${level}: ${blocking.length}`);
  for (const i of blocking.slice(0, 25)) {
    console.log(`  [${i.state}] ${i.key}`);
    console.log(`      ${i.source.slice(0, 90)}`);
  }
  if (blocking.length > 25) console.log(`  … ще ${blocking.length - 25}`);
  console.log("\nЩо робити: npm run i18n:translate (машинний) або");
  console.log("npm run i18n:export -> вичитка -> npm run i18n:import (людиною).");
}

const done = counts[STATE.HUMAN];
console.log(`\nВичитано людиною: ${done} з ${total} (${Math.round((done / total) * 100)}%)`);

if (blocking.length && strict) {
  console.error(`\nПОМИЛКА: збірка в суворому режимі не пройде.`);
  process.exit(1);
}
if (blocking.length) {
  console.log("\n(локально це попередження; у CI така збірка впаде)");
}
