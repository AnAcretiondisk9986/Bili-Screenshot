@echo off
setlocal
rem Build the single-file BiliScreenshot installer exe.
rem The extension files are embedded into the exe (base64 in EmbeddedFiles.cs),
rem so the exe is self-contained and can be distributed as a single file.
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo ERROR: csc.exe not found
  exit /b 1
)
set OUT=%~dp0..\release\installer\BiliScreenshotInstaller.exe
set EMBED=%~dp0installer\_embedded\EmbeddedFiles.cs

echo [1/2] Generating embedded files...
python "%~dp0installer\generate_embedded.py" "%EMBED%"
if errorlevel 1 (
  echo ERROR: generate embedded files failed
  exit /b 1
)

echo [2/2] Compiling...
"%CSC%" /nologo /target:winexe /platform:anycpu /codepage:65001 /out:"%OUT%" /r:System.Windows.Forms.dll /r:Microsoft.CSharp.dll "%~dp0installer\Installer.cs" "%EMBED%"
if errorlevel 1 (
  echo ERROR: compile failed
  exit /b 1
)
echo BUILD OK: %OUT%
