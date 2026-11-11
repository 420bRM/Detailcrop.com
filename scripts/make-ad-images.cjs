// 광고 이미지 만들기 (2026-11-11) — 실행: NODE_PATH=$(npm root -g) node scripts/make-ad-images.cjs
// Playwright 필요. 한글은 저장소의 Pretendard(public/fonts), 로고 글자는 Google Fonts Archivo.
// 결과: public/ads/google-detailcrop-1/ (사이트에 올라가 광고 플랫폼이 주소로 읽어 갈 수 있다 · 목록 쪽은 noindex)
// 그림은 도구의 예시 사진(template.html 의 DEMO, 야경-도시)과 같은 상자 색(--b1~b6)으로 그린다. 그림 속 글자는 짧게.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OUT = path.join(REPO, 'public/ads/google-detailcrop-1');
const TYPES = { '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };

// 예시 사진(1200 × 1580) — template.html 안의 data URL 을 그대로 꺼내 쓴다
const DEMO = fs.readFileSync(path.join(REPO, 'template.html'), 'utf8').match(/DEMO\s*=\s*"(data:image\/webp;base64,[A-Za-z0-9+/=]+)"/)[1];
const IW = 1200, IH = 1580;
const COLORS = ['#e8b45a', '#71e666', '#fc6847', '#35b7e0', '#f4eddf', '#e879c6'];
// 여섯 컷(2:3) — 원본 픽셀 [x, y, 폭], 높이는 폭 × 1.5
const BOXES = [[400, 470, 330], [90, 80, 400], [300, 940, 420], [700, 70, 380], [770, 1000, 300], [130, 560, 270]];

const FONT = '<link rel="stylesheet" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css"><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700&display=block" rel="stylesheet">';
const CSS = '<style>html,body{margin:0;padding:0;background:#0a1016}body{font-family:"Pretendard Variable",sans-serif;color:#e6f0f2}' +
  '.wrap{position:relative;overflow:hidden;background:#0a1016}' +
  '.img{position:absolute;background:url(' + DEMO + ') 0 0/100% 100% no-repeat}' +
  '.box{position:absolute;border:3px solid;box-sizing:border-box}.box b{position:absolute;left:-3px;top:-3px;font:700 .9em/1 Archivo,sans-serif;color:#0a1016;padding:.25em .4em}' +
  '.crop{position:absolute;border:3px solid;box-sizing:border-box;background-image:url(' + DEMO + ');background-repeat:no-repeat}' +
  '.crop b{position:absolute;left:0;top:0;font:700 .8em/1 Archivo,sans-serif;color:#0a1016;padding:.2em .35em}' +
  '.mark{position:absolute;display:inline-flex;align-items:center;gap:.4em;font:700 1em/1 Archivo,sans-serif;color:#e6f0f2;letter-spacing:-.01em}' +
  '.t{position:absolute;font-weight:700;letter-spacing:-.02em;line-height:1.3}.s{position:absolute;color:#a8c3ca;font-weight:500}</style>';

// 로고 아이콘(icon-512.png 와 같은 모양) — 512 격자
const ICON = (px, bg) => '<svg width="' + px + '" height="' + px + '" viewBox="0 0 512 512">' + (bg ? '<rect width="512" height="512" rx="96" fill="#0d1a21"/>' : '') +
  '<path d="M102 102H276V170H170V276H102Z" fill="#e8b45a"/><rect x="192" y="192" width="128" height="128" fill="#35b7e0"/><path d="M410 236V410H236V342H342V236Z" fill="#e8b45a"/></svg>';
const mark = (size, pos) => '<div class="mark" style="font-size:' + size + 'px;' + pos + '">' + ICON(size * 1.25, true) + '<span>DetailCrop</span></div>';

// 사진과 상자: (x, y) 에 폭 w 로 놓는다
function photo(x, y, w, fs) {
  const k = w / IW, h = IH * k;
  let s = '<div class="img" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px"></div>';
  BOXES.forEach(([bx, by, bw], i) => {
    s += '<div class="box" style="font-size:' + fs + 'px;border-color:' + COLORS[i] + ';left:' + (x + bx * k) + 'px;top:' + (y + by * k) + 'px;width:' + (bw * k) + 'px;height:' + (bw * 1.5 * k) + 'px">' +
      '<b style="background:' + COLORS[i] + '">' + (i + 1) + '</b></div>';
  });
  return s;
}
// 잘라 낸 컷 i 를 (x, y) 에 폭 w(높이 1.5w)로
function crop(i, x, y, w, fs) {
  const [bx, by, bw] = BOXES[i], k = w / bw;
  return '<div class="crop" style="font-size:' + fs + 'px;border-color:' + COLORS[i] + ';left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + (w * 1.5) + 'px;' +
    'background-size:' + (IW * k) + 'px ' + (IH * k) + 'px;background-position:' + (-bx * k) + 'px ' + (-by * k) + 'px"><b style="background:' + COLORS[i] + '">' + (i + 1) + '</b></div>';
}
const crops = (x, y, w, gap, cols, fs) => [0, 1, 2, 3, 4, 5].map(i => crop(i, x + (i % cols) * (w + gap), y + Math.floor(i / cols) * (w * 1.5 + gap), w, fs)).join('');

const IMAGES = [
  // 가로 1.91:1 — 왼쪽 사진에 상자 여섯, 오른쪽에 잘린 컷 여섯 + 한 줄
  { file: 'landscape-1-crops.jpg', w: 1200, h: 628, html: '<div class="wrap" style="width:1200px;height:628px">' + photo(0, 0, 478, 18) +
      mark(30, 'left:530px;top:52px') + '<div class="t" style="left:530px;top:122px;font-size:44px">여러 사진을 한 번에,<br>사진마다 여섯 컷까지</div>' +
      crops(530, 300, 98, 12, 6, 15) + '<div class="s" style="left:530px;top:546px;font-size:22px">무료 · 업로드 없이 브라우저에서 · zip 하나로</div></div>' },
  // 가로 1.91:1 — 잘린 컷만 크게(글자 거의 없음)
  { file: 'landscape-2-strip.jpg', w: 1200, h: 628, html: '<div class="wrap" style="width:1200px;height:628px">' +
      crops(44, 120, 172, 16, 6, 20) + mark(30, 'left:44px;top:40px') + '<div class="t" style="left:44px;top:430px;font-size:40px">한 장에서 여섯 컷, zip 하나로</div>' + '<div class="s" style="left:44px;top:500px;font-size:26px">무료 · 업로드 없이 브라우저에서</div></div>' },
  // 정사각형 — 위에 로고 · 한 줄, 왼쪽 사진, 오른쪽 컷 2 × 3
  { file: 'square-1-crops.jpg', w: 1200, h: 1200, html: '<div class="wrap" style="width:1200px;height:1200px">' + mark(40, 'left:60px;top:58px') +
      '<div class="t" style="left:60px;top:140px;font-size:58px">사진마다 여섯 컷, 한 번에</div>' + photo(60, 270, 600, 22) + crops(720, 270, 167, 20, 2, 20) +
      '<div class="s" style="left:60px;top:1110px;font-size:30px">무료 · 업로드 없이 브라우저에서</div></div>' },
  // 정사각형 — 컷 3 × 2 크게 + 로고
  { file: 'square-2-grid.jpg', w: 1200, h: 1200, html: '<div class="wrap" style="width:1200px;height:1200px">' + crops(120, 155, 300, 30, 3, 26) +
      mark(40, 'left:120px;top:58px') + '<div class="s" style="left:120px;top:1118px;font-size:32px">한 장에서 여섯 컷 · 무료 · 업로드 없이</div></div>' },
  // 세로 9:16 — 사진 위, 컷 아래, 로고 · 한 줄
  { file: 'portrait-crops.jpg', w: 900, h: 1600, html: '<div class="wrap" style="width:900px;height:1600px">' + mark(40, 'left:60px;top:60px') +
      '<div class="t" style="left:60px;top:140px;font-size:54px">여러 사진을 한 번에,<br>사진마다 여섯 컷까지</div>' + photo(100, 330, 700, 22) +
      crops(60, 1290, 120, 16, 6, 16) + '<div class="s" style="left:60px;top:1515px;font-size:30px">무료 · 업로드 없이 브라우저에서</div></div>' },
  // 로고 1:1 · 4:1
  { file: 'logo-square.png', w: 1200, h: 1200, png: true, html: '<div style="width:1200px;height:1200px;background:#0a1016;display:flex;align-items:center;justify-content:center">' + ICON(900, true) + '</div>' },
  { file: 'logo-landscape.png', w: 1200, h: 300, png: true, html: '<div style="width:1200px;height:300px;background:#0a1016;display:flex;align-items:center;justify-content:center;gap:40px;font:700 120px/1 Archivo,sans-serif;color:#e6f0f2;letter-spacing:-.01em">' + ICON(180, true) + '<span>DetailCrop</span></div>' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const pages = {};
  const PUB = path.join(REPO, 'public');
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (pages[u]) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(pages[u]); }
    const f = path.join(PUB, u);
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const port = srv.address().port;
  const b = await chromium.launch();
  for (const im of IMAGES) {
    pages['/_ad-' + im.file + '.html'] = '<!doctype html><meta charset="utf-8">' + FONT + CSS + im.html;
    const ctx = await b.newContext({ viewport: { width: im.w, height: im.h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto('http://localhost:' + port + '/_ad-' + im.file + '.html', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, im.file), type: im.png ? 'png' : 'jpeg', quality: im.png ? undefined : 90, clip: { x: 0, y: 0, width: im.w, height: im.h } });
    await ctx.close();
    console.log(im.file);
  }
  await b.close();
  srv.close();
})();
