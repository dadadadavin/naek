@echo off
title naek - WhatsApp Remote Control for Antigravity
echo.
echo  ================================================
echo   naek - WhatsApp Remote Control for Antigravity
echo  ================================================
echo.

echo [1/2] Launching Antigravity with CDP on port 9222...
start "" antigravity . --remote-debugging-port=9222

echo Waiting 5 seconds for Antigravity to start...
timeout /t 5 /nobreak >nul

echo [2/2] Starting WhatsApp bot...
echo.
node src/index.js
pause
