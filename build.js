// Crea TavoloDnD.exe (accanto a data.json): Node + server.js + index.html in un unico file (Node Single Executable Application).
const fs = require('fs');
const { execSync } = require('child_process');

const run = cmd => execSync(cmd, { stdio: 'inherit' });
const exe = process.platform === 'win32' ? 'TavoloDnD.exe' : 'TavoloDnD';

fs.writeFileSync('sea-config.json', JSON.stringify({
  main: 'server.js',
  output: 'sea-prep.blob',
  assets: { 'index.html': 'index.html' },
  disableExperimentalSEAWarning: true,
}));
run('node --experimental-sea-config sea-config.json');
fs.copyFileSync(process.execPath, exe);
run(`npx --yes postject@1.0.0-alpha.6 ${exe} NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2${process.platform === 'darwin' ? ' --macho-segment-name NODE_SEA' : ''}`);
fs.rmSync('sea-prep.blob');
fs.rmSync('sea-config.json');
console.log(`Creato ${exe}`);
