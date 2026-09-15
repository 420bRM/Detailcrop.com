#!/usr/bin/env python3
# Builds the three language pages of each tool:
#   template.html        ->  public/{,ko/,ja/}index.html         (stills)
#   template-video.html  ->  public/video/{,ko/,ja/}index.html   (video)
# The templates are the source of truth — never hand-edit public/**/index.html.
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
    title = "DetailCrop — batch detail crops from every image",
    desc  = "Pull several fixed-ratio detail crops out of every image in a batch, then download them all as a zip. Runs entirely in your browser — nothing is uploaded.",
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
    title = "DetailCrop — 라인업 전체의 확대컷을 한자리에서",
    desc  = "여러 장의 이미지에서 같은 비율의 확대컷을 한 장당 여러 개씩 잡아 zip 하나로 내려받습니다. 모든 처리가 브라우저 안에서 끝나며 업로드가 없습니다.",
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
    title = "DetailCrop — ラインナップ全体のディテールカットを一度に",
    desc  = "複数の画像から同じ比率のディテールカットを1枚につき何カットも切り出し、zipひとつでダウンロードします。処理はすべてブラウザ内で完結し、アップロードはありません。",
    feats = ["1画像あたり最大6カット",
             "バッチ全体で比率を固定",
             "切り抜く前に写真の傾きを補正",
             "インスタのフィードを3・6・9分割",
             "すべてのカットをzipひとつで書き出し",
             "ブラウザ内で処理 — アップロードなし"],
  ),
}

OG_TITLE = "DetailCrop — batch detail crops from every image"

# The video tool. Same three languages, its own canonical set under /video/.
# Still noindex and out of the sitemap while it is in testing.
VLANGS = {
  "en": dict(
    path  = "/video/",
    file  = "video/index.html",
    title = "DetailCrop Video — batch detail crops from every video",
    desc  = "Pull several fixed-ratio crops out of every video in a batch and save them all as mp4. Runs entirely in your browser — nothing is uploaded.",
  ),
  "ko": dict(
    path  = "/video/ko/",
    file  = "video/ko/index.html",
    title = "DetailCrop Video — 영상마다 여러 컷을 한 번에",
    desc  = "여러 영상에서 같은 비율의 컷을 하나당 여러 개씩 잡아 mp4로 내보냅니다. 모든 처리가 브라우저 안에서 끝나며 업로드가 없습니다.",
  ),
  "ja": dict(
    path  = "/video/ja/",
    file  = "video/ja/index.html",
    title = "DetailCrop Video — 動画ごとに複数カットを一度に",
    desc  = "複数の動画から同じ比率のカットを1本につき何カットも切り出し、mp4で書き出します。処理はすべてブラウザ内で完結し、アップロードはありません。",
  ),
}

V_OG_TITLE = "DetailCrop Video — batch detail crops from every video"


def head_urls(path, langs=None, xdefault="/"):
    langs = langs or LANGS
    L = ['<link rel="canonical" href="%s%s">' % (BASE, path),
         '<meta property="og:url" content="%s%s">' % (BASE, path)]
    for code, cfg in langs.items():
        L.append('<link rel="alternate" hreflang="%s" href="%s%s">' % (code, BASE, cfg["path"]))
    L.append('<link rel="alternate" hreflang="x-default" href="%s%s">' % (BASE, xdefault))
    return "\n".join(L)

def jsonld(code, cfg):
    d = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "DetailCrop",
      "url": BASE + cfg["path"],
      "inLanguage": code,
      "description": cfg["desc"],
      "applicationCategory": "MultimediaApplication",
      "applicationSubCategory": "Image editor",
      "operatingSystem": "Any (modern web browser)",
      "browserRequirements": "Requires JavaScript",
      "isAccessibleForFree": True,
      "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
      "featureList": cfg["feats"],
      "permissions": "No account, no upload; images are processed locally in the browser",
    }
    return '<script type="application/ld+json">%s</script>' % json.dumps(d, ensure_ascii=False, separators=(",", ":"))

def main():
    tpl = io.open(TPL, encoding="utf-8").read()
    for code, cfg in LANGS.items():
        s = tpl
        s = s.replace('<html lang="en">', '<html lang="%s">' % code, 1)
        s = s.replace("<title>%s</title>" % LANGS["en"]["title"],
                      "<title>%s</title>" % cfg["title"], 1)
        s = re.sub(r'<meta name="description" content="[^"]*">',
                   '<meta name="description" content="%s">' % cfg["desc"], s, count=1)
        s = re.sub(r'<meta property="og:title" content="[^"]*">',
                   '<meta property="og:title" content="%s">' % OG_TITLE, s, count=1)
        s = re.sub(r'<meta property="og:description" content="[^"]*">',
                   '<meta property="og:description" content="%s">' % cfg["desc"], s, count=1)
        s = s.replace("__HEAD_URLS__", head_urls(cfg["path"]), 1)
        s = s.replace("__JSONLD__", jsonld(code, cfg), 1)
        s = s.replace('const PAGE_LANG = "__LANG__";', 'const PAGE_LANG = "%s";' % code, 1)
        assert "__LANG__" not in s and "__HEAD_URLS__" not in s and "__JSONLD__" not in s, code
        dest = os.path.join(OUT, cfg["file"])
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        io.open(dest, "w", encoding="utf-8").write(s)
        print("%-3s %s  %d bytes" % (code, cfg["file"], len(s.encode("utf-8"))))

def build_video():
    tpl = io.open(VTPL, encoding="utf-8").read()
    for code, cfg in VLANGS.items():
        s = tpl
        s = s.replace('<html lang="en">', '<html lang="%s">' % code, 1)
        s = s.replace("<title>%s</title>" % VLANGS["en"]["title"],
                      "<title>%s</title>" % cfg["title"], 1)
        s = re.sub(r'<meta name="description" content="[^"]*">',
                   '<meta name="description" content="%s">' % cfg["desc"], s, count=1)
        s = re.sub(r'<meta property="og:title" content="[^"]*">',
                   '<meta property="og:title" content="%s">' % V_OG_TITLE, s, count=1)
        s = re.sub(r'<meta property="og:description" content="[^"]*">',
                   '<meta property="og:description" content="%s">' % cfg["desc"], s, count=1)
        s = s.replace("__HEAD_URLS__", head_urls(cfg["path"], VLANGS, "/video/"), 1)
        # the links the page renders without JavaScript; applyLang() keeps them
        # in step once the visitor switches language
        stills = "/" if code == "en" else "/%s/" % code
        s = s.replace('<a href="/video/" id="brandLink"', '<a href="%s" id="brandLink"' % cfg["path"], 1)
        s = s.replace('<a class="crossban" id="crossBan" href="/"',
                      '<a class="crossban" id="crossBan" href="%s"' % stills, 1)
        s = s.replace('const PAGE_LANG = "__LANG__";', 'const PAGE_LANG = "%s";' % code, 1)
        assert "__LANG__" not in s and "__HEAD_URLS__" not in s, code
        dest = os.path.join(OUT, cfg["file"])
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        io.open(dest, "w", encoding="utf-8").write(s)
        print("%-3s %s  %d bytes" % (code, cfg["file"], len(s.encode("utf-8"))))

main()
build_video()
