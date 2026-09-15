# DetailCrop

Batch detail crops, in the browser. Pull several fixed-ratio crops out of
every image in a batch and download them as one zip. One static page, no
build step, no dependencies. Cropping happens on the client — **image data
never reaches the server**, and there is no code path that could send it.

Live at <https://detailcrop.com>. Also answers on `*.workers.dev`, which is
served with `noindex` so the two hostnames do not compete in search.

```
template.html           the stills tool — one of the two files to edit
template-video.html     the video tool (/video/, still noindex)
build.py                writes the six language pages below
public/
  index.html            en  →  /
  ko/index.html         ko  →  /ko/
  ja/index.html         ja  →  /ja/
  video/index.html      en  →  /video/
  video/ko/index.html   ko  →  /video/ko/
  video/ja/index.html   ja  →  /video/ja/
  og.jpg  og.png        share image (og tags point at the .jpg)
  favicon.ico           16/32/48/64/128/256, each drawn at its own size
  apple-touch-icon.png  180
  icon-512.png
  robots.txt  sitemap.xml
src/
  index.js              Worker: serves assets, POST /e, routes /stats
  stats.js              the /stats dashboard and /api/today
wrangler.jsonc
```

Each tool's three language pages are the same file with a different default
language, `<title>`, description and canonical (the stills pages also carry
JSON-LD). **They are generated. Edit `template.html` or
`template-video.html`, then run `python3 build.py`** — a change hand-typed
into `public/ko/index.html` is gone the next time anyone builds.

## Deploy

Cloudflare dashboard → **Workers & Pages → detailcrop → Settings → Build**,
connected to the GitHub repo. Build command **empty**; `wrangler.jsonc`
points at `public/` and registers the Analytics Engine dataset.

**If a push does not deploy**, check the Builds page for a banner saying the
project is disconnected from Git. The usual cause is that the Cloudflare
GitHub App is set to *Only select repositories* and this repo was created
after the app was installed, so it is not on the list. Add it on the GitHub
side, then make any commit — re-authorising does not replay the push event
that was missed.

Deploying from a machine instead, which bypasses Git entirely:

```bash
npx wrangler login
npx wrangler deploy
```

**Custom domain**: point the registrar's nameservers at the two Cloudflare
gives you, then add the domain under **Settings → Domains & Routes**. The
nameserver change alone is not enough — without the custom domain entry
there is no DNS record and the domain will not resolve at all.

## Limits

| | | why |
|---|---|---|
| 200 MB per file | soft | generous; the real constraint is below |
| 16384 px per side | hard | canvas ceiling, measured: 16384 works, 20000 fails |
| 200 files | soft | nothing breaks above it, the UI just gets unwieldy |
| 6 crops per image | soft | more fits, but the box colours and 1–6 keys run out |

File size was the original limit and it was the wrong metric — a 3 MB JPEG
can be 100 MP while a 50 MB PNG is 12 MP. Measured in Chrome, 16000×12000
(192 MP, 96 MB) decodes in 1.2 s and exports six crops fine. **iOS Safari is
far lower and fails silently**, so a decode failure reports "this browser
could not open it" rather than guessing a threshold.

## Features worth knowing about

**Feed grid.** The Instagram buttons (3/6/9) lay contiguous tiles that
reassemble on a profile grid. Tiles keep the chosen ratio (forced to 4:5 when
a grid is switched on) and the block moves and scales as one object, because
a puzzle stops being a puzzle the moment one tile drifts.

**Straighten and perspective.** Three sliders under the move pad: *Rotate*
(±15°) levels a horizon, and *Horiz.* / *Vert.* (±100) pull a keystoned wall,
poster or building back to square. All three are one 3×3 homography per
image, and that same matrix drives the stage (as a CSS `matrix3d`), the crop
previews and the export — so the three cannot drift apart.

They live in `#alignPanel`, a section that **starts closed on every load**.
Rotating a photo is a different job from placing crop boxes and most visits
never need it, so it stays out of the way. Closed is not hidden: when the
current image is warped the header carries the numbers and turns amber,
because otherwise the stage would look wrong for no visible reason. Being one
self-contained section is also the point — **this is the block earmarked to go
behind a paywall**, and gating it means refusing to open this one panel.

Warping leaves empty space at the corners, so the working area becomes the
largest axis-aligned rectangle of the source aspect ratio that fits wholly
inside the warped quad — found by binary search on size, with the fit test
being four half-plane clips. Because that rectangle keeps the source ratio,
every ratio calculation and the feed grid are untouched; only the pixel count
shrinks, by roughly 13% at 6° of rotation and 10% at a half-travel keystone.
It sits one pixel in from the exact fit: the exact fit leaves the outermost
corner pixels half-covered, which reads as a translucent speck in a PNG. An
image with all three sliders at zero takes a separate path and comes out
byte-identical to a plain crop.

Rotation alone is affine, so canvas draws it. A keystone is projective and
canvas cannot, so those crops go through WebGL: one quad, the inverse
homography per pixel. Output is subdivided until each block's source slice
fits in a texture — `MAX_TEXTURE_SIZE` is 8192 in headless Chrome and 4096 on
plenty of phones, and a driver that is handed more just drops the upload with
nothing you can see. Blocks split on integer pixels with two pixels of margin,
so a seam samples the same texels its neighbour does; a full-frame warp of a
54 MP original was checked against a CPU reference and came back within
0.6/255 everywhere, block boundaries included. **No WebGL means no keystone**
— the two perspective rows hide themselves and rotation carries on.

Crop rotation is deliberately absent. A tilted box on a level photo yields the
same picture and a much less obvious control.

**One ratio, or one crop's ratio.** The toggle above the ratio buttons is the
same one the video page carries. **Whole batch** is the default and the
original behaviour: the ratio is a property of the job, so every crop of
every image follows it. **Selected crop** gives one box a ratio of its own —
on export it gets a frame of the same *area* as the fixed output size, so a
16:9 exception inside a 1000 × 1000 batch comes out 1333 × 750 rather than
twice the file size of everything around it. A feed grid lays its own tiles,
so while one is on the toggle stays on the whole batch.

**The two tools link to each other from the footer**, as a banner in the
other tool's accent colour rather than a button in the header — the header is
for the job in front of you. Both pages carry it; the markup and the CSS are
the same on each side, so a change to one belongs in both.

**Numbers are posting order, not reading order.** A profile grid stacks
newest first, so the bottom-right tile must be posted before the top-left
one. On-canvas tags and filenames both count in posting order, and grid
exports are named `-post01`…`-post09` unless the user set their own pattern.

## The video tool (/video/)

Same idea as the stills page, one clip at a time: drag boxes over the
footage, several at once, and every box comes out as its own mp4. Decoding
is the `<video>` element, encoding is WebCodecs, muxing is mp4-muxer
inlined into the page, and the zip writer is the same hand-rolled one — so
nothing leaves the browser here either. It is `noindex` and out of the
sitemap while it is in testing; publishing it means deleting one meta line
and adding three URLs to the sitemap.

**A batch, like the stills page.** Drop several clips and the filmstrip
above the stage steps through them; a green dot marks each clip you have
confirmed. **Export every clip** runs each one in turn and **Save all as
zip** brings the whole batch down as one file. Colliding file names pick up
a counter rather than overwriting each other inside the zip.

**Every crop owns its own ratio and its own range.** A toggle above the
ratio buttons says how far a change reaches: **whole clip** — the default —
writes it to every crop of every clip and to the ones added later, while
**selected crop** writes it to the one, so a single clip can carry a 9:16 for
Shorts, a 1:1 for the feed and a 4:5 for the carousel at once. With a fixed
output size each of them gets the frame its own ratio calls for. The
timeline underneath gives every crop a lane of its own: drag the middle to
slide its range, the ends to trim, the ruler to scrub, and click any lane to
select that crop.

**Six crops per clip**, the same ceiling and the same six box colours as the
stills page. The clip the page opens on arrives with all six already
scattered over the frame at varying sizes — cells keep them off each other,
a shuffle and some jitter keep the grid from showing — because a row of
identical boxes does not say "several at once, anywhere" the way a scatter
does.

**The page opens on 16:9 at the crop's own pixels.** Footage arrives 16:9,
and the first thing anyone does is place crops rather than convert, so that
is the ratio the buttons start on. Output starts on *crop size* for the same
reason: a fixed frame is a choice, and scaling a 200 px crop up to a 1280 px
frame — with the warning that comes with it — is not a thing to do to
someone before they have touched anything.

**There is a walkthrough**, the stills page's tour pointed at this page's
parts: the box on the stage, the crop count, the previews, the ratio scope,
the timeline lanes, the filmstrip, export. The button pulses until it has
been opened once (`dcv.tour` in `localStorage`).

**Playback rides the frame clock.** `timeupdate` fires about four times a
second, which reads as a playhead lurching along, so while a clip plays the
page follows `requestAnimationFrame` instead and moves the playhead with a
transform — no layout per frame — and redraws the crop previews at about
8 fps.

Every clip is probed on the way in — metadata for the readouts and one frame
for the thumbnail. A clip recorded in a browser arrives with no duration in
its header, so the probe seeks past the end to make the browser go and find
it before reading it back.

The page opens on the built-in sample, the way the stills page opens on its
plate: the editor is up and working before
anyone has chosen a file. A browser that cannot decode the sample (Chromium
builds without the licensed H.264 decoder, which includes the one Playwright
ships) drops back to the empty state without complaining.

**Codec.** H.264 first, because it is the one every phone, editor and upload
form takes. VP9 and AV1 are the fallback for browsers built without the
licensed encoder; the files still go in an .mp4 and the page says so,
because Safari will not play them.

## The /stats dashboard

`https://detailcrop.com/stats?k=<STATS_KEY>` renders everything below with no
SQL. A wrong key or no key returns 404, so the endpoint does not advertise
itself, and the page is `noindex`. It leads with today, compares to
yesterday, and shows a banner when today is more than triple the running
average — the case worth catching.

Two secrets. Either the dashboard (**Settings → Variables and Secrets → Add**,
with the **Secret** checkbox ticked) or the CLI:

```bash
npx wrangler secret put STATS_KEY      # any long random string
npx wrangler secret put CF_API_TOKEN   # see below
```

Tick **Secret** rather than leaving it a plain variable: plain vars can be
overwritten by the `vars` block in `wrangler.jsonc` on the next Git deploy.
Secrets are stored separately and survive deploys.

The API token: **My Profile → API Tokens → Create Token → Create Custom
Token**, one permission, **Account → Account Analytics → Read**. Leave *Client
IP Filtering* empty — the calls come from a Worker, not from your machine, so
pinning your IP breaks it. Leave *TTL* empty too, or the dashboard dies
silently on the expiry date.

`CF_ACCOUNT_ID` is a plain var in `wrangler.jsonc`; it is not a credential.

Neither secret can be read back once saved, and neither needs to be. Losing
one costs two minutes: set a new value and redeploy. No data is affected —
the events live in Analytics Engine, independent of both. `STATS_KEY` is also
recoverable from `localStorage.getItem("dc.admin")` in a browser where the
footer readout is armed. The dashboard warns at the top if the key is
shorter than 16 characters.

### Today's numbers on the site itself

Open `https://detailcrop.com/?admin=<STATS_KEY>` once. The key is stored in
that browser, the URL parameter is stripped, and a small line appears in the
footer with today's visits and countries, served by `GET /api/today` (cached
60 s). **Visitors never see it** — a public counter showing single digits is
worse than none. Clear it with `localStorage.removeItem("dc.admin")`.

Country chips are capped at six; anything past that is summed into a
"기타" chip so the parts always add up to the headline number.

### Bots

Crawlers are excluded twice: the page skips the beacon when
`navigator.webdriver` is set (headless Chrome, Playwright and Puppeteer all
report it), and the Worker drops anything whose user agent looks automated.
**Numbers from before 2026-09-13 include scanner traffic** — new domains hit
certificate transparency logs within minutes and get swept.

## Usage stats

`POST /e` records one row per event. Four events: `visit`, `add`, `export`,
`skip`. Payloads run ~170 bytes and the Worker drops anything over 1 KB, so
it could not receive an image even by accident.

**Never collected:** the images, any pixel data, file names, IP addresses, or
anything identifying a person. `blob8` is a random string the browser
generates for itself; the footer has an off switch and `navigator.doNotTrack`
is honoured.

| column | meaning | column | meaning |
|---|---|---|---|
| blob1 | event | double1 | visit number for this browser |
| blob2 | ui language | double2 | images in batch / files rejected |
| blob3 | country | double3 | median image width |
| blob4 | referrer host | double4 | median image height |
| blob5 | crop ratio | double5 | median file size, MB |
| blob6 | output format | double6 | crops exported |
| blob7 | native / fixed | double7 | output width (fixed only) |
| blob8 | anonymous id | double8 | output height (fixed only) |
| blob9 | desktop / mobile | double9 | quality |
| | | double10 | 1 = demo plate only |
| | | double11 | feed-grid tiles (0 = free crops) |
| | | double12 | files rejected as not images |
| | | double13 | files rejected past the side limit |
| | | double14 | largest straighten angle used, degrees |
| | | double15 | largest keystone slider used, 0-100 |

`skip` exists because a rejected file is otherwise invisible: the visitor
sees a message and leaves, and nothing is recorded. If the size limits are
costing real users, that event is the only way to find out.

### Querying

The dashboard covers the usual questions. For anything else:

```bash
curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "SELECT blob1 AS event, count() AS n
      FROM detailcrop_events
      WHERE timestamp > NOW() - INTERVAL '7' DAY
      GROUP BY event"
```

**Who is actually using this.** Image shape and batch size separate an
e-commerce seller from someone selling art prints:

```sql
SELECT blob5 AS ratio, blob6 AS format,
       round(avg(double3)) AS avg_px_w,
       round(avg(double4)) AS avg_px_h,
       round(avg(double2), 1) AS avg_images,
       count() AS exports
FROM detailcrop_events
WHERE blob1 = 'export' AND double10 = 0
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY ratio, format
ORDER BY exports DESC
```

**Are the limits costing anyone.**

```sql
SELECT sum(double2) AS files_rejected,
       max(double5) AS biggest_mb,
       sum(double13) AS past_side_limit
FROM detailcrop_events
WHERE blob1 = 'skip' AND timestamp > NOW() - INTERVAL '30' DAY
```

Analytics Engine samples at high volume. When that starts, weight aggregates
by `_sample_interval`
(`SUM(_sample_interval * double2) / SUM(_sample_interval)`).

## Deliberately not done

- **No Cloudflare Web Analytics.** The `/e` events already cover visits,
  countries, referrers and language, and a second beacon would be a second
  tracking script on a page whose pitch is that nothing leaves the browser.
- **No public visitor counter**, for the reason above.
- **No framework, no bundler, no dependencies.** The page is one file with
  the demo image inlined as base64. It is ~330 KB and that is the whole cost.
- **The ZIP writer is hand-rolled** (store method, ~50 lines in the page).
  WebP and JPEG are already compressed, so there is nothing to gain from a
  library, and this way a CDN outage cannot break exports.

## Known gaps

- The demo plate is the owner's own artwork. If this project ever changes
  hands, that image goes with it unless it is swapped first.
- The footer contact is a personal Gmail rather than a domain address.
- No content pages yet, so the long-tail search terms the tool could rank
  for are unclaimed.
