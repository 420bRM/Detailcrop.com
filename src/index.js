/**
 * DetailCrop
 *
 * Serves the static site and accepts one thing besides: anonymous usage
 * events at POST /e. Image data never reaches this Worker — the page has
 * no code path that sends pixels, and this handler rejects any body over
 * 1 KB, so it could not receive one by accident.
 */

import { statsPage } from "./stats.js";

const ALLOWED_EVENTS = new Set(["visit", "add", "export"]);
const MAX_BODY = 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/e") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return recordEvent(request, env);
    }

    if (url.pathname === "/stats") return statsPage(request, env);

    return env.ASSETS.fetch(request);
  }
};

async function recordEvent(request, env) {
  // Beacons are fire-and-forget: always answer 204, never make the page wait
  // or retry. A malformed or unwanted body is dropped silently.
  if (!env.EVENTS) return noContent();

  // Only our own pages post here. sendBeacon always sets Origin.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return noContent();

  let d;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return noContent();
    d = JSON.parse(raw);
  } catch {
    return noContent();
  }
  if (!d || typeof d !== "object" || !ALLOWED_EVENTS.has(d.e)) return noContent();

  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const cf = request.cf || {};
  const vw = num(d.w);

  env.EVENTS.writeDataPoint({
    indexes: [str(d.e, 32)],
    blobs: [
      str(d.e, 32),                              // blob1  event: visit | add | export
      str(d.lang, 8),                            // blob2  ui language
      str(cf.country, 4),                        // blob3  country
      str(d.ref, 64),                            // blob4  referrer host
      str(d.ratio, 16),                          // blob5  crop ratio preset
      str(d.fmt, 16),                            // blob6  output format
      str(d.out, 8),                             // blob7  native | fixed
      str(d.id, 24),                             // blob8  anonymous id
      vw > 0 && vw < 820 ? "mobile" : "desktop"  // blob9  device class
    ],
    doubles: [
      num(d.v),      // double1  visit number for this browser
      num(d.n),      // double2  images in the batch
      num(d.iw),     // double3  median image width
      num(d.ih),     // double4  median image height
      num(d.mb),     // double5  median file size, MB
      num(d.crops),  // double6  crops exported
      num(d.ow),     // double7  output width  (fixed mode only)
      num(d.oh),     // double8  output height (fixed mode only)
      num(d.q),      // double9  quality
      num(d.sample), // double10 1 = only the demo plate was exported
      num(d.grid)    // double11 tiles, when a feed grid was used (0 = free crops)
    ]
  });

  return noContent();
}

function noContent() {
  return new Response(null, { status: 204 });
}
