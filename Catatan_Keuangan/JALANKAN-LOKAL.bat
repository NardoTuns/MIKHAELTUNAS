@echo off
title Catatan Keuangan - Server Lokal
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8080"
  node server-lokal.js
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  echo Node.js tidak ada, memakai Python...
  start "" "http://localhost:8080"
  python -m http.server 8080
  goto :eof
)
echo.
echo  Node.js atau Python belum terpasang.
echo  Pasang Node.js dari https://nodejs.org lalu jalankan file ini lagi.
pause
