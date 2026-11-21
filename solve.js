// Fast drop-in replacement for csv-reader 1.0.0, written from the RULES.txt
// spec only. Single pass over the text; fields are sliced out of the input
// string and a new string is allocated only when a quoted field actually
// needs unescaping ("" -> ") or CR normalisation (CRLF / lone CR -> LF).
// No regex, no dependencies.
//
// The scanners are tiny top-level functions (each compiles once, cheaply,
// by call count) with module-level scratch objects for multi-value returns;
// run() itself keeps only dispatch and record filing. This keeps the
// just-in-time compile cost of a fresh process low: the entry is timed in a
// fresh container on every run, so cold-start compile time counts.
const UQ = { end: 0, kind: 0, cr: -1 };
const QQ = { close: -1, doubled: false };
const CB = { breaks: 0, hasCR: false };

function scanUnquoted(text, pos, n) {
  UQ.cr = -1;
  let end = pos;
  while (end < n) {
    const c = text.charCodeAt(end);
    if (c === 44) {
      UQ.end = end;
      UQ.kind = 0;
      return;
    }
    if (c === 10) {
      UQ.end = end;
      UQ.kind = 1;
      return;
    }
    if (c === 13) {
      if (text.charCodeAt(end + 1) === 10) {
        UQ.end = end;
        UQ.kind = 2;
        return;
      }
      if (UQ.cr === -1) UQ.cr = end;
      end++;
      continue;
    }
    end++;
  }
  UQ.end = n;
  UQ.kind = 3;
}

function scanQuoted(text, start) {
  let q = start;
  let doubled = false;
  for (;;) {
    q = text.indexOf('"', q);
    if (q === -1) {
      QQ.close = -1;
      QQ.doubled = doubled;
      return;
    }
    if (text.charCodeAt(q + 1) === 34) {
      doubled = true;
      q += 2;
      continue;
    }
    QQ.close = q;
    QQ.doubled = doubled;
    return;
  }
}

function countBreaks(content) {
  let breaks = 0;
  let p = content.indexOf("\n");
  while (p !== -1) {
    breaks++;
    p = content.indexOf("\n", p + 1);
  }
  let hasCR = false;
  let r = content.indexOf("\r");
  while (r !== -1) {
    hasCR = true;
    if (content.charCodeAt(r + 1) !== 10) breaks++;
    r = content.indexOf("\r", r + 1);
  }
  CB.breaks = breaks;
  CB.hasCR = hasCR;
}

function normalizeQuoted(content) {
  const parts = [];
  let s = 0;
  let i = 0;
  const m = content.length;
  for (;;) {
    const nq = content.indexOf('"', i);
    const nr = content.indexOf("\r", i);
    let cut = -1;
    let isQuote = false;
    if (nq !== -1 && (nr === -1 || nq < nr)) {
      cut = nq;
      isQuote = true;
    } else if (nr !== -1) {
      cut = nr;
    }
    if (cut === -1) break;
    parts.push(content.slice(s, cut));
    if (isQuote) {
      parts.push('"');
      i = cut + 2;
    } else {
      parts.push("\n");
      i = cut + (content.charCodeAt(cut + 1) === 10 ? 2 : 1);
    }
    s = i;
  }
  parts.push(content.slice(s, m));
  return parts.join("");
}

function dropStrayCRs(text, from, to, errors, recLine, recRow) {
  const parts = [];
  let s = from;
  let i = text.indexOf("\r", from);
  while (i !== -1 && i < to) {
    errors.push({ code: "stray_cr", line: recLine, row: recRow });
    parts.push(text.slice(s, i));
    i++;
    s = i;
    i = text.indexOf("\r", i);
  }
  parts.push(text.slice(s, to));
  return parts.join("");
}

export function run(input) {
  const text = input.text;
  const header = input.header === true;
  const n = text.length;
  let pos = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let line = 1;
  let nextRow = 0;
  let headerPending = header;

  while (pos < n) {
    const c0 = text.charCodeAt(pos);
    if (c0 === 10) {
      pos++;
      line++;
      continue;
    }
    if (c0 === 13) {
      if (text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
        continue;
      }
      errors.push({ code: "stray_cr", line, row: headerPending ? null : nextRow });
      pos++;
      continue;
    }
    const recLine = line;
    const recRow = headerPending ? null : nextRow;
    const fields = [];
    let done = false;
    while (!done) {
      if (text.charCodeAt(pos) === 34) {
        scanQuoted(text, pos + 1);
        const close = QQ.close;
        if (close !== -1) {
          const content = text.slice(pos + 1, close);
          countBreaks(content);
          line += CB.breaks;
          let field =
            QQ.doubled || CB.hasCR ? normalizeQuoted(content) : content;
          const after = close + 1;
          if (after >= n) {
            fields.push(field);
            pos = n;
            done = true;
            continue;
          }
          const ac = text.charCodeAt(after);
          if (ac === 44) {
            fields.push(field);
            pos = after + 1;
            continue;
          }
          if (ac === 10) {
            fields.push(field);
            pos = after + 1;
            line++;
            done = true;
            continue;
          }
          if (ac === 13 && text.charCodeAt(after + 1) === 10) {
            fields.push(field);
            pos = after + 2;
            line++;
            done = true;
            continue;
          }
          scanUnquoted(text, after, n);
          let junk;
          if (UQ.cr === -1) junk = text.slice(after, UQ.end);
          else junk = dropStrayCRs(text, after, UQ.end, errors, recLine, recRow);
          if (junk.length > 0) {
            field += junk;
            errors.push({ code: "quote_junk", line: recLine, row: recRow });
          }
          fields.push(field);
          if (UQ.kind === 0) pos = UQ.end + 1;
          else if (UQ.kind === 1) {
            pos = UQ.end + 1;
            line++;
            done = true;
          } else if (UQ.kind === 2) {
            pos = UQ.end + 2;
            line++;
            done = true;
          } else {
            pos = n;
            done = true;
          }
          continue;
        }
        errors.push({ code: "unterminated_quote", line: recLine, row: recRow });
      }
      scanUnquoted(text, pos, n);
      if (UQ.cr === -1) fields.push(text.slice(pos, UQ.end));
      else fields.push(dropStrayCRs(text, pos, UQ.end, errors, recLine, recRow));
      if (UQ.kind === 0) pos = UQ.end + 1;
      else if (UQ.kind === 1) {
        pos = UQ.end + 1;
        line++;
        done = true;
      } else if (UQ.kind === 2) {
        pos = UQ.end + 2;
        line++;
        done = true;
      } else {
        pos = n;
        done = true;
      }
    }
    if (width < 0) {
      width = fields.length;
      if (headerPending) {
        columns = fields;
        headerPending = false;
      } else {
        rows.push(fields);
        nextRow++;
      }
    } else if (fields.length === width) {
      rows.push(fields);
      nextRow++;
    } else if (fields.length < width) {
      errors.push({
        code: "short_row",
        line: recLine,
        row: recRow,
        fields: fields.length,
      });
      while (fields.length < width) fields.push("");
      rows.push(fields);
      nextRow++;
    } else {
      errors.push({
        code: "long_row",
        line: recLine,
        row: recRow,
        extra: fields.slice(width),
      });
      fields.length = width;
      rows.push(fields);
      nextRow++;
    }
  }

  return { columns, rows, errors };
}
