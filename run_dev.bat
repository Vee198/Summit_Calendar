@echo off
chcp 65001 >nul
title Summit Calendar - Dev Server

echo ============================================
echo   Summit Calendar Tracking - Dev Server
echo ============================================
echo.

:: ── Step 1: Activate Conda Environment ──
:: หมายเหตุ: ใน .bat file ต้องใช้ "call" เพราะไม่งั้น script จะหยุดทำงาน
:: และต้องรัน activate.bat ก่อนเพราะ .bat เปิดใน CMD ปกติ (ไม่ใช่ Anaconda Prompt)
:: แต่ถ้าพิมพ์เองใน Anaconda Prompt ไม่ต้องใช้ทั้ง call และ activate.bat
echo [1/4] Activating Conda environment "calendar"...
call C:\Users\vee\anaconda3\Scripts\activate.bat
call conda activate calendar
if errorlevel 1 (
    echo [ERROR] ไม่สามารถ activate conda environment "calendar" ได้
    echo         ลอง: conda create -n calendar nodejs
    pause
    exit /b 1
)
echo       ✓ Conda "calendar" activated
echo.

:: ── Step 2: Navigate to project folder ──
cd /d C:\Users\vee\Desktop\P_Tai_Project\Calendar
echo [2/4] Working directory: %cd%
echo.

:: ── Step 3: Install dependencies (if needed) ──
if not exist "node_modules" (
    echo [3/4] Installing npm dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install ล้มเหลว
        pause
        exit /b 1
    )
    echo       ✓ Dependencies installed
) else (
    echo [3/4] Dependencies already installed ✓
)
echo.

:: ── Step 4: Init local D1 database (if needed) ──
if not exist ".wrangler\state" (
    echo [4/4] Initializing local D1 database...
    call npx wrangler d1 execute summit-calendar-db --local --file=./schema.sql
    if errorlevel 1 (
        echo [WARNING] DB init อาจมีปัญหา แต่จะลอง dev server ต่อ
    ) else (
        echo       ✓ Local database initialized
    )
) else (
    echo [4/4] Local database already exists ✓
)
echo.

:: ── Start Dev Server ──
echo ============================================
echo   Starting wrangler dev server...
echo   กด Ctrl+C เพื่อหยุด
echo ============================================
echo.
call npx wrangler dev
