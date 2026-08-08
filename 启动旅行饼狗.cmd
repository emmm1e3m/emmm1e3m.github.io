@echo off
chcp 65001 >nul
setlocal EnableExtensions

cd /d "%~dp0"
if errorlevel 1 goto :fallback_error

where powershell.exe >nul 2>&1
if errorlevel 1 goto :fallback_error

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\start-travelling-bingo.ps1"
if errorlevel 1 goto :powershell_failed
goto :eof

:powershell_failed
echo.
pause
exit /b 1

:fallback_error
echo.
echo Unable to start the TravellingBingo launcher.
echo Please run scripts\dev\start-travelling-bingo.ps1 from Windows PowerShell.
echo.
pause
exit /b 1
