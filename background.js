// Bili Screenshot — background service worker
// 职责：快捷键触发截图、与 content script 协作采集、下载保存、
//       文件名/路径模板渲染、历史记录、通知与连拍控制。

"use strict";

// ---------- 默认设置 ----------

const DEFAULTS = {
  savePath: "BiliScreenshots/{date}/", // 下载目录内相对路径，支持 {date}
  burstPath: "BiliScreenshots/burst/", // 连拍单独保存路径（第三层），支持 {date}
  format: "jpeg",                      // jpeg | png
  jpegQuality: 90,                     // 1-100
  includeDanmaku: true,                // 截图是否带上弹幕
  filenameTemplate: "{date}_{time}_{bvid}_{title}_{progress}",
  burstCount: 6,                       // 连拍张数
  burstInterval: 300,                  // 连拍间隔 ms
  notifyOnSave: true,                  // 保存后轻提示
  useSystemNotification: false,        // 使用系统通知（否则仅角标）
  pageShortcutEnabled: true,           // 页面内快捷键总开关
  shortcutCapture: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyS" },
  shortcutBurst: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyX" },
};

async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...data };
}

// ---------- 工具 ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pad2(n) {
  return String(n).padStart(2, "0");
}

function sanitize(str) {
  return String(str)
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function buildFilename(settings, info, width, height) {
  const now = new Date();
  const vars = {
    date: `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`,
    time: `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`,
    bvid: info.bvid || "BV",
    title: sanitize(info.title || "bilibili"),
    progress: info.progress || "00_00_00",
    duration: info.duration || "00_00_00",
    width: width || 0,
    height: height || 0,
  };
  const ext = settings.format === "png" ? "png" : "jpg";
  let name = settings.filenameTemplate.replace(/\{(\w+)\}/g, (m, k) =>
    vars[k] !== undefined ? String(vars[k]) : ""
  );
  name = sanitize(name) || `screenshot_${vars.time}`;
  return `${name}.${ext}`;
}

function buildPath(template, filename) {
  const now = new Date();
  const vars = {
    date: `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`,
    time: `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`,
  };
  const rendered = template.replace(/\{(\w+)\}/g, (m, k) =>
    vars[k] !== undefined ? String(vars[k]) : ""
  );
  const segs = rendered
    .split(/[\\/]+/)
    .map((s) => sanitize(s))
    .filter(Boolean)
    .filter((s) => s !== "." && s !== "..");
  return [...segs, filename].join("/");
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error("FileReader error"));
    fr.readAsDataURL(blob);
  });
}

const reasonText = (resp) => {
  const map = {
    "no-video": "当前页面没有可截图的视频",
    "no-video-data": "视频尚未加载出画面",
    tainted: "视频源跨域，已尝试视口捕获",
    "export-failed": "图片导出失败",
  };
  return (resp && map[resp.reason]) || "未知错误";
};

// ---------- 通知 / 角标 ----------

async function notifyUser(title, message) {
  const s = await getSettings();
  if (!s.notifyOnSave) return;
  if (s.useSystemNotification) {
    chrome.notifications
      .create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title,
        message,
      })
      .catch(() => {});
  }
  chrome.action.setBadgeText({ text: "✓" });
  chrome.action.setBadgeBackgroundColor({ color: "#00A1D6" });
  chrome.alarms.create("clearBadge", { when: Date.now() + 1600 });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "clearBadge") chrome.action.setBadgeText({ text: "" });
});

// ---------- 历史记录 ----------

const HISTORY_LIMIT = 100;

async function saveHistory(item) {
  const data = await chrome.storage.local.get("history");
  const list = data.history || [];
  list.unshift(item);
  if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
  await chrome.storage.local.set({ history: list });
}

// ---------- 与 content script 协作 ----------

async function getActiveBiliTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && /^https:\/\/[^/]*bilibili\.com\//.test(tab.url || "")) return tab;
  return null;
}

async function ensureContent(tabId) {
  for (let i = 0; i < 10; i++) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: "ping" });
      if (r && r.pong) return true;
    } catch (e) {
      /* 未注入，尝试注入 */
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch (e) {
      /* 已注入时可能报错，忽略 */
    }
    await sleep(250);
  }
  return false;
}

// 视口捕获（canvas 污染回退）：捕获屏幕画面并按播放器矩形裁剪
async function captureViewport(tab, rect) {
  try {
    const shotUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const blob = await (await fetch(shotUrl)).blob();
    const bmp = await createImageBitmap(blob);
    const dpr = rect.dpr || 1;
    let x = Math.round(rect.x * dpr);
    let y = Math.round(rect.y * dpr);
    let w = Math.round(rect.width * dpr);
    let h = Math.round(rect.height * dpr);
    const vw = Math.round((rect.viewportW || 0) * dpr);
    const vh = Math.round((rect.viewportH || 0) * dpr);
    x = Math.max(0, Math.min(x, vw - 1));
    y = Math.max(0, Math.min(y, vh - 1));
    w = Math.max(1, Math.min(w, vw - x));
    h = Math.max(1, Math.min(h, vh - y));

    const settings = await getSettings();
    const isPng = settings.format === "png";
    const mime = isPng ? "image/png" : "image/jpeg";
    const quality = isPng ? undefined : Math.min(1, Math.max(0.05, settings.jpegQuality / 100));

    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d").drawImage(bmp, x, y, w, h, 0, 0, w, h);
    const outBlob = await canvas.convertToBlob({ type: mime, quality });
    const dataUrl = await blobToDataUrl(outBlob);

    let thumb = null;
    try {
      const scale = Math.min(1, 256 / w);
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const tc = new OffscreenCanvas(tw, th);
      tc.getContext("2d").drawImage(bmp, x, y, w, h, 0, 0, tw, th);
      thumb = await blobToDataUrl(
        await tc.convertToBlob({ type: "image/jpeg", quality: 0.55 })
      );
    } catch (e) {
      /* 缩略图失败可忽略 */
    }
    bmp.close && bmp.close();
    return { dataUrl, thumb, width: w, height: h };
  } catch (e) {
    console.error("captureViewport failed:", e);
    return null;
  }
}

// ---------- 核心：单次截图 ----------

async function captureOnce(opts = {}) {
  const settings = await getSettings();

  const tab = await getActiveBiliTab();
  if (!tab) {
    if (!opts.silent) await notifyUser("Bili Screenshot", "请先在 B 站视频页打开视频再截图");
    return false;
  }

  const ready = await ensureContent(tab.id);
  if (!ready) {
    if (!opts.silent) await notifyUser("Bili Screenshot", "无法与页面通信，请刷新 B 站页面后重试");
    return false;
  }

  let resp;
  try {
    resp = await chrome.tabs.sendMessage(tab.id, {
      type: "capture",
      format: settings.format,
      quality: settings.jpegQuality / 100,
      includeDanmaku: settings.includeDanmaku,
    });
  } catch (e) {
    if (!opts.silent) await notifyUser("截图失败", "与页面通信失败");
    return false;
  }

  if (!resp || !resp.ok) {
    if (!opts.silent) await notifyUser("截图失败", reasonText(resp));
    return false;
  }

  let dataUrl = resp.dataUrl;
  let thumb = resp.thumb;
  let width = resp.width;
  let height = resp.height;

  if (resp.mode === "viewport") {
    const shot = await captureViewport(tab, resp.rect);
    chrome.tabs.sendMessage(tab.id, { type: "restore-danmaku" }).catch(() => {});
    if (!shot) {
      if (!opts.silent) await notifyUser("截图失败", "视口捕获失败");
      return false;
    }
    dataUrl = shot.dataUrl;
    thumb = shot.thumb;
    width = shot.width;
    height = shot.height;
  }

  const filename = buildFilename(settings, resp, width, height);
  const pathTpl = opts.pathOverride || settings.savePath;
  const fullPath = buildPath(pathTpl, filename);

  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename: fullPath,
      conflictAction: "uniquify",
      saveAs: false,
    });
  } catch (e) {
    if (!opts.silent) await notifyUser("保存失败", String((e && e.message) || e));
    return false;
  }

  const size = Math.round(dataUrl.length * 3 / 4);
  await saveHistory({
    ts: Date.now(),
    filename: fullPath,
    size,
    thumb,
    bvid: resp.bvid || "",
    title: resp.title || "",
    width,
    height,
  });

  if (!opts.silent) {
    await notifyUser(
      "已保存截图",
      `${fullPath}（${width}×${height}，${formatSize(size)}）`
    );
  }
  return true;
}

// ---------- 连拍 ----------
// 状态写入 storage：SW 被回收后重启也能正确响应"再按停止"；
// 循环内每轮读取状态本身也是 storage API 调用，可刷新 SW 空闲计时器保活。

const BURST_KEY = "burstState";

async function isBurstActive() {
  const data = await chrome.storage.local.get(BURST_KEY);
  return !!(data[BURST_KEY] && data[BURST_KEY].active);
}

async function setBurstActive(active) {
  await chrome.storage.local.set({ [BURST_KEY]: { active } });
}

async function toggleBurst() {
  if (await isBurstActive()) {
    await setBurstActive(false);
    return;
  }

  const s = await getSettings();
  const count = Math.max(1, Math.min(50, Number(s.burstCount) || 6));
  const interval = Math.max(100, Math.min(5000, Number(s.burstInterval) || 300));

  await setBurstActive(true);
  let saved = 0;

  // 连拍期间全部静默，结束后统一汇总通知，避免每张弹提示
  for (let i = 0; i < count; i++) {
    if (!(await isBurstActive())) break;
    const ok = await captureOnce({ silent: true, pathOverride: s.burstPath });
    if (ok) saved++;
    if (i < count - 1) {
      if (!(await isBurstActive())) break;
      await sleep(interval);
    }
  }

  await setBurstActive(false);
  if (saved > 0) {
    await notifyUser("连拍完成", `已保存 ${saved} 张截图`);
  } else {
    await notifyUser("连拍失败", "未保存任何图片，请检查是否在 B 站视频页");
  }
}

// ---------- 命令入口 ----------

// 命令入口：captureVisibleTab 由 manifest 中的 "tabs" 权限覆盖（勿删）
chrome.commands.onCommand.addListener((command) => {
  if (command === "bili-screenshot") {
    captureOnce().catch((e) => console.error(e));
  } else if (command === "bili-burst") {
    toggleBurst().catch((e) => console.error(e));
  }
});

// ---------- 供设置页/页面内快捷键调用的消息 ----------
// 无需触发去重：Chrome 键事件分发互斥——组合键若被系统级命令层截获，
// 页面不会收到 keydown；页面内与系统级组合不同时，两路互不干扰。
// 对 burst 的 toggle 语义（再按停止）尤其不能吞第二次按键。

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "test-save") {
    testSave()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // 异步响应
  }
  // 页面内快捷键（content script keydown 监听触发）
  if (msg && msg.type === "trigger-capture") {
    captureOnce().catch((e) => console.error(e));
    sendResponse({ ok: true });
  } else if (msg && msg.type === "trigger-burst") {
    toggleBurst().catch((e) => console.error(e));
    sendResponse({ ok: true });
  }
});

async function testSave() {
  const s = await getSettings();
  const canvas = new OffscreenCanvas(320, 180);
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 320, 180);
  g.addColorStop(0, "#00A1D6");
  g.addColorStop(1, "#00485e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 320, 180);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("Bili Screenshot Test", 16, 44);
  ctx.font = "12px sans-serif";
  ctx.fillText(new Date().toLocaleString(), 16, 66);

  const isPng = s.format === "png";
  const blob = await canvas.convertToBlob({
    type: isPng ? "image/png" : "image/jpeg",
    quality: isPng ? undefined : Math.min(1, Math.max(0.05, s.jpegQuality / 100)),
  });
  const dataUrl = await blobToDataUrl(blob);
  const filename = buildFilename(s, { title: "test", bvid: "", progress: "00_00_00", duration: "00_00_00" }, 320, 180);
  const fullPath = buildPath(s.savePath, filename);
  await chrome.downloads.download({
    url: dataUrl,
    filename: fullPath,
    conflictAction: "uniquify",
    saveAs: false,
  });
  return { ok: true, path: fullPath };
}
