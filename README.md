# Bili Screenshot — B站视频截图扩展

在 B 站视频页按快捷键**静默保存**播放器画面到本地，无需弹窗确认。

## 功能

- 🎯 **一键静默截图**：快捷键直接保存，默认 `Ctrl+Shift+S`（Mac：`⌘+Shift+S`）
- ⌨️ **快捷键可自定义**：在扩展设置页点击输入框、按下新组合键即可直接更改（页面内快捷键），无需去浏览器设置
- 📁 **自定义保存路径**：下载目录内子目录，支持 `{date}` 变量（如 `BiliScreenshots/{date}/`）
- 🗂️ **连拍独立目录**：连拍图片单独保存到第三层目录（默认 `下载/BiliScreenshots/burst/`）
- 🖼️ **原始分辨率导出**：按视频源分辨率输出（1080P 源 → 1920×1080），而非屏幕所见
- 🗜️ **JPEG 质量压缩**：1–100% 可调；也可切换 PNG 无损
- 💬 **弹幕开关**：可选择截图是否带上当前弹幕
- 🔥 **连拍模式**：默认 `Ctrl+Shift+X` 连拍 6 张（间隔 300ms），再按一次停止
- 📝 **文件名模板**：`{date} {time} {bvid} {title} {progress} {duration} {width} {height}` 自由组合
- 🕘 **截图历史**：popup 中查看最近 100 条记录（缩略图 + 文件名 + 尺寸）
- 🔔 **轻提示**：保存成功显示扩展角标 ✓，可选系统通知

## 安装（开发者模式）

1. 打开 Chrome，进入 `chrome://extensions/`
2. 右上角开启 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择本目录（`D:\Bili-Screenshot`）
4. 打开任意 B 站视频页，按 `Ctrl+Shift+S` 即可截图

> 快捷键可在 `chrome://extensions/shortcuts` 中修改。

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

## 一键安装器（无需开发者模式）

如果目标用户不想手动开启开发者模式，可用 `release/` 下的安装器：

1. 解压 `bili-screenshot-installer-1.0.0.zip`
2. 双击 `BiliScreenshotInstaller.exe` → 自动完成：复制扩展到 `%LOCALAPPDATA%\BiliScreenshot\extension\`，并在桌面和开始菜单创建「B站截图浏览器」快捷方式
3. 完全退出 Chrome 后，双击该快捷方式启动浏览器，扩展即生效

- 卸载：再次运行安装器（或在命令行执行 `BiliScreenshotInstaller.exe uninstall`）
- 重新构建：运行 `tools/build_installer.cmd`（使用系统自带 .NET Framework 编译器，无第三方依赖）
- 工作原理：Chrome 官方支持的 `--load-extension` 启动参数，不修改 Chrome 任何配置

> 注意：扩展仅在该快捷方式启动的 Chrome 中生效；更新扩展版本时重新运行安装器覆盖即可。

## 项目结构

```
manifest.json        # MV3 清单
background.js        # Service Worker：快捷键、下载、连拍、历史、通知
content.js           # 页面内采集：canvas 合成（视频帧+弹幕层）与视口回退
options/             # 设置页
popup/               # 截图历史弹窗
icons/               # 扩展图标
tools/               # 构建脚本（图标生成、商店打包、安装器编译）
release/             # 发布产物（商店 zip / 安装器）
```

## 技术说明

- **主方案**：`content script` 将 `<video>` 当前帧绘制到 canvas（输出原始分辨率），按设置叠加弹幕 canvas 层，`toDataURL` 后交由 `background` 通过 `chrome.downloads` 静默保存
- **回退方案**：canvas 被跨域污染时（如视频直连 CDN），改用 `chrome.tabs.captureVisibleTab` 捕获视口并按播放器矩形裁剪（`OffscreenCanvas`），"不带弹幕"通过临时隐藏弹幕层实现
- 数据仅存本地：设置用 `chrome.storage.sync`，历史用 `chrome.storage.local`

## 已知限制

- 保存路径受 Chrome 安全模型限制，只能是下载目录内的相对路径（含子目录）
- 视口回退模式下，播放器需完整处于屏幕可见区域才能截全画面
- 截图时若视频正在播放，捕获的是按下快捷键那一刻的画面帧
