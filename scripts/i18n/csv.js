// Мінімальний RFC 4180 CSV — читання й запис, без зовнішніх залежностей.
// Важливо для нас: тексти новин багаторядкові й містять коми та лапки,
// тож наївний split(",") тут не годиться.

// Excel в українській/європейській локалі очікує ';' як роздільник,
// Google Sheets розпізнає обидва. Тому пишемо тим, що попросили, а при
// читанні визначаємо роздільник самі — щоб файл, збережений перекладачем
// у будь-якій програмі, імпортувався без ручного налаштування.
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  let inQuotes = false;
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ",");
}

function stringify(rows, delimiter = ",") {
  const esc = (v) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /["\r\n]|[,;\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // CRLF — Excel на Windows інакше показує весь файл одним рядком.
  // BOM додає викликач (див. export-csv.js), щоб Excel не ламав кирилицю.
  return rows.map((r) => r.map(esc).join(delimiter)).join("\r\n") + "\r\n";
}

function parse(text) {
  let src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || row.length) endRow();
  return rows.filter((r) => r.length && !(r.length === 1 && r[0].trim() === ""));
}

module.exports = { stringify, parse, detectDelimiter };
