/**
 * The preset format — the one place it is defined.
 *
 * A preset is how a job is set up, never what is in it: ratio, output size,
 * format, quality, file names, feed split and where the boxes sit. No image,
 * no file name, no straighten or perspective values (those belong to one
 * photo, not to a job).
 *
 * This file is used twice. The Worker imports it to clean whatever a browser
 * sends before it is stored in an account, and build.py pastes it into the
 * stills page (at the PRESET_FORMAT marker, with `export` taken off) so the
 * page builds and reads presets by the very same rules. A later ?preset= link
 * or a list of shop specs only has to produce an object cleanPreset() accepts.
 *
 *   { v: 1, id, name, at,
 *     ratio:  { id, w, h, scope: "all" | "one" },
 *     out:    { mode: "native" | "fixed", w, h },
 *     fmt, quality, pattern,
 *     layout: { grid:  null | { cols, rows, x, y, w },
 *               boxes: [ { x, y, w, h, r: null | { id, w, h } } ] } }
 *
 *   An account holds { list: [preset…], last: id } — `last` is the one loaded
 *   or saved most recently.
 *
 * Box and grid positions are fractions of the working area: the coordinates
 * "Same boxes as previous image" already copies between images, so a preset
 * lands on an image of any size or shape the same way.
 *
 * Everything here is prefixed `preset`, because it shares the page's scope.
 */
export const PRESET_V = 1;
export const PRESET_MAX = 50;              // per account
export const PRESET_NAME_MAX = 60;
/* keep in step with RATIO_PRESETS in template.html */
export const PRESET_RATIOS = {
  "free": [0, 0], "1:1": [1, 1], "4:5": [4, 5], "2:3": [2, 3], "3:4": [3, 4],
  "5:7": [5, 7], "16:9": [16, 9], "9:16": [9, 16], "custom": [0, 0]
};
export const PRESET_FORMATS = ["image/webp", "image/jpeg", "image/png"];
const PRESET_BOXES = 6;                    // MAX_CROPS on the page
const PRESET_SIDE = 16384;                 // MAX_SIDE on the page
const PRESET_ID_RE = /^[a-z0-9]{6,24}$/;

function presetNum(v, lo, hi, dflt){
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
function presetInt(v, lo, hi, dflt){ return Math.round(presetNum(v, lo, hi, dflt)); }
function presetText(v, max){
  return String(v == null ? "" : v).normalize("NFC").replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, max);
}

/* {id, w, h} for a known ratio id, null for anything else */
export function presetRatio(r){
  if (!r || typeof r !== "object" || !Object.prototype.hasOwnProperty.call(PRESET_RATIOS, r.id)) return null;
  if (r.id === "custom") return {id: "custom", w: presetInt(r.w, 1, 999, 1), h: presetInt(r.h, 1, 999, 1)};
  const p = PRESET_RATIOS[r.id];
  return {id: r.id, w: p[0], h: p[1]};
}

/* A clean preset, or null when there is nothing usable in it. */
export function cleanPreset(o){
  if (!o || typeof o !== "object") return null;
  const name = presetText(o.name, PRESET_NAME_MAX);
  const id = typeof o.id === "string" && PRESET_ID_RE.test(o.id) ? o.id : null;
  if (!name || !id) return null;

  const r0 = o.ratio && typeof o.ratio === "object" ? o.ratio : {};
  const ratio = presetRatio(r0) || {id: "2:3", w: 2, h: 3};
  ratio.scope = r0.scope === "one" ? "one" : "all";
  const locked = ratio.id !== "free";

  const o0 = o.out && typeof o.out === "object" ? o.out : {};
  const out = {
    mode: o0.mode === "fixed" && locked ? "fixed" : "native",
    w: presetInt(o0.w, 1, PRESET_SIDE, 1600),
    h: presetInt(o0.h, 1, PRESET_SIDE, 2400)
  };

  const L = o.layout && typeof o.layout === "object" ? o.layout : {};
  let grid = null;
  if (L.grid && typeof L.grid === "object" && locked){
    const g = L.grid;
    grid = { cols: 3, rows: presetInt(g.rows, 1, 3, 1),
             x: presetNum(g.x, 0, 1, 0), y: presetNum(g.y, 0, 1, 0), w: presetNum(g.w, 0.12, 1, 0.92) };
  }
  const boxes = grid ? [] : (Array.isArray(L.boxes) ? L.boxes : []).slice(0, PRESET_BOXES)
    .filter(b => b && typeof b === "object")
    .map(b => {
      const w = presetNum(b.w, 0.02, 1, 0.3), h = presetNum(b.h, 0.02, 1, 0.3);
      return { x: presetNum(b.x, 0, 1 - w, 0), y: presetNum(b.y, 0, 1 - h, 0), w, h,
               r: ratio.scope === "one" ? presetRatio(b.r) : null };
    });

  return {
    v: PRESET_V, id, name,
    at: presetInt(o.at, 0, 1e13, 0),
    ratio, out,
    fmt: PRESET_FORMATS.indexOf(o.fmt) >= 0 ? o.fmt : "image/webp",
    quality: presetInt(o.quality, 40, 100, 86),
    pattern: presetText(o.pattern, 120) || "{name}-d{n}",
    layout: { grid, boxes }
  };
}

/* What an account holds: the presets, newest first as stored, and the last used. */
export function cleanPresetBook(o){
  const list = [], seen = {};
  const src = o && typeof o === "object" && Array.isArray(o.list) ? o.list : [];
  for (const p of src){
    if (list.length >= PRESET_MAX) break;
    const c = cleanPreset(p);
    if (c && !seen[c.id]){ seen[c.id] = 1; list.push(c); }
  }
  const last = o && typeof o.last === "string" && seen[o.last] ? o.last : "";
  return { list, last };
}
