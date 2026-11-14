/* DetailCrop for Chrome — the side panel.
   Pictures are gathered here while the web page stays in view: from the
   right-click menu ("Add to DetailCrop") or dropped onto the panel. Each one
   is read at once when the site lets the extension read it; a picture that
   can never come in says why the moment it is added; a site that needs the
   extension's permission is only noted. "Crop them all" then asks Chrome
   once, for every such site together, and hands the whole set to the tool
   tab. Addresses stay in this browser; nothing is sent anywhere. */
(function () {
  const L = {
    en: {
      openTool: "Open the tool", drop: "Right-click a picture → “Add to DetailCrop”, or drag it here.",
      none: "Nothing gathered yet.",
      sum: (n, r) => `${n} gathered · ${r} ready`,
      perm: hs => `Chrome will ask once to read pictures from: ${hs.join(", ")}`,
      go: n => `Crop ${n} in DetailCrop`, clear: "Clear all",
      ready: "Ready", sentTag: "Sent to the tool", reading: "Reading…", needPerm: "Needs permission for this site",
      dup: "Already gathered.", sent: n => `${n} sent to the tool.`,
      denied: "Permission not given: those pictures stay here.",
      expiring: "The address expires soon — crop it today",
      why: {
        noimg: "No picture here. A background picture or one under another layer cannot be gathered.",
        blob: "A temporary address that only that page can read. Save the picture, then drop the file here.",
        scheme: "Not a web address the extension can read.",
        notimg: "This address is not a picture file.",
        login: "The site refused: it may show this picture only to signed-in visitors.",
        gone: "The site no longer has it: the address may have expired.",
        unread: "The site would not let the extension read it. Save it, then drop the file here."
      }
    },
    ko: {
      openTool: "도구 열기", drop: "그림을 오른쪽 버튼 → ‘디테일크롭에 담기’, 또는 여기로 끌어다 놓기",
      none: "아직 담은 그림이 없습니다.",
      sum: (n, r) => `${n}장 담음 · ${r}장 준비됨`,
      perm: hs => `작업할 때 Chrome이 한 번 묻습니다 — 읽기 권한 필요: ${hs.join(", ")}`,
      go: n => `디테일크롭에서 한 번에 작업 (${n}장)`, clear: "모두 비우기",
      ready: "준비됨", sentTag: "도구로 넘김", reading: "읽는 중…", needPerm: "이 사이트 권한 필요",
      dup: "이미 담은 그림입니다.", sent: n => `${n}장을 도구로 넘겼습니다.`,
      denied: "권한을 받지 못해 해당 그림은 여기 남겨 두었습니다.",
      expiring: "주소에 만료 시간이 있습니다 — 오늘 안에 작업하세요",
      why: {
        noimg: "여기서는 그림을 찾지 못했습니다. 배경으로 깔린 그림이나 다른 요소에 덮인 그림은 담을 수 없습니다.",
        blob: "그 페이지만 읽을 수 있는 일시 주소입니다. 그림을 저장한 뒤 파일을 여기로 끌어다 놓으세요.",
        scheme: "확장이 읽을 수 있는 웹 주소가 아닙니다.",
        notimg: "이 주소는 그림 파일이 아닙니다.",
        login: "사이트가 거부했습니다. 로그인해야만 보이는 그림일 수 있습니다.",
        gone: "사이트에 그림이 없습니다. 주소가 만료됐을 수 있습니다.",
        unread: "사이트가 확장에 그림을 내주지 않았습니다. 저장한 뒤 파일을 끌어다 놓으세요."
      }
    },
    ja: {
      openTool: "ツールを開く", drop: "画像を右クリック →「DetailCropに追加」、またはここへドラッグ",
      none: "まだ何も集めていません。",
      sum: (n, r) => `${n}枚 追加 · ${r}枚 準備完了`,
      perm: hs => `作業するときにChromeが一度だけ確認します — 読み取り許可が必要：${hs.join("、")}`,
      go: n => `DetailCropでまとめて作業（${n}枚）`, clear: "すべて消す",
      ready: "準備完了", sentTag: "ツールに渡し済み", reading: "読み込み中…", needPerm: "このサイトの許可が必要",
      dup: "すでに追加した画像です。", sent: n => `${n}枚をツールに渡しました。`,
      denied: "許可が得られなかった画像はここに残しました。",
      expiring: "アドレスに期限があります — 今日中に作業してください",
      why: {
        noimg: "ここでは画像が見つかりません。背景の画像やほかの要素に覆われた画像は追加できません。",
        blob: "そのページだけが読める一時的なアドレスです。画像を保存してからファイルをここへドラッグしてください。",
        scheme: "拡張機能が読めるWebアドレスではありません。",
        notimg: "このアドレスは画像ファイルではありません。",
        login: "サイトに拒否されました。ログインしないと見られない画像かもしれません。",
        gone: "サイトに画像がありません。アドレスの期限が切れた可能性があります。",
        unread: "サイトが拡張機能に画像を渡しませんでした。保存してからファイルをドラッグしてください。"
      }
    }
  };
  const ui = (chrome.i18n.getUILanguage() || "en").toLowerCase();
  const t = L[ui.slice(0, 2)] || L.en;
  document.documentElement.lang = L[ui.slice(0, 2)] ? ui.slice(0, 2) : "en";
  const $ = s => document.querySelector(s);

  const STORE = "dcp.items";          // addresses only, so the list survives closing the panel
  let items = [];                     // {id, src, page, s: ready|perm|bad|reading, why, blob, url, name, exp, sent}
  let seq = 0;

  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
                "image/avif": "avif", "image/svg+xml": "svg", "image/bmp": "bmp" };
  function nameFor(src, type) {
    let base = "";
    try { const u = new URL(src); if (u.protocol !== "data:") base = decodeURIComponent(u.pathname.split("/").pop() || ""); } catch {}
    base = base.replace(/[\\/:*?"<>|]+/g, "").slice(0, 120) || "image";
    return /\.\w{2,5}$/.test(base) ? base : base + "." + (EXT[type] || "png");
  }
  const hostOf = src => { try { return new URL(src).host; } catch { return ""; } };
  const originOf = src => { try { const u = new URL(src); return /^https?:$/.test(u.protocol) ? u.origin + "/*" : ""; } catch { return ""; } };
  // signed or time-limited addresses (S3, CDNs, Instagram/Facebook, Azure)
  const EXPIRING = /[?&](x-amz-expires|x-amz-signature|x-goog-expires|expires|exp|oe|se|sig|signature|token|validto)=/i;

  /* Why a picture can never come in, before anything is fetched */
  function refuse(src) {
    if (!src) return "noimg";
    if (src.startsWith("blob:")) return "blob";
    if (!/^(https?|data):/i.test(src)) return "scheme";
    return "";
  }

  async function read(it, withCookies) {
    it.s = "reading"; paint();
    try {
      const r = await fetch(it.src, withCookies ? { credentials: "include" } : {});
      if (r.status === 401 || r.status === 403) return fail(it, "login");
      if (r.status === 404 || r.status === 410) return fail(it, "gone");
      if (!r.ok) return fail(it, "unread");
      const blob = await r.blob();
      if (!blob.type.startsWith("image/")) return fail(it, "notimg");
      it.blob = blob; it.url = URL.createObjectURL(blob); it.name = nameFor(it.src, blob.type);
      it.s = "ready"; it.why = "";
    } catch (e) {
      // a cross-origin refusal: unreadable for now unless the site is granted
      const o = originOf(it.src);
      const has = o && await chrome.permissions.contains({ origins: [o] });
      if (o && !has) { it.s = "perm"; it.why = ""; }
      else fail(it, "unread");
    }
    paint();
  }
  function fail(it, why) { it.s = "bad"; it.why = why; paint(); }

  function add(src, page, file) {
    note("");
    if (src && items.some(i => i.src === src)) return note(t.dup);
    const it = { id: ++seq, src: src || "", page: page || "", s: "reading", why: "", exp: EXPIRING.test(src || "") };
    items.push(it);
    if (file) {
      it.blob = file; it.url = URL.createObjectURL(file); it.name = file.name; it.s = "ready"; it.src = it.src || "file:" + file.name + ":" + it.id;
    } else {
      const no = refuse(it.src);
      if (no) fail(it, no); else read(it, false);
    }
    save(); paint();
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(items.filter(i => /^(https?|data):/.test(i.src)).map(i => ({ src: i.src, page: i.page })))); } catch {}
  }

  function paint() {
    const list = $("#items");
    list.textContent = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.className = "item"; li.dataset.s = it.sent ? "sent" : it.s;
      const img = document.createElement("img");
      img.alt = ""; img.loading = "lazy";
      img.addEventListener("error", () => { img.removeAttribute("src"); img.style.visibility = "hidden"; });   // an empty square, not a broken-image icon
      if (it.s === "bad") img.style.visibility = "hidden";
      if (it.url || /^(https?|data):/.test(it.src)) img.src = it.url || it.src;
      const meta = document.createElement("span"); meta.className = "meta";
      const host = document.createElement("span"); host.className = "host";
      host.textContent = it.blob && !hostOf(it.src) ? it.name : (hostOf(it.src) || it.name || "—");
      host.title = it.src;
      const st = document.createElement("span"); st.className = "state";
      st.textContent = it.s === "bad" ? t.why[it.why] : it.s === "perm" ? t.needPerm : it.s === "reading" ? t.reading
                     : it.sent ? t.sentTag : t.ready + (it.exp ? " · " + t.expiring : "");
      if (it.s === "perm" && it.exp) st.textContent += " · " + t.expiring;
      meta.append(host, st);
      const x = document.createElement("button");
      x.type = "button"; x.className = "x"; x.textContent = "×"; x.setAttribute("aria-label", "Remove");
      x.addEventListener("click", () => { if (it.url) URL.revokeObjectURL(it.url); items = items.filter(i => i !== it); save(); paint(); });
      li.append(img, meta, x);
      list.append(li);
    }
    const usable = items.filter(i => (i.s === "ready" && !i.sent) || i.s === "perm");
    const ready = items.filter(i => i.s === "ready").length;
    $("#sum").textContent = items.length ? t.sum(items.length, ready) : t.none;
    const hosts = [...new Set(items.filter(i => i.s === "perm").map(i => hostOf(i.src)))];
    $("#perm").hidden = !hosts.length;
    $("#perm").textContent = hosts.length ? t.perm(hosts) : "";
    $("#goBtn").textContent = t.go(usable.length);
    $("#goBtn").disabled = !usable.length;
  }
  function note(s) { $("#note").textContent = s; $("#note").hidden = !s; }

  /* One permission question for every site that needs one, then the batch */
  $("#goBtn").addEventListener("click", async () => {
    const waiting = items.filter(i => i.s === "perm");
    const origins = [...new Set(waiting.map(i => originOf(i.src)).filter(Boolean))];
    let granted = true;
    // request() has to be the first thing the click does
    if (origins.length) { try { granted = await chrome.permissions.request({ origins }); } catch { granted = false; } }
    if (granted) await Promise.all(waiting.map(i => read(i, true)));
    else note(t.denied);
    // what went over before stays listed, so the tool's tab is not sent it twice
    const fresh = items.filter(i => i.s === "ready" && !i.sent);
    if (!fresh.length) return;
    const send = fresh.map(i => ({ url: i.url, name: i.name }));
    await chrome.runtime.sendMessage({ type: "dc-batch", items: send });
    fresh.forEach(i => { i.sent = true; });
    paint();
    if (granted) note(t.sent(send.length));
  });
  $("#clearBtn").addEventListener("click", () => {
    items.forEach(i => i.url && URL.revokeObjectURL(i.url));
    items = []; save(); paint(); note("");
  });
  $("#openTool").addEventListener("click", () => chrome.runtime.sendMessage({ type: "dc-open-tool" }));

  /* Dropped from a web page (the picture's address) or from the computer (a file) */
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => document.addEventListener(ev, () => drop.classList.remove("over")));
  document.addEventListener("drop", e => {
    e.preventDefault();
    const dt = e.dataTransfer;
    const files = [...(dt.files || [])].filter(f => f.type.startsWith("image/"));
    if (files.length) return files.forEach(f => add("", "", f));
    // a dragged <img> carries its markup; a link around it would put the
    // link's address first in the uri list, so the markup wins
    const html = dt.getData("text/html");
    const m = html && html.match(/<img[^>]+src="([^"]+)"/i);
    const src = m ? m[1].replace(/&amp;/g, "&") : (dt.getData("text/uri-list") || "").split("\n").find(l => l && !l.startsWith("#"));
    add((src || "").trim(), "");
  });

  /* From the right-click menu, now or while the panel was opening */
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || msg.type !== "dc-collect") return;
    reply(true);
    add(msg.item.src, msg.item.page);
  });

  $("#openTool").textContent = t.openTool;
  $("#dropText").textContent = t.drop;
  $("#clearBtn").textContent = t.clear;
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(STORE) || "[]") || []; } catch {}
  saved.forEach(i => add(i.src, i.page));
  paint();
  chrome.runtime.sendMessage({ type: "dc-waiting" }).then(list => (list || []).forEach(i => add(i.src, i.page))).catch(() => {});

  window.__dcPanel = { add, items: () => items };
})();
