const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const Image = require("@11ty/eleventy-img");

/**
 * Соцкартки для og:image та JSON-LD.
 *
 * Навіщо: у прод ми більше не копіюємо сирі оригінали з src/assets —
 * на сторінці їх заміняють webp-похідні з /assets/opt/. Але og:image
 * забирає не браузер, а краулер Facebook/LinkedIn/Telegram, і webp там
 * досі відмальовується не скрізь. Тому для кожної обкладинки новини чи
 * проєкту робимо один jpeg 1200px — його і віддаємо назовні.
 *
 * Побічний ефект — вага: community-aid.png важить 2.3 МБ, як соцкартка
 * це ~100 КБ. Оригінал у прод не їде взагалі.
 *
 * Повертає мапу { "/assets/community-aid.png": "/assets/social/community-aid-1200.jpeg" }.
 * Імена файлів детерміновані (без хешу), бо вміст оригіналу і так
 * змінюється разом з ім'ям, а стабільний шлях простіше дебажити.
 */
const SOURCES = ["src/news", "src/projects"];

module.exports = async function () {
  const originals = new Set();

  for (const dir of SOURCES) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const { data } = matter.read(path.join(dir, name));
      if (data.image) originals.add(data.image);
    }
  }

  const map = {};
  for (const url of originals) {
    const file = path.join("src", url);
    if (!fs.existsSync(file)) {
      console.warn(`[social] нема файлу для ${url} — og:image лишиться дефолтним`);
      continue;
    }
    const stats = await Image(file, {
      formats: ["jpeg"],
      // Один розмір: соцмережі однаково масштабують до ~1200×630.
      // eleventy-img не апскейлить, тож дрібніші оригінали лишаються собою.
      widths: [1200],
      urlPath: "/assets/social/",
      outputDir: "_site/assets/social/",
      filenameFormat: (id, src, width, format) =>
        `${path.basename(src, path.extname(src))}-${width}.${format}`,
      sharpJpegOptions: { quality: 82, mozjpeg: true },
    });
    map[url] = stats.jpeg[0].url;
  }

  return map;
};
