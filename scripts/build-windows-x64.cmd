@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1" -Arch x64 %*
