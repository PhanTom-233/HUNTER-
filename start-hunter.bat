@echo off
title HUNTER - Penetration Test Workflow Manager
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node

if not exist "dist\index.html" goto no_build
if not exist "dist-server\server.bundle.cjs" goto no_build
if not exist "scripts\launch.mjs" goto no_build

node "scripts\launch.mjs"
exit /b %ERRORLEVEL%

:no_node
echo.
echo   [X] Node.js was not found on this computer.
echo.
echo       HUNTER needs Node.js 18 or newer.
echo         1. Open  https://nodejs.org  in your browser
echo         2. Download the LTS version, install it (keep clicking Next)
echo         3. Double-click start-hunter.bat again
echo.
echo       Python is NOT required. You do NOT need to run "npm install".
echo.
pause
exit /b 1

:no_build
echo.
echo   [X] Some files are missing from this folder.
echo.
echo       Expected: dist\index.html, dist-server\server.bundle.cjs,
echo                 scripts\launch.mjs
echo.
echo       Please extract the WHOLE zip again (do not drag out single
echo       files), then double-click start-hunter.bat.
echo.
pause
exit /b 1
