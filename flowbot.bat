@echo off
REM Flow Automator - control de los servicios del autopiloto.
REM Uso: flowbot [start|stop|status]
set "SCRIPTS=%~dp0scripts"

if "%~1"==""           goto usage
if /I "%~1"=="start"   goto start
if /I "%~1"=="-start"  goto start
if /I "%~1"=="stop"    goto stop
if /I "%~1"=="-stop"   goto stop
if /I "%~1"=="status"  goto status
if /I "%~1"=="-status" goto status
if /I "%~1"=="restart" goto restart
goto usage

:start
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS%\flowbot_start.ps1"
goto :eof

:stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS%\flowbot_stop.ps1"
goto :eof

:status
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS%\flowbot_status.ps1"
goto :eof

:restart
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS%\flowbot_stop.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS%\flowbot_start.ps1"
goto :eof

:usage
echo Uso: flowbot [start^|stop^|status^|restart]
echo   start    Levanta dev-server (puente) + render watch de Remotion
echo   stop     Detiene ambos
echo   status   Estado de ambos + puerto 35729
echo   restart  Reinicia ambos
goto :eof
