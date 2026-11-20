#!/usr/bin/env node
// Counts the places where the CSS strays from docs/design.md.
//   node tools/ui_check.cjs        list them; exit 1 if there are any
//
// What it checks, in every <style> of the three templates, their style=""
// attributes, and the extension's own CSS:
//   1. font-size     is one of the five steps: var(--fs-1) … var(--fs-5)
//                    (the reading pages also have var(--fs-logo)), or inherit
//   2. line-height   is var(--lh-1) or var(--lh-2); 1 or 0 only for boxes that
//                    hold a glyph, an image or a tag of fixed height
//   3. margin, padding, gap   every px value is a multiple of 4
//   4. color:var(--muted)     only in a rule set at step 4 or 5 (grey text is
//                    small print), and never on a link
// A line that has to break a rule says why with  /* ui-ok: <reason> */.
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const FILES = ["template.html", "template-video.html", "template-page.html", "extension/src/ext.css"];

const SPACING = /(?<![\w-])((?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap)\s*:\s*([^;}"]*)/g;
const FS_OK = /^(var\(--fs-[1-5]\)|var\(--fs-logo\)|inherit)$/;
const LH_OK = /^(var\(--lh-[12]\)|1|0|inherit)$/;

const problems = [];
const say = (file, line, msg, text) => problems.push(`${file}:${line}  ${msg}\n    ${text.trim().slice(0, 140)}`);

// the CSS of a file as [lineNumber, text] pairs; for HTML, only <style> and style=""
function cssLines(file, src) {
  const lines = src.split("\n");
  if (file.endsWith(".css")) return lines.map((t, i) => [i + 1, t, "css"]);
  const out = [];
  let inStyle = false;
  lines.forEach((t, i) => {
    if (/<style>/.test(t)) inStyle = true;
    if (inStyle) out.push([i + 1, t, "css"]);
    else for (const m of t.matchAll(/style="([^"]*)"/g)) out.push([i + 1, m[1], "attr"]);
    if (/<\/style>/.test(t)) inStyle = false;
  });
  return out;
}

// split CSS into rules so a muted colour can be checked against the size in the same rule
function rules(lines) {
  const out = [];
  const css = [];
  for (const [n, t, kind] of lines) {
    if (kind === "attr") out.push({ start: n, body: t, sel: "", text: t });
    else css.push([n, t]);
  }
  // comments out (they can span lines), keeping "ui-ok" visible to the rule it sits in
  let text = css.map(([, t]) => t).join("\n").replace(/\/\*[\s\S]*?\*\//g, c => (/ui-ok/.test(c) ? " ui-ok " : " ") + c.replace(/[^\n]/g, "").replace(/\n/g, "\n"));
  const lineAt = i => css[Math.min(css.length - 1, text.slice(0, i).split("\n").length - 1)][0];
  const stack = [];
  let pre = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { stack.push({ sel: text.slice(pre, i).trim(), from: i + 1 }); pre = i + 1; }
    else if (text[i] === "}") {
      const r = stack.pop();
      if (r) {
        const body = text.slice(r.from, i);
        if (!body.includes("{")) out.push({ start: lineAt(r.from), body, sel: r.sel.split(/[;}]/).pop().trim(), text: r.sel });
      }
      pre = i + 1;
    } else if (text[i] === ";" && !stack.length) pre = i + 1;
  }
  return out;
}

for (const file of FILES) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const lines = cssLines(file, src);
  for (const [n, t] of lines) {
    if (/ui-ok/.test(t)) continue;
    const code = t.replace(/\/\*.*?\*\//g, "");
    if (/^\s*--(fs|lh)-/.test(code)) continue; // the definitions themselves
    for (const m of code.matchAll(/font-size\s*:\s*([^;}"]+)/g)) {
      if (!FS_OK.test(m[1].trim())) say(file, n, `font-size ${m[1].trim()} is not a step (--fs-1…5)`, t);
    }
    for (const m of code.matchAll(/line-height\s*:\s*([^;}"]+)/g)) {
      if (!LH_OK.test(m[1].trim())) say(file, n, `line-height ${m[1].trim()} is not --lh-1 or --lh-2`, t);
    }
    for (const m of code.matchAll(/(?<![\w-])font\s*:\s*([^;}"]+)/g)) {
      if (m[1].trim() !== "inherit") say(file, n, `font shorthand sets a size: use font-size and line-height`, t);
    }
    for (const m of code.matchAll(SPACING)) {
      for (const px of m[2].matchAll(/(-?\d+(?:\.\d+)?)px/g)) {
        const v = Math.abs(parseFloat(px[1]));
        if (v % 4 !== 0) say(file, n, `${m[1]} ${px[1]}px is not a multiple of 4`, t);
      }
    }
  }
  for (const r of rules(lines)) {
    if (!/color\s*:\s*var\(--muted\)/.test(r.body) || /ui-ok/.test(r.body)) continue;
    const sel = (r.sel || "").trim();
    if (/(^|[\s,>])a([\s:.[,]|$)/.test(sel)) { say(file, r.start, `grey (--muted) on a link`, sel); continue; }
    const size = (r.body.match(/font-size\s*:\s*([^;}]+)/) || [])[1];
    if (!size) continue; // inherits its size; the rule that sets it is checked
    if (!/--fs-[45]\)/.test(size)) say(file, r.start, `grey (--muted) at ${size.trim()}: grey is for steps 4 and 5 only`, sel || r.text);
  }
}

if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\n${problems.length} place(s) off the rules in docs/design.md`);
  process.exit(1);
}
console.log("ui_check: 0 places off the rules (" + FILES.join(", ") + ")");
