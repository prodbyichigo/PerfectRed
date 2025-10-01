@echo off
setlocal
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo ❌ Node.js is not installed. Please install it first:
  echo 👉 https://nodejs.org/
  exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo ❌ npm is not installed. Please install Node.js (npm comes with it).
  exit /b 1
)

echo ✅ Node.js and npm are installed.
echo 📦 Installing dependencies...
npm install

if %errorlevel% equ 0 (
  echo 🎉 Installation complete!
) else (
  echo ⚠️ npm install failed.
  exit /b 1
)
