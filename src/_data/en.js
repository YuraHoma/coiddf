// Англійська версія контенту сайту — генерується білд-тайм із того самого
// українського _data/*.json + news/projects markdown, підставляючи готові
// переклади з кешу (scripts/i18n/cache.json), який готує
// scripts/i18n/translate.js. Мережевих запитів тут немає — лише читання
// кешу, тому білд лишається швидким і не залежить від доступності мережі.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const MarkdownIt = require("markdown-it");
const { walk } = require("../../scripts/i18n/lib");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(__dirname);
const NEWS_DIR = path.join(ROOT, "src", "news");
const PROJECTS_DIR = path.join(ROOT, "src", "projects");
const CACHE_PATH = path.join(ROOT, "scripts", "i18n", "cache.json");

const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) : {};
const md = new MarkdownIt({ html: false });

function t(text) {
  if (cache[text]) return cache[text];
  console.warn(`[en.js] немає перекладу в кеші, лишаю оригінал: "${text.slice(0, 60)}"`);
  return text;
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8"));
}

function translateData(name, skipKeys = []) {
  return walk(readJson(name), t, { skipKeys });
}

module.exports = function () {
  const site = translateData("site");
  site.orgFull = readJson("site").orgEnglish; // офіційна англійська назва замість машинного перекладу

  const contacts = translateData("contacts");
  const home = translateData("home");
  const pronas = translateData("pronas");
  const team = translateData("team", ["photo"]);
  const partners = translateData("partners", ["key"]);
  const novyny = translateData("novyny");
  const proyekty = translateData("proyekty");
  const legal = translateData("legal");
  const policy = translateData("policy");
  const reports = translateData("reports");
  const feedback = translateData("feedback");

  const newsPosts = fs
    .readdirSync(NEWS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, content } = matter(fs.readFileSync(path.join(NEWS_DIR, f), "utf8"));
      const slug = f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
      const title = data.title ? t(data.title) : data.title;
      const excerpt = data.excerpt ? t(data.excerpt) : data.excerpt;
      const body = content.trim();
      const contentHtml = body ? md.render(t(body)) : "";
      const url = `/en/novyny/${slug}/`;
      return {
        url,
        slug,
        title,
        excerpt,
        date: data.date,
        image: data.image,
        contentHtml,
        data: { title, excerpt, date: data.date, image: data.image },
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const projects = fs
    .readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, content } = matter(fs.readFileSync(path.join(PROJECTS_DIR, f), "utf8"));
      const slug = f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
      const title = data.title ? t(data.title) : data.title;
      const excerpt = data.excerpt ? t(data.excerpt) : data.excerpt;
      const body = content.trim();
      const contentHtml = body ? md.render(t(body)) : "";
      const url = `/en/proyekty/${slug}/`;
      return {
        url,
        slug,
        title,
        excerpt,
        date: data.date,
        image: data.image,
        contentHtml,
        data: { title, excerpt, date: data.date, image: data.image, url, direction: data.direction },
      };
    })
    .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));

  return {
    site,
    contacts,
    home,
    pronas,
    team,
    partners,
    novyny,
    proyekty,
    legal,
    policy,
    reports,
    feedback,
    newsPosts,
    projects,
  };
};
