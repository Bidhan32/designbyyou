// pg_dump/reparse can distribute an unbounded varchar[] -> text[] cast over
// its string-literal elements. Normalize ONLY that equivalence, not arbitrary
// casts, predicates, parentheses, identifiers, or values.
function tokenize(sql) {
  const tokens = [];
  for (let index = 0; index < sql.length;) {
    if (/\s/.test(sql[index])) { index++; continue; }
    const start = index;
    let kind = "symbol";
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index);
      index = end < 0 ? sql.length : end;
      kind = "opaque";
    } else if (sql.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth) {
        if (sql.startsWith("/*", index)) { depth++; index += 2; }
        else if (sql.startsWith("*/", index)) { depth--; index += 2; }
        else index++;
      }
      kind = "opaque";
    } else if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index++];
      kind = quote === "'" ? "string" : "opaque";
      const escaped = quote === "'" && /(?:^|\W)[eE]$/.test(sql.slice(0, start));
      while (index < sql.length) {
        if (escaped && sql[index] === "\\") { index += 2; continue; }
        if (sql[index++] === quote) {
          if (sql[index] === quote) index++;
          else break;
        }
      }
    } else {
      const dollar = sql.slice(index).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0];
      const word = sql.slice(index).match(/^[a-z_][a-z0-9_$]*/i)?.[0];
      if (dollar) {
        const end = sql.indexOf(dollar, index + dollar.length);
        index = end < 0 ? sql.length : end + dollar.length;
        kind = "opaque";
      } else if (word) { index += word.length; kind = "word"; }
      else index += sql.startsWith("::", index) ? 2 : 1;
    }
    tokens.push({ start, end: index, kind, text: sql.slice(start, index) });
  }
  return tokens;
}

function readTextArray(tokens, start) {
  let index = start;
  const is = (value) => tokens[index]?.text === value;
  const word = (value) => tokens[index]?.kind === "word" && tokens[index].text.toLowerCase() === value;
  const wrappedArray = is("(");
  if (wrappedArray) index++;
  if (!word("array")) return null;
  index++;
  if (!is("[")) return null;
  index++;
  const literals = [];
  let allText = true;
  while (true) {
    const wrappedElement = is("(");
    if (wrappedElement) index++;
    if (tokens[index]?.kind !== "string") return null;
    const literal = tokens[index++].text;
    if (!is("::")) return null;
    index++;
    let text = false;
    if (word("character")) {
      index++;
      if (!word("varying")) return null;
      index++;
    } else if (word("text")) { text = true; index++; }
    else return null;
    // In particular, do not accept varchar(n), char(n), or custom types.
    if (wrappedElement) {
      if (!is(")")) return null;
      index++;
    }
    if (is("::")) {
      index++;
      if (!word("text")) return null;
      index++;
      text = true;
    }
    allText &&= text;
    literals.push(literal);
    if (is("]")) { index++; break; }
    if (!is(",")) return null;
    index++;
  }
  if (wrappedArray) {
    if (!is(")")) return null;
    index++;
  }
  let arrayTextCast = false;
  if (is("::")) {
    index++;
    if (!word("text")) return null;
    index++;
    if (!is("[")) return null;
    index++;
    if (!is("]")) return null;
    index++;
    arrayTextCast = true;
  }
  // A leading '(' can belong to ANY(...), so consume it only when it wraps
  // an explicitly cast array: (ARRAY[...])::text[].
  if (wrappedArray && !arrayTextCast) return null;
  if (!allText && !arrayTextCast) return null;
  return { end: index, replacement: `ARRAY[${literals.map((literal) => `${literal}::text`).join(", ")}]` };
}

function normalizeSqlDefinition(sql) {
  if (typeof sql !== "string") return sql;
  const tokens = tokenize(sql);
  let output = "";
  let offset = 0;
  for (let index = 0; index < tokens.length;) {
    const match = readTextArray(tokens, index);
    if (!match) { index++; continue; }
    output += sql.slice(offset, tokens[index].start) + match.replacement;
    offset = tokens[match.end - 1].end;
    index = match.end;
  }
  return output + sql.slice(offset);
}

module.exports = { normalizeSqlDefinition };
