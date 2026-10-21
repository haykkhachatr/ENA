@echo off
rem Rebuilds data\network-data.js from a line.geojson export, then reports the result.
rem Usage: rebuild_data.bat [path\to\line.geojson]   (default: ..\..\HEC_JSON\line.geojson)
python "%~dp0build_data.py" %*
if errorlevel 1 (echo Build failed - is Python 3 installed and on PATH? & pause & exit /b 1)
echo.
echo Done. Refresh index.html in the browser.
pause
