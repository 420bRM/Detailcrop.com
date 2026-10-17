# DetailCrop

Batch detail crops, in the browser. Pull several fixed-ratio crops out of
every image in a batch and download them as one zip. One static page, no
build step, no dependencies. Cropping happens on the client — **image data
never reaches the server**, and there is no code path that could send it.

Live at <https://detailcrop.com>. Also answers on `*.workers.dev`, which is
served with `noindex` so the two hostnames do not compete in search.

```
template.html           the stills tool — one of the two files to edit
template-video.html     the video tool (/video/)
template-page.html      shell for the reading pages (about, how-to, uses)
pages/<lang>/<slug>.html  their text: a few header lines, "---", then HTML
build.py                writes every page below, and the sitemap
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
  about/ how-to/ uses/ privacy/  reading pages; also under ko/ and ja/
  robots.txt  sitemap.xml   (sitemap is generated)
src/
  index.js              Worker: serves assets, POST /e, routes /stats and /api
  stats.js              the /stats dashboard and /api/today
  account-api.js        /api/*: Google sign-in and the presets in an account
  accounts.js           the Durable Object that holds members and their presets
  google.js             checks Google's ID token
  preset.js             the preset format — also pasted into the stills page
test/accounts.test.mjs  sign-in and presets end to end: node --test test/*.mjs
extension/
  src/                  what only the Chrome extension has: manifest, background.js,
                        ext.js (right-click image in), ext.css, fonts, icons, _locales
  build/                the unpacked extension — generated, like public/
  detailcrop-chrome.zip the file to upload to the Chrome Web Store — generated
  store/                listing text, screenshots, privacy-practice answers
wrangler.jsonc
```

Each tool's three language pages are the same file with a different default
language, `<title>`, description and canonical (the stills pages also carry
JSON-LD). **They are generated. Edit `template.html` or
`template-video.html`, then run `python3 build.py`** — a change hand-typed
into `public/ko/index.html` is gone the next time anyone builds.

The build also writes the Chrome extension from the same `template.html` (see
*The Chrome extension* below), so the web tool and the extension are one
source, never two copies.

The build also writes each page language's interface text into the HTML, so
crawlers that don't run JavaScript (Naver, link previews) see real text instead
of empty tags. The script sets the same text again when the page loads.

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

**Search pings (IndexNow).** After a push to `main` that touches `public/`,
`.github/workflows/indexnow.yml` waits for the *Workers Builds: detailcrop*
check to pass, then sends the pages whose files changed to IndexNow — Bing,
Naver and the other participating engines. Only URLs in the sitemap are ever
sent. Google does not take IndexNow and keeps reading the sitemap. The key is
`public/838e8b259cdca4a42f8713d62c15708c.txt`; it is public on purpose, and
deleting or renaming it makes every ping fail. To announce every page at once,
run the workflow by hand from the Actions tab. `python3 scripts/indexnow.py
all --dry-run` lists what would be sent.

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

**The next image starts from the boxes you just confirmed.** A batch is
usually the same kind of shot again and again, so the details worth cropping
sit in the same places. *Confirm & next* hands its boxes to the next image if
that image has never been opened — an unopened image only holds the default
single box, so nothing is lost. An image you have already visited keeps what
it has, and for those **Same boxes as previous image** copies from the image
to its left in the strip. Positions are fractions of the working area. On an
image of another shape each box keeps its centre and its share of the picture
while its ratio holds. A feed grid carries over as a grid. Straighten values
are per photo and do not carry.

**Presets, for members.** A preset is a named setup: ratio and its scope,
output size, format, quality, file-name pattern, feed split and where the
boxes sit. Never an image or a file name, and not straighten or perspective,
which belong to one photo. Saving one takes the boxes from the image on
screen. Loading one sets the batch to it (the settings reach every image, as
the buttons do) and lays its boxes on the current image, on images not yet
opened and on images added afterwards; an image already opened keeps its
boxes — the line *Confirm & next* draws. Boxes travel by the same rule as
*Same boxes as previous image*.

Presets live in the member's account, so they follow a person to any browser
they sign in on — the point is a reason to come back. Sign-in is lottodraw.kr's:
Google's button hands the page an ID token, `src/google.js` checks it against
Google's keys, and the Worker answers with a 30-day session the page keeps in
`dc.account`. Members, sessions and presets sit in one Durable Object
(`src/accounts.js`); only the email address comes from Google. Signed out, the
panel shows a padlock and *Save* opens the sign-in box; once signed in the save
finishes by itself. Google's script is loaded only when that box opens.

**The privacy policy (`pages/<lang>/privacy.html`) describes exactly this**
— the anonymous stats, the member's email and presets, Cloudflare and Google
as the two services involved, and that the Chrome extension collects nothing.
Change what is collected, change that page too. The tools link it from the
footer and the sign-in box. That page is the one place the details live: the
rest of the site says only that photos are not stored and never reach the
server (the sign-in box's small print included). While sign-in is on, the
header line adds "sign in to keep your own settings" (`#memberLine`).

**Sign-in is off until `GOOGLE_CLIENT_ID` is set** in `wrangler.jsonc`. Off,
`/api/config` says so and the panel stays hidden — the page looks as it did.
To turn it on: Google Cloud console → new project → *OAuth consent screen*
(External, default scopes only, publish to production) → *Credentials →
OAuth client ID → Web application*, authorised JavaScript origins
`https://detailcrop.com` (no redirect URI) → paste the client ID (a public
value; the client secret is not used anywhere) into `wrangler.jsonc` and push.

The format is defined once, in `src/preset.js`: the Worker cleans every preset
with it before storing, and `build.py` pastes the same file into the stills page
at `/* PRESET_FORMAT */`, so the two cannot drift. A `?preset=` link or a list of
shop specs only needs to produce an object `cleanPreset()` accepts.

**Numbers are posting order, not reading order.** A profile grid stacks
newest first, so the bottom-right tile must be posted before the top-left
one. On-canvas tags and filenames both count in posting order, and grid
exports are named `-post01`…`-post09` unless the user set their own pattern.

## The video tool (/video/)

Same idea as the stills page, one clip at a time: drag boxes over the
footage, several at once, and every box comes out as its own mp4. Decoding
is the `<video>` element, encoding is WebCodecs, muxing is mp4-muxer
inlined into the page, and the zip writer is the same hand-rolled one — so
nothing leaves the browser here either. It is indexed and in the sitemap
like the stills pages, with its own JSON-LD.

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
stills page. The clip the page opens on arrives with all six already placed,
from a fixed layout (`OPENING_CROPS`): one ratio, six different widths,
spread over the frame the way someone actually working would leave them. The
numbers are fractions of the frame — x, y and width, with the height
following whatever ratio is in force — read off a layout drawn by hand on the
1280 × 720 sample, so they land on that plate exactly and stay sensible on
anything else. Editing that one array is how the opening shot changes.

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

`POST /e` records one row per event. The stills page sends `visit`, `add`,
`export`, `skip`, `use` (one per feature per load), `tour`, `why`, `job` and
`preset`; the video page sends `vvisit` and `vexport`. Anything else is dropped
(`ALLOWED_EVENTS` in `src/index.js`). Payloads run ~170–250 bytes and the
Worker drops anything over 1 KB, so it could not receive an image even by
accident.

Both pages share one record in `localStorage` (`dc.stats`): the same
anonymous id and the same off switch, so a browser reads as one person across
the two tools. Each page counts its own visits (`dc.stats.visits` for stills,
`dcv.visits` for video).

**`why` — the one question.** After the first export of the visitor's own
images (never the sample), the export card asks once what the batch was for:
eight fixed choices, any number of them, then *Send* — or *Skip*. Nothing is
typed. It is only shown while stats are on, and `dc.why` in `localStorage`
makes it once per browser — it is marked when shown, and stays up for the rest
of that visit. Each chosen option is its own `why` event with the key in
`blob10` (`shop`, `art`, `social`, `dataset`, `photo`, `docs`, `try`,
`other`; a skip sends one event with `skip`), and every one of them carries
the shape of the export it followed (`n`, `crops`, `ratio`, `grid`, `out`,
`ow`, `oh`), so a purpose can be read next to its crops per image without a
JOIN. Because one person can pick several, count respondents with
`count(DISTINCT blob8)`, not by adding up the purposes. The /stats page shows
it as *무엇에 쓰는가*.

**`job` — what the person does, optional.** Under the same question sits one
more line: *seller*, *photo* (photographer), *creator* (artist or designer),
*marketer* or *other*, at most one. *Other* opens a box for their own words,
the only typed thing the page ever sends: 30 characters, one line, and
anything that looks like an email address, phone number or link is dropped —
in the page and again in the Worker (`cleanJob` in `src/index.js`), which is
the copy that counts. No names or contact details are asked for. The key goes
in `blob10`, their own words in `blob11`. *Send* works with either part
answered; *Skip* sends no `job`. The /stats page shows it as *누가 쓰는가*, with
the typed answers listed beside it.

**Kept for good, in our own store.** Analytics Engine drops rows after about
three months, so `/e` also writes every row into `src/archive.js`, a Durable
Object's SQLite, with no end date. Owner-only, behind `?k=<STATS_KEY>`:

- `/stats/export` — the whole archive as CSV (`&from=` / `&to=` as
  `YYYY-MM-DD`, `&t=presets` for the settings deleted accounts left behind).
  Download it now and then and keep a copy away from Cloudflare.
- `/stats/backfill` — run once: copies what Analytics Engine still holds from
  before the archive existed. Uses `CF_API_TOKEN`; refuses a second clean run.
- `/stats/archive` — row counts and the first and last dates.

When a member deletes their account, the email and account ID go (the law
says so), and their presets stay as anonymous settings: name, file-name
pattern and account removed (`strayPreset`).

**`preset`** — a member saved (`blob10` = `save`) or loaded (`load`) a preset;
`double2` is how many presets the account holds. Never the preset's name or
contents. Counting `load` per `blob8` over weeks is the return-visit signal
presets exist for.

**Never in the stats:** the images, any pixel data, file names, IP addresses,
or anything identifying a person. `blob8` is a random string the browser
generates for itself; the footer has an off switch and `navigator.doNotTrack`
is honoured. The one place the site does hold personal data is the sign-in:
a member's Google email address and account ID, kept in `src/accounts.js`
(never in the stats) until they delete their account.

| column | meaning | column | meaning |
|---|---|---|---|
| blob1 | event | double1 | visit number for this browser (per page) |
| blob2 | ui language | double2 | images (video: clips) in batch / files rejected / presets held (`preset`) |
| blob3 | country | double3 | median image width (`add`, `vexport`) |
| blob4 | referrer host | double4 | median image height (`add`, `vexport`) |
| blob5 | crop ratio, or `mixed` | double5 | median file size, MB |
| blob6 | output format (video: codec) | double6 | crops exported |
| blob7 | native / fixed | double7 | output width (fixed only) |
| blob8 | anonymous id | double8 | output height (fixed only) |
| blob9 | desktop / mobile | double9 | quality |
| blob10 | feature key (`use`) / purpose (`why`) / job key (`job`) / `save`·`load` (`preset`) | double10 | 1 = demo plate (or sample clip) only |
| blob11 | a job in the person's own words (`job` with `other`, ≤ 30 chars) | double11 | feed-grid tiles (0 = free crops) |
| | | double12 | files rejected as not images |
| | | double13 | files rejected past the side limit |
| | | double14 | largest straighten angle used, degrees |
| | | double15 | largest keystone slider used, 0-100 |
| | | double16 | seconds from first add to export |
| | | double17 | walkthrough step reached (`tour`) |

`ratio` on `export` and `vexport` is the ratio the crops actually had: one
preset id, or `mixed` when crops in the run carry different ones (the
*selected crop* scope). Switching that scope on also sends `use` with
`scope`.

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

**Who is actually using this.** Ask the answers first — each `why` row
carries the export it followed:

```sql
SELECT blob10 AS purpose, count(DISTINCT blob8) AS people,
       sum(double6) AS crops, sum(double2) AS images,
       countIf(double11 > 0) AS grid_runs
FROM detailcrop_events
WHERE blob1 = 'why' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY purpose
ORDER BY people DESC
```

Who comes back to do it again — the same id on different days, several
crops per image, not the sample:

```sql
SELECT blob8 AS id, toStartOfDay(timestamp) AS day,
       count() AS exports, sum(double2) AS images, sum(double6) AS crops,
       max(double11) AS grid
FROM detailcrop_events
WHERE blob1 = 'export' AND double10 = 0
  AND timestamp > NOW() - INTERVAL '42' DAY
GROUP BY id, day
ORDER BY id, day
LIMIT 1000
```

Image size is sent with `add`, not with `export`, so read it from `add` rows
and match by id by eye (Analytics Engine has no JOIN):

```sql
SELECT blob8 AS id, sum(double2) AS images_added,
       round(avg(double3)) AS w, round(avg(double4)) AS h,
       round(avg(double5), 1) AS mb
FROM detailcrop_events
WHERE blob1 = 'add' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY id
ORDER BY images_added DESC
LIMIT 200
```

To leave your own browser out, add `AND blob8 != '<id>'`; the id is
`JSON.parse(localStorage.getItem("dc.stats")).id` in that browser's console.
Analytics Engine keeps three months of data, so save what a decision rests on.

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

## The Chrome extension

`extension/` packs the stills tool as a Manifest V3 extension. The toolbar
button opens the tool in a tab; on any web page, right-click an image →
**Open with DetailCrop** puts that image in the tool (into the tool tab already
open, so several can be gathered into one batch, or a new tab). The image is
read from its own address and cropped inside the extension. The extension
sends nothing anywhere: no stats, no sign-in, no fonts from Google.

**It is built, not copied.** `python3 build.py` makes `extension/build/` and
`extension/detailcrop-chrome.zip` from `template.html` plus `extension/src/`:

- code between `/* WEB-ONLY: <stub> */` and `/* /WEB-ONLY */` in the template
  (the stats beacon, the owner's counter, sign-in and presets) is replaced by
  the stub, and `<!-- WEB-ONLY -->` HTML (the stats switch) is dropped;
- the page's inline script becomes `tool.js` (Manifest V3 runs no inline
  scripts), and `ext.js` from `extension/src/` runs after it;
- Google Fonts become `ext.css` and files under `fonts/` (OFL-1.1).

The build stops if anything that talks to a server is left in `tool.js`. In
the template, `EXTENSION` is true inside the extension: links then point at
`https://detailcrop.com` and open in a new tab, and a tab opened with a
picture skips the sample plate.

**Permissions.** `contextMenus` only. Sites whose images cannot be read from
another origin need a host permission; it is optional, asked for one site at
a time, and only after the user clicks *Allow and open* in the tool. The
reasons, in the words the store asks for, are in
`extension/store/privacy-practices.md`.

**Tested** in this repo's Chromium with Playwright: toolbar open, right-click
open into an open tab and into a new one, zip export, the permission prompt
for a site without CORS, and loading after the permission is held; no request
left the extension. Store screenshots are `extension/store/screenshots/`
(1280 × 800, two per language).

To try it locally: `chrome://extensions` → *Developer mode* on → *Load
unpacked* → pick `extension/build`.

To ship a new version: raise `version` in `extension/src/manifest.json`, run
`python3 build.py`, upload the new zip.

### Chrome 웹 스토어 등록 순서 (운영자가 직접)

1. **개발자 등록** — <https://chrome.google.com/webstore/devconsole> 에 구글 계정으로 들어가 약관에 동의하고 등록비(1회, 5달러)를 냅니다. 이메일 인증까지 마칩니다.
2. **zip 받기** — GitHub 저장소에서 `extension/detailcrop-chrome.zip` 을 열고 *Download* 를 눌러 내려받습니다. 압축은 풀지 않습니다.
3. **새 항목 올리기** — 대시보드 **+ 새 항목(New item)** → 그 zip을 올립니다.
4. **스토어 등록정보** — `extension/store/listing.md` 의 자세한 설명을 언어별로 붙여 넣고, `extension/store/screenshots/` 의 PNG를 언어별로 올립니다. 아이콘(128×128)은 zip 안에 있어 따로 올리지 않아도 됩니다. 카테고리는 *Tools* 나 *Photos*.
5. **개인정보 보호 관행** — `extension/store/privacy-practices.md` 의 답을 그대로 옮깁니다. 개인정보처리방침 URL은 `https://detailcrop.com/privacy/`.
6. **배포 설정** — 공개(Public), 모든 지역.
7. **검토 제출** — *검토를 위해 제출* 을 누릅니다. 보통 며칠 걸리고, 결과는 이메일로 옵니다. 반려되면 그 메일 내용을 그대로 보여 주세요.

새 버전을 낼 때는 `manifest.json` 의 `version` 을 올려 빌드한 zip을 같은 항목의 *패키지* 탭에 올리고 다시 제출합니다.

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
- Presets are on the stills page only. The video page has no "unopened clip"
  rule or box hand-over to build on yet; it is the next piece.
