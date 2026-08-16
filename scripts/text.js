// Автоматичні короткий опис і короткий заголовок.
//
// Клієнту в CMS лишились два поля: назва і текст. Усе інше, що раніше
// доводилось заповнювати руками (короткий опис для картки, коротка
// назва для вкладки браузера), рахується звідси.

/** Markdown → звичайний текст: прибираємо розмітку, лишаємо слова. */
function plainText(md) {
  if (!md) return "";
  return String(md)
    .replace(/^---[\s\S]*?---\s*/, "")          // front matter, якщо приїхав разом із тілом
    .replace(/```[\s\S]*?```/g, " ")            // блоки коду
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")      // зображення
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")    // посилання — лишаємо підпис
    .replace(/<[^>]+>/g, " ")                   // теги, якщо текст уже відрендерений
    .replace(/^[ \t]*#{1,6}[ \t]+.*$/gm, " ")   // рядки-заголовки цілком: у картку
                                                //   має йти текст, а не «Опис проєкту»
    .replace(/^\s*[-*+]\s+/gm, "")              // марковані списки
    .replace(/[*_`]/g, "")                      // жирний, курсив, код
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Обрізає по межі слова, не лишаючи розділового знака перед крапками. */
function cutAt(text, limit) {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit + 1);
  const space = head.lastIndexOf(" ");
  return (space > limit * 0.5 ? head.slice(0, space) : text.slice(0, limit)).replace(
    /[\s.,;:—–-]+$/,
    ""
  );
}

/**
 * Короткий опис для картки, meta description і соцмереж.
 * Береться початок тексту матеріалу.
 */
function autoExcerpt(body, limit = 180) {
  const text = plainText(body);
  if (!text) return "";
  if (text.length <= limit) return text;
  return cutAt(text, limit) + "…";
}

/**
 * Заголовок для вкладки браузера й видачі пошуку.
 *
 * Просто обрізати початок не можна: офіційні назви проєктів починаються
 * однаково («Забезпечення особового складу Збройних сил України…»), і
 * три сторінки отримували однаковий заголовок. Тому лишаємо початок І
 * кінець — саме кінець і відрізняє назви одну від одної.
 */
function seoTitle(title, limit = 58) {
  const t = String(title || "").trim();
  if (t.length <= limit) return t;
  const headLimit = Math.round(limit * 0.5);
  const head = cutAt(t, headLimit);
  const tailLimit = limit - head.length - 2;
  const words = t.split(" ");
  let tail = "";
  for (let i = words.length - 1; i >= 0; i--) {
    const next = words[i] + (tail ? " " + tail : "");
    if (next.length > tailLimit) break;
    tail = next;
  }
  return tail ? `${head}… ${tail}` : head + "…";
}

module.exports = { plainText, autoExcerpt, seoTitle, cutAt };
