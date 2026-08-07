// Англійська версія контенту сайту — генерується білд-тайм із того самого
// українського _data/*.json + news/projects markdown, підставляючи готові
// переклади з каталогу (scripts/i18n/catalog.json). Мережевих запитів тут
// немає, тому білд лишається швидким і не залежить від доступності мережі.
//
// Що саме перекладається — описано в scripts/i18n/content.js (спільно зі
// скриптами перекладу), щоб білд і скрипти не могли розійтися.
//
// Суворий режим (I18N_STRICT=1 або будь-який CI): збірка ПАДАЄ, якщо
// англійська сторінка отримала б неперекладений або застарілий текст.
// Мета — українська проза не може непомітно поїхати на прод.

const catalogLib = require("../../scripts/i18n/catalog");
const { buildContent } = require("../../scripts/i18n/content");
const { STATE, LABEL } = catalogLib;

module.exports = function () {
  const catalog = catalogLib.load();
  const resolver = catalogLib.createResolver(catalog);
  const content = buildContent(resolver.translate);

  const level = catalogLib.requireLevel();
  const strict = catalogLib.isStrict();
  const blocking = resolver.issues.filter((i) => catalogLib.BLOCKING[level].includes(i.state));

  if (blocking.length) {
    const lines = blocking
      .slice(0, 15)
      .map((i) => `  [${LABEL[i.state]}] ${i.key}\n      ${i.source.slice(0, 80)}`);
    const more = blocking.length > 15 ? `\n  … ще ${blocking.length - 15}` : "";
    const report = `${blocking.length} записів без придатного перекладу (I18N_REQUIRE=${level}):\n${lines.join("\n")}${more}`;

    if (strict) {
      throw new Error(
        `[i18n] ${report}\n\n` +
          `Виправити: npm run i18n:translate (машинний переклад нового)\n` +
          `або npm run i18n:export -> вичитка перекладачем -> npm run i18n:import.\n` +
          `Детальний звіт: npm run i18n:check`
      );
    }
    console.warn(`[i18n] ${report}\n[i18n] Локально це попередження; у CI збірка впаде.`);
  }

  const machine = resolver.counts[STATE.MACHINE] + resolver.counts[STATE.MOVED];
  if (machine && !strict) {
    console.warn(`[i18n] ${machine} рядків — машинний переклад, не вичитаний людиною.`);
  }

  return content;
};
