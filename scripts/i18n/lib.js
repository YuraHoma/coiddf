// Спільна логіка для офлайн-скрипта перекладу (scripts/i18n/translate.js)
// та білд-тайм даних (src/_data/en.js) — щоб обидва однаково проходили по
// структурі даних і однаково вирішували, який рядок перекладати, а який ні.

const CYRILLIC = /[а-яА-ЯіїєґІЇЄҐ'’]/;

function isCyrillic(value) {
  return typeof value === "string" && CYRILLIC.test(value);
}

// Внутрішні шляхи сайту (не asset-файли) — на англійській версії ведуть на
// дзеркальну /en/... сторінку з тим самим (неперекладеним) слагом.
function isInternalPath(value) {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/assets")
  );
}

function toEnPath(value) {
  return "/en" + value;
}

// Рекурсивно проходить об'єкт/масив, перекладаючи кириличні рядки через
// translateFn(text) і переписуючи внутрішні шляхи на /en/... .
// opts.skipKeys — ключі, які лишаються без змін на будь-якому рівні
// (напр. власні імена людей).
function walk(value, translateFn, opts = {}) {
  if (Array.isArray(value)) return value.map((v) => walk(v, translateFn, opts));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = opts.skipKeys && opts.skipKeys.includes(k) ? v : walk(v, translateFn, opts);
    }
    return out;
  }
  if (isInternalPath(value)) return toEnPath(value);
  if (isCyrillic(value)) return translateFn(value);
  return value;
}

module.exports = { isCyrillic, isInternalPath, toEnPath, walk };
