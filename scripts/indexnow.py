#!/usr/bin/env python3
"""Tell Bing and Naver which pages changed, through IndexNow.

  python3 scripts/indexnow.py changed BASE HEAD   pages whose public/ file changed
  python3 scripts/indexnow.py all                 every URL in the sitemap
  python3 scripts/indexnow.py wait SHA            block until Cloudflare has deployed SHA
  add --dry-run to print the URLs without sending them

Only URLs listed in public/sitemap.xml are ever sent, so a page kept out of
search never gets announced by accident. Google does not take IndexNow; it
keeps reading the sitemap.

The key is the public/<32 hex>.txt file. It is meant to be public — the
search engines fetch it to check that the ping really comes from this site.
"""
import glob, json, os, re, subprocess, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
HOST = "detailcrop.com"
BASE = "https://" + HOST

# api.indexnow.org forwards to every participating engine (Bing, Yandex, Seznam,
# Naver...). Naver is also sent directly, since it is the one we care about most.
ENDPOINTS = ["https://api.indexnow.org/indexnow",
             "https://searchadvisor.naver.com/indexnow"]

DEPLOY_CHECK = "Workers Builds: detailcrop"


def key():
    for p in glob.glob(os.path.join(PUBLIC, "*.txt")):
        name = os.path.basename(p)[:-4]
        if re.fullmatch(r"[0-9a-f]{32}", name) and open(p).read().strip() == name:
            return name
    sys.exit("no IndexNow key file (public/<32 hex>.txt containing its own name)")


def sitemap_urls():
    xml = open(os.path.join(PUBLIC, "sitemap.xml"), encoding="utf-8").read()
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def url_of(path):
    """public/ko/about/index.html -> https://detailcrop.com/ko/about/"""
    rel = os.path.relpath(path, "public").replace(os.sep, "/")
    if rel == "index.html":
        return BASE + "/"
    if rel.endswith("/index.html"):
        return BASE + "/" + rel[: -len("index.html")]
    return None


def changed_urls(base, head):
    out = subprocess.run(["git", "diff", "--name-only", base, head, "--", "public/"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    allowed = set(sitemap_urls())
    urls = [url_of(f) for f in out.split()]
    return sorted(u for u in set(urls) if u in allowed)


def send(urls, dry):
    if not urls:
        print("nothing to send")
        return True
    k = key()
    body = json.dumps({"host": HOST, "key": k, "keyLocation": "%s/%s.txt" % (BASE, k),
                       "urlList": urls}).encode()
    print("\n".join(urls))
    if dry:
        print("(dry run: %d urls not sent)" % len(urls))
        return True
    ok = True
    for ep in ENDPOINTS:
        req = urllib.request.Request(ep, data=body, method="POST",
                                     headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                code, text = r.status, r.read(300).decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            code, text = e.code, e.read(300).decode("utf-8", "replace")
        except Exception as e:                                   # network trouble
            code, text = 0, str(e)
        # 200 accepted · 202 accepted, key still being checked
        good = code in (200, 202)
        ok = ok and good
        print("%s  %s  %s %s" % ("ok " if good else "ERR", code, ep, text.strip()[:200]))
    return ok


def wait_for_deploy(sha, minutes=15):
    """Pages must be live before we announce them, or the crawler fetches the old copy."""
    repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GH_TOKEN")
    if not (repo and token):
        sys.exit("wait needs GITHUB_REPOSITORY and GH_TOKEN")
    url = "https://api.github.com/repos/%s/commits/%s/check-runs?check_name=%s" % (
        repo, sha, urllib.request.quote(DEPLOY_CHECK))
    deadline = time.time() + minutes * 60
    while time.time() < deadline:
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token,
                                                   "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            runs = json.load(r).get("check_runs", [])
        if runs:
            run = runs[0]
            if run["status"] == "completed":
                if run["conclusion"] == "success":
                    print("deploy finished")
                    time.sleep(20)               # let the edge pick up the new assets
                    return
                sys.exit("deploy %s — not announcing pages that did not go out" % run["conclusion"])
        time.sleep(20)
    print("no finished '%s' check after %d min; sending anyway" % (DEPLOY_CHECK, minutes))


def main(argv):
    dry = "--dry-run" in argv
    args = [a for a in argv if a != "--dry-run"]
    if args[:1] == ["changed"] and len(args) == 3:
        return send(changed_urls(args[1], args[2]), dry)
    if args[:1] == ["all"]:
        return send(sitemap_urls(), dry)
    if args[:1] == ["wait"] and len(args) == 2:
        wait_for_deploy(args[1])
        return True
    sys.exit(__doc__)


if __name__ == "__main__":
    sys.exit(0 if main(sys.argv[1:]) else 1)
