// Bili Screenshot — 截图历史二级页面

"use strict";

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

async function render() {
  const { history = [] } = await chrome.storage.local.get("history");
  const list = document.getElementById("history");
  const empty = document.getElementById("empty");
  list.innerHTML = "";
  empty.style.display = history.length ? "none" : "block";

  for (const item of history) {
    const li = document.createElement("li");

    const img = document.createElement("img");
    img.className = "thumb";
    if (item.thumb) {
      img.src = item.thumb;
    } else {
      img.src = "../icons/icon48.png";
      img.style.opacity = "0.35";
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = item.filename;
    name.title = item.filename;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent =
      `${formatTime(item.ts)} · ${item.width || "?"}×${item.height || "?"} · ` +
      `${formatSize(item.size || 0)}` +
      (item.bvid ? ` · ${item.bvid}` : "");

    meta.appendChild(name);
    meta.appendChild(sub);
    li.appendChild(img);
    li.appendChild(meta);
    list.appendChild(li);
  }
}

document.getElementById("clearBtn").addEventListener("click", async () => {
  if (!confirm("确定清空全部截图记录？")) return;
  await chrome.storage.local.set({ history: [] });
  render();
});

render();
