// Обробник форми зворотного зв'язку.
//
// Сайт статичний, тож єдине серверне місце — цей Worker: він приймає
// POST /api/contact, надсилає лист через Resend і повертає JSON. Усе
// інше віддає статикою через прив'язку ASSETS.
//
// Адресу отримувача бере з CMS (contacts.json): спершу formRecipient
// — щоб можна було тимчасово слати листи на пошту розробника, — а якщо
// він порожній, то загальну пошту фонду.

import contacts from "../src/_data/contacts.json";
import feedback from "../src/_data/feedback.json";
import site from "../src/_data/site.json";

const RECIPIENT = contacts.formRecipient || contacts.general;
// Причина звернення приходить із форми, але покластися на це не можна:
// у Subject листа має потрапити лише те, що є в списку CMS.
const CATEGORIES = new Set(feedback.categories || []);
// Відправник листів з форми.
//
// Поки поле mailFrom у site.json порожнє, лист іде від службової адреси
// Resend. У неї є жорстке обмеження: вона доставляє ЛИШЕ на пошту
// власника акаунта Resend. Тобто зі службовим відправником звернення з
// сайту фізично не можуть прийти на пошту фонду — Resend відмовить.
//
// Після підтвердження домену coicdf.org у Resend сюди вписується адреса
// на домені (напр. "ICDF <site@coicdf.org>") — і обмеження зникає.
const SENDER = site.mailFrom || "ICDF site <onboarding@resend.dev>";

const MAX = { name: 120, email: 200, phone: 60, category: 120, message: 5000 };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clean(value, limit) {
  if (typeof value !== "string") return "";
  // Керівні символи ріжемо завжди: \r\n у полі, яке потрапляє в
  // заголовок листа, — це шлях до підміни заголовків.
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, limit);
}

// Проста заслінка від залпу з однієї адреси. Лічильник живе в памʼяті
// ізолята, тож це не заміна повноцінному rate limiting на рівні
// Cloudflare, а дешевий захист від найпростішого залиття форми.
const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;

function tooMany(ip) {
  if (!ip) return false;
  const now = Date.now();
  const hits = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  HITS.set(ip, hits);
  if (HITS.size > 5000) HITS.clear();
  return hits.length > LIMIT;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

async function handleContact(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.RESEND_API_KEY) return json({ error: "not_configured" }, 500);
  // Порожня адреса отримувача — це помилка налаштування, а не збій
  // Resend: інакше форма мовчки віддавала б 502 після кожного звернення.
  if (!RECIPIENT) {
    console.error("contact: не задано ні formRecipient, ні general");
    return json({ error: "not_configured" }, 500);
  }

  // Форму викликає лише сам сайт. Запит з чужої сторінки відхиляємо:
  // це не заважає жодному звичайному відвідувачу.
  const origin = request.headers.get("origin");
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch {}
    if (host !== new URL(request.url).host && host !== new URL(site.url).host)
      return json({ error: "forbidden" }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  // request.json() успішно розбирає "null" і голі числа — далі за кодом
  // це впало б на зверненні до поля й дало відвідувачу 500 замість
  // зрозумілої відповіді.
  if (!body || typeof body !== "object") return json({ error: "bad_request" }, 400);

  // Приховане поле: боти його заповнюють, люди — ні. Відповідаємо
  // успіхом, щоб спамер не підбирав обхід.
  if (clean(body.website, 100)) return json({ ok: true });

  const firstname = clean(body.firstname, MAX.name);
  const lastname = clean(body.lastname, MAX.name);
  const email = clean(body.email, MAX.email);
  const phone = clean(body.phone, MAX.phone);
  const raw = clean(body.category, MAX.category);
  const category = CATEGORIES.has(raw) ? raw : "";
  const message = clean(body.message, MAX.message);

  if (!firstname || !lastname || !email || !message) return json({ error: "missing_fields" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);

  // Лічильник ведемо тільки на листах, що справді пішли б: інакше
  // відвідувач, який двічі схибив у полі, впирався б у заслінку.
  if (tooMany(request.headers.get("cf-connecting-ip")))
    return json({ error: "too_many_requests" }, 429);

  const fullName = `${firstname} ${lastname}`;
  const rows = [
    ["Ім'я та прізвище", fullName],
    ["Email", email],
    phone ? ["Телефон", phone] : null,
    category ? ["Причина звернення", category] : null,
  ].filter(Boolean);

  const html =
    `<table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:15px">` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 14px 4px 0;color:#666">${escapeHtml(k)}</td>` +
          `<td style="padding:4px 0"><b>${escapeHtml(v)}</b></td></tr>`
      )
      .join("") +
    `</table><hr style="border:0;border-top:1px solid #e5e5e5;margin:18px 0">` +
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: SENDER,
      to: [RECIPIENT],
      reply_to: email,
      subject: `${category ? `[${category}] ` : ""}Звернення з сайту — ${fullName}`,
      html,
    }),
  });

  if (!res.ok) {
    console.error("resend", res.status, await res.text());
    return json({ error: "send_failed" }, 502);
  }
  return json({ ok: true });
}

// Головний хост сайту береться з site.json — того самого місця, звідки
// беруться canonical, hreflang і sitemap. Тож перемикання на власний
// домен — це зміна одного поля, а не полювання по коду.
const CANONICAL_HOST = new URL(site.url).host;
const CANONICAL_IS_TEMP = CANONICAL_HOST.endsWith(".workers.dev");

/**
 * Чи треба вести цей запит на головний домен.
 *
 * Перенаправляємо ЛИШЕ з відомих другорядних адрес — з «www» і зі старої
 * тимчасової адреси на workers.dev, — а не з усього, що не збігається з
 * головним хостом. Різниця критична в мить підключення домену: спершу
 * домен привʼязують до воркера, і лише потім міняється site.json. Якби
 * правило звучало «все, що не головний хост», новий домен у цьому
 * проміжку відсилав би відвідувача назад на заблоковану адресу.
 */
export function redirectTarget(url) {
  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1") return null;
  // Незашифрований http віддавав сторінку як є. Заголовок HSTS захищає
  // лише тих, хто вже був на сайті; перший візит за посиланням http://
  // ішов відкритим текстом. Тепер такий запит одразу веде на https.
  if (url.protocol === "http:") {
    const secure = new URL(url);
    secure.protocol = "https:";
    secure.port = "";
    secure.host = host === `www.${CANONICAL_HOST}` || host.endsWith(".workers.dev") ? CANONICAL_HOST : host;
    return secure.toString();
  }
  if (host === CANONICAL_HOST) return null;
  const isWww = host === `www.${CANONICAL_HOST}`;
  // Стару адресу лишаємо робочою, поки вона сама є головною.
  const isOldTemp = host.endsWith(".workers.dev") && !CANONICAL_IS_TEMP;
  if (!isWww && !isOldTemp) return null;
  const target = new URL(url);
  target.host = CANONICAL_HOST;
  target.protocol = "https:";
  target.port = "";
  return target.toString();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Посилання на workers.dev уже розійшлися листами, а корпоративні
    // фільтри блокують цей спільний домен цілком — тож старі адреси
    // мають вести на новий домен, а не вмирати.
    if (request.method === "GET") {
      const target = redirectTarget(url);
      if (target) return Response.redirect(target, 301);
    }

    if (pathname !== "/api/contact") return env.ASSETS.fetch(request);
    // Що б не сталося всередині, відвідувач має отримати JSON, який
    // форма вміє прочитати, а не голу сторінку помилки Cloudflare.
    try {
      return await handleContact(request, env);
    } catch (e) {
      console.error("contact", e && e.stack ? e.stack : e);
      return json({ error: "server_error" }, 500);
    }
  },
};
