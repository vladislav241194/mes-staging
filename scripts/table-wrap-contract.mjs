function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getWindow(source, index, before = 1400, after = 700) {
  return source.slice(Math.max(0, index - before), Math.min(source.length, index + after));
}

function skipJavaScriptLiteral(source, index) {
  const quote = source[index];
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let cursor = openIndex; cursor < source.length; cursor += 1) {
    const token = source[cursor];
    const nextToken = source[cursor + 1];
    if (token === "\"" || token === "'" || token === "`") {
      cursor = skipJavaScriptLiteral(source, cursor) - 1;
      continue;
    }
    if (token === "/" && nextToken === "/") {
      const lineEnd = source.indexOf("\n", cursor + 2);
      cursor = (lineEnd === -1 ? source.length : lineEnd) - 1;
      continue;
    }
    if (token === "/" && nextToken === "*") {
      const commentEnd = source.indexOf("*/", cursor + 2);
      cursor = (commentEnd === -1 ? source.length : commentEnd + 2) - 1;
      continue;
    }
    if (token === "{") depth += 1;
    if (token === "}") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function isObjectDestructuringAlias(source, propertyIndex, aliasEndIndex) {
  let openIndex = source.lastIndexOf("{", propertyIndex);
  while (openIndex >= 0) {
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex >= aliasEndIndex && /^\s*=/.test(source.slice(closeIndex + 1))) return true;
    openIndex = source.lastIndexOf("{", openIndex - 1);
  }
  return false;
}

export function getTableWrapHelperNames(source) {
  const helperNames = new Set(["renderUiTableWrap"]);
  const aliasPattern = /\brenderUiTableWrap\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
  for (const match of source.matchAll(aliasPattern)) {
    const alias = match[1];
    const propertyIndex = match.index || 0;
    const aliasEndIndex = propertyIndex + match[0].length;
    if (isObjectDestructuringAlias(source, propertyIndex, aliasEndIndex)) helperNames.add(alias);
  }
  return helperNames;
}

export function findTableWrapHelperCall(source, index, helperNames) {
  const context = getWindow(source, index);
  return [...helperNames].find((helperName) => (
    new RegExp(`\\b${escapeRegExp(helperName)}\\s*\\(`).test(context)
  )) || "";
}

export function runTableWrapAliasRegressionChecks() {
  const cases = [
    {
      id: "minified-alias",
      source: 'function render(dependencies) { const{renderUiTableWrap:h}=dependencies; return h({body:"<table></table>"}); }',
      helperName: "h",
    },
    {
      id: "alias-with-default",
      source: 'function render(dependencies) { const { renderUiTableWrap: wrap = () => "" } = dependencies; return wrap({body:"<table></table>"}); }',
      helperName: "wrap",
    },
    {
      id: "object-property-is-not-an-alias",
      source: 'const metadata = { renderUiTableWrap: h }; function render() { return h({body:"<table></table>"}); }',
      helperName: "",
    },
  ];
  cases.forEach(({ id, source, helperName }) => {
    const tableIndex = source.indexOf("<table");
    const actualHelperName = findTableWrapHelperCall(source, tableIndex, getTableWrapHelperNames(source));
    if (actualHelperName !== helperName) {
      throw new Error(`TableWrap alias regression failed for ${id}: expected ${helperName || "no helper"}, received ${actualHelperName || "no helper"}`);
    }
  });
}
