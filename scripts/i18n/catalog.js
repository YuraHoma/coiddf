// Каталог перекладів: сховище + правила розвʼязання.
//
// Головна ідея — запис ідентифікується СТАБІЛЬНИМ КЛЮЧЕМ місця в контенті
// ("data/home.hero.headline"), а не українським текстом. Разом із кожним
// перекладом зберігається джерело, з якого його зробили. Тому:
//   * клієнт правит текст у CMS — переклад не «губиться», а позначається
//     як застарілий (stale) і потрапляє перекладачу на перегляд;
//   * машинний скрипт бачить статус "human" і НІКОЛИ його не перезаписує.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CATALOG_PATH = path.join(__dirname, "catalog.json");
const SCHEMA = 1;

// Статуси, які зберігаються у файлі (походження перекладу).
const MACHINE = "machine"; // машинний переклад, людина не вичитувала
const HUMAN = "human"; // вичитано людиною — фінальний варіант

// Стани, що ОБЧИСЛЮЮТЬСЯ при звірці з живим контентом. У файлі їх немає,
// бо вони залежать від поточного стану src/ і мають перераховуватись щоразу.
const STATE = {
  HUMAN: "human", // вичитаний і джерело не змінювалось
  MACHINE: "machine", // машинний, джерело збігається
  STALE_HUMAN: "stale-human", // джерело змінилось після вичитки
  STALE_MACHINE: "stale-machine", // джерело змінилось після машинного перекладу
  MOVED: "moved", // ключ новий, але точно такий самий текст уже перекладено
  MISSING: "missing", // перекладу немає взагалі
};

function hash(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex").slice(0, 12);
}

function emptyCatalog() {
  return { schema: SCHEMA, sourceLang: "uk", targetLang: "en", entries: {} };
}

function load() {
  if (!fs.existsSync(CATALOG_PATH)) return emptyCatalog();
  const parsed = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  if (parsed.schema !== SCHEMA) {
    throw new Error(
      `catalog.json має схему ${parsed.schema}, а код очікує ${SCHEMA}. Потрібна міграція.`
    );
  }
  return parsed;
}

// Ключі сортуються, щоб diff у git показував лише реальні зміни перекладів,
// а не перетасовку рядків після кожного запуску скрипта.
function save(catalog) {
  const sorted = {};
  for (const key of Object.keys(catalog.entries).sort()) sorted[key] = catalog.entries[key];
  const out = { ...catalog, schema: SCHEMA, entries: sorted };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(out, null, 2) + "\n");
}

function makeEntry({ source, target, status, note }) {
  return {
    source,
    sourceHash: hash(source),
    target,
    status,
    note: note || "",
    updated: new Date().toISOString().slice(0, 10),
  };
}

// Індекс «текст джерела -> запис» для відновлення перекладу, коли запис
// переїхав на інший ключ (клієнт переставив блоки місцями чи перейменував
// файл новини). Вичитані людиною записи мають пріоритет.
function buildSourceIndex(catalog) {
  const index = new Map();
  for (const entry of Object.values(catalog.entries)) {
    const prev = index.get(entry.sourceHash);
    if (!prev || (prev.status !== HUMAN && entry.status === HUMAN)) {
      index.set(entry.sourceHash, entry);
    }
  }
  return index;
}

// Порівнює один запис каталогу з живим джерелом і повертає обчислений стан.
function resolveOne(catalog, index, key, source) {
  const entry = catalog.entries[key];

  if (entry && entry.source === source) {
    return { state: entry.status === HUMAN ? STATE.HUMAN : STATE.MACHINE, target: entry.target };
  }

  // Джерело під цим ключем змінилось (або ключа ще немає), але точно такий
  // самий текст уже перекладено деінде — переносимо переклад, не втрачаємо.
  const moved = index.get(hash(source));
  if (moved) {
    return { state: STATE.MOVED, target: moved.target, movedFromStatus: moved.status };
  }

  if (entry) {
    // Свідомо повертаємо СТАРИЙ англійський текст, а не українське джерело:
    // навіть трохи застарілий переклад кращий за кирилицю на EN-сторінці.
    return {
      state: entry.status === HUMAN ? STATE.STALE_HUMAN : STATE.STALE_MACHINE,
      target: entry.target,
      previousSource: entry.source,
    };
  }

  return { state: STATE.MISSING, target: source };
}

// Створює translate(source, key) для buildContent() і паралельно збирає звіт.
// Це єдина точка, через яку переклад потрапляє у збірку.
function createResolver(catalog) {
  const index = buildSourceIndex(catalog);
  const issues = [];
  const counts = Object.fromEntries(Object.values(STATE).map((s) => [s, 0]));

  function translate(source, key) {
    const r = resolveOne(catalog, index, key, source);
    counts[r.state]++;
    if (r.state !== STATE.HUMAN) issues.push({ key, source, ...r });
    return r.target;
  }

  return { translate, issues, counts };
}

// Рівні суворості. Ключова властивість: українська проза не може непомітно
// потрапити на англійську сторінку.
//   translated — падаємо на відсутньому/застарілому перекладі (типово);
//   human      — падаємо ще й на машинному, не вичитаному людиною.
// Рівень "human" вмикають, коли перекладач закінчив перший повний прохід.
const BLOCKING = {
  translated: [STATE.MISSING, STATE.STALE_HUMAN, STATE.STALE_MACHINE],
  human: [STATE.MISSING, STATE.STALE_HUMAN, STATE.STALE_MACHINE, STATE.MACHINE, STATE.MOVED],
};

function requireLevel() {
  const level = process.env.I18N_REQUIRE || "translated";
  if (!BLOCKING[level]) {
    throw new Error(`I18N_REQUIRE="${level}" — очікується "translated" або "human".`);
  }
  return level;
}

// Строгий режим вмикається явно (I18N_STRICT=1) або автоматично в CI.
// I18N_STRICT=0 дозволяє локально відтворити мʼяку поведінку навіть у CI.
function isStrict() {
  if (process.env.I18N_STRICT === "0") return false;
  return process.env.I18N_STRICT === "1" || !!process.env.CI;
}

const LABEL = {
  [STATE.HUMAN]: "вичитано людиною",
  [STATE.MACHINE]: "машинний переклад, не вичитано",
  [STATE.STALE_HUMAN]: "джерело змінилось після вичитки",
  [STATE.STALE_MACHINE]: "джерело змінилось після машинного перекладу",
  [STATE.MOVED]: "переклад перенесено з іншого ключа",
  [STATE.MISSING]: "перекладу НЕМАЄ — на сторінці буде українська",
};

module.exports = {
  CATALOG_PATH,
  SCHEMA,
  MACHINE,
  HUMAN,
  STATE,
  LABEL,
  BLOCKING,
  hash,
  load,
  save,
  makeEntry,
  emptyCatalog,
  buildSourceIndex,
  resolveOne,
  createResolver,
  requireLevel,
  isStrict,
};
