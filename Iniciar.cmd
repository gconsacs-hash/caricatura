@echo off
title Caricatura - Loomis / Kascht
cd /d "%~dp0"
echo.
echo   Iniciando Caricatura...
echo.
start "" http://localhost:3300
node servidor.js
pause
