// Спільна логіка обходу контенту для всього i18n-конвеєра:
// scripts/i18n/content.js (побудова англійського дерева даних),
// translate.js, export-csv.js, check.js та src/_data/en.js.
// Обидві сторони мають однаково вирішувати, який рядок перекладати,
// і однаково називати його ключем — інакше переклади «розїдуться».

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
// translateFn(text, key) і переписуючи внутрішні шляхи на /en/... .
//
// Другий аргумент translateFn — стабільний ключ місця в контенті
// (напр. "data/home.hero.headline", "data/pronas.blocks[2].title").
// Саме він, а не сам український текст, ідентифікує запис у каталозі:
// клієнт може виправити одруківку в CMS, і переклад лишається прив'язаним.
//
// opts.skipKeys — ключі, що лишаються без змін на будь-якому рівні
// (напр. власні імена людей, машинні ідентифікатори партнерів).
// opts.basePath — префікс ключа для цього набору даних.
function walk(value, translateFn, opts = {}, keyPath = opts.basePath || "") {
  if (Array.isArray(value)) {
    return value.map((v, i) => walk(v, translateFn, opts, `${keyPath}[${i}]`));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        opts.skipKeys && opts.skipKeys.includes(k)
          ? v
          : walk(v, translateFn, opts, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
  if (isInternalPath(value)) return toEnPath(value);
  if (isCyrillic(value)) return translateFn(value, keyPath);
  return value;
}

module.exports = { isCyrillic, isInternalPath, toEnPath, walk };
