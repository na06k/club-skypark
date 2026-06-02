@echo off
setlocal
set "BACKEND_DIR=%~dp0backend"
set "APP_URL=http://localhost:3000/login.html"
if not exist "%BACKEND_DIR%\package.json" (
  echo Backend folder not found. Please keep this file inside the club-skypark folder.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not available in PATH.
  echo Please install Node.js, then open this launcher again.
  pause
  exit /b 1
)
if not exist "%BACKEND_DIR%\node_modules" (
  echo First time setup: installing backend dependencies...
  cd /d "%BACKEND_DIR%"
  call npm install
  if errorlevel 1 (
    echo npm install failed. Please check your internet and try again.
    pause
    exit /b 1
  )
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$backend=$env:BACKEND_DIR; $url=$env:APP_URL; $ok=$false; try { $r=Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/api/health' -TimeoutSec 3; if ($r.StatusCode -eq 200) { $ok=$true } } catch {}; if (-not $ok) { Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm start' -WorkingDirectory $backend -WindowStyle Hidden; Start-Sleep -Seconds 4 }; Start-Process $url"
endlocal
