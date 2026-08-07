#!/usr/bin/env node
/**
 * Перевірка зібраного сайту перед деплоєм. Три незалежні перевірки:
 *
 *   1. JSON-LD  — кожен <script type="application/ld+json"> має бути
 *                 розбірним JSON зі схемою schema.org.
 *   2. Assets   — кожне посилання на /assets/... з HTML (src, href, srcset,
 *                 og:image, JSON-LD) має існувати у _site. Ловить випадок,
 *                 коли з passthrough-копіювання випав потрібний файл.
 *   3. External — жодного посилання на сторонній домен у розмітці
 *                 (шрифти, скрипти, стилі мають бути свої).
 *
 * Запуск: node scripts/check-build.js [--dir _site]
 * Код виходу 1, якщо хоч одна перевірка не пройшла.
 */

const fs = require("fs");
const path = require("path");

const argDir = process.argv.indexOf("--dir");
const SITE = path.resolve(argDir > -1 ? process.argv[argDir + 1] : "_site");

/** Рекурсивно зібрати всі файли з розширенням. */
function walk(dir, ext, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, acc);
    else if (!ext || full.endsWith(ext)) acc.push(full);
  }
  return acc;
}

if (!fs.existsSync(SITE)) {
  console.error(`✗ Немає теки ${SITE}. Спершу: npm run build`);
  process.exit(1);
}

const htmlFiles = walk(SITE, ".html");
const errors = [];
let ldBlocks = 0;
let assetRefs = 0;

// --- 1. JSON-LD ------------------------------------------------------------
const LD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const pagesWithLd = new Set();

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(SITE, file);
  for (const m of html.matchAll(LD_RE)) {
    ldBlocks++;
    pagesWithLd.add(rel);
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      errors.push(`[json-ld] ${rel}: JSON не розбирається — ${e.message}`);
      continue;
    }
    if (data["@context"] !== "https://schema.org") {
      errors.push(`[json-ld] ${rel}: очікувався @context = https://schema.org`);
    }
    const nodes = data["@graph"] || [data];
    for (const node of nodes) {
      if (!node["@type"]) errors.push(`[json-ld] ${rel}: вузол без @type`);
      // Порожні значення — це те, від чого ми свідомо відмовились
      for (const [k, v] of Object.entries(node)) {
        if (v === "" || (Array.isArray(v) && v.length === 0)) {
          errors.push(`[json-ld] ${rel}: порожнє поле "${k}" у ${node["@type"]}`);
        }
      }
    }
  }
}

// --- 2. Посилання на /assets/ ----------------------------------------------
// src / href / content (og:image) / srcset — усе, що браузер або краулер
// піде забирати з сервера.
const ATTR_RE = /(?:src|href|content)=["']([^"']*\/assets\/[^"']*)["']/gi;
const SRCSET_RE = /srcset=["']([^"']+)["']/gi;
const LD_URL_RE = /"(https?:\/\/[^"]*\/assets\/[^"]*)"/gi;
const missing = new Map(); // шлях -> сторінки, що на нього посилаються

function checkAsset(url, rel) {
  // прибираємо origin, query і hash
  let p = url.replace(/^https?:\/\/[^/]+/, "").split("#")[0].split("?")[0];
  if (!p.startsWith("/assets/")) return;
  assetRefs++;
  const onDisk = path.join(SITE, decodeURIComponent(p));
  if (!fs.existsSync(onDisk)) {
    if (!missing.has(p)) missing.set(p, new Set());
    missing.get(p).add(rel);
  }
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(SITE, file);
  for (const m of html.matchAll(ATTR_RE)) checkAsset(m[1], rel);
  for (const m of html.matchAll(LD_URL_RE)) checkAsset(m[1], rel);
  for (const m of html.matchAll(SRCSET_RE)) {
    for (const cand of m[1].split(",")) {
      const u = cand.trim().split(/\s+/)[0];
      if (u) checkAsset(u, rel);
    }
  }
}

// CSS теж посилається на шрифти
for (const file of walk(SITE, ".css")) {
  const css = fs.readFileSync(file, "utf8");
  const rel = path.relative(SITE, file);
  for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) checkAsset(m[1], rel);
}

for (const [p, pages] of missing) {
  const where = [...pages].slice(0, 3).join(", ");
  errors.push(`[assets] нема ${p} — потрібен у ${where}${pages.size > 3 ? ` (+${pages.size - 3})` : ""}`);
}

// --- 3. Зовнішні запити ----------------------------------------------------
const EXTERNAL_RE = /(?:src|href)=["'](https?:\/\/[^"']+)["']/gi;
// Посилання в тілі сторінки на сайти партнерів — це навігація, не запит
// ресурсу. Перевіряємо лише те, що браузер завантажує сам.
const RESOURCE_TAG_RE = /<(?:link|script|img|iframe|source|video|audio)\b[^>]*>/gi;
const external = new Map();
// canonical/alternate вказують на власний домен — це метадані, а не запит.
const ownHost = (() => {
  try {
    return new URL(require(path.resolve("src/_data/site.json")).url).host;
  } catch (e) {
    return null;
  }
})();

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(SITE, file);
  for (const tag of html.match(RESOURCE_TAG_RE) || []) {
    if (/rel=["'](?:canonical|alternate)["']/i.test(tag)) continue;
    for (const m of tag.matchAll(EXTERNAL_RE)) {
      const host = new URL(m[1]).host;
      if (host === ownHost) continue;
      if (!external.has(host)) external.set(host, new Set());
      external.get(host).add(rel);
    }
  }
  for (const m of (html.match(/@import\s+["'][^"']+["']/g) || [])) {
    errors.push(`[external] ${rel}: @import ${m}`);
  }
}
for (const [host, pages] of external) {
  errors.push(`[external] зовнішній ресурс ${host} на ${pages.size} сторінках`);
}

// --- Підсумок --------------------------------------------------------------
const noLd = htmlFiles.filter((f) => !pagesWithLd.has(path.relative(SITE, f)));
console.log(`HTML-сторінок:        ${htmlFiles.length}`);
console.log(`JSON-LD блоків:       ${ldBlocks} (сторінок без розмітки: ${noLd.length}${noLd.length ? " — " + noLd.map((f) => path.relative(SITE, f)).join(", ") : ""})`);
console.log(`Посилань на /assets/: ${assetRefs}, унікальних битих: ${missing.size}`);
console.log(`Зовнішніх доменів:    ${external.size}`);

if (errors.length) {
  console.error(`\n✗ Помилок: ${errors.length}`);
  for (const e of errors.slice(0, 40)) console.error("  " + e);
  if (errors.length > 40) console.error(`  … ще ${errors.length - 40}`);
  process.exit(1);
}
console.log("\n✓ Усі перевірки пройдено");
