// Crea TavoloDnD.exe: l'interfaccia React (Vite) + il server + la finestra (Electron) in un solo file, senza console.
const fs = require('fs');
const { execSync } = require('child_process');

// node diretto e non npx: i comandi .cmd di Windows si rompono se il percorso contiene "&" (come "D&D")
const run = cmd => execSync(cmd, { stdio: 'inherit' });
if (!fs.existsSync('node_modules/vite')) run('npm install');
run('node node_modules/vite/bin/vite.js build');
run('node node_modules/electron-builder/cli.js --win portable --publish never');
fs.copyFileSync('release/TavoloDnD.exe', 'TavoloDnD.exe');
console.log('Creato TavoloDnD.exe');
