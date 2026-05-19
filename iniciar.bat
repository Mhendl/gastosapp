@echo off
echo Iniciando GastosIA...

echo [1/2] Iniciando Backend...
start "GastosIA Backend" cmd /k "cd /d %~dp0backend && npm start"

timeout /t 2 /nobreak > nul

echo [2/2] Iniciando Frontend...
start "GastosIA Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Abriendo el navegador en http://localhost:5173
timeout /t 3 /nobreak > nul
start http://localhost:5173
