@echo off
setlocal enabledelayedexpansion
title naek - WhatsApp Remote Control for Antigravity

echo.
echo  ================================================
echo   naek - WhatsApp Remote Control for Antigravity
echo  ================================================
echo.

REM Move to directory where script is located
cd /d "%~dp0"

REM Parse .env file
set CDP_PORT=9222
set PROJECT_DIR=%CD%

if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if "%%A"=="CDP_PORT" set CDP_PORT=%%B
        if "%%A"=="PROJECT_DIR" set PROJECT_DIR=%%B
    )
)

echo [1/2] Launching Antigravity...
echo       Project Dir: !PROJECT_DIR!
echo       CDP Port   : !CDP_PORT!

start "" antigravity "!PROJECT_DIR!" --remote-debugging-port=!CDP_PORT!

echo Waiting 5 seconds for Antigravity to boot...
timeout /t 5 /nobreak >nul

echo [2/2] Starting WhatsApp bot...
echo.
node src/index.js
pause
