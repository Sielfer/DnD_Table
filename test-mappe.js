// Controlli sulle funzioni della pagina che spostano e cancellano pezzi di mappa (npm test).
// Esegue lo script di index.html con un finto browser intorno, poi prova le funzioni.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
// un oggetto che accetta qualunque proprietà e chiamata: basta perché lo script parta senza un vero browser
const fake = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : fake), apply: () => fake, construct: () => fake });
const ctx = vm.createContext({
  document: fake, localStorage: { getItem: () => null, setItem() {} }, matchMedia: () => fake, addEventListener() {},
  fetch: () => new Promise(() => {}), EventSource: fake, location: fake, alert() {}, confirm: () => true, prompt: () => null,
  setTimeout, clearTimeout, console, structuredClone, innerWidth: 1000, innerHeight: 800,
});
vm.runInContext(script, ctx);
// copia via JSON: gli array creati nella pagina hanno un altro prototipo e assert non li confronterebbe
const run = code => { const v = vm.runInContext(code, ctx); return v === undefined ? v : JSON.parse(JSON.stringify(v)); };

// una mappa 2×2 con un po' di tutto, anche sul bordo
const map = () => ({
  id: 'm', cols: 2, rows: 2, levels: [{
    id: 'L', z: 0, tiles: { '0,0': { kind: 'm' }, '1,1': { kind: 'corr', w: 2 } }, edges: { '-1,0,e': 2, '0,0,e': 1, '1,0,s': 5 },
    edoor: { '0,0,e': { n: 2, f: 1 } }, fog: { on: true, shown: { '0,0': 1 } },
    objects: [{ id: 'a', type: 'barrel', x: 3, y: 3, rot: 0 }, { id: 'b', type: 'table', x: 14, y: 15, rot: 0, w: 4, h: 2 }],
    doors: [{ id: 'd', v: true, x: 10, y: 12, n: 2, s: 2 }], notes: [{ id: 'n', text: 'x', x: 5, y: 5, ax: 12, ay: 12, on: false }],
  }],
});
const M0 = map();
ctx.M0 = M0;

// allargare a sinistra e in alto, poi stringere dalle stesse parti: si torna alla mappa di partenza
run(`var m = structuredClone(M0); resizeMap(m, 'w', 1); resizeMap(m, 'n', 1);`);
assert.deepStrictEqual([run('m.cols'), run('m.rows'), Object.keys(run('m.levels[0].tiles'))], [3, 3, ['1,1', '2,2']]);
assert.deepStrictEqual(run('m.levels[0].objects.map(o => [o.x, o.y])'), [[13, 13], [24, 25]]);
assert.deepStrictEqual(run('m.levels[0].fog.shown'), { '1,1': 1 });
assert.strictEqual(run(`resizeMap(m, 'w', -1) + resizeMap(m, 'n', -1)`), 0); // niente da perdere: era tutto vuoto
assert.deepStrictEqual(run('m'), M0);

// allargare a destra o in basso non sposta niente
run(`var r = structuredClone(M0); resizeMap(r, 'e', 1); resizeMap(r, 's', 1);`);
assert.deepStrictEqual(run('r.levels'), M0.levels);

// stringere a destra toglie ciò che restava fuori e dice quanto
run(`var s = structuredClone(M0);`);
assert.strictEqual(run(`resizeMap(s, 'e', -1)`), 2); // il tassello 1,1 e il tavolo
assert.deepStrictEqual([Object.keys(run('s.levels[0].tiles')), run('s.levels[0].objects.map(o => o.id)')], [['0,0'], ['a']]);
assert.deepStrictEqual(Object.keys(run('s.levels[0].edges')).sort(), ['-1,0,e', '0,0,e']);

// la misura di un oggetto: quella scelta, quella vecchia delle statue (n), o quella del disegno
assert.deepStrictEqual(run(`[footprint({ type: 'table', rot: 1, w: 4, h: 2 }), footprint({ type: 'statue', rot: 0, n: 3 }), footprint({ type: 'bed', rot: 0 })]`), [[2, 4], [3, 3], [1, 2]]);
console.log('ok mappe');
