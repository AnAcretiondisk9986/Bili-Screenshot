# Bili Screenshot — B站视频截图扩展

在 B 站视频页按快捷键**静默保存**播放器画面到本地，无需弹窗确认。

## 通用安装步骤（开发者模式）

本扩展兼容所有 Chromium 内核浏览器（Chrome、Edge、360 等），以下方法通用，无需商店上架：

1. **获取源码**：
   - 在 [GitHub 仓库](https://github.com/AnAcretiondisk9986/Bili-Screenshot) 页面点击绿色 **Code** 按钮 → **Download ZIP**（或直接到 [Releases](https://github.com/AnAcretiondisk9986/Bili-Screenshot/releases) 下载 `bili-screenshot-1.1.0.zip`）
   - 解压到任意位置，确认 `manifest.json` 在解压目录的**根目录**（不要在压缩包内再嵌套一层文件夹）
2. **打开扩展管理页**：
   - Chrome：地址栏输入 `chrome://extensions/` 回车
   - Edge：地址栏输入 `edge://extensions/` 回车
   - 其他浏览器：设置 → 扩展/扩展程序
3. **开启「开发者模式」**：页面右上角（Edge 在左侧）打开开关
4. 点击 **「加载已解压的扩展程序」**，选择解压后的目录
5. 完成！打开任意 B 站视频页，按 `Ctrl+Shift+S` 即可截图

> **两种安装方式怎么选**：
> - 本方法（开发者模式）— 通用、永久生效、跟随代码更新，适合自己用或任何浏览器
> - 商店版 — 发布后可在 Chrome Web Store / Edge Add-ons 搜索安装

## 功能

- **一键静默截图**：快捷键直接保存，默认 `Ctrl+Shift+S`（Mac：`⌘+Shift+S`）
- **快捷键可自定义**：在扩展设置页点击输入框、按下新组合键即可直接更改（页面内快捷键），无需去浏览器设置
- **自定义保存路径**：下载目录内子目录，支持 `{date}` 变量（如 `BiliScreenshots/{date}/`）
- **连拍独立目录**：连拍图片单独保存到第三层目录（默认 `下载/BiliScreenshots/burst/`）
- **原始分辨率导出**：按视频源分辨率输出（1080P 源 → 1920×1080），而非屏幕所见
- **JPEG 质量压缩**：1–100% 可调；也可切换 PNG 无损
- **弹幕开关**：可选择截图是否带上当前弹幕
- **连拍模式**：默认 `Ctrl+Shift+X` 连拍 6 张（间隔 300ms），再按一次停止
- **文件名模板**：`{date} {time} {bvid} {title} {progress} {duration} {width} {height}` 自由组合
- **截图历史**：popup 中查看最近 100 条记录（缩略图 + 文件名 + 尺寸）
- **轻提示**：保存成功显示扩展角标提示，可选系统通知

## 使用说明

| 操作 | 默认快捷键 | 在哪改 |
| --- | --- | --- |
| 单张截图 | `Ctrl+Shift+S` / `⌘+Shift+S` | 扩展**设置页**（页面内快捷键）或 `chrome://extensions/shortcuts`（系统级） |
| 连拍（再按停止） | `Ctrl+Shift+X` / `⌘+Shift+X` | 同上 |

- 单张截图保存在 **浏览器下载目录** 下的 `BiliScreenshots/<日期>/`（可在设置中修改）
- **连拍**图片单独保存到 `BiliScreenshots/burst/`（可在设置中修改，同样支持 `{date}`）
- 文件名示例：`20260805_173012_BV1xx411c7mD_示例视频标题_01_23_45.jpg`
- 截图导出的是**视频原始分辨率**；若视频源为跨域直连导致画布受限，会自动回退为"视口捕获"模式（此时为屏幕所见分辨率）
- 设置页（右键扩展图标 → 选项）可随时**测试保存**，验证路径与质量配置

### 关于快捷键

- **页面内快捷键**（推荐）：在扩展设置页点击输入框、直接按下组合键即可录制，保存后立即生效（需 B 站页面获得焦点）；该快捷键受浏览器/系统占用组合影响，若按下无反应请换一组键
- **系统级快捷键**：由浏览器拦截，任何状态下都可靠，但只能在 `chrome://extensions/shortcuts` 修改（Chrome API 限制）
- 两者可并存：若配置相同组合，浏览器优先响应系统级，行为一致无冲突


## 项目结构

```
manifest.json        # MV3 清单
background.js        # Service Worker：快捷键、下载、连拍、历史、通知
content.js           # 页面内采集：canvas 合成（视频帧+弹幕层）与视口回退
options/             # 设置页
popup/               # 截图历史弹窗
icons/               # 扩展图标
tools/               # 构建脚本（图标生成、商店打包）
release/             # 发布产物（商店 zip）
```

## 技术说明

- **主方案**：`content script` 将 `<video>` 当前帧绘制到 canvas（输出原始分辨率），按设置叠加弹幕 canvas 层，`toDataURL` 后交由 `background` 通过 `chrome.downloads` 静默保存
- **回退方案**：canvas 被跨域污染时（如视频直连 CDN），改用 `chrome.tabs.captureVisibleTab` 捕获视口并按播放器矩形裁剪（`OffscreenCanvas`），"不带弹幕"通过临时隐藏弹幕层实现
- 数据仅存本地：设置用 `chrome.storage.sync`，历史用 `chrome.storage.local`

## 已知限制

- 保存路径受 Chrome 限制，只能是下载目录内的相对路径（含子目录）
- 视口回退模式下，播放器需完整处于屏幕可见区域才能截全画面
- 截图时若视频正在播放，捕获的是按下快捷键那一刻的画面帧
