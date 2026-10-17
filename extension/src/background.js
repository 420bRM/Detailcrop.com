/* DetailCrop for Chrome — the service worker.
   Two ways in: the toolbar button opens the tool, and "Open with DetailCrop"
   on an image's right-click menu opens it with that picture. Neither sends
   anything anywhere: this file only opens or focuses a tab of tool.html,
   which ships inside the extension. */
const TOOL = chrome.runtime.getURL("tool.html");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "dc-open",
    title: chrome.i18n.getMessage("openWith"),
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === "dc-open" && info.srcUrl) openTool(info.srcUrl);
});
chrome.action.onClicked.addListener(() => openTool(""));

/* tool.html tabs that are open now, oldest first */
async function toolTabs() {
  const all = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
  return all.filter(c => c.tabId >= 0 && (c.documentUrl || "").startsWith(TOOL));
}

/* A picture goes into the tool tab already open, so several can be gathered
   into one batch; with none open, a new tab starts with it. */
async function openTool(src) {
  const open = await toolTabs();
  const t = open[open.length - 1];
  if (t) {
    const taken = !src || await chrome.runtime.sendMessage({ type: "dc-add", tab: t.tabId, src }).catch(() => false);
    if (taken) {
      await chrome.tabs.update(t.tabId, { active: true });
      await chrome.windows.update(t.windowId, { focused: true });
      return;
    }
  }
  await chrome.tabs.create({ url: src ? TOOL + "#src=" + encodeURIComponent(src) : TOOL });
}
