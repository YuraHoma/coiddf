// Єдине джерело правди про те, ЩО саме на сайті перекладається.
//
// Раніше цей перелік був продубльований у translate.js і в src/_data/en.js,
// і вони встигли розійтися: en.js перекладав contacts.json, а translate.js
// про нього не знав. Тепер обидва викликають buildContent() і різняться лише
// функцією translate(), яку передають:
//   src/_data/en.js — підставляє переклад із каталогу;
//   translate.js/export-csv.js/check.js — лише збирають перелік рядків.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { autoExcerpt } = require("../text.js");
const MarkdownIt = require("markdown-it");
const { walk } = require("./lib");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "src", "_data");
const NEWS_DIR = path.join(ROOT, "src", "news");
const PROJECTS_DIR = path.join(ROOT, "src", "projects");

// Набори даних, що мають англійську версію.
// skipKeys — ключі, які не перекладаються на жодному рівні вкладеності.
const DATASETS = [
  { name: "site", skipKeys: [] },
  { name: "contacts", skipKeys: [] },
  { name: "home", skipKeys: [] },
  { name: "pronas", skipKeys: [] },
  { name: "team", skipKeys: ["photo"] },
  { name: "partners", skipKeys: ["key"] },
  { name: "novyny", skipKeys: [] },
  { name: "proyekty", skipKeys: [] },
  // file — шлях до документа політики, не текст.
  { name: "legal", skipKeys: ["file"] },
  { name: "policy", skipKeys: [] },
  // file — шлях до PDF, а не текст: перекладати його не можна.
  { name: "reports", skipKeys: ["file"] },
  { name: "feedback", skipKeys: [] },
];

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8"));
}

function mdFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

// Слаг файлу = ключ статті. Не залежить від заголовка, тому переклад
// переживає редагування тексту в CMS.
const { ukSlug } = require("../slug.js");

// Слаг має збігатися з permalink у 11tydata (фільтр ukslug) — інакше
// англійська сторінка отримає іншу адресу, ніж українська.
function slugOf(file) {
  return ukSlug(file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""));
}

// translate(source, key) -> англійський рядок.
// Повертає повністю зібраний англійський контент сайту.
function buildContent(translate) {
  const md = new MarkdownIt({ html: false });

  const dataset = (name, skipKeys) =>
    walk(readJson(name), translate, { skipKeys, basePath: `data/${name}` });

  const out = {};
  for (const { name, skipKeys } of DATASETS) {
    out[name] = dataset(name, skipKeys);
  }

  // Офіційна англійська назва організації — не машинний переклад.
  out.site.orgFull = readJson("site").orgEnglish;

  const article = (dir, kind, urlPrefix) =>
    mdFiles(dir)
      .map((f) => {
        const { data, content } = matter(fs.readFileSync(path.join(dir, f), "utf8"));
        const slug = slugOf(f);
        const key = `${kind}/${slug}`;
        const title = data.title ? translate(data.title, `${key}.title`) : data.title;
        const body = content.trim();
        const enBody = body ? translate(body, `${key}.body`) : "";
        const contentHtml = enBody ? md.render(enBody) : "";
        // Короткий опис окремо не перекладається: він і українською
        // береться з початку тексту, тож англійський рахуємо з уже
        // перекладеного тіла. Одним полем менше і в CMS, і перекладачу.
        const excerpt = autoExcerpt(enBody);
        const url = `${urlPrefix}${slug}/`;
        return {
          url,
          slug,
          title,
          excerpt,
          date: data.date,
          image: data.image,
          contentHtml,
          data: {
            title,
            excerpt,
            date: data.date,
            image: data.image,
            url,
            direction: data.direction,
          },
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

  out.newsPosts = article(NEWS_DIR, "news", "/en/novyny/");
  out.projects = article(PROJECTS_DIR, "projects", "/en/proyekty/");

  return out;
}

// Перелік усіх перекладних одиниць у порядку появи в контенті.
// Дублі одного й того самого ключа неможливі — ключ унікальний за побудовою.
function collectUnits() {
  const units = [];
  const seen = new Set();
  buildContent((source, key) => {
    if (!seen.has(key)) {
      seen.add(key);
      units.push({ key, source });
    }
    return source;
  });
  return units;
}

module.exports = { buildContent, collectUnits, DATASETS };
