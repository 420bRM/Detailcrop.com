# DetailCrop

Batch detail crops, in the browser. One static page, no build step, no
dependencies. Cropping happens on the client — image data never reaches
the server.

```
public/
  index.html      en   →  /
  ko/index.html   ko   →  /ko/
  ja/index.html   ja   →  /ja/
  og.jpg og.png   share image
  robots.txt sitemap.xml
src/index.js      Worker: serves the assets, records anonymous events
wrangler.jsonc
```

## Deploy

Cloudflare dashboard → **Workers & Pages → Create → Import a repository**.
Leave the build command empty. `wrangler.jsonc` points at `public/` and
registers the Analytics Engine dataset.

Custom domain: change the nameservers at the registrar to the two
Cloudflare gives you, then add the domain under the Worker's
**Settings → Domains & Routes**.

## The /stats dashboard

`https://detailcrop.com/stats?k=<STATS_KEY>` renders the numbers below without
any SQL. Wrong key or no key returns 404, and the page is `noindex`.

Two secrets, once:

```bash
npx wrangler secret put STATS_KEY      # any long random string you invent
npx wrangler secret put CF_API_TOKEN   # see below
npx wrangler deploy
```

The API token comes from **My Profile -> API Tokens -> Create Token ->
Create Custom Token**, with one permission: **Account -> Account Analytics ->
Read**. Nothing else. `CF_ACCOUNT_ID` is already set in `wrangler.jsonc`.

The dashboard shows a banner when today's visits are more than triple the
running average, which is the case you actually want to catch.

## Usage stats

`POST /e` records one row per event. Three events: `visit`, `add`,
`export`. Payloads are ~170 bytes; the Worker drops anything over 1 KB.

**Never collected:** the images, any pixel data, file names, IP addresses,
or anything that identifies a person. The id in `blob8` is a random string
the browser generates for itself and can throw away — the footer has an
off switch, and `navigator.doNotTrack` is honoured.

| column | meaning | column | meaning |
|---|---|---|---|
| blob1 | event | double1 | visit number for this browser |
| blob2 | ui language | double2 | images in the batch |
| blob3 | country | double3 | median image width |
| blob4 | referrer host | double4 | median image height |
| blob5 | crop ratio | double5 | median file size (MB) |
| blob6 | output format | double6 | crops exported |
| blob7 | native / fixed | double7 | output width (fixed only) |
| blob8 | anonymous id | double8 | output height (fixed only) |
| blob9 | desktop / mobile | double9 | quality |
| | | double10 | 1 = demo plate only |
| | | double11 | feed-grid tiles (0 = free crops) |

### Querying

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

**Do they come back.**

```sql
SELECT double1 AS visit_number, count(DISTINCT blob8) AS people
FROM detailcrop_events
WHERE blob1 = 'visit' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY visit_number ORDER BY visit_number
```

**Where they come from, and whether they finish.**

```sql
SELECT blob4 AS referrer, blob3 AS country,
       countIf(blob1 = 'visit')  AS visits,
       countIf(blob1 = 'export') AS exports
FROM detailcrop_events
WHERE timestamp > NOW() - INTERVAL '30' DAY
GROUP BY referrer, country
ORDER BY visits DESC
```

Analytics Engine samples at high volume. When that starts happening,
weight aggregates by `_sample_interval`
(`SUM(_sample_interval * double2) / SUM(_sample_interval)`).

