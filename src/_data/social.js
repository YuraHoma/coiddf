const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const sharp = require("sharp");

/**
 * Соцкартки для og:image та JSON-LD.
 *
 * Навіщо: у прод ми більше не копіюємо сирі оригінали з src/assets —
 * на сторінці їх заміняють webp-похідні з /assets/opt/. Але og:image
 * забирає не браузер, а краулер Facebook/LinkedIn/Telegram, і webp там
 * досі відмальовується не скрізь. Тому для кожної обкладинки робимо
 * jpeg — його і віддаємо назовні.
 *
 * Розмір завжди рівно 1200×630: саме таке співвідношення (1.91:1)
 * очікують соцмережі, і саме його обіцяє наш twitter:card. Раніше сюди
 * йшло вихідне фото як є — здебільшого вертикальне і вужче за 1200px,
 * тож месенджер або обрізав його до смужки, або взагалі відмовлявся
 * показувати велику картку.
 *
 * Фото вписується цілком (contain) у брендове полотно, а не обрізається:
 * вертикальний кадр при кропі 1.91:1 втрачав до двох третин зображення,
 * зокрема обличчя й техніку, заради яких фото й знімали.
 *
 * Повертає мапу { "/assets/community-aid.png": "/assets/social/community-aid-1200.jpeg" }.
 */
const SOURCES = ["src/news", "src/projects"];

// Сторінки без власних матеріалів (політика, реквізити, партнери)
// лишаються на загальній картці — це нормально й очікувано. Сюди
// додаємо лише ті, у яких є справжнє власне фото.
const EXTRA = ["/assets/about-hero.jpg"];

const W = 1200;
const H = 630;
const BG = "#12170D"; // --ink: те саме тло, що й у футері сайту

module.exports = async function () {
  const originals = new Set(EXTRA);

  for (const dir of SOURCES) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const { data } = matter.read(path.join(dir, name));
      if (data.image) originals.add(data.image);
    }
  }

  const outDir = "_site/assets/social";
  fs.mkdirSync(outDir, { recursive: true });

  const map = {};
  for (const url of originals) {
    const file = path.join("src", url);
    if (!fs.existsSync(file)) {
      console.warn(`[social] нема файлу для ${url} — og:image лишиться дефолтним`);
      continue;
    }
    const name = `${path.basename(file, path.extname(file))}-${W}.jpeg`;
    const out = path.join(outDir, name);

    // Перезбираємо, лише якщо джерело новіше за наявну картку:
    // на кожній збірці 16 картинок через sharp — це помітні секунди.
    const fresh =
      fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(file).mtimeMs;
    if (!fresh) {
      await sharp(file)
        .resize(W, H, {
          fit: "contain",
          background: BG,
          withoutEnlargement: false,
        })
        .flatten({ background: BG })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(out);
    }
    map[url] = `/assets/social/${name}`;
  }

  return map;
};
