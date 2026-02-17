@echo off
cd /d "%~dp0"
start "" http://localhost:3200/
node server.js
