// Bili Screenshot — options 页面逻辑

"use strict";

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  savePath: "BiliScreenshots/{date}/",
  burstPath: "BiliScreenshots/burst/",
  format: "jpeg",
  jpegQuality: 90,
  includeDanmaku: true,
  filenameTemplate: "{date}_{time}_{bvid}_{title}_{progress}",
  burstCount: 6,
  burstInterval: 300,
  notifyOnSave: true,
  useSystemNotification: false,
  pageShortcutEnabled: true,
  shortcutCapture: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyS" },
  shortcutBurst: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyX" },
};

// ---------- 快捷键格式化 ----------

const KEY_NAMES = {
  Space: "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  IntlBackslash: "\\",
};

function prettyKey(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Numpad\d$/.test(code)) return "Num" + code.slice(6);
  return KEY_NAMES[code] || code;
}

function formatShortcut(s) {
  if (!s || !s.code) return "";
  const parts = [];
  if (s.ctrl) parts.push("Ctrl");
  if (s.alt) parts.push("Alt");
  if (s.shift) parts.push("Shift");
  if (s.meta) parts.push("⌘");
  parts.push(prettyKey(s.code));
  return parts.join("+");
}

function shortcutEqual(a, b) {
  if (!a || !b || !a.code || !b.code) return false;
  return (
    a.code === b.code &&
    !!a.ctrl === !!b.ctrl &&
    !!a.alt === !!b.alt &&
    !!a.shift === !!b.shift &&
    !!a.meta === !!b.meta
  );
}

// 系统级快捷键（manifest commands，Mac 为 Command 组合，其余平台为 Ctrl 组合）
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const DEFAULT_MOD = IS_MAC ? { ctrl: false, shift: true, alt: false, meta: true } : { ctrl: true, shift: true, alt: false, meta: false };

const SYSTEM_SHORTCUTS = [
  { name: "单张截图", combo: { ...DEFAULT_MOD, code: "KeyS" } },
  { name: "连拍", combo: { ...DEFAULT_MOD, code: "KeyX" } },
];

function readForm() {
  return {
    savePath: $("savePath").value.trim() || DEFAULTS.savePath,
    burstPath: $("burstPath").value.trim() || DEFAULTS.burstPath,
    format: document.querySelector('input[name="format"]:checked').value,
    jpegQuality: Number($("jpegQuality").value),
    includeDanmaku: $("includeDanmaku").checked,
    filenameTemplate: $("filenameTemplate").value.trim() || DEFAULTS.filenameTemplate,
    burstCount: Number($("burstCount").value) || 6,
    burstInterval: Number($("burstInterval").value) || 300,
    notifyOnSave: $("notifyOnSave").checked,
    useSystemNotification: $("useSystemNotification").checked,
    pageShortcutEnabled: $("pageShortcutEnabled").checked,
    shortcutCapture: window._scCapture || null,
    shortcutBurst: window._scBurst || null,
  };
}

function fillForm(s) {
  $("savePath").value = s.savePath;
  $("burstPath").value = s.burstPath;
  const fmtEl = document.querySelector(`input[name="format"][value="${s.format}"]`);
  if (fmtEl) fmtEl.checked = true;
  else document.querySelector('input[name="format"][value="jpeg"]').checked = true;
  $("jpegQuality").value = s.jpegQuality;
  $("qualityVal").textContent = s.jpegQuality;
  $("includeDanmaku").checked = s.includeDanmaku;
  $("filenameTemplate").value = s.filenameTemplate;
  $("burstCount").value = s.burstCount;
  $("burstInterval").value = s.burstInterval;
  $("notifyOnSave").checked = s.notifyOnSave;
  $("useSystemNotification").checked = s.useSystemNotification;
  $("pageShortcutEnabled").checked = s.pageShortcutEnabled;
  window._scCapture = s.shortcutCapture || null;
  window._scBurst = s.shortcutBurst || null;
  renderShortcuts();
  updateQualityRow();
  updatePreview();
}

function updateQualityRow() {
  const png = document.querySelector('input[name="format"]:checked').value === "png";
  $("jpegQuality").disabled = png;
  $("qualityRow").style.opacity = png ? 0.45 : 1;
}

function updatePreview() {
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const vars = {
    date: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    time: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    bvid: "BV1xx411c7mD",
    title: "示例视频标题",
    progress: "01_23_45",
    duration: "03_45_00",
    width: "1920",
    height: "1080",
  };
  const tpl = $("filenameTemplate").value;
  const name =
    tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : "")) ||
    "screenshot";
  const ext = document.querySelector('input[name="format"]:checked').value === "png" ? "png" : "jpg";
  $("preview").textContent = `${name}.${ext}`;
}

function setStatus(msg, isError) {
  const el = $("status");
  el.textContent = msg;
  el.className = isError ? "error" : "";
  setTimeout(() => (el.textContent = ""), 5000);
}

// ---------- 快捷键录制 ----------

function renderShortcuts() {
  $("shortcutCapture").value = formatShortcut(window._scCapture);
  $("shortcutBurst").value = formatShortcut(window._scBurst);
  updateConflictHint();
}

function updateConflictHint() {
  const el = $("shortcutConflict");
  const conflicts = [];
  const pairs = [
    ["shortcutCapture", "单张截图"],
    ["shortcutBurst", "连拍"],
  ];
  for (const [key, label] of pairs) {
    const combo = window[key === "shortcutCapture" ? "_scCapture" : "_scBurst"];
    if (!combo) continue;
    for (const sys of SYSTEM_SHORTCUTS) {
      if (shortcutEqual(combo, sys.combo)) {
        conflicts.push(
          `「${label}」与系统级快捷键「${sys.name}」相同，浏览器会优先响应系统级（效果一致）`
        );
      }
    }
  }
  if (window._scCapture && window._scBurst && shortcutEqual(window._scCapture, window._scBurst)) {
    conflicts.push("「单张截图」与「连拍」快捷键相同，建议区分");
  }
  el.textContent = conflicts.join("；");
}

let recording = null; // { key, el }

function startRecording(key, el) {
  stopRecording();
  recording = { key, el };
  el.classList.add("recording");
  el.value = "请按下新的组合键…";
  el.focus();
}

function stopRecording() {
  if (recording) {
    recording.el.classList.remove("recording");
    recording = null;
    renderShortcuts(); // 恢复输入框显示
  }
}

document.querySelectorAll("input.shortcut").forEach((el) => {
  el.addEventListener("focus", () => {
    const key = el.id; // shortcutCapture | shortcutBurst
    startRecording(key, el);
  });
  el.addEventListener("keydown", (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    // 纯修饰键按下时不结束录制
    if (/^(Control|Shift|Alt|Meta)$/.test(e.key)) return;
    const combo = {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
      code: e.code,
    };
    // 至少需要一个修饰键，避免裸键在 B 站页面打字时误触发截图
    if (!combo.ctrl && !combo.alt && !combo.shift && !combo.meta) {
      el.value = "请至少包含一个修饰键（Ctrl/Alt/Shift/⌘）";
      return;
    }
    window[recording.key === "shortcutCapture" ? "_scCapture" : "_scBurst"] = combo;
    stopRecording();
    renderShortcuts();
  });
});

document.querySelectorAll("[data-clear]").forEach((btn) => {
  btn.addEventListener("click", () => {
    window[btn.dataset.clear === "shortcutCapture" ? "_scCapture" : "_scBurst"] = null;
    renderShortcuts();
  });
});

// 恢复默认页面内快捷键（与 DEFAULTS 一致：Ctrl+Shift，跨平台统一，避免与 Mac 系统级 ⌘ 组合冲突）
$("resetShortcutsBtn").addEventListener("click", () => {
  window._scCapture = { ctrl: true, shift: true, alt: false, meta: false, code: "KeyS" };
  window._scBurst = { ctrl: true, shift: true, alt: false, meta: false, code: "KeyX" };
  renderShortcuts();
  setStatus("已恢复默认快捷键，记得点击「保存设置」");
});

document.addEventListener("click", (e) => {
  if (recording && !e.target.closest("input.shortcut")) stopRecording();
});

// ---------- 初始化 ----------

async function init() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  fillForm({ ...DEFAULTS, ...data });

  document.querySelectorAll('input[name="format"]').forEach((r) =>
    r.addEventListener("change", () => {
      updateQualityRow();
      updatePreview();
    })
  );
  $("jpegQuality").addEventListener("input", () => {
    $("qualityVal").textContent = $("jpegQuality").value;
  });
  $("filenameTemplate").addEventListener("input", updatePreview);
  $("savePath").addEventListener("input", updatePreview);

  $("saveBtn").addEventListener("click", async () => {
    stopRecording();
    try {
      await chrome.storage.sync.set(readForm());
      setStatus("✅ 设置已保存");
    } catch (e) {
      setStatus("保存失败：" + (e && e.message), true);
    }
  });

  $("testBtn").addEventListener("click", async () => {
    stopRecording();
    // 先保存当前表单，确保测试使用最新设置
    try {
      await chrome.storage.sync.set(readForm());
    } catch (e) { /* 忽略 */ }
    $("testBtn").disabled = true;
    $("testBtn").textContent = "测试中…";
    try {
      const resp = await chrome.runtime.sendMessage({ type: "test-save" });
      if (resp && resp.ok) {
        setStatus(`✅ 测试图片已保存到：下载/${resp.path}`);
      } else {
        setStatus("测试失败：" + ((resp && resp.error) || "未知错误"), true);
      }
    } catch (e) {
      setStatus("测试失败：" + (e && e.message), true);
    } finally {
      $("testBtn").disabled = false;
      $("testBtn").textContent = "测试保存一张";
    }
  });
}

init();
