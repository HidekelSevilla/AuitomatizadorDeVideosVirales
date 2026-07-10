@echo off
rem Supervisor del bridge de Telegram: si el proceso crashea (red caida, excepcion, etc.)
rem lo reinicia solo a los 5s. El offset persistido (.flowbot-telegram-offset.json) evita
rem re-procesar mensajes viejos, y el bridge ya ignora comandos de mas de 5 min.
cd /d "%~dp0.."
:loop
node scripts\telegram-bridge.mjs
echo [%date% %time%] bridge termino (code %errorlevel%); reinicio en 5s... (Ctrl+C para salir)
timeout /t 5 /nobreak >nul
goto loop
