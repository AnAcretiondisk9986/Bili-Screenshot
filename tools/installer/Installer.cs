// Bili Screenshot — 一键安装器（方案 A：--load-extension 快捷方式）
// 编译：csc /target:winexe /codepage:65001 /r:System.Windows.Forms.dll /r:Microsoft.CSharp.dll
// 用法：BiliScreenshotInstaller.exe [install|uninstall]
// 原理：复制扩展到 %LOCALAPPDATA%\BiliScreenshot\extension\，
//       创建带 --load-extension 参数的 Chrome 快捷方式（桌面 + 开始菜单）。
//       不修改 Chrome 任何配置，官方支持的加载机制。

using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace BiliScreenshot
{
    internal static class Installer
    {
        private const string APP_NAME = "BiliScreenshot";
        private const string SHORTCUT_NAME = "B站截图浏览器.lnk";

        private static string ExtensionDir
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    APP_NAME, "extension");
            }
        }

        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                string action = (args != null && args.Length > 0) ? args[0].ToLowerInvariant() : "install";
                if (action == "install") return DoInstall();
                if (action == "uninstall") return DoUninstall();
                MessageBox.Show("用法：BiliScreenshotInstaller.exe [install|uninstall]",
                    "Bili Screenshot", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 1;
            }
            catch (Exception ex)
            {
                MessageBox.Show("操作失败：" + ex.Message,
                    "Bili Screenshot", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        private static int DoInstall()
        {
            string src = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "extension");
            if (!File.Exists(Path.Combine(src, "manifest.json")))
            {
                MessageBox.Show("未找到 extension 目录（应位于安装器同目录下）。",
                    "Bili Screenshot", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            string chrome = FindChrome();
            if (chrome == null)
            {
                MessageBox.Show("未找到 Google Chrome，请先安装 Chrome 再运行本安装器。",
                    "Bili Screenshot", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            if (IsRunning("chrome"))
            {
                DialogResult r = MessageBox.Show(
                    "检测到 Chrome 正在运行。\n安装后需要完全退出 Chrome，再通过新快捷方式启动才能加载扩展。\n\n要继续安装吗？",
                    "Bili Screenshot", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (r != DialogResult.Yes) return 0;
            }

            CopyDirectory(src, ExtensionDir);

            string loadArgs = "--load-extension=\"" + ExtensionDir + "\"";
            int created = 0;
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string startMenu = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Microsoft", "Windows", "Start Menu", "Programs");
            if (CreateShortcut(Path.Combine(desktop, SHORTCUT_NAME), chrome, loadArgs)) created++;
            if (CreateShortcut(Path.Combine(startMenu, SHORTCUT_NAME), chrome, loadArgs)) created++;

            if (created == 0)
            {
                MessageBox.Show("快捷方式创建失败，请检查权限。",
                    "Bili Screenshot", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            MessageBox.Show(
                "安装成功！\n\n" +
                "已在桌面和开始菜单创建「" + SHORTCUT_NAME + "」快捷方式。\n\n" +
                "使用方法：\n" +
                "1. 完全退出 Chrome\n" +
                "2. 双击「" + SHORTCUT_NAME + "」启动浏览器\n" +
                "3. 打开 B 站视频页，按 Ctrl+Shift+S 即可截图\n\n" +
                "说明：扩展只在该快捷方式启动的 Chrome 中生效；\n" +
                "卸载时重新运行本安装器选择卸载即可。",
                "Bili Screenshot", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        private static int DoUninstall()
        {
            string desktop = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), SHORTCUT_NAME);
            string startMenu = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Microsoft", "Windows", "Start Menu", "Programs", SHORTCUT_NAME);

            DeleteFileIfExists(desktop);
            DeleteFileIfExists(startMenu);
            DeleteDirIfExists(ExtensionDir);

            MessageBox.Show("卸载完成。", "Bili Screenshot",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        private static string FindChrome()
        {
            string[] keys = new string[]
            {
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
                @"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
                @"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
            };
            foreach (string key in keys)
            {
                object v = Registry.GetValue(key, "", null);
                if (v is string && File.Exists((string)v)) return (string)v;
            }
            string[] fallbacks = new string[]
            {
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"Google\Chrome\Application\chrome.exe"),
            };
            foreach (string p in fallbacks)
            {
                if (File.Exists(p)) return p;
            }
            return null;
        }

        private static bool IsRunning(string name)
        {
            return Process.GetProcessesByName(name).Length > 0;
        }

        private static void CopyDirectory(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            foreach (string file in Directory.GetFiles(src))
            {
                File.Copy(file, Path.Combine(dst, Path.GetFileName(file)), true);
            }
            foreach (string dir in Directory.GetDirectories(src))
            {
                CopyDirectory(dir, Path.Combine(dst, Path.GetFileName(dir)));
            }
        }

        private static bool CreateShortcut(string linkPath, string target, string arguments)
        {
            try
            {
                Type t = Type.GetTypeFromProgID("WScript.Shell");
                if (t == null) return false;
                dynamic shell = Activator.CreateInstance(t);
                dynamic sc = shell.CreateShortcut(linkPath);
                sc.TargetPath = target;
                sc.Arguments = arguments;
                sc.IconLocation = target + ",0";
                sc.WorkingDirectory = Path.GetDirectoryName(target);
                sc.Description = "B站视频截图浏览器（自动加载 Bili Screenshot 扩展）";
                sc.Save();
                return File.Exists(linkPath);
            }
            catch
            {
                return false;
            }
        }

        private static void DeleteFileIfExists(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { }
        }

        private static void DeleteDirIfExists(string path)
        {
            try { if (Directory.Exists(path)) Directory.Delete(path, true); } catch { }
        }
    }
}
