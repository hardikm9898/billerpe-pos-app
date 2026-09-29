// Lists every English phrase the app can show, for the Hindi / Gujarati
// dictionaries (src/lib/pos/i18n). Reads the app's screens and components
// and the cloud's error messages (uat-backend-v2/appv1). Prints the phrases
// that no dictionary has yet.
//   node scripts/extract-strings.cjs            -> summary + missing per language
//   node scripts/extract-strings.cjs --json     -> all phrases as JSON
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const APP = path.resolve(__dirname, "..");
const CLOUD = path.resolve(APP, "../../uat-backend-v2/appv1");

// Props whose string value is shown to people.
const UI_PROPS = new Set([
  "placeholder",
  "title",
  "label",
  "aria-label",
  "description",
  "hint",
  "body",
  "sub",
  "subtitle",
  "message",
  "alt",
  "dialogTitle",
  "emptyText",
  "confirmLabel",
  "cancelLabel",
  "text",
  "error",
  "note",
]);
// Calls whose first string argument is shown to people.
const UI_CALLS = /^(toast(\.(success|error|info|warning))?|fail|setError|confirm|alert|shareText)$/;

const files = [];
const walk = (dir, re) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (!/node_modules|\.git|ui$|mock$/.test(p)) walk(p, re);
    } else if (re.test(f.name) && !/routeTree\.gen|\.d\.ts$/.test(f.name)) files.push(p);
  }
};
walk(path.join(APP, "src/routes"), /\.tsx?$/);
walk(path.join(APP, "src/components/pos"), /\.tsx?$/);
for (const f of ["types.ts", "reportList.ts", "permissions.ts", "format.ts"])
  files.push(path.join(APP, "src/lib/pos", f));
// The demo backend's errors are the same texts as the cloud's.
walk(path.join(APP, "src/lib/pos/backend/mock"), /\.ts$/);
if (fs.existsSync(CLOUD)) walk(CLOUD, /\.js$/);

const phrases = new Map(); // text -> first file
const add = (raw, file) => {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!looksLikeText(t)) return;
  if (!phrases.has(t)) phrases.set(t, path.relative(path.resolve(APP, "../.."), file));
};

function looksLikeText(t) {
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^[a-z0-9]+([-_:.][a-z0-9]+)*$/.test(t)) return false; // ids, keys, css tokens
  if (
    /^[a-z-]+(\s+[a-z0-9:[\]().%/#-]+)+$/.test(t) &&
    /(^|\s)(flex|grid|px-|py-|p-|m[trblxy]?-|text-|bg-|border|rounded|size-|w-|h-|gap-|items-|justify-)/.test(
      t,
    )
  )
    return false; // tailwind classes
  if (/^(\/|\.\/|@\/|https?:|#\/|[A-Z_]+$)/.test(t)) return false; // paths, constants
  if (/^[\w.]+\(.*\)$/.test(t)) return false;
  if (/^(GET|POST|SELECT|INSERT|UPDATE)\b/.test(t)) return false;
  return true;
}

// JSX text is always on screen: only skip what has no letters.
function addVisible(raw, file) {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length >= 2 && /[A-Za-z]{2}/.test(t) && !phrases.has(t)) {
    phrases.set(t, path.relative(path.resolve(APP, "../.."), file));
  }
}

// Strings that are code, not text: CSS classes, routes, ids, keys.
function insideCode(node, sf) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) {
      return /^(className|class|key|id|to|href|type|variant|size|value|name|role|inputMode|autoComplete|enterKeyHint|target|rel|src|accept)$/.test(
        p.name.getText(sf),
      );
    }
    if (
      ts.isCallExpression(p) &&
      /^(cn|clsx|cva|twMerge|require|navigate|createFileRoute|localStorage\.\w+|setItem|getItem|addEventListener|querySelector\w*)$/.test(
        p.expression.getText(sf),
      )
    )
      return true;
    if (
      ts.isPropertyAssignment(p) &&
      /^(className|to|href|id|key|type|kind|icon|module|path|status|mode|cls)$/.test(
        p.name.getText(sf),
      )
    )
      return true;
    if (ts.isCaseClause(p) || ts.isElementAccessExpression(p)) return true;
    if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText(sf)))
      return true;
    if (ts.isTypeNode(p)) return true;
    if (ts.isBlock(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

// A template literal becomes a pattern: "Bill {0} printed".
function templateText(node) {
  let s = node.head.text;
  node.templateSpans.forEach((sp, i) => (s += `{${i}}` + sp.literal.text));
  return s;
}

function textOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return templateText(node);
  return null;
}

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x")
      ? ts.ScriptKind.TSX
      : file.endsWith(".js")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS,
  );
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      // React joins the lines of one JSX text with single spaces; a short
      // lowercase piece next to a value ("4 seats") is on screen too.
      addVisible(
        node.text
          .split(/\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .join(" "),
        file,
      );
    } else if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateExpression(node)) &&
      !file.endsWith(".js") &&
      !/[\\/]mock[\\/]/.test(file) &&
      !ts.isImportDeclaration(node.parent) &&
      !insideCode(node, sf)
    ) {
      // Any other literal that reads like UI text: label lists, help text, status names.
      const t = textOf(node);
      if (t && /^[A-Z][a-z]/.test(t) && (/ /.test(t) || /^[A-Z][a-z-]+$/.test(t))) add(t, file);
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (UI_PROPS.has(name)) {
        const init = ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : node.initializer;
        const t = init && textOf(init);
        if (t) add(t, file);
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (UI_CALLS.test(callee) && node.arguments[0]) {
        const t = textOf(node.arguments[0]);
        if (t) add(t, file);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const key = node.name.getText(sf).replace(/["']/g, "");
      if (UI_PROPS.has(key) || /^(label|title|body|hint|error|message)$/.test(key)) {
        const t = textOf(node.initializer);
        if (t) add(t, file);
      }
    } else if (ts.isConditionalExpression(node) || ts.isBinaryExpression(node)) {
      // "a ? 'Text one' : 'Text two'" inside JSX / props
      for (const side of ts.isConditionalExpression(node)
        ? [node.whenTrue, node.whenFalse]
        : [node.left, node.right]) {
        const t = textOf(side);
        if (t && /\s/.test(t) && /^[A-Z]/.test(t)) add(t, file);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const all = [...phrases.keys()].sort((a, b) => a.localeCompare(b));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(all, null, 1));
  process.exit(0);
}
console.log(`${all.length} phrases from ${files.length} files`);
const dictDir = path.join(APP, "src/lib/pos/i18n");
const keepFile = path.join(dictDir, "keep-english.json");
const keep = new Set(
  fs.existsSync(keepFile) ? JSON.parse(fs.readFileSync(keepFile, "utf8")).phrases : [],
);
for (const lang of ["hi", "gu"]) {
  const f = path.join(dictDir, `${lang}.json`);
  const dict = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  const missing = all.filter((p) => !(p in dict) && !keep.has(p));
  console.log(`${lang}: ${Object.keys(dict).length} translated, ${missing.length} missing`);
  if (process.argv.includes("--missing")) missing.forEach((m) => console.log(`  ${m}`));
}
