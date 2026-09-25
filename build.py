#!/usr/bin/env python3
# Builds the three language pages of each tool, the reading pages, and the sitemap:
#   template.html        ->  public/{,ko/,ja/}index.html         (stills)
#   template-video.html  ->  public/video/{,ko/,ja/}index.html   (video)
#   template-page.html + pages/<lang>/<slug>.html
#                        ->  public/{,ko/,ja/}<slug>/index.html  (about, how-to, uses)
#   public/sitemap.xml
# The templates are the source of truth — never hand-edit anything they write.
import json, io, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
TPL  = os.path.join(ROOT, "template.html")
VTPL = os.path.join(ROOT, "template-video.html")
OUT  = os.path.join(ROOT, "public")
BASE = "https://detailcrop.com"

LANGS = {
  "en": dict(
    path  = "/",
    file  = "index.html",
    title = "Multi Crop — Batch Crop Multiple Images at Once | DetailCrop",
    desc  = "DetailCrop's Multi Crop lets you batch crop multiple images at once: place up to six fixed-ratio crops on every image and download them all as one zip. Free, no upload — it runs in your browser.",
    feats = ["Up to six crops per image",
             "Locked aspect ratio across the whole batch",
             "Straighten the photo before cropping",
             "Instagram feed split into 3, 6 or 9 posts",
             "Exports every crop as one zip",
             "Runs entirely in the browser — no upload"],
  ),
  "ko": dict(
    path  = "/ko/",
    file  = "ko/index.html",
    title = "멀티크롭 — 여러 이미지 한번에 자르기 | 디테일크롭 DetailCrop",
    desc  = "디테일크롭(DetailCrop) 멀티크롭으로 여러 이미지를 한번에 자르세요. 이미지마다 같은 비율의 컷을 최대 6개씩 잡아 zip 하나로 내려받습니다. 무료, 업로드 없이 브라우저에서 처리됩니다.",
    feats = ["이미지 한 장당 최대 6컷",
             "작업 전체에 같은 비율 고정",
             "자르기 전에 사진 수평 맞추기",
             "인스타 피드 3·6·9분할",
             "모든 컷을 zip 하나로 내보내기",
             "브라우저 안에서 처리 — 업로드 없음"],
  ),
  "ja": dict(
    path  = "/ja/",
    file  = "ja/index.html",
    title = "マルチクロップ — 複数の画像を一括トリミング | DetailCrop ディテールクロップ",
    desc  = "DetailCrop（ディテールクロップ）のマルチクロップで、複数の画像をまとめてトリミング。1枚につき同じ比率のカットを最大6つ切り出し、zipひとつでダウンロード。無料・アップロード不要。",
    feats = ["1画像あたり最大6カット",
             "バッチ全体で比率を固定",
             "切り抜く前に写真の傾きを補正",
             "インスタのフィードを3・6・9分割",
             "すべてのカットをzipひとつで書き出し",
             "ブラウザ内で処理 — アップロードなし"],
  ),
}

# Names people search the site by. Google reads alternateName for the site name.
ALT_NAMES = ["Detail Crop", "Multi Crop", "디테일크롭", "멀티크롭", "ディテールクロップ", "マルチクロップ"]

# The video tool. Same three languages, its own canonical set under /video/.
VLANGS = {
  "en": dict(
    path  = "/video/",
    file  = "video/index.html",
    title = "Video Multi Crop — Crop Multiple Videos at Once | DetailCrop Video",
    desc  = "DetailCrop's Multi Crop for video: crop several fixed-ratio clips out of every video at once — 9:16 for Shorts, 1:1 or 4:5 for the feed — and save them all as mp4. Free, runs in your browser, nothing is uploaded.",
    feats = ["Several crops per video, each with its own ratio and time range",
             "9:16, 1:1, 4:5, 16:9 and custom ratios",
             "A whole batch of clips in one sitting",
             "Every crop saved as its own mp4",
             "Runs entirely in the browser — no upload"],
  ),
  "ko": dict(
    path  = "/video/ko/",
    file  = "video/ko/index.html",
    title = "영상 멀티크롭 — 여러 영상 한번에 자르기 | 디테일크롭 DetailCrop Video",
    desc  = "디테일크롭 영상 멀티크롭으로 여러 영상을 한번에 자르세요. 가로 영상에서 쇼츠용 9:16, 피드용 1:1·4:5 컷을 여러 개씩 잡아 mp4로 내보냅니다. 무료, 업로드 없이 브라우저에서 처리됩니다.",
    feats = ["영상 하나에서 여러 컷, 컷마다 비율과 구간 따로",
             "9:16 · 1:1 · 4:5 · 16:9 · 직접 입력 비율",
             "여러 영상을 한 번에 작업",
             "컷마다 mp4로 저장",
             "브라우저 안에서 처리 — 업로드 없음"],
  ),
  "ja": dict(
    path  = "/video/ja/",
    file  = "video/ja/index.html",
    title = "動画マルチクロップ — 複数の動画を一括トリミング | DetailCrop Video",
    desc  = "ディテールクロップの動画マルチクロップで、複数の動画をまとめてトリミング。横長の動画からショート用9:16、フィード用1:1・4:5のカットを何本も切り出し、mp4で書き出します。無料・アップロード不要。",
    feats = ["1本の動画から複数カット、カットごとに比率と区間を設定",
             "9:16・1:1・4:5・16:9・手入力の比率",
             "複数の動画をまとめて作業",
             "カットごとにmp4で保存",
             "ブラウザ内で処理 — アップロードなし"],
  ),
}

# The reading pages, in footer order. Each lives at pages/<lang>/<slug>.html.
PAGES = ["about", "how-to", "uses"]

PAGE_UI = {
  "en": dict(open="Open DetailCrop", nav=["About", "How to use", "Use cases"], tool="The tool",
             cta="Crop a whole batch of images at once, several crops each. Free, and nothing is uploaded.",
             privacy="Runs entirely in your browser. Your images are never uploaded."),
  "ko": dict(open="디테일크롭 열기", nav=["소개", "사용법", "활용법"], tool="도구",
             cta="여러 이미지를 한번에, 한 장에서 여러 컷씩. 무료이고 업로드는 없습니다.",
             privacy="모든 처리가 브라우저 안에서 이루어집니다. 이미지는 업로드되지 않습니다."),
  "ja": dict(open="DetailCropを開く", nav=["DetailCropについて", "使い方", "使い方の例"], tool="ツール",
             cta="複数の画像をまとめて、1枚から何カットも。無料で、アップロードはありません。",
             privacy="処理はすべてブラウザ内で行われます。画像がアップロードされることはありません。"),
}
LANG_LABEL = {"en": "EN", "ko": "한국어", "ja": "日本語"}


def head_urls(path, langs=None, xdefault="/"):
    langs = langs or LANGS
    L = ['<link rel="canonical" href="%s%s">' % (BASE, path),
         '<meta property="og:url" content="%s%s">' % (BASE, path)]
    for code, cfg in langs.items():
        L.append('<link rel="alternate" hreflang="%s" href="%s%s">' % (code, BASE, cfg["path"]))
    L.append('<link rel="alternate" hreflang="x-default" href="%s%s">' % (BASE, xdefault))
    return "\n".join(L)

def ldscript(d):
    return '<script type="application/ld+json">%s</script>' % json.dumps(d, ensure_ascii=False, separators=(",", ":"))

def website_ld():
    return {"@context": "https://schema.org", "@type": "WebSite", "name": "DetailCrop",
            "alternateName": ALT_NAMES, "url": BASE + "/"}

def jsonld_body(code, cfg, name="DetailCrop", sub="Image editor", alt=ALT_NAMES, media="images"):
    return {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": name,
      "alternateName": alt,
      "url": BASE + cfg["path"],
      "inLanguage": code,
      "description": cfg["desc"],
      "applicationCategory": "MultimediaApplication",
      "applicationSubCategory": sub,
      "operatingSystem": "Any (modern web browser)",
      "browserRequirements": "Requires JavaScript",
      "isAccessibleForFree": True,
      "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
      "featureList": cfg["feats"],
      "permissions": "No account, no upload; %s are processed locally in the browser" % media,
    }

def jsonld(code, cfg):
    return ldscript(website_ld()) + "\n" + ldscript(jsonld_body(code, cfg))

# ---------- text in the HTML before any script runs ----------
# The tools fill every [data-i] element from I18N at load. Crawlers that do not
# run JavaScript (Naver, most link previews) would see an empty page, so the
# build writes the page language's strings in beforehand. applyLang() sets the
# same textContent again, so nothing changes for a visitor.

def i18n_strings(tpl):
    start = tpl.index("const I18N = {")
    end = tpl.index("\n};", start)
    body = tpl[start:end]
    out = {}
    marks = [(m.group(1), m.start()) for m in re.finditer(r"\n  (en|ko|ja):\{", body)]
    for i, (code, pos) in enumerate(marks):
        block = body[pos: marks[i + 1][1] if i + 1 < len(marks) else len(body)]
        d = {}
        for m in re.finditer(r'(?<![\w$])(\w+)\s*:\s*"((?:[^"\\\n]|\\.)*)"', block):
            if m.group(1) in d:
                continue
            try:
                d[m.group(1)] = json.loads('"%s"' % m.group(2))
            except ValueError:
                pass
        out[code] = d
    return out

def esc(v, attr=False):
    v = v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return v.replace('"', "&quot;") if attr else v

def prerender(s, strings):
    def fill(m):
        v = strings.get(m.group(2))
        return m.group(1) + esc(v) + m.group(3) if v is not None else m.group(0)
    s = re.sub(r'(<[a-z0-9]+\b[^>]*\bdata-i="(\w+)"[^>]*>)(</[a-z0-9]+>)', fill, s)
    def alt(m):
        v = strings.get(m.group(2))
        return m.group(0) if v is None else m.group(1) + 'alt="%s" ' % esc(v, True) + m.group(0)[len(m.group(1)) + len('alt="" '):]
    s = re.sub(r'(<img\b[^>]*?)alt="" data-i-alt="(\w+)"', alt, s)
    return s

def foot_hrefs(s, code):
    sfx = "/" if code == "en" else "/%s/" % code
    for id_, slug in (("aboutLink", "about"), ("howLink", "how-to"), ("usesLink", "uses")):
        s = s.replace('<a id="%s" href="/%s/"' % (id_, slug), '<a id="%s" href="%s%s/"' % (id_, sfx, slug), 1)
    return s

def main():
    tpl = io.open(TPL, encoding="utf-8").read()
    strings = i18n_strings(tpl)
    for code, cfg in LANGS.items():
        s = tpl
        s = s.replace('<html lang="en">', '<html lang="%s">' % code, 1)
        s = s.replace("<title>%s</title>" % LANGS["en"]["title"],
                      "<title>%s</title>" % cfg["title"], 1)
        s = re.sub(r'<meta name="description" content="[^"]*">',
                   '<meta name="description" content="%s">' % cfg["desc"], s, count=1)
        s = re.sub(r'<meta property="og:title" content="[^"]*">',
                   '<meta property="og:title" content="%s">' % cfg["title"], s, count=1)
        s = re.sub(r'<meta property="og:description" content="[^"]*">',
                   '<meta property="og:description" content="%s">' % cfg["desc"], s, count=1)
        s = s.replace("__HEAD_URLS__", head_urls(cfg["path"]), 1)
        s = s.replace("__JSONLD__", jsonld(code, cfg), 1)
        s = s.replace('<a href="/" id="brandLink"', '<a href="%s" id="brandLink"' % cfg["path"], 1)
        s = s.replace('<a class="crossban" id="crossBan" href="/video/"',
                      '<a class="crossban" id="crossBan" href="/video%s"' % cfg["path"], 1)
        s = foot_hrefs(s, code)
        s = prerender(s, strings[code])
        s = s.replace('const PAGE_LANG = "__LANG__";', 'const PAGE_LANG = "%s";' % code, 1)
        assert "__LANG__" not in s and "__HEAD_URLS__" not in s and "__JSONLD__" not in s, code
        dest = os.path.join(OUT, cfg["file"])
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        io.open(dest, "w", encoding="utf-8").write(s)
        print("%-3s %s  %d bytes" % (code, cfg["file"], len(s.encode("utf-8"))))

def build_video():
    tpl = io.open(VTPL, encoding="utf-8").read()
    strings = i18n_strings(tpl)
    for code, cfg in VLANGS.items():
        s = tpl
        s = s.replace('<html lang="en">', '<html lang="%s">' % code, 1)
        s = s.replace("<title>%s</title>" % VLANGS["en"]["title"],
                      "<title>%s</title>" % cfg["title"], 1)
        s = re.sub(r'<meta name="description" content="[^"]*">',
                   '<meta name="description" content="%s">' % cfg["desc"], s, count=1)
        s = re.sub(r'<meta property="og:title" content="[^"]*">',
                   '<meta property="og:title" content="%s">' % cfg["title"], s, count=1)
        s = re.sub(r'<meta property="og:description" content="[^"]*">',
                   '<meta property="og:description" content="%s">' % cfg["desc"], s, count=1)
        s = s.replace("__HEAD_URLS__", head_urls(cfg["path"], VLANGS, "/video/"), 1)
        s = s.replace("__JSONLD__", ldscript(website_ld()) + "\n" + ldscript(jsonld_body(code, cfg, "DetailCrop Video", "Video editor",
                      ["Multi Crop Video", "디테일크롭 영상", "ディテールクロップ 動画"], "videos")), 1)
        # the links the page renders without JavaScript; applyLang() keeps them
        # in step once the visitor switches language
        stills = "/" if code == "en" else "/%s/" % code
        s = s.replace('<a href="/video/" id="brandLink"', '<a href="%s" id="brandLink"' % cfg["path"], 1)
        s = s.replace('<a class="crossban" id="crossBan" href="/"',
                      '<a class="crossban" id="crossBan" href="%s"' % stills, 1)
        s = foot_hrefs(s, code)
        s = prerender(s, strings[code])
        s = s.replace('const PAGE_LANG = "__LANG__";', 'const PAGE_LANG = "%s";' % code, 1)
        assert "__LANG__" not in s and "__HEAD_URLS__" not in s and "__JSONLD__" not in s, code
        dest = os.path.join(OUT, cfg["file"])
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        io.open(dest, "w", encoding="utf-8").write(s)
        print("%-3s %s  %d bytes" % (code, cfg["file"], len(s.encode("utf-8"))))

def page_url(code, slug):
    return LANGS[code]["path"] + slug + "/"

def read_page(code, slug):
    raw = io.open(os.path.join(ROOT, "pages", code, slug + ".html"), encoding="utf-8").read()
    head, body = raw.split("\n---\n", 1)
    meta = dict(line.split(": ", 1) for line in head.strip().splitlines())
    return meta, body.strip()

def build_pages():
    tpl = io.open(os.path.join(ROOT, "template-page.html"), encoding="utf-8").read()
    for code in LANGS:
        ui = PAGE_UI[code]
        tool = LANGS[code]["path"]
        for slug in PAGES:
            meta, body = read_page(code, slug)
            path = page_url(code, slug)
            alts = {c: dict(path=page_url(c, slug)) for c in LANGS}
            body = (body.replace("__TOOL__", tool).replace("__VIDEO__", "/video" + tool)
                        .replace("__ABOUT__", page_url(code, "about"))
                        .replace("__HOW__", page_url(code, "how-to"))
                        .replace("__USES__", page_url(code, "uses")))
            langlinks = "".join('<a href="%s" hreflang="%s"%s>%s</a>' % (
                page_url(c, slug), c, ' aria-current="page"' if c == code else "", LANG_LABEL[c]) for c in LANGS)
            footlinks = '<a href="%s">%s</a>' % (tool, ui["tool"]) + "".join(
                '<a href="%s"%s>%s</a>' % (page_url(code, sl), ' aria-current="page"' if sl == slug else "", name)
                for sl, name in zip(PAGES, ui["nav"]))
            ld = ldscript({
              "@context": "https://schema.org",
              "@type": "AboutPage" if slug == "about" else "Article",
              ("name" if slug == "about" else "headline"): meta["h1"],
              "description": meta["description"],
              "inLanguage": code,
              "url": BASE + path,
              "isPartOf": website_ld(),
              "publisher": {"@type": "Organization", "name": "DetailCrop", "url": BASE + "/"},
            })
            s = tpl
            for k, v in (("__LANG__", code), ("__TITLE__", esc(meta["title"], True)),
                         ("__DESC__", esc(meta["description"], True)),
                         ("__HEAD_URLS__", head_urls(path, alts, page_url("en", slug))),
                         ("__JSONLD__", ld), ("__LANGLINKS__", langlinks),
                         ("__FOOTLINKS__", footlinks), ("__H1__", meta["h1"]),
                         ("__LEAD__", meta["lead"]), ("__CTA__", ui["cta"]),
                         ("__PRIVACY__", ui["privacy"]), ("__OPEN__", ui["open"]),
                         ("__TOOL__", tool), ("__BODY__", body)):
                s = s.replace(k, v)
            assert not re.search(r"__[A-Z]+__", s), (code, slug, re.findall(r"__[A-Z]+__", s))
            dest = os.path.join(OUT, path.strip("/"), "index.html")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            io.open(dest, "w", encoding="utf-8").write(s)
            print("%-3s %s  %d bytes" % (code, os.path.relpath(dest, OUT), len(s.encode("utf-8"))))

def build_sitemap():
    groups = [{c: cfg["path"] for c, cfg in LANGS.items()},
              {c: cfg["path"] for c, cfg in VLANGS.items()}]
    groups += [{c: page_url(c, slug) for c in LANGS} for slug in PAGES]
    L = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
         '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for g in groups:
        for code in g:
            L.append("  <url>")
            L.append("    <loc>%s%s</loc>" % (BASE, g[code]))
            for c2, p2 in g.items():
                L.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s%s"/>' % (c2, BASE, p2))
            L.append('    <xhtml:link rel="alternate" hreflang="x-default" href="%s%s"/>' % (BASE, g["en"]))
            L.append("  </url>")
    L.append("</urlset>\n")
    io.open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(L))
    print("sitemap.xml  %d urls" % sum(len(g) for g in groups))

main()
build_video()
build_pages()
build_sitemap()
