@echo off
setlocal
rem Build the BiliScreenshot installer exe using the .NET Framework csc compiler.
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo ERROR: csc.exe not found
  exit /b 1
)
set OUT=%~dp0..\release\installer\BiliScreenshotInstaller.exe
"%CSC%" /nologo /target:winexe /platform:anycpu /codepage:65001 /out:"%OUT%" /r:System.Windows.Forms.dll /r:Microsoft.CSharp.dll "%~dp0installer\Installer.cs"
if errorlevel 1 (
  echo ERROR: compile failed
  exit /b 1
)
echo BUILD OK: %OUT%
