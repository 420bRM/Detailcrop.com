/* DetailCrop for Chrome — the service worker.
   Three ways in. The toolbar button opens the side panel, where pictures are
   gathered while the web page stays in view; "Add to DetailCrop" on the
   right-click menu puts a picture in that panel; "Open with DetailCrop" opens
   one straight in the tool, as in 1.0. Nothing here sends anything anywhere:
   it only opens the panel, passes addresses between the extension's own
   pages, and opens or focuses a tab of tool.html, which ships inside the
   extension. */
const TOOL = chrome.runtime.getURL("tool.html");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    // "page" too, so a right-click on a background picture gets an answer
    // in the panel instead of nothing
    chrome.contextMenus.create({ id: "dc-collect", title: chrome.i18n.getMessage("collectTo"), contexts: ["image", "page"] });
    chrome.contextMenus.create({ id: "dc-open", title: chrome.i18n.getMessage("openWith"), contexts: ["image"] });
  });
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

/* Pictures picked while the panel is still loading wait here until it asks. */
let waiting = [];

chrome.contextMenus.onClicked.addListener(onMenu);
function onMenu(info, tab) {
  if (info.menuItemId === "dc-open" && info.srcUrl) return openTool(info.srcUrl);
  if (info.menuItemId !== "dc-collect") return;
  const item = { src: info.srcUrl || "", page: info.pageUrl || "", at: Date.now() };
  // open() must run inside the click, before anything is awaited
  if (tab && tab.windowId >= 0) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  chrome.runtime.sendMessage({ type: "dc-collect", item })
    .then(taken => { if (!taken) waiting.push(item); })
    .catch(() => waiting.push(item));
}

/* the batch the panel hands over, held until the tool tab asks for it */
let batch = null;

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "dc-waiting") { reply(waiting); waiting = []; return; }
  if (msg.type === "dc-batch") { handOver(msg.items || []).then(() => reply(true)); return true; }
  if (msg.type === "dc-batch-get") { reply(batch || []); batch = null; return; }
  if (msg.type === "dc-open-tool") { openTool(""); return; }
});

/* tool.html tabs that are open now, oldest first */
async function toolTabs() {
  const all = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
  return all.filter(c => c.tabId >= 0 && (c.documentUrl || "").startsWith(TOOL));
}

async function focus(t) {
  await chrome.tabs.update(t.tabId, { active: true });
  await chrome.windows.update(t.windowId, { focused: true });
}

/* A picture goes into the tool tab already open, so several can be gathered
   into one batch; with none open, a new tab starts with it. */
async function openTool(src) {
  const open = await toolTabs();
  const t = open[open.length - 1];
  if (t) {
    const taken = !src || await chrome.runtime.sendMessage({ type: "dc-add", tab: t.tabId, src }).catch(() => false);
    if (taken) return focus(t);
  }
  await chrome.tabs.create({ url: src ? TOOL + "#src=" + encodeURIComponent(src) : TOOL });
}

/* The panel's whole collection, as blob: addresses of the panel's own page —
   same origin as tool.html, so the tool can read them while the panel is
   open. Into the open tool tab if there is one, else a new tab that asks. */
async function handOver(items) {
  const open = await toolTabs();
  const t = open[open.length - 1];
  if (t) {
    const taken = await chrome.runtime.sendMessage({ type: "dc-add-many", tab: t.tabId, items }).catch(() => false);
    if (taken) return focus(t);
  }
  batch = items;
  await chrome.tabs.create({ url: TOOL + "#batch" });
}
