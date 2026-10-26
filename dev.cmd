@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22 LTS, then run this tool again.
  pause
  exit /b 1
)
node scripts\dev.cjs %*
set "DEV_EXIT_CODE=%ERRORLEVEL%"
if not "%DEV_EXIT_CODE%"=="0" pause
exit /b %DEV_EXIT_CODE%
