@echo off
cd /d "%~dp0"

echo ============================================
echo  Git Push to GitHub
echo ============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Git not found. Install from https://git-scm.com/
    pause
    exit /b 1
)

REM --- Init repo if not already ---
if not exist ".git\" (
    echo Initializing git repo...
    git init
    git remote add origin https://github.com/Caramel0784/Make-FFMPEG-easy-again.git
)

REM --- Create .gitignore if not exists ---
if not exist ".gitignore" (
    echo Creating .gitignore...
    (
        echo venv/
        echo uploads/
        echo outputs/
        echo __pycache__/
        echo *.pyc
        echo *.log
    ) > .gitignore
)

set /p msg=Commit message (or press Enter for "update"): 
if "%msg%"=="" set msg=update

git add .
git commit -m "%msg%"
git branch -M main
git push -u origin main

echo.
echo ============================================
echo  Done! Check: https://github.com/Caramel0784/Make-FFMPEG-easy-again
echo ============================================
pause
