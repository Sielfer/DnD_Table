// Controlli sulle funzioni che spostano e cancellano pezzi di mappa (npm test).
import assert from 'node:assert';
import { resizeMap, footprint, paintTile, floorOf, wallAt } from './src/map/geo.js';
import { drawMap } from './src/map/draw.js';

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

// allargare a sinistra e in alto, poi stringere dalle stesse parti: si torna alla mappa di partenza
const m = structuredClone(M0);
resizeMap(m, 'w', 1);
resizeMap(m, 'n', 1);
assert.deepStrictEqual([m.cols, m.rows, Object.keys(m.levels[0].tiles)], [3, 3, ['1,1', '2,2']]);
assert.deepStrictEqual(m.levels[0].objects.map(o => [o.x, o.y]), [[13, 13], [24, 25]]);
assert.deepStrictEqual(m.levels[0].fog.shown, { '1,1': 1 });
assert.strictEqual(resizeMap(m, 'w', -1) + resizeMap(m, 'n', -1), 0); // niente da perdere: era tutto vuoto
assert.deepStrictEqual(m, M0);

// allargare a destra o in basso non sposta niente
const r = structuredClone(M0);
resizeMap(r, 'e', 1);
resizeMap(r, 's', 1);
assert.deepStrictEqual(r.levels, M0.levels);

// stringere a destra toglie ciò che restava fuori e dice quanto
const s = structuredClone(M0);
assert.strictEqual(resizeMap(s, 'e', -1), 2); // il tassello 1,1 e il tavolo
assert.deepStrictEqual([Object.keys(s.levels[0].tiles), s.levels[0].objects.map(o => o.id)], [['0,0'], ['a']]);
assert.deepStrictEqual(Object.keys(s.levels[0].edges).sort(), ['-1,0,e', '0,0,e']);

// la misura di un oggetto: quella scelta, quella vecchia delle statue (n), o quella del disegno
assert.deepStrictEqual([footprint({ type: 'table', rot: 1, w: 4, h: 2 }), footprint({ type: 'statue', rot: 0, n: 3 }), footprint({ type: 'bed', rot: 0 })], [[2, 4], [3, 3], [1, 2]]);

// il pennello: un corridoio accanto a una stanza apre il passaggio da solo; la gomma lo richiude
const lv = { tiles: { '0,0': { kind: 'm' } }, edges: {} };
paintTile(lv, 1, 0, false, { kind: 'corr', w: 2, terrain: 'pietra' });
assert.deepStrictEqual(lv.edges, { '0,0,e': 1 });
paintTile(lv, 1, 0, true, {});
assert.deepStrictEqual([Object.keys(lv.tiles), lv.edges], [['0,0'], {}]);

// corridoio spostato in alto accanto a una stanza: la stanza apre il passaggio lì, senza muro in mezzo
const cl = { tiles: { '0,0': { kind: 'm' } }, edges: {} };
paintTile(cl, 1, 0, false, { kind: 'corr', w: 2, terrain: 'pietra', oy: -1 });
assert.deepStrictEqual([cl.tiles['1,0'].oy, cl.edges], [-3, { '0,0,e': 1 }]);
const cm = { ...cl, cols: 2, rows: 1 }, { F } = floorOf(cm);
assert.ok(F(12, 1) && F(12, 2) && !F(12, 4), 'il corridoio corre sulle righe 1-2');
assert.ok(F(9, 1) && F(9, 2), 'la stanza apre il varco dove arriva il corridoio');
assert.ok(!wallAt(cm, F, 9, 1, true) && wallAt(cm, F, 9, 3, true), 'nessun muro sul passaggio, muro dove il corridoio non arriva');
// due corridoi spostati in modo diverso si incontrano con un gomito sul confine
const cj = { tiles: { '0,0': { kind: 'corr', w: 2, oy: -3 }, '1,0': { kind: 'corr', w: 2 } }, edges: { '0,0,e': 1 }, cols: 2, rows: 1 };
const FJ = floorOf(cj).F;
assert.ok(FJ(9, 1) && FJ(9, 5) && FJ(10, 5) && !wallAt(cj, FJ, 9, 5, true), 'il gomito unisce le righe 1-2 alle righe 4-5');
// un corridoio al centro resta com'era: largo 3 m sulle righe 4-5
const cc = { tiles: { '0,0': { kind: 'corr', w: 2 }, '1,0': { kind: 'corr', w: 2 } }, edges: { '0,0,e': 1 }, cols: 2, rows: 1 };
assert.deepStrictEqual([3, 4, 5, 6].map(y => !!floorOf(cc).F(10, y)), [false, true, true, false]);

// il disegno di una mappa con tutto dentro non va in errore e mette segnalini e note
const svg = drawMap({ ...M0.levels[0], cols: 2, rows: 2, id: 'm', name: 'Prova', lvId: 'L', tokens: { c1: { lv: 'L', x: 1, y: 1 } } }, 'note',
  { chars: { c1: { id: 'c1', name: 'Aria <b>', size: 'Grande' } }, me: 'u', master: true, zoom: 20 });
assert.ok(svg.includes('data-cid="c1"') && svg.includes('data-note="n"') && svg.includes('Aria &lt;b&gt;'));
console.log('ok mappe');
