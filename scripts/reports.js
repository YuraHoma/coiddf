// Адреси сторінок документів звітності.
//
// Звіти лежать не файлами, а записами в reports.json, тож адресу для
// кожного треба порахувати. Робимо це в одному місці: і сторінка звіту,
// і посилання з переліку, і англійська версія беруть слаг звідси, тому
// пара українська/англійська сторінка завжди зчеплена.

const { ukSlug } = require("./slug.js");

// Рік документа. Дата — головне джерело; якщо її не заповнили, пробуємо
// витягти рік із назви («…за 2025 рік»), бо саме так партнер називає
// документ. Немає ні там, ні там — повертаємо порожньо.
function reportYear(item) {
  const d = item && item.date ? new Date(item.date) : null;
  if (d && !isNaN(d)) return String(d.getUTCFullYear());
  const m = String((item && item.title) || "").match(/\b(?:19|20)\d{2}\b/);
  return m ? m[0] : "";
}

const MAX = 52;

// Рік стоїть ПЕРЕД назвою навмисно. Офіційні назви звітів різняться
// здебільшого роком у кінці («…неприбуткової організації за 2025 рік»),
// а слаг доводиться обрізати — тож без року попереду звіти за різні роки
// дали б однакову адресу, і одна сторінка мовчки затерла б іншу.
function reportSlug(item) {
  const year = reportYear(item);
  let slug = ukSlug((item && item.title) || "");
  if (slug.length > MAX) {
    slug = slug.slice(0, MAX);
    // Ріжемо по межі слова, щоб в адресі не лишалося пів слова.
    const cut = slug.lastIndexOf("-");
    if (cut > 0) slug = slug.slice(0, cut);
  }
  return [year, slug].filter(Boolean).join("-") || "dokument";
}

// Слаги всього переліку разом: тільки так можна побачити збіг і розвести
// адреси. Збіг цілком реальний — два документи одного року з назвами, що
// різняться лише хвостом.
function reportSlugs(items) {
  const seen = new Map();
  return (items || []).map((item) => {
    const base = reportSlug(item);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

module.exports = { reportYear, reportSlug, reportSlugs };
