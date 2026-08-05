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
  shortcutCopy: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyZ" },
  copyAlsoSave: false,
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
  // Mac 上 Command+Shift+Z 是浏览器重做快捷键，故复制用 Command+Shift+C
  { name: "复制", combo: { ctrl: !IS_MAC, shift: true, alt: false, meta: IS_MAC, code: IS_MAC ? "KeyC" : "KeyZ" } },
];

// 快捷键录入框与内存变量映射
const SC_MAP = {
  shortcutCapture: "_scCapture",
  shortcutBurst: "_scBurst",
  shortcutCopy: "_scCopy",
};

function readForm() {
  return {
    savePath: $("savePath").value.trim() || DEFAULTS.savePath,
    burstPath: $("burstPath").value.trim() || DEFAULTS.burstPath,
    format: document.querySelector('input[name="format"]:checked').value,
    jpegQuality: Number($("jpegQuality").value),
    includeDanmaku: $("includeDanmaku").checked,
    filenameTemplate: serializeModules(),
    burstCount: Number($("burstCount").value) || 6,
    burstInterval: Number($("burstInterval").value) || 300,
    notifyOnSave: $("notifyOnSave").checked,
    useSystemNotification: $("useSystemNotification").checked,
    pageShortcutEnabled: $("pageShortcutEnabled").checked,
    shortcutCapture: window._scCapture || null,
    shortcutBurst: window._scBurst || null,
    shortcutCopy: window._scCopy || null,
    copyAlsoSave: $("copyAlsoSave").checked,
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
  $("burstCount").value = s.burstCount;
  $("burstInterval").value = s.burstInterval;
  $("notifyOnSave").checked = s.notifyOnSave;
  $("useSystemNotification").checked = s.useSystemNotification;
  $("pageShortcutEnabled").checked = s.pageShortcutEnabled;
  $("copyAlsoSave").checked = !!s.copyAlsoSave;
  window._scCapture = s.shortcutCapture || null;
  window._scBurst = s.shortcutBurst || null;
  window._scCopy = s.shortcutCopy || null;
  renderShortcuts();
  // 空字符串表示用户清空了模板（保存后 background 会回退为 screenshot_时间）
  window._tplModules = s.filenameTemplate ? parseTemplateToModules(s.filenameTemplate) : [];
  updateQualityRow();
  renderModules();
}

function updateQualityRow() {
  const png = document.querySelector('input[name="format"]:checked').value === "png";
  $("jpegQuality").disabled = png;
  $("qualityRow").style.opacity = png ? 0.45 : 1;
}

function updatePreview() {
  const name = tplPreviewName() || "screenshot";
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
  $("shortcutCopy").value = formatShortcut(window._scCopy);
  updateConflictHint();
}

function updateConflictHint() {
  const el = $("shortcutConflict");
  const conflicts = [];
  const pairs = [
    ["shortcutCapture", "单张截图"],
    ["shortcutBurst", "连拍"],
    ["shortcutCopy", "复制"],
  ];
  for (const [id, label] of pairs) {
    const combo = window[SC_MAP[id]];
    if (!combo) continue;
    for (const sys of SYSTEM_SHORTCUTS) {
      if (shortcutEqual(combo, sys.combo)) {
        conflicts.push(
          `「${label}」与系统级快捷键「${sys.name}」相同，浏览器会优先响应系统级（效果一致）`
        );
      }
    }
  }
  const seen = {};
  for (const id of Object.keys(SC_MAP)) {
    const combo = window[SC_MAP[id]];
    if (!combo) continue;
    const sig = `${combo.code}|${combo.ctrl}|${combo.alt}|${combo.shift}|${combo.meta}`;
    if (seen[sig]) {
      const label = pairs.find((p) => p[0] === id)[1];
      const other = pairs.find((p) => p[0] === seen[sig])[1];
      conflicts.push(`「${label}」与「${other}」快捷键相同，建议区分`);
    }
    seen[sig] = id;
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
    window[SC_MAP[recording.key]] = combo;
    stopRecording();
    renderShortcuts();  });
});

document.querySelectorAll("[data-clear]").forEach((btn) => {
  btn.addEventListener("click", () => {
    window[SC_MAP[btn.dataset.clear]] = null;
    renderShortcuts();
  });
});

// 恢复默认页面内快捷键（与 DEFAULTS 一致：Ctrl+Shift，跨平台统一，避免与 Mac 系统级 ⌘ 组合冲突）
$("resetShortcutsBtn").addEventListener("click", () => {
  window._scCapture = { ctrl: true, shift: true, alt: false, meta: false, code: "KeyS" };
  window._scBurst = { ctrl: true, shift: true, alt: false, meta: false, code: "KeyX" };
  window._scCopy = { ctrl: true, shift: true, alt: false, meta: false, code: "KeyZ" };
  renderShortcuts();
  setStatus("已恢复默认快捷键，记得点击「保存设置」");
});

document.addEventListener("click", (e) => {
  if (recording && !e.target.closest("input.shortcut")) stopRecording();
});

// ---------- 文件名模板拖拽构建器 ----------

const TPL_VARS = [
  { key: "date", label: "日期", example: "20260805" },
  { key: "time", label: "时间", example: "173012" },
  { key: "bvid", label: "视频编号", example: "BV1xx411c7mD" },
  { key: "title", label: "视频标题", example: "示例视频标题" },
  { key: "progress", label: "当前进度", example: "01_23_45" },
  { key: "duration", label: "视频时长", example: "03_45_00" },
  { key: "width", label: "宽度", example: "1920" },
  { key: "height", label: "高度", example: "1080" },
];

// 模块：{ type: "var" | "text", value: 变量key 或 文本内容 }
window._tplModules = [];

function parseTemplateToModules(str) {
  const modules = [];
  const re = /\{([A-Za-z]\w*)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) modules.push({ type: "text", value: str.slice(last, m.index) });
    const known = TPL_VARS.some((v) => v.key === m[1]);
    modules.push(known ? { type: "var", value: m[1] } : { type: "text", value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < str.length) modules.push({ type: "text", value: str.slice(last) });
  return modules;
}

function serializeModules() {
  return window._tplModules
    .map((mod) => (mod.type === "var" ? "{" + mod.value + "}" : mod.value))
    .join("");
}

function tplPreviewName() {
  return window._tplModules
    .map((mod) => {
      if (mod.type === "var") {
        const v = TPL_VARS.find((x) => x.key === mod.value);
        return v ? v.example : "";
      }
      return mod.value;
    })
    .join("");
}

function tplVarLabel(key) {
  const v = TPL_VARS.find((x) => x.key === key);
  return v ? v.label : key;
}

function renderLibrary() {
  const lib = $("tplLibrary");
  lib.innerHTML = "";
  for (const v of TPL_VARS) {
    const chip = document.createElement("span");
    chip.className = "tpl-lib-chip";
    chip.textContent = v.label;
    chip.title = "示例：" + v.example;
    chip.draggable = true;
    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ type: "var", value: v.key }));
      e.dataTransfer.effectAllowed = "copy";
    });
    lib.appendChild(chip);
  }
}

function renderModules() {
  const zone = $("tplDropzone");
  zone.querySelectorAll(".tpl-chip").forEach((el) => el.remove());
  const mods = window._tplModules;
  $("tplPlaceholder").style.display = mods.length ? "none" : "";
  mods.forEach((mod, idx) => {
    const chip = document.createElement("span");
    chip.className = "tpl-chip " + (mod.type === "var" ? "var" : "text");
    chip.draggable = true;
    chip.title = "拖动排序";
    chip.textContent = mod.type === "var" ? tplVarLabel(mod.value) : mod.value;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "×";
    del.title = "删除";
    del.addEventListener("click", () => {
      window._tplModules.splice(idx, 1);
      renderModules();
    });
    chip.appendChild(del);

    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ type: "move", index: idx }));
      e.dataTransfer.effectAllowed = "move";
      chip.classList.add("dragging");
    });
    chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
    zone.appendChild(chip);
  });
  $("filenameTemplateRaw").value = serializeModules();
  updatePreview();
}

function getInsertIndex(clientX, clientY) {
  // 找与鼠标最近的 chip（行权重高于列，适配多行布局），
  // 再按鼠标在其左/右半区决定插入到它之前或之后
  const chips = Array.from($("tplDropzone").querySelectorAll(".tpl-chip"));
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < chips.length; i++) {
    const r = chips[i].getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const d = Math.abs(dx) + Math.abs(dy) * 3;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best === -1) return 0;
  const r = chips[best].getBoundingClientRect();
  return clientX < r.left + r.width / 2 ? best : best + 1;
}

function initTemplateBuilder() {
  renderLibrary();
  const zone = $("tplDropzone");

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    let data = null;
    try {
      data = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch (err) {
      return;
    }
    if (!data) return;
    let idx = getInsertIndex(e.clientX, e.clientY);
    const mods = window._tplModules;
    if (data.type === "var") {
      mods.splice(idx, 0, { type: "var", value: data.value });
    } else if (data.type === "move") {
      const from = data.index;
      if (from < 0 || from >= mods.length) return;
      const mod = mods.splice(from, 1)[0];
      if (idx > from) idx--;
      mods.splice(idx, 0, mod);
    }
    renderModules();
  });

  $("addTextBtn").addEventListener("click", () => {
    const t = prompt("输入自定义文本（可用作分隔符或前缀，如 _ - [ ]）", "_");
    if (t === null) return;
    window._tplModules.push({ type: "text", value: t });
    renderModules();
  });

  $("applyRawBtn").addEventListener("click", () => {
    const str = $("filenameTemplateRaw").value;
    window._tplModules = str.trim() ? parseTemplateToModules(str) : [];
    renderModules();
    setStatus("已应用字符串到构建区");
  });
}

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
  $("savePath").addEventListener("input", updatePreview);

  initTemplateBuilder();

  $("saveBtn").addEventListener("click", async () => {
    stopRecording();
    try {
      await chrome.storage.sync.set(readForm());
      setStatus("设置已保存");
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
        setStatus(`测试图片已保存到：下载/${resp.path}`);
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
