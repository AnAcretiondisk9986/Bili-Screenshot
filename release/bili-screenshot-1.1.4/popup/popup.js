// Bili Screenshot — popup 轻量入口页

"use strict";

// ---------- 快捷键格式化（与 options.js 保持一致） ----------

// Mac 上 ⌘+Shift+Z 是浏览器重做快捷键，复制默认用 ⌘+Shift+C（与 manifest 命令一致）
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

const PAGE_SHORTCUT_DEFAULTS = {
  shortcutCapture: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyQ" },
  shortcutBurst: { ctrl: true, shift: true, alt: false, meta: false, code: "KeyX" },
  shortcutCopy: IS_MAC
    ? { ctrl: false, shift: true, alt: false, meta: true, code: "KeyC" }
    : { ctrl: true, shift: true, alt: false, meta: false, code: "KeyZ" },
};

// manifest 命令名 → 功能名（用于 chrome.commands.getAll 结果映射）
const SYS_CMD_MAP = {
  "bili-screenshot": "sysCapture",
  "bili-burst": "sysBurst",
  "bili-copy": "sysCopy",
};

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
  if (!s || !s.code) return "未设置";
  const parts = [];
  if (s.ctrl) parts.push("Ctrl");
  if (s.alt) parts.push("Alt");
  if (s.shift) parts.push("Shift");
  if (s.meta) parts.push("⌘");
  parts.push(prettyKey(s.code));
  return parts.join("+");
}

// ---------- 初始化 ----------

async function init() {
  // 页面内快捷键：读取用户实际配置（未配置时用默认值）
  try {
    const data = await chrome.storage.sync.get(PAGE_SHORTCUT_DEFAULTS);
    document.getElementById("scCapture").textContent = formatShortcut(data.shortcutCapture);
    document.getElementById("scBurst").textContent = formatShortcut(data.shortcutBurst);
    document.getElementById("scCopy").textContent = formatShortcut(data.shortcutCopy);
  } catch (e) {
    /* storage 异常时保持占位符，不影响菜单按钮 */
  }

  // 系统级快捷键：读取浏览器里实际生效的值（用户可在 chrome://extensions/shortcuts 修改）
  try {
    const cmds = await chrome.commands.getAll();
    for (const cmd of cmds) {
      const elId = SYS_CMD_MAP[cmd.name];
      if (!elId) continue;
      const el = document.getElementById(elId);
      if (el) el.textContent = cmd.shortcut || "未设置";
    }
  } catch (e) {
    /* 忽略：极旧浏览器不支持 commands API 时保持占位符 */
  }
}

document.getElementById("historyBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("history/history.html") });
});

document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init();
