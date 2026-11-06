@echo off
rem Scarica l'ultima versione del tavolo e ricrea TavoloDnD.exe. I dati (data.json) non vengono toccati.
cd /d "%~dp0"
tasklist /fi "imagename eq TavoloDnD.exe" | find /i "TavoloDnD.exe" >nul && (
  echo Chiudi prima il tavolo ^(la finestra di TavoloDnD^), poi riprova.
  pause & exit /b 1
)
git pull --ff-only || (echo Aggiornamento non riuscito: vedi il messaggio sopra. & pause & exit /b 1)
call npm install --no-audit --no-fund || (echo Installazione dei componenti non riuscita: serve internet. & pause & exit /b 1)
call npm run build || (echo Creazione dell'exe non riuscita. & pause & exit /b 1)
echo.
echo Fatto: TavoloDnD.exe e' aggiornato.
pause
