#!/usr/bin/env python3
# Builds the three language pages from template.html.
# Source of truth is template.html — never hand-edit public/*/index.html.
import json, io, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
TPL  = os.path.join(ROOT, "template.html")
OUT  = os.path.join(ROOT, "detailcrop", "public")
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

def head_urls(path):
    L = ['<link rel="canonical" href="%s%s">' % (BASE, path),
         '<meta property="og:url" content="%s%s">' % (BASE, path)]
    for code, cfg in LANGS.items():
        L.append('<link rel="alternate" hreflang="%s" href="%s%s">' % (code, BASE, cfg["path"]))
    L.append('<link rel="alternate" hreflang="x-default" href="%s/">' % BASE)
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

main()
