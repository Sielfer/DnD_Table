// --- Mappe a tasselli: dati e regole, senza disegno né pagina (si provano con npm test) ---
// Tassello = 10×10 quadretti da 1,5 m (15 m di lato). I passaggi stanno sempre al centro di ogni lato,
// così due tasselli vicini si congiungono nello stesso punto qualunque sia il loro tipo.
import { num, rid } from '../util.js';

export const TILE = 10, GATE = [3, 7]; // varco: quadretti 3..6 di ogni lato
export const MAX_TILES = 40; // per lato: 600 m
export const TERRAIN = { pietra: 'Pietra', legno: 'Legno', erba: 'Erba', sabbia: 'Sabbia', acqua: 'Acqua', lava: 'Lava' };
export const WATER = [['#4a82bb', 'Limpida'], ['#1f4a7a', 'Profonda'], ['#7d7a45', 'Impura'], ['#4d6b3b', 'Palude'], ['#5e4a30', 'Fogna'], ['#b8e2ef', 'Gelida'], ['#7b3fae', 'Magica']];
export const hex = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : WATER[0][0]); // il colore finisce in un attributo SVG: solo #rrggbb
export const KINDS = [['corr', 'Corridoio'], ['s', 'Stanza piccola'], ['m', 'Stanza media'], ['l', 'Stanza grande'], ['vuoto', 'Roccia']];
const MARGIN = { s: 2, m: 1, l: 0 };
// Stati di un lato. I numeri 0-3 sono quelli delle prime mappe: non cambiarli.
export const E = { muro: 0, passaggio: 1, porta: 2, aperto: 3, portaAperta: 4, finestra: 5, finestraAperta: 6 };
export const GLYPH = new Set([E.porta, E.portaAperta, E.finestra, E.finestraAperta]);
export const TOGGLE = { [E.porta]: E.portaAperta, [E.portaAperta]: E.porta, [E.finestra]: E.finestraAperta, [E.finestraAperta]: E.finestra };
export const EDGE_TOOLS = [[E.muro, 'Muro'], [E.passaggio, 'Passaggio'], [E.porta, 'Porta'], [E.finestra, 'Finestra'], [E.aperto, 'Aperto'], ['toggle', 'Apri / chiudi'], ['flip', 'Senso di apertura']];
export const DOOR_LENS = [[0, 'Tutto il varco'], [1, '1,5 m'], [2, '3 m'], [3, '4,5 m']]; // larghezza di porte e finestre, in quadretti
export const MODES = [['brush', 'Tasselli', '🧱'], ['edge', 'Porte e passaggi', '🚪'], ['obj', 'Oggetti', '🪑'], ['tok', 'Personaggi', '♟️'], ['note', 'Note', '📝'], ['fog', 'Nebbia', '🌫️']];
// Ogni lato è salvato una volta sola, sul tassello a ovest ("e") o a nord ("s"): i due vicini lo condividono.
export const edgeKey = (x, y, d) => (d === 'n' ? `${x},${y - 1},s` : d === 'w' ? `${x - 1},${y},e` : `${x},${y},${d}`);
export const edgeOf = (m, x, y, d) => m.edges?.[edgeKey(x, y, d)] || 0;

// Un corridoio si può spostare nel suo tassello (ox, oy in quadretti: + verso destra / verso il basso).
// Di quanto al massimo: resta sempre un quadretto di roccia tra il corridoio e il bordo.
export const corrStep = w => (TILE - (num(w) || 2)) / 2 - 1;
const isFloor = t => t && t.kind !== 'vuoto';
// Il tratto di un lato (in quadretti dall'inizio del lato) dove passa il tassello: il suo corridoio, o il varco centrale.
function laneOf(t, d) {
  if (t.kind !== 'corr') return GATE;
  const w = num(t.w) || 2, lo = (TILE - w) / 2 + num(d === 'e' || d === 'w' ? t.oy : t.ox);
  return [lo, lo + w];
}
// Il varco sul lato d del tassello tx,ty: abbastanza largo per i due tasselli che ci si affacciano.
// Così una stanza accanto a un corridoio spostato apre il passaggio proprio dove arriva il corridoio.
export function edgeSpan(m, tx, ty, d) {
  const [nx, ny, nd] = { n: [tx, ty - 1, 's'], s: [tx, ty + 1, 'n'], w: [tx - 1, ty, 'e'], e: [tx + 1, ty, 'w'] }[d];
  const a = m.tiles?.[tx + ',' + ty], b = m.tiles?.[nx + ',' + ny];
  const lanes = [isFloor(a) && laneOf(a, d), isFloor(b) && laneOf(b, nd)].filter(Boolean);
  return lanes.length ? [Math.min(...lanes.map(l => l[0])), Math.max(...lanes.map(l => l[1]))] : GATE;
}

// Quadretti calpestabili di un tassello (10×10 booleani), dai suoi parametri e dai lati aperti.
export function tileMask(m, tx, ty) {
  const f = Array.from({ length: TILE }, () => Array(TILE).fill(false));
  const t = m.tiles?.[tx + ',' + ty];
  if (!isFloor(t)) return f;
  const fill = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f[y][x] = true; };
  const open = d => edgeOf(m, tx, ty, d);
  if (t.kind === 'corr') {
    // il quadrato centrale del corridoio, spostato se serve, e i bracci verso i lati aperti
    const w = num(t.w) || 2, a = (TILE - w) / 2, x0 = a + num(t.ox), y0 = a + num(t.oy), x1 = x0 + w, y1 = y0 + w;
    fill(x0, y0, x1, y1);
    if (open('n')) fill(x0, 0, x1, y0);
    if (open('s')) fill(x0, y1, x1, TILE);
    if (open('w')) fill(0, y0, x0, y1);
    if (open('e')) fill(x1, y0, TILE, y1);
    // accanto a un corridoio spostato in modo diverso: un gomito sul confine, così i due si incontrano
    for (const [d, nx, ny] of [['n', tx, ty - 1], ['s', tx, ty + 1], ['w', tx - 1, ty], ['e', tx + 1, ty]]) {
      if (!open(d) || m.tiles?.[nx + ',' + ny]?.kind !== 'corr') continue;
      const [lo, hi] = edgeSpan(m, tx, ty, d);
      if (d === 'n') fill(lo, 0, hi, w); else if (d === 's') fill(lo, TILE - w, hi, TILE);
      else if (d === 'w') fill(0, lo, w, hi); else fill(TILE - w, lo, TILE, hi);
    }
    return f;
  }
  const g = MARGIN[t.kind] ?? 1, h = TILE - g;
  fill(g, g, h, h);
  const arm = d => edgeSpan(m, tx, ty, d);
  if (open('n')) { const [lo, hi] = arm('n'); fill(lo, 0, hi, g); }
  if (open('s')) { const [lo, hi] = arm('s'); fill(lo, h, hi, TILE); }
  if (open('w')) { const [lo, hi] = arm('w'); fill(0, lo, g, hi); }
  if (open('e')) { const [lo, hi] = arm('e'); fill(h, lo, TILE, hi); }
  return f;
}

// Pavimento quadretto per quadretto: il materiale (per l'acqua anche il colore), o null per la roccia.
export function floorOf(m) {
  const W = m.cols * TILE, H = m.rows * TILE;
  const floor = Array.from({ length: H }, () => Array(W).fill(null));
  for (let ty = 0; ty < m.rows; ty++) for (let tx = 0; tx < m.cols; tx++) {
    const t = m.tiles?.[tx + ',' + ty], ter = t?.terrain, c = ter === 'acqua' ? 'acqua' + hex(t.water) : TERRAIN[ter] ? ter : 'pietra';
    tileMask(m, tx, ty).forEach((row, y) => row.forEach((on, x) => { if (on) floor[ty * TILE + y][tx * TILE + x] = c; }));
  }
  return { floor, F: (x, y) => x >= 0 && y >= 0 && x < W && y < H && floor[y][x] };
}

// C'è un muro sul lato tra il quadretto (x,y) e quello a destra (right) o sotto? (senza contare le porte spostate)
export function wallAt(m, F, x, y, right) {
  const A = F(x, y), B = right ? F(x + 1, y) : F(x, y + 1);
  if (!A && !B) return false;
  let wall = !(A && B);
  if ((right ? x + 1 : y + 1) % TILE === 0) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), s = m.edges?.[`${tx},${ty},${right ? 'e' : 's'}`] || 0;
    const [lo, hi] = edgeSpan(m, tx, ty, right ? 'e' : 's'), p = (right ? y : x) % TILE, inGate = p >= lo && p < hi;
    if (A && B) wall = !(s === E.aperto || (s && inGate));
    else if (inGate && GLYPH.has(s)) wall = false; // porta o finestra verso la roccia o il bordo: c'è il disegno
  }
  return wall;
}

// Porte e finestre spostate a mano: { v: verticale, x, y, n: lunghezza, s: stato }, sulla linea x (v) o y.
export const doorFits = (m, F, { v, x, y, n }) => Array.from({ length: n }, (_, i) => (v ? wallAt(m, F, x - 1, y + i, true) : wallAt(m, F, x + i, y - 1, false))).every(Boolean);
// La posizione lungo un muro più vicina al puntatore (entro 2 quadretti), o null.
export function doorSnap({ view, F, n }, sx, sy) {
  let best = null, bd = Infinity;
  for (const v of [true, false]) {
    const cx = Math.round(v ? sx : sx - n / 2), cy = Math.round(v ? sy - n / 2 : sy);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const at = { v, x: cx + i, y: cy + j, n }, d = Math.hypot(at.x + (v ? 0 : n / 2) - sx, at.y + (v ? n / 2 : 0) - sy);
      if (d < bd && doorFits(view, F, at)) { best = at; bd = d; }
    }
  }
  return best;
}

// --- Oggetti sui quadretti ---
// [larghezza, lunghezza, nome, gruppo] in quadretti a rotazione 0; la scala "sale" verso l'alto del disegno.
export const OBJ = {
  stairs: [2, 3, 'Scala', 'pass'], spiral: [2, 2, 'Scala a chiocciola', 'pass'], ladder: [1, 2, 'Scala a pioli', 'pass'], well: [2, 2, 'Pozzo', 'pass'], hole: [2, 2, 'Buco nel soffitto', 'pass'], pit: [2, 2, 'Buco nel pavimento', 'pass'],
  bed: [1, 2, 'Letto', 'arredo'], chair: [1, 1, 'Sedia', 'arredo'], table: [2, 1, 'Tavolo', 'arredo'], barrel: [1, 1, 'Barile', 'arredo'], crate: [1, 1, 'Cassa', 'arredo'],
  chest: [1, 1, 'Baule', 'arredo'], mirror: [1, 1, 'Specchio', 'arredo'], rug: [2, 3, 'Tappeto', 'arredo'], shelf: [2, 1, 'Libreria', 'arredo'], wardrobe: [2, 1, 'Armadio', 'arredo'],
  brazier: [1, 1, 'Braciere', 'arredo'], statue: [1, 1, 'Statua', 'arredo'], altar: [2, 1, 'Altare', 'arredo'],
  throne: [2, 2, 'Trono', 'regale'], canopy: [2, 3, 'Letto a baldacchino', 'regale'], banquet: [4, 2, 'Tavolo da banchetto', 'regale'], carpet: [2, 6, 'Passatoia reale', 'regale'],
  candelabra: [1, 1, 'Candelabro', 'regale'], banner: [1, 1, 'Stendardo', 'regale'], coffer: [1, 1, 'Forziere reale', 'regale'], fountain: [2, 2, 'Fontana', 'regale'],
  bush: [1, 1, 'Cespuglio', 'natura'], tree: [2, 2, 'Albero', 'natura'], boulder: [1, 1, 'Masso', 'natura'],
};
export const OBJ_GROUPS = [['pass', 'Scale e buchi'], ['arredo', 'Arredo'], ['regale', 'Regale'], ['natura', 'Natura']];
export const CLIMB = new Set(['stairs', 'spiral', 'ladder']);
export const ROUND = new Set(['spiral', 'well', 'hole', 'pit', 'barrel', 'brazier', 'bush', 'tree', 'candelabra', 'fountain']); // non si ruotano
export const FLAT = new Set(['rug', 'carpet']); // stanno sotto a tutto il resto
export const VEG = new Set(['bush', 'tree']);
export const VEG_STATES = [['lush', 'Rigogliosa'], ['dry', 'Secca'], ['inf', 'Infestata']];
export const ruinLabel = t => (OBJ[t]?.[3] === 'pass' ? 'Rovinata (inagibile)' : t === 'boulder' ? 'Spaccato' : t === 'candelabra' ? 'Spento' : t === 'fountain' ? 'Secca e rotta' : 'Rotto');
// Misure a scelta [larghezza, lunghezza, nome] in quadretti; l'oggetto le salva in w e h.
export const SIZE_OPTS = {
  table: [[2, 1, 'Piccolo'], [3, 2, 'Medio'], [4, 2, 'Grande'], [6, 2, 'Lungo']],
  shelf: [[2, 1, 'Corta'], [3, 1, 'Media'], [4, 1, 'Lunga'], [6, 1, 'Lunghissima']],
  stairs: [[1, 3, 'Stretta'], [2, 3, 'Normale'], [3, 4, 'Larga'], [4, 6, 'Monumentale']],
  spiral: [[2, 2, 'Piccola'], [3, 3, 'Grande'], [4, 4, 'Enorme']],
  statue: [[1, 1, 'Piccola'], [2, 2, 'Grande'], [3, 3, 'Enorme'], [4, 4, 'Colossale']],
};
// n: misura delle statue salvate prima di SIZE_OPTS (lato in quadretti)
export const baseDims = o => (o.w ? [o.w, o.h] : o.n ? [o.n, o.n] : OBJ[o.type].slice(0, 2));
export const footprint = o => { const [w, h] = baseDims(o); return o.rot % 2 ? [h, w] : [w, h]; };
// misura scelta per un tipo (indice in SIZE_OPTS), di base quella del disegno originale
export const sizeIdx = (t, sz) => sz?.[t] ?? SIZE_OPTS[t].findIndex(([w, h]) => w === OBJ[t][0] && h === OBJ[t][1]);
export const meters = n => String(n * 1.5).replace('.', ',');

// --- Piani ---
// Le mappe fatte prima dei piani hanno tiles/edges sulla mappa: diventano il "Piano terra".
export function levelsOf(m) {
  if (!m.levels) {
    m.levels = [{ id: 'L0', z: 0, name: 'Piano terra', tiles: m.tiles || {}, edges: m.edges || {}, objects: [] }];
    delete m.tiles;
    delete m.edges;
  }
  return m.levels;
}
// il piano scelto (levels: { idMappa: idPiano } della vista di chi guarda), altrimenti il piano terra
export const curLevel = (m, levels) => { const ls = levelsOf(m); return ls.find(l => l.id === levels?.[m.id]) || ls.find(l => l.z === 0) || ls[0]; };
// Scale e buchi dei piani vicini compaiono anche qui, tratteggiati e capovolti (chi sale da sotto, qui scende).
const flipObj = o => ({ ...o, rot: CLIMB.has(o.type) ? (o.rot + 2) % 4 : o.rot, dir: o.dir === 'down' ? 'up' : 'down', type: o.type === 'hole' ? 'pit' : o.type === 'pit' ? 'hole' : o.type });
export function levelView(m, lv) {
  const near = dz => m.levels.find(l => l.z === lv.z + dz);
  const fromAbove = (near(1)?.objects || []).filter(o => (CLIMB.has(o.type) && o.dir === 'down') || o.type === 'pit');
  const fromBelow = (near(-1)?.objects || []).filter(o => (CLIMB.has(o.type) && o.dir !== 'down') || o.type === 'hole');
  return { ...lv, cols: m.cols, rows: m.rows, id: m.id, name: m.name, lvId: lv.id, tokens: m.tokens, arrivals: [...fromAbove, ...fromBelow].map(flipObj) };
}
export const levelName = z => (z > 0 ? `Piano ${z}` : z < 0 ? `Sotterraneo ${-z}` : 'Piano terra');
export const newLevel = z => ({ id: rid(), z, name: levelName(z), tiles: {}, edges: {}, objects: [] });

// Spazio occupato per taglia, in quadretti da 1,5 m (D&D 3.5: Grande 3 m, Enorme 4,5 m, Mastodontica 6 m, Colossale 9 m).
// Sotto la Piccola si sta in una parte di quadretto: il segnalino resta al centro del suo quadretto, più piccolo.
const SPACE = { Piccolissima: .1, Minuta: .2, Minuscola: .5, Piccola: 1, Media: 1, Grande: 2, Enorme: 3, Mastodontica: 4, Colossale: 6 };
export const space = c => SPACE[c?.size] ?? 1;

// --- Allargare e stringere ---
// Sposta tutto il contenuto della mappa di dx, dy tasselli (per allargarla in alto o a sinistra).
export function shiftMap(m, dx, dy) {
  const mv = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => { const [x, y, ...r] = k.split(','); return [[+x + dx, +y + dy, ...r].join(','), v]; }));
  for (const l of m.levels) {
    l.tiles = mv(l.tiles);
    l.edges = mv(l.edges);
    l.edoor = mv(l.edoor);
    if (l.fog) l.fog.shown = mv(l.fog.shown);
    for (const o of [...(l.objects || []), ...(l.doors || [])]) { o.x += dx * TILE; o.y += dy * TILE; }
    for (const n of l.notes || []) { n.x += dx * TILE; n.y += dy * TILE; n.ax += dx * TILE; n.ay += dy * TILE; }
  }
}
// Toglie quello che è rimasto fuori dai bordi; restituisce quanti elementi sono stati tolti.
export function clipMap(m) {
  const W = m.cols * TILE, H = m.rows * TILE;
  let lost = 0;
  const keep = (o, ok) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => { const [x, y] = k.split(',').map(Number); return ok(x, y); }));
  for (const l of m.levels) {
    const n = Object.keys(l.tiles || {}).length + (l.objects || []).length;
    l.tiles = keep(l.tiles, (x, y) => x >= 0 && y >= 0 && x < m.cols && y < m.rows);
    l.edges = keep(l.edges, (x, y) => x >= -1 && y >= -1 && x < m.cols && y < m.rows); // -1: i lati sul bordo ovest/nord
    l.edoor = keep(l.edoor, (x, y) => x >= -1 && y >= -1 && x < m.cols && y < m.rows);
    if (l.fog) l.fog.shown = keep(l.fog.shown, (x, y) => x >= 0 && y >= 0 && x < m.cols && y < m.rows);
    l.objects = (l.objects || []).filter(o => { const [fw, fh] = footprint(o); return o.x >= 0 && o.y >= 0 && o.x + fw <= W && o.y + fh <= H; });
    l.doors = (l.doors || []).filter(d => d.x >= 0 && d.y >= 0 && d.x <= W && d.y <= H);
    lost += n - Object.keys(l.tiles).length - l.objects.length;
  }
  return lost;
}
// + o − su un lato: una fila o colonna di tasselli in più o in meno da quella parte.
export function resizeMap(m, d, n) {
  const horiz = d === 'w' || d === 'e';
  if (horiz) m.cols += n; else m.rows += n;
  if (d === 'w' || d === 'n') shiftMap(m, horiz ? n : 0, horiz ? 0 : n);
  return clipMap(m);
}

// Dipinge il tassello tx,ty del piano con il pennello { kind, w, terrain, water } (o lo rimette roccia).
export function paintTile(lv, tx, ty, erase, brush) {
  lv.tiles ??= {};
  lv.edges ??= {};
  const { kind, w, terrain } = brush, key = tx + ',' + ty;
  if (erase || kind === 'vuoto') {
    delete lv.tiles[key];
    for (const d of 'nesw') delete lv.edges[edgeKey(tx, ty, d)];
    return;
  }
  // corridoio spostato: brush.ox/oy sono -1, 0 o 1 (verso sinistra/alto, centro, destra/basso)
  const step = kind === 'corr' ? corrStep(w) : 0, ox = num(brush.ox) * step, oy = num(brush.oy) * step;
  lv.tiles[key] = { kind, w: num(w), terrain, ...(terrain === 'acqua' && { water: hex(brush.water) }), ...(ox && { ox }), ...(oy && { oy }) };
  // un corridoio si collega da solo a ciò che ha accanto (e una stanza ai corridoi vicini)
  for (const [d, nx, ny] of [['n', tx, ty - 1], ['s', tx, ty + 1], ['w', tx - 1, ty], ['e', tx + 1, ty]]) {
    const n = lv.tiles[nx + ',' + ny];
    if (n && (kind === 'corr' || n.kind === 'corr') && !lv.edges[edgeKey(tx, ty, d)]) lv.edges[edgeKey(tx, ty, d)] = 1;
  }
}

// --- Note: riquadro di testo con freccia; { id, text, x, y: centro, ax, ay: punta, on: la vedono i giocatori } ---
function wrapText(s, max) {
  const lines = [];
  for (const w of String(s).split(/\s+/)) {
    if (lines.length && (lines.at(-1) + ' ' + w).length <= max) lines[lines.length - 1] += ' ' + w;
    else lines.push(w);
  }
  return lines;
}
export const noteBox = text => { const lines = wrapText(text, 26); return { lines, w: Math.max(...lines.map(l => l.length)) * .36 + .9, h: lines.length * .85 + .55 }; };
