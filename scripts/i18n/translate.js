#!/usr/bin/env node
// Офлайн пакетний переклад: один раз проходить по всьому українському
// контенту, перекладає кожен унікальний кириличний рядок через неофіційний
// endpoint Google Translate і зберігає результат у cache.json.
//
// Білд (src/_data/en.js) НЕ звертається в мережу — лише читає цей кеш.
// Тому запуск цього скрипта потрібен лише коли з'являється новий контент.
//
// Використання: node scripts/i18n/translate.js

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const matter = require("gray-matter");
const { walk } = require("./lib");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "src", "_data");
const NEWS_DIR = path.join(ROOT, "src", "news");
const PROJECTS_DIR = path.join(ROOT, "src", "projects");
const CACHE_PATH = path.join(__dirname, "cache.json");

const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) : {};
let translatedCount = 0;
let failedCount = 0;

function sleep(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function translateOnce(text) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=uk&tl=en&dt=t&q=" +
    encodeURIComponent(text);
  const out = execFileSync("curl", ["-sS", "--max-time", "15", url], { encoding: "utf8" });
  const parsed = JSON.parse(out);
  return parsed[0].map((seg) => seg[0]).join("");
}

// Гарантує, що text є в кеші (перекладає й дописує, якщо ще нема).
// Використовується і як translateFn для walk(), і напряму для довільних рядків.
function ensureTranslated(text) {
  if (cache[text]) return cache[text];
  try {
    const translated = translateOnce(text);
    cache[text] = translated;
    translatedCount++;
    process.stdout.write(".");
    sleep(120);
    return translated;
  } catch (e) {
    failedCount++;
    process.stderr.write(`\nПомилка перекладу "${text.slice(0, 60)}...": ${e.message}\n`);
    return text;
  }
}

function saveCache() {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

// --- _data/*.json ---
const dataFiles = [
  { name: "site", skipKeys: [] },
  { name: "home", skipKeys: [] },
  { name: "pronas", skipKeys: [] },
  { name: "team", skipKeys: ["photo"] },
  { name: "partners", skipKeys: ["key"] },
  { name: "novyny", skipKeys: [] },
  { name: "proyekty", skipKeys: [] },
  { name: "legal", skipKeys: [] },
  { name: "policy", skipKeys: [] },
  { name: "reports", skipKeys: [] },
  { name: "feedback", skipKeys: [] },
];

for (const { name, skipKeys } of dataFiles) {
  const file = path.join(DATA_DIR, `${name}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`\n${name}.json:`);
  walk(data, ensureTranslated, { skipKeys });
}

// --- news markdown: title, excerpt, body ---
console.log("\nnews/*.md:");
for (const f of fs.readdirSync(NEWS_DIR).filter((f) => f.endsWith(".md"))) {
  const { data, content } = matter(fs.readFileSync(path.join(NEWS_DIR, f), "utf8"));
  if (data.title) ensureTranslated(data.title);
  if (data.excerpt) ensureTranslated(data.excerpt);
  const body = content.trim();
  if (body) ensureTranslated(body);
}

// --- projects markdown: title, excerpt, body (у проєктів є власні сторінки) ---
console.log("\nprojects/*.md:");
for (const f of fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith(".md"))) {
  const { data, content } = matter(fs.readFileSync(path.join(PROJECTS_DIR, f), "utf8"));
  if (data.title) ensureTranslated(data.title);
  if (data.excerpt) ensureTranslated(data.excerpt);
  const body = content.trim();
  if (body) ensureTranslated(body);
}

// --- hardcoded UI strings used directly in templates (not data-driven) ---
console.log("\nUI-рядки шаблонів:");
const uiStrings = [
  // page <title>/description (front matter, not localized via data)
  "Фонд розвитку міжнародної співпраці | Гуманітарна допомога",
  "Головна сторінка благодійного фонду.",
  "Про нас | Фонд розвитку міжнародної співпраці",
  "Місія, принципи та історія благодійного фонду.",
  "Наша команда | Фонд розвитку міжнародної співпраці",
  "Команда фонду — засновники, менеджери, бухгалтерія, склад і волонтери.",
  "Проєкти | Фонд розвитку міжнародної співпраці",
  "Гуманітарні, освітні та відновлювальні проєкти фонду.",
  "Новини | Фонд розвитку міжнародної співпраці",
  "Останні новини та оновлення фонду.",
  "Партнери | Фонд розвитку міжнародної співпраці",
  "Українські та міжнародні партнери фонду.",
  "Звітність | Фонд розвитку міжнародної співпраці",
  "Статистичні дані, аналітичні звіти та фінансова звітність фонду.",
  "Правова інформація | Фонд розвитку міжнародної співпраці",
  "Реєстраційні дані та реквізити благодійного фонду.",
  "Політика | Фонд розвитку міжнародної співпраці",
  "Політика конфіденційності та обробки звернень фонду.",
  "Зв'язатися з нами | Фонд розвитку міжнародної співпраці",
  "Форма зворотного зв'язку — запити, скарги та кар'єрні можливості.",
  "Сторінку не знайдено | Фонд розвитку міжнародної співпраці",
  "Такої сторінки не існує або її було переміщено.",
  // 404 page body
  "Помилка 404",
  "Сторінку не знайдено",
  "Такої сторінки не існує або її було переміщено. Поверніться на головну чи скористайтеся меню.",
  "На головну ↗",
  // header/footer chrome
  "Меню",
  "Головна навігація",
  "Зв'язатися з нами",
  "Навігація футера",
  "Контакти",
  "Партнерство",
  "Для медіа",
  "Ми в соц. мережах",
  "Соціальні мережі",
  "Всі права захищені.",
  // news list/article/card chrome
  "Новини",
  "Інші новини",
  "Усі новини ↗",
  "Детальніше ↗",
  // home hero map alt
  "Карта областей України; Запорізька область — домашній регіон фонду — виділена кольором",
  // contact form
  "Ім'я",
  "Категорія звернення",
  "Повідомлення",
  "Надіслати",
  "Звернення від",
];
uiStrings.forEach(ensureTranslated);

saveCache();
console.log(`\n\nГотово. Нові переклади: ${translatedCount}, помилок: ${failedCount}, всього в кеші: ${Object.keys(cache).length}.`);
if (failedCount > 0) process.exitCode = 1;
