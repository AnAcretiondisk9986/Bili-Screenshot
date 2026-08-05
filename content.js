// Bili Screenshot — content script
// 职责：在 B 站页面内完成截图采集。
// 主方案：把 <video> 当前帧绘制到 canvas（输出视频原始分辨率），
//         可选叠加弹幕层；若 canvas 被跨域污染则回退到视口捕获模式。

(function () {
  "use strict";
  // 防重复注入：ensureContent 在页面导航期间可能重复注入，直接忽略副本
  if (window.__BILI_SCREENSHOT_LOADED__) return;
  window.__BILI_SCREENSHOT_LOADED__ = true;

  // ---------- 页面信息 ----------

  function getVideoTitle() {
    const h1 = document.querySelector("h1.video-title");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    let t = document.title
      .replace(/[_-]\s*哔哩哔哩\s*[_-]?\s*bilibili\s*$/i, "")
      .replace(/\s*$/, "")
      .trim();
    return t || "bilibili";
  }

  function getBvid() {
    const m = /\/video\/(BV[a-zA-Z0-9]+)/.exec(location.pathname);
    return m ? m[1] : "";
  }

  function findVideo() {
    const videos = Array.from(document.querySelectorAll("video")).filter(
      (v) => v.videoWidth > 0 || v.readyState > 0
    );
    if (!videos.length) return null;
    // 优先当前正在播放的，其次画面尺寸最大的
    const playing = videos.find((v) => !v.paused && !v.ended);
    if (playing) return playing;
    return videos.sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight)[0];
  }

  // ---------- 弹幕层查找 ----------

  function findDanmakuCanvas(video) {
    // 播放器容器：新播放器 .bpx-player-container，旧播放器 .bilibili-player
    const container =
      video.closest(".bpx-player-container") ||
      video.closest(".bilibili-player") ||
      video.closest("[class*='player']") ||
      document.body;

    // 1) 按已知类名匹配
    const byClass = container.querySelector(
      ".bpx-danmaku-canvas, .bilibili-danmaku-canvas, canvas[class*='danmaku'], canvas[class*='Danmaku']"
    );
    if (byClass && byClass.width > 0) return byClass;

    // 2) 兜底：画面尺寸与 video 显示尺寸接近、且非隐藏的 canvas
    const vw = video.clientWidth, vh = video.clientHeight;
    if (vw <= 0 || vh <= 0) return null;
    const candidates = Array.from(container.querySelectorAll("canvas")).filter((c) => {
      const r = c.getBoundingClientRect();
      const visible = r.width > 10 && r.height > 10 &&
        getComputedStyle(c).display !== "none" && getComputedStyle(c).visibility !== "hidden";
      if (!visible) return false;
      const match =
        Math.abs(r.width - vw) <= 2 && Math.abs(r.height - vh) <= 2 ||
        Math.abs(c.width - vw) <= 2 && Math.abs(c.height - vh) <= 2;
      return match;
    });
    // 取内容面积最大的（视频帧 canvas 不存在，弹幕层通常是唯一大 canvas）
    candidates.sort((a, b) => b.width * b.height - a.width * a.height);
    return candidates[0] || null;
  }

  // ---------- 主方案：canvas 合成 ----------

  // 返回 { ok, dataUrl, width, height }；canvas 被污染时返回 { ok:false, tainted:true }
  function composeFrame(video, includeDanmaku) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return { ok: false, tainted: false, reason: "no-video-data" };

    const canvas = document.createElement("canvas");
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, vw, vh);

    if (includeDanmaku) {
      const dm = findDanmakuCanvas(video);
      if (dm) ctx.drawImage(dm, 0, 0, vw, vh);
    }

    // 污染探测（跨域直连视频会污染 canvas，此时导出会抛 SecurityError）
    try {
      ctx.getImageData(0, 0, 1, 1);
    } catch (e) {
      return { ok: false, tainted: true, reason: "tainted" };
    }
    return { ok: true, canvas };
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const p = (n) => String(n).padStart(2, "0");
    return `${p(h)}_${p(m)}_${p(s)}`;
  }

  function canvasToDataUrl(canvas, format, quality) {
    if (format === "png") return canvas.toDataURL("image/png");
    return canvas.toDataURL("image/jpeg", quality);
  }

  // 小尺寸缩略图，用于历史记录（JPEG q55，宽 256）
  function makeThumb(canvas) {
    try {
      const scale = Math.min(1, 256 / canvas.width);
      const tw = Math.max(1, Math.round(canvas.width * scale));
      const th = Math.max(1, Math.round(canvas.height * scale));
      const c = document.createElement("canvas");
      c.width = tw;
      c.height = th;
      c.getContext("2d").drawImage(canvas, 0, 0, tw, th);
      return c.toDataURL("image/jpeg", 0.55);
    } catch (e) {
      return null;
    }
  }

  // ---------- 回退方案：视口捕获辅助 ----------

  let pendingRestore = null;

  // 隐藏/恢复弹幕层（视口捕获模式下控制是否带弹幕）
  function setDanmakuVisible(video, visible) {
    const dm = findDanmakuCanvas(video);
    if (!dm) return false;
    if (visible) {
      dm.style.removeProperty("display");
      dm.style.removeProperty("visibility");
    } else {
      dm.style.setProperty("display", "none", "important");
    }
    return true;
  }

  // 视口捕获模式第一步：content 侧准备（可选隐藏弹幕），返回裁剪矩形
  async function prepareViewport(video, includeDanmaku) {
    const rect = video.getBoundingClientRect();
    const r = {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      dpr: window.devicePixelRatio || 1,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    };
    if (r.width < 2 || r.height < 2) return { ...r, invalid: true };

    const hidden = includeDanmaku ? false : setDanmakuVisible(video, false);
    if (hidden) {
      // 等浏览器完成一次合成，再让 background 去捕获
      await new Promise((res) => setTimeout(res, 120));
    }
    return { ...r, danmakuHidden: hidden };
  }

  function restoreDanmaku() {
    const v = findVideo();
    if (v) setDanmakuVisible(v, true);
    pendingRestore = null;
  }

  // ---------- 消息入口 ----------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "ping") {
      sendResponse({ pong: true });
      return;
    }
    if (msg.type !== "capture") return;

    const video = findVideo();
    if (!video) {
      sendResponse({ ok: false, reason: "no-video" });
      return;
    }

    const format = msg.format === "png" ? "png" : "jpeg";
    const quality = Math.min(1, Math.max(0.05, Number(msg.quality) || 0.9));
    const includeDanmaku = !!msg.includeDanmaku;

    const info = {
      title: getVideoTitle(),
      bvid: getBvid(),
      progress: formatTime(video.currentTime),
      duration: formatTime(video.duration),
    };

    const composed = composeFrame(video, includeDanmaku);    if (composed.ok) {
      try {
        const dataUrl = canvasToDataUrl(composed.canvas, format, quality);
        const thumb = makeThumb(composed.canvas);
        sendResponse({
          ok: true,
          mode: "canvas",
          dataUrl,
          thumb,
          width: composed.canvas.width,
          height: composed.canvas.height,
          ...info,
        });
      } catch (e) {
        sendResponse({ ok: false, reason: "export-failed" });
      }
      return;
    }

    // canvas 被污染（跨域直连）→ 回退视口捕获
    if (composed.tainted) {
      prepareViewport(video, includeDanmaku).then((r) => {
        sendResponse({
          ok: true,
          mode: "viewport",
          rect: r,
          width: r.width,
          height: r.height,
          danmakuHidden: r.danmakuHidden,
          ...info,
        });
        if (r.danmakuHidden) {
          pendingRestore = setTimeout(restoreDanmaku, 20000); // 兜底恢复
        }
      });
      return;
    }

    sendResponse({ ok: false, reason: composed.reason || "no-video-data" });
  });

  // 复制当前画面到剪贴板（PNG 无损，含/不含弹幕按设置）
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "copy") return;

    const video = findVideo();
    if (!video) {
      sendResponse({ ok: false, reason: "no-video" });
      return;
    }

    const composed = composeFrame(video, !!msg.includeDanmaku);
    if (!composed.ok) {
      sendResponse({ ok: false, reason: composed.tainted ? "tainted" : composed.reason });
      return;
    }

    composed.canvas.toBlob(async (blob) => {
      if (!blob) {
        sendResponse({ ok: false, reason: "export-failed" });
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        sendResponse({ ok: true, width: composed.canvas.width, height: composed.canvas.height });
      } catch (e) {
        sendResponse({ ok: false, reason: "clipboard-denied" });
      }
    }, "image/png");
    return true; // 异步 sendResponse
  });

  // background 捕获完成后通知恢复弹幕
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "restore-danmaku") {
      if (pendingRestore) {
        clearTimeout(pendingRestore);
        pendingRestore = null;
      }
      restoreDanmaku();
    }
  });

  // ---------- 页面内快捷键（可在扩展设置页直接修改） ----------

  let shortcutSettings = {
    pageShortcutEnabled: true,
    shortcutCapture: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyS" },
    shortcutBurst: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyX" },
    shortcutCopy: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyZ" },
  };

  function matchesShortcut(e, s) {
    if (!s || !s.code) return false;
    return (
      e.code === s.code &&
      !!e.ctrlKey === !!s.ctrl &&
      !!e.shiftKey === !!s.shift &&
      !!e.altKey === !!s.alt &&
      !!e.metaKey === !!s.meta
    );
  }

  async function loadShortcutSettings() {
    try {
      const data = await chrome.storage.sync.get({
        pageShortcutEnabled: true,
        shortcutCapture: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyS" },
        shortcutBurst: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyX" },
        shortcutCopy: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyZ" },
      });
      shortcutSettings = data;
    } catch (e) {
      /* storage 不可用时保持默认 */
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const key of ["pageShortcutEnabled", "shortcutCapture", "shortcutBurst", "shortcutCopy"]) {
      if (changes[key]) shortcutSettings[key] = changes[key].newValue;
    }
  });

  loadShortcutSettings();

  document.addEventListener(
    "keydown",
    (e) => {
      if (!shortcutSettings.pageShortcutEnabled) return;
      if (matchesShortcut(e, shortcutSettings.shortcutCapture)) {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: "trigger-capture" }).catch(() => {});
      } else if (matchesShortcut(e, shortcutSettings.shortcutBurst)) {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: "trigger-burst" }).catch(() => {});
      } else if (matchesShortcut(e, shortcutSettings.shortcutCopy)) {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: "trigger-copy" }).catch(() => {});
      }
    },
    true // capture 阶段，尽早拦截
  );
})();
