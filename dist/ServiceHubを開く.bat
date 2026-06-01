@echo off
chcp 65001 >/dev/null
rem ============================================================
rem  Service Hub 起動ボタン (Windows)
rem  このファイルをダブルクリックすると standalone.html を自動で探して
rem  既定のブラウザで開きます。standalone.html と同じフォルダ（ダウンロード等）
rem  に置いてください。
rem ============================================================
setlocal
cd /d "%~dp0"
set "TARGET="
if exist "%~dp0standalone.html" set "TARGET=%~dp0standalone.html"
if not defined TARGET if exist "%USERPROFILE%\Downloads\standalone.html" set "TARGET=%USERPROFILE%\Downloads\standalone.html"
if not defined TARGET if exist "%USERPROFILE%\Desktop\standalone.html" set "TARGET=%USERPROFILE%\Desktop\standalone.html"
if defined TARGET (
  echo Service Hub を開いています...
  start "" "%TARGET%"
  exit /b 0
)
echo.
echo  standalone.html が見つかりませんでした。
echo  この .bat と standalone.html を同じフォルダに置いてから、もう一度ダブルクリックしてください。
echo.
pause
