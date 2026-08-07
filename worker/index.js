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

const RECIPIENT = contacts.formRecipient || contacts.general;
// Домен фонду ще не підтверджений у Resend, тож відправник — їхній
// службовий. Після підключення icdf.org сюди піде адреса на домені.
const SENDER = "ICDF site <onboarding@resend.dev>";

const MAX = { name: 120, email: 200, phone: 60, category: 120, message: 5000 };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clean(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

async function handleContact(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.RESEND_API_KEY) return json({ error: "not_configured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  // Приховане поле: боти його заповнюють, люди — ні. Відповідаємо
  // успіхом, щоб спамер не підбирав обхід.
  if (clean(body.website, 100)) return json({ ok: true });

  const firstname = clean(body.firstname, MAX.name);
  const lastname = clean(body.lastname, MAX.name);
  const email = clean(body.email, MAX.email);
  const phone = clean(body.phone, MAX.phone);
  const category = clean(body.category, MAX.category);
  const message = clean(body.message, MAX.message);

  if (!firstname || !lastname || !email || !message) return json({ error: "missing_fields" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);

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

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/contact") return handleContact(request, env);
    return env.ASSETS.fetch(request);
  },
};
