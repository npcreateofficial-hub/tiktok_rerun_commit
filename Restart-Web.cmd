@echo off
echo Restarting Studio in web-only mode.
echo Stop any live streams before using this launcher.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-Web.ps1"
if errorlevel 1 goto failed
set "NP_TIKTOK_VISIBLE=0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Web.ps1"
if errorlevel 1 goto failed
exit /b 0
:failed
echo Could not restart. Please keep this message for diagnosis.
pause
exit /b 1
