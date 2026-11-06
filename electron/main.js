// TavoloDnD.exe: il server del tavolo e la sua finestra, senza console e senza aprire il browser.
// I giocatori si collegano dal browser dei loro telefoni o PC, come prima.
const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');

// data.json accanto all'exe. L'exe "portable" si scompatta in una cartella temporanea: la sua vera cartella è in PORTABLE_EXECUTABLE_DIR.
process.env.TAVOLO_DIR ||= app.isPackaged ? process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath) : path.join(__dirname, '..');

let win = null;
// Un tavolo solo: un secondo doppio clic porta in primo piano la finestra già aperta.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    let server;
    try {
      server = require('../server.js'); // legge data.json: può fallire se il file è rovinato o la cartella non si può scrivere
      await server.start();
    } catch (e) {
      dialog.showErrorBox('Tavolo D&D 3.5', e.code === 'EADDRINUSE'
        ? `La porta ${server.PORT} è già usata da un altro programma, quindi il tavolo non può accendersi. Chiudi quel programma e riprova.`
        : `Il tavolo non è partito: ${e.message}\n\nCartella dei dati: ${process.env.TAVOLO_DIR}`);
      return app.quit();
    }
    win = new BrowserWindow({
      width: 1400, height: 900, minWidth: 420, minHeight: 500, title: 'Tavolo D&D 3.5', autoHideMenuBar: true,
      backgroundColor: '#0d0f15', show: false,
      icon: path.join(__dirname, 'icon.png'),
    });
    win.removeMenu();
    win.once('ready-to-show', () => { win.maximize(); win.show(); });
    // i link verso fuori si aprono nel browser, non dentro la finestra del tavolo
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    win.loadURL(`http://localhost:${server.PORT}/`);
    win.on('closed', () => { win = null; });
  });
  // chiudendo la finestra il tavolo si spegne, dopo aver salvato
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { try { require.cache[require.resolve('../server.js')]?.exports.flush(); } catch {} });
}
