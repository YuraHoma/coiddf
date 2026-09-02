// Дати публікації документів звітності.
//
// Дату більше не обирають у CMS: документ датується днем, коли він
// зʼявився на сайті. Але записати цю дату в сам reports.json не можна —
// Pages CMS зберігає лише поля, описані в схемі, тож поле, якого в схемі
// немає, стерлося б при першому ж збереженні. Тому дати живуть в окремому
// файлі, до якого CMS не має стосунку, і звʼязані з документом за шляхом
// до файлу.
//
// Скрипт виконується в деплої перед збіркою: побачив новий документ —
// проставив сьогоднішню дату й повернув файл у репозиторій (так само, як
// це робиться з каталогом перекладів). Дати, що вже є, не чіпаються
// ніколи: інакше кожна правка назви документа переносила б його на
// сьогодні й ламала порядок на сторінці.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const REPORTS = path.join(ROOT, "src", "_data", "reports.json");
const DATES = path.join(ROOT, "src", "_data", "reportDates.json");

function load(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function main() {
  const reports = load(REPORTS, { items: [] });
  const dates = load(DATES, {});
  const today = new Date().toISOString().slice(0, 10);

  const added = [];
  for (const item of reports.items || []) {
    if (!item.file) continue;
    if (dates[item.file]) continue;
    dates[item.file] = today;
    added.push(item.file);
  }

  // Записи документів, які прибрали з переліку, лишаємо: якщо документ
  // колись повернуть, він має зберегти свою першу дату, а не отримати
  // нову. Файл від цього росте на рядок на документ — байдуже.
  if (!added.length) {
    console.log("Нових документів звітності немає — дати без змін.");
    return;
  }

  const sorted = {};
  for (const key of Object.keys(dates).sort()) sorted[key] = dates[key];
  fs.writeFileSync(DATES, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Проставлено дату ${today} для ${added.length} документа(ів):`);
  for (const file of added) console.log(`  ${file}`);
}

main();
