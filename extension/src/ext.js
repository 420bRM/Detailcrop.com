/* DetailCrop for Chrome — the part of the page only the extension has.
   tool.js is the web tool itself, built from template.html; this file runs
   after it and uses its addFiles() and S. It brings in the picture picked
   from a web page's right-click menu and keeps the site's links out of the
   tab. The picture is read from the address it already has, then cropped
   here like any dropped file — nothing is sent anywhere. */
(function () {
  const L = {
    en: {
      loading: "Opening the image…",
      ask: h => `To open images from ${h}, Chrome needs your permission to read them. Nothing is sent anywhere.`,
      allow: "Allow and open", cancel: "Cancel",
      failed: "This image could not be opened here. Save it to your computer, then drop it in.",
      close: "Close"
    },
    ko: {
      loading: "이미지를 여는 중…",
      ask: h => `${h}의 이미지를 열려면 Chrome에서 읽기 권한을 허용해야 합니다. 어디로도 전송하지 않습니다.`,
      allow: "허용하고 열기", cancel: "취소",
      failed: "이 이미지는 여기서 열 수 없었습니다. 컴퓨터에 저장한 뒤 끌어다 놓아 주세요.",
      close: "닫기"
    },
    ja: {
      loading: "画像を開いています…",
      ask: h => `${h} の画像を開くには、Chromeで読み取りを許可する必要があります。どこにも送信しません。`,
      allow: "許可して開く", cancel: "キャンセル",
      failed: "この画像はここでは開けませんでした。パソコンに保存してから、ドロップしてください。",
      close: "閉じる"
    }
  };
  const t = () => L[S.lang] || L.en;

  /* the site's own pages open beside the tool, so a batch in progress stays */
  document.querySelectorAll("a[href]").forEach(a => { a.target = "_blank"; a.rel = "noopener"; });

  const note = document.createElement("div");
  note.className = "extNote";
  note.setAttribute("role", "status");
  note.hidden = true;
  document.body.appendChild(note);
  function say(text, buttons) {
    note.textContent = "";
    const p = document.createElement("span");
    p.textContent = text;
    note.appendChild(p);
    (buttons || []).forEach(([label, primary, act]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn" + (primary ? " primary" : "");
      b.textContent = label;
      b.addEventListener("click", act);
      note.appendChild(b);
    });
    note.hidden = false;
  }
  const quiet = () => { note.hidden = true; };

  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
                "image/avif": "avif", "image/svg+xml": "svg", "image/bmp": "bmp" };
  function nameFor(src, type) {
    let base = "";
    try {
      const u = new URL(src);
      if (u.protocol !== "data:") base = decodeURIComponent(u.pathname.split("/").pop() || "");
    } catch {}
    base = base.replace(/[\\/:*?"<>|]+/g, "").slice(0, 120) || "image";
    return /\.\w{2,5}$/.test(base) ? base : base + "." + (EXT[type] || "png");
  }
  async function fetchImage(src) {
    const r = await fetch(src);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    if (!blob.type.startsWith("image/")) throw new Error("not an image: " + blob.type);
    return new File([blob], nameFor(src, blob.type), { type: blob.type });
  }

  /* Most sites let the extension read their pictures as they are. Those that
     do not need a host permission, asked for that one site only, and only
     once someone has clicked "Allow". */
  async function bring(src) {
    say(t().loading);
    try {
      await addFiles([await fetchImage(src)]);
      quiet();
      return;
    } catch (e) {
      console.warn("DetailCrop:", e);
    }
    let origin = "";
    try { const u = new URL(src); if (/^https?:$/.test(u.protocol)) origin = u.origin + "/*"; } catch {}
    if (origin && !(await chrome.permissions.contains({ origins: [origin] }))) {
      say(t().ask(new URL(src).host), [
        [t().allow, true, async () => {
          let ok = false;
          try { ok = await chrome.permissions.request({ origins: [origin] }); } catch {}
          if (ok) bring(src); else fail();
        }],
        [t().cancel, false, quiet]
      ]);
      return;
    }
    fail();
  }
  function fail() {
    say(t().failed, [[t().close, false, quiet]]);
  }

  /* a picture sent to this tab while it is open */
  let myTab = null;
  chrome.tabs.getCurrent(tab => { myTab = tab ? tab.id : null; });
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || msg.type !== "dc-add" || msg.tab !== myTab) return;
    reply(true);
    bring(String(msg.src || ""));
  });

  /* the picture this tab was opened with */
  if (location.hash.startsWith("#src=")) {
    const src = decodeURIComponent(location.hash.slice(5));
    history.replaceState(null, "", location.pathname);
    bring(src);
  }

  window.__dcExt = { bring };
})();
