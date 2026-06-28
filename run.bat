@echo off
title FFmpeg GUI - Starting...
cd /d "%~dp0"

echo ============================================
echo  FFmpeg GUI - Setup and Launch
echo ============================================
echo.

REM --- Check Python is installed ---
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python was not found on your PATH.
    echo Please install Python from https://www.python.org/downloads/
    echo IMPORTANT: during install, check the box "Add python.exe to PATH"
    echo.
    pause
    exit /b 1
)

REM --- Check ffmpeg is installed ---
where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo [WARNING] ffmpeg was not found on your PATH.
    echo The app will still start, but conversions will fail until you install ffmpeg.
    echo Get it from https://ffmpeg.org/download.html  ^(or run: winget install ffmpeg^)
    echo.
)

REM --- Create virtual environment if it doesn't exist yet ---
if not exist "venv\" (
    echo Creating a local Python environment ^(first run only, this takes a minute^)...
    python -m venv venv
)

REM --- Activate venv and install Flask ---
call venv\Scripts\activate.bat

echo Checking dependencies...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt

echo.
echo ============================================
echo  Starting server...
echo  Open this in your browser:  http://127.0.0.1:5000
echo  (Close this window to stop the server)
echo ============================================
echo.

REM --- Open browser automatically after a short delay ---
start "" cmd /c "timeout /t 2 >nul && start http://127.0.0.1:5000"

REM --- Run the app ---
python app.py

pause
