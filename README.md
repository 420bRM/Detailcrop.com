# DetailCrop

Batch detail crops, in the browser. One static page, no build step, no dependencies.

## Deploy

Cloudflare dashboard -> Workers & Pages -> Create -> Import a repository.
Leave the build command empty; `wrangler.jsonc` points at `public/`.

## Still to add

- `public/og.png` — 1200x630 share image (referenced by every page's og:image)
- `public/favicon.ico`
