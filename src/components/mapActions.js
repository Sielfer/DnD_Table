// Cosa succede quando si clicca, si dipinge o si trascina sulla mappa. Legge sempre lo stato più recente dai negozi.
import { flushSync } from 'react-dom';
import { server, uiStore, setUi, act, ask, confirmBox, say, isMaster, interaction } from '../store.js';
import { num, rid } from '../util.js';
import {
  TILE, MAX_TILES, E, GLYPH, TOGGLE, OBJ, FLAT, VEG, ROUND, SIZE_OPTS, edgeKey, floorOf, doorFits, doorSnap, footprint, sizeIdx,
  levelsOf, curLevel, resizeMap, paintTile, space, noteBox, newLevel,
} from '../map/geo.js';
import { doorGlyph, noteInner } from '../map/draw.js';

const S_ = () => server.get(), U = () => uiStore.get();
export const curLv = m => curLevel(m, U().levels);
const master = () => isMaster(S_());

// "Annulla": le mappe com'erano prima di ogni modifica del master (i segnalini no: li tiene il server).
const undo = [];
export const undoCount = { n: 0, subs: new Set(), get: () => undoCount.n, subscribe: f => { undoCount.subs.add(f); return () => undoCount.subs.delete(f); } };
const bump = () => { undoCount.n = undo.length; undoCount.subs.forEach(f => f()); };
export function snapshot() { undo.push(S_().maps); if (undo.length > 50) undo.shift(); bump(); }

// Cambia le mappe subito in locale, poi le manda al server.
export function setMaps(f) {
  snapshot();
  const ms = structuredClone(S_().maps || []);
  ms.forEach(levelsOf);
  f(ms);
  server.set(S => ({ ...S, maps: ms }));
  return act('maps', { maps: ms });
}

// Dopo un trascinamento la mappa si ridisegna da capo (il disegno era stato spostato a mano).
export const redraw = { n: 0, subs: new Set(), get: () => redraw.n, subscribe: f => { redraw.subs.add(f); return () => redraw.subs.delete(f); } };
const again = () => { redraw.n++; redraw.subs.forEach(f => f()); };

export async function undoLast() {
  const prev = undo.pop();
  bump();
  if (!prev) return;
  const ms = structuredClone(prev), back = [];
  for (const m of ms) {
    const now = S_().maps.find(x => x.id === m.id);
    // si annulla un allargamento o restringimento: i segnalini tornano dov'erano, gli altri restano come sono ora
    if (now && (now.cols !== m.cols || now.rows !== m.rows)) back.push([m.id, m.tokens || {}]);
    m.tokens = now?.tokens;
  }
  server.set(S => ({ ...S, maps: ms }));
  await act('maps', { maps: ms });
  for (const [mid, toks] of back) for (const [cid, t] of Object.entries(toks)) moveToken(mid, cid, t);
}

// Sposta un segnalino subito in locale, poi lo manda al server (pos null: lo toglie dalla mappa).
export function moveToken(mid, cid, pos) {
  const m = S_().maps.find(x => x.id === mid);
  if (!m) return;
  const tokens = { ...m.tokens };
  if (pos) {
    // tutto il segnalino deve stare dentro la mappa
    const n = Math.max(1, space(S_().characters[cid]));
    pos = { ...pos, x: Math.min(m.cols * TILE - n, Math.max(0, pos.x)), y: Math.min(m.rows * TILE - n, Math.max(0, pos.y)) };
    tokens[cid] = pos;
  } else delete tokens[cid];
  server.set(S => ({ ...S, maps: S.maps.map(x => (x.id === mid ? { ...x, tokens } : x)) }));
  act('token', pos ? { map: mid, char: cid, ...pos } : { map: mid, char: cid, remove: true });
}

export async function grow(mid, d, n) {
  const m0 = S_().maps.find(x => x.id === mid), size = d === 'w' || d === 'e' ? m0.cols : m0.rows;
  if (size + n < 1 || size + n > MAX_TILES) return say(`La mappa va da 1 a ${MAX_TILES} tasselli per lato.`);
  // togliere una fila cancella quello che c'era sopra: prima chiedi
  const probe = structuredClone(m0);
  levelsOf(probe);
  const lost = n < 0 ? resizeMap(probe, d, n) : 0;
  if (lost && !await confirmBox(`Su questa fila ci sono ${lost} tra tasselli e oggetti: verranno cancellati. Continuare?`, { ok: 'Togli', danger: true })) return;
  await setMaps(ms => resizeMap(ms.find(x => x.id === mid), d, n));
  // i segnalini li tiene il server: si spostano con la mappa (dopo il salvataggio, così stanno nei nuovi bordi)
  const dx = d === 'w' ? n * TILE : 0, dy = d === 'n' ? n * TILE : 0;
  for (const [cid, t] of Object.entries(m0.tokens || {})) if (dx || dy || n < 0) moveToken(mid, cid, { ...t, x: t.x + dx, y: t.y + dy });
}

export async function newMap() {
  const name = await ask('Nome della mappa', 'Nuova mappa', { max: 80 });
  if (!name) return;
  const m = { id: rid(), name, cols: 6, rows: 4, visible: false, levels: [{ ...newLevel(0), id: rid() }] };
  setUi({ mapId: m.id });
  setMaps(ms => ms.push(m));
}
export function addLevel(mid, dir) {
  setMaps(ms => {
    const m = ms.find(x => x.id === mid), zs = m.levels.map(l => l.z);
    const l = newLevel(dir === 'up' ? Math.max(...zs) + 1 : Math.min(...zs) - 1);
    m.levels.push(l);
    setUi(u => ({ levels: { ...u.levels, [m.id]: l.id } }));
  });
}

// --- Zoom ---
const scroller = () => document.querySelector('.mapscroll');
const zoomNow = () => { const svg = scroller().querySelector('svg'); return U().mapZoom || svg.getBoundingClientRect().width / svg.viewBox.baseVal.width; };
export const zoomStep = f => Math.round(Math.min(80, Math.max(6, zoomNow() * f)));
// Zoom tenendo fermo il punto sotto (cx, cy): il puntatore, o il centro della mappa.
export function zoomTo(z, cx, cy) {
  const sc = scroller();
  if (!sc) return setUi({ mapZoom: z });
  const r = sc.getBoundingClientRect(), a = sc.querySelector('svg').getBoundingClientRect();
  cx ??= r.left + sc.clientWidth / 2;
  cy ??= r.top + sc.clientHeight / 2;
  const fx = (cx - a.left) / a.width, fy = (cy - a.top) / a.height;
  flushSync(() => setUi({ mapZoom: z }));
  const n = scroller(), b = n.querySelector('svg').getBoundingClientRect();
  n.scrollLeft += b.left + fx * b.width - cx;
  n.scrollTop += b.top + fy * b.height - cy;
}
// Porta il segnalino al centro della vista, ingrandito, e lo fa lampeggiare.
export function focusTok(cid) {
  const m = S_().maps.find(x => x.id === U().mapId) || S_().maps[0], t = m?.tokens?.[cid];
  if (!t) return;
  flushSync(() => setUi(u => ({ levels: { ...u.levels, [m.id]: t.lv }, mapZoom: Math.max(u.mapZoom, 56) })));
  const sc = scroller(), g = sc?.querySelector(`[data-cid="${cid}"]`);
  if (!g) return;
  sc.scrollIntoView({ block: 'nearest' });
  const r = g.getBoundingClientRect(), s = sc.getBoundingClientRect();
  sc.scrollLeft += r.left + r.width / 2 - (s.left + sc.clientWidth / 2);
  sc.scrollTop += r.top + r.height / 2 - (s.top + sc.clientHeight / 2);
  g.classList.add('ping');
}

// --- Clic sulla mappa ---
export const toMap = (svg, e) => { const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; return [(e.clientX - r.left) / r.width * vb.width + vb.x, (e.clientY - r.top) / r.height * vb.height + vb.y]; };
let dragged = false;

// erase: tasto destro, toglie invece di mettere
export function mapClick(e, erase) {
  const svg = e.target.closest?.('#mapsvg');
  if (dragged || !svg) return;
  const ui = U(), S = S_(), m = S.maps.find(x => x.id === svg.dataset.id);
  if (!m) return;
  if (!master() || ui.mapMode === 'tok') {
    const c = S.characters[ui.tokChar];
    if (erase || !c || !(master() || c.owner === S.me.id)) return;
    const [sx, sy] = toMap(svg, e), off = Math.floor((Math.max(1, space(c)) - 1) / 2); // il quadretto cliccato sta al centro
    return moveToken(m.id, c.id, { lv: curLv(m).id, x: Math.floor(sx) - off, y: Math.floor(sy) - off });
  }
  if (ui.mapMode === 'note') return noteClick(e, svg, m, erase);
  if (ui.mapMode === 'brush' || ui.mapMode === 'fog') return; // tasselli e nebbia si dipingono con il puntatore premuto
  const [sx, sy] = toMap(svg, e), W = m.cols * TILE, H = m.rows * TILE;
  const tx = Math.min(m.cols - 1, Math.max(0, Math.floor(sx / TILE))), ty = Math.min(m.rows - 1, Math.max(0, Math.floor(sy / TILE)));
  setMaps(ms => {
    const map = ms.find(x => x.id === m.id), lv = curLv(map);
    lv.tiles ??= {};
    lv.edges ??= {};
    lv.objects ??= [];
    if (ui.mapMode === 'obj') {
      const qx = Math.min(W - 1, Math.max(0, Math.floor(sx))), qy = Math.min(H - 1, Math.max(0, Math.floor(sy)));
      const inside = o => { const [fw, fh] = footprint(o); return qx >= o.x && qx < o.x + fw && qy >= o.y && qy < o.y + fh; };
      let hit = lv.objects.findLastIndex(o => !FLAT.has(o.type) && inside(o)); // i tappeti stanno sotto: prima ciò che c'è sopra
      if (hit < 0) hit = lv.objects.findLastIndex(inside);
      const { rot, dir, ruined, ladder, veg = 'lush' } = ui.obj, type = erase ? 'erase' : ui.obj.type, h = lv.objects[hit];
      if (type === 'erase') { if (hit >= 0) lv.objects.splice(hit, 1); return; }
      if (type === 'ruin') { if (h && h.type !== 'well') { h.ruined = !h.ruined; delete h.inf; } return; }
      if (!OBJ[type]) return;
      const plant = VEG.has(type) && { ruined: veg === 'dry', inf: veg === 'inf' };
      if (plant && h?.type === type) return Object.assign(h, plant); // clic su una pianta uguale: ne cambia lo stato
      const so = SIZE_OPTS[type]?.[sizeIdx(type, ui.obj.sz)];
      const o = { id: rid(), type, rot: ROUND.has(type) ? 0 : rot, dir, ruined: type !== 'well' && ruined, ladder, ...plant, ...(so && { w: so[0], h: so[1] }) };
      const [fw, fh] = footprint(o);
      // il quadretto cliccato sta al centro dell'oggetto
      o.x = Math.min(W - fw, Math.max(0, qx - Math.floor((fw - 1) / 2)));
      o.y = Math.min(H - fh, Math.max(0, qy - Math.floor((fh - 1) / 2)));
      lv.objects.push(o);
      return;
    }
    if (ui.mapMode === 'edge') {
      // prima le porte spostate a mano: apri/chiudi, cambia in porta o finestra, oppure togli (muro)
      const fd = (lv.doors || []).findIndex(dr => (dr.v ? Math.abs(sx - dr.x) < .6 && sy > dr.y && sy < dr.y + dr.n : Math.abs(sy - dr.y) < .6 && sx > dr.x && sx < dr.x + dr.n));
      const t = erase ? E.muro : ui.edgeTool;
      if (fd >= 0) {
        const dr = lv.doors[fd];
        if (t === 'flip') dr.f = ((dr.f || 0) + 1) % 4;
        else if (t === 'toggle') dr.s = TOGGLE[dr.s] ?? dr.s;
        else if (GLYPH.has(num(t))) {
          dr.s = num(t);
          // nuova larghezza solo se c'è muro sotto per tutta la sua lunghezza
          const view = { ...lv, cols: map.cols, rows: map.rows }, cand = { ...dr, n: ui.doorLen || dr.n };
          if (doorFits(view, floorOf(view).F, cand)) dr.n = cand.n;
        } else lv.doors.splice(fd, 1);
        return;
      }
      // il lato più vicino al punto cliccato
      const lx = sx - tx * TILE, ly = sy - ty * TILE;
      const d = [['w', lx], ['e', TILE - lx], ['n', ly], ['s', TILE - ly]].sort((a, b) => a[1] - b[1])[0][0];
      const k = edgeKey(tx, ty, d), cur = lv.edges[k] || 0;
      lv.edoor ??= {};
      if (t === 'flip') { if (GLYPH.has(cur)) lv.edoor[k] = { ...lv.edoor[k], f: ((lv.edoor[k]?.f || 0) + 1) % 4 }; return; }
      const next = t === 'toggle' ? TOGGLE[cur] ?? cur : num(t);
      if (next) lv.edges[k] = next; else delete lv.edges[k];
      // larghezza e senso di apertura restano solo su porte e finestre
      if (!GLYPH.has(next)) delete lv.edoor[k];
      else if (t !== 'toggle') { const { n, ...rest } = lv.edoor[k] || {}; lv.edoor[k] = { ...rest, ...(ui.doorLen && { n: ui.doorLen }) }; }
    }
  });
}

// Note: clic sul vuoto ne scrive una nuova (la freccia punta lì), clic su una nota la modifica, tasto destro la toglie.
async function noteClick(e, svg, m, erase) {
  const id = e.target.closest?.('[data-note]')?.dataset.note, old = curLv(m).notes?.find(n => n.id === id);
  const [sx, sy] = toMap(svg, e);
  const edit = f => setMaps(ms => { const l = curLv(ms.find(x => x.id === m.id)); l.notes ??= []; f(l); });
  if (erase) return old && edit(l => { l.notes = l.notes.filter(n => n.id !== id); });
  const text = await ask(old ? 'Modifica la nota' : 'Nuova nota', old?.text || '', { area: true, max: 300, text: old ? 'Lascia vuoto per toglierla.' : 'La freccia punta dove hai cliccato. Ctrl+Invio per salvare.' });
  if (text === null) return;
  const t = text.trim().slice(0, 300);
  if (old) return edit(l => { if (t) l.notes.find(n => n.id === id).text = t; else l.notes = l.notes.filter(n => n.id !== id); });
  if (!t) return;
  const W = m.cols * TILE, H = m.rows * TILE, half = v => Math.round(v * 2) / 2, { w, h } = noteBox(t);
  // il riquadro un po' in alto a destra della punta, tutto dentro la mappa
  const fit = (v, size, max) => Math.min(Math.floor((max - size / 2) * 2) / 2, Math.max(Math.ceil(size / 2 * 2) / 2, half(v)));
  edit(l => l.notes.push({ id: rid(), text: t, ax: half(sx), ay: half(sy), x: fit(sx + 2 + w / 2, w, W), y: fit(sy - 3, h, H), on: false }));
}

// --- Puntatore premuto: pennello, trascinamenti, tavolozza. Si agganciano alla finestra (vedi Maps.jsx) ---
function paintMove(e) {
  const p = interaction.paint, svg = document.querySelector('#mapsvg');
  if (!svg) return;
  const m = S_().maps.find(x => x.id === p.mid), [sx, sy] = toMap(svg, e);
  const tx = Math.floor(sx / TILE), ty = Math.floor(sy / TILE), k = tx + ',' + ty;
  if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows || p.done.has(k)) return;
  p.done.add(k);
  const lv = curLv(m);
  if (p.fog) {
    // la prima pennellata su un piano accende la nebbia
    lv.fog = { on: true, ...lv.fog, shown: { ...lv.fog?.shown } };
    if (p.erase) delete lv.fog.shown[k]; else lv.fog.shown[k] = 1;
  } else paintTile(lv, tx, ty, p.erase, U().brush);
  server.set(S => ({ ...S, maps: [...S.maps] }));
}

export function onPointerDown(e) {
  const svg = e.target.closest?.('#mapsvg'), ui = U();
  if (!svg) return;
  // pennello: premi e trascina per dipingere più tasselli (tasto destro: roccia); si salva una volta sola al rilascio
  const fog = ui.mapMode === 'fog';
  if (master() && (fog || ui.mapMode === 'brush') && (e.button === 0 || e.button === 2)) {
    snapshot();
    const maps = structuredClone(S_().maps);
    maps.forEach(levelsOf);
    server.set(S => ({ ...S, maps }));
    // erase: per i tasselli torna roccia, per la nebbia copre (con "Copri" scelto il tasto sinistro copre e il destro rivela)
    interaction.paint = { mid: svg.dataset.id, fog, erase: (e.button === 2) !== (fog && ui.fogTool === 'hide'), done: new Set() };
    return paintMove(e);
  }
  // trascinare un oggetto lo sposta, una porta scorre lungo i muri; un clic senza movimento resta un clic
  const g = e.button === 0 && e.target.closest('[data-oid], [data-door], [data-tok], [data-note]');
  if (!g) return;
  const mid = svg.dataset.id, d = { g, svg, mid, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false };
  const m = S_().maps.find(x => x.id === mid);
  if (g.dataset.note) {
    // la punta della freccia o tutto il riquadro (la punta resta dov'è)
    const n = curLv(m).notes.find(x => x.id === g.dataset.note);
    d.note = { n, tip: !!e.target.closest('[data-ntip]'), at: n };
  }
  if (g.dataset.door) {
    const view = { ...structuredClone(curLv(m)), cols: m.cols, rows: m.rows };
    if (g.dataset.ek) delete view.edges[g.dataset.ek]; // la porta lascia il suo varco: lì torna il muro
    d.door = { view, F: floorOf(view).F, n: +g.dataset.n, s: +g.dataset.s, f: +g.dataset.f || 0, at: null };
  }
  interaction.drag = d;
}

export function onPointerMove(e) {
  if (interaction.paint) return paintMove(e);
  const d = interaction.drag;
  if (!d) return;
  const k = d.svg.viewBox.baseVal.width / d.svg.getBoundingClientRect().width;
  d.moved ||= Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 5;
  if (!d.moved) return;
  if (d.door) {
    const at = doorSnap(d.door, ...toMap(d.svg, e));
    if (at) { d.door.at = at; d.g.innerHTML = doorGlyph(d.door.F, { ...at, f: d.door.f }, d.door.s); }
    d.g.classList.add('dragging');
    return;
  }
  if (d.note) {
    const { n, tip } = d.note, dx = Math.round((e.clientX - d.x0) * k * 2) / 2, dy = Math.round((e.clientY - d.y0) * k * 2) / 2; // a mezzi quadretti
    d.note.at = tip ? { ...n, ax: n.ax + dx, ay: n.ay + dy } : { ...n, x: n.x + dx, y: n.y + dy };
    d.g.innerHTML = noteInner(d.note.at, true);
    return;
  }
  d.dx = Math.round((e.clientX - d.x0) * k);
  d.dy = Math.round((e.clientY - d.y0) * k);
  d.g.classList.add('dragging');
  d.g.setAttribute('transform', `translate(${d.dx} ${d.dy})`);
}

export function onPointerUp() {
  if (interaction.paint) {
    interaction.paint = null;
    act('maps', { maps: S_().maps });
    return;
  }
  const d = interaction.drag;
  interaction.drag = null;
  if (!d?.moved) return;
  dragged = true;
  setTimeout(() => { dragged = false; }); // il click che segue il rilascio non deve posare un nuovo oggetto
  again();
  const { mid } = d;
  if (d.note) {
    const { x, y, ax, ay } = d.note.at;
    return setMaps(ms => Object.assign(curLv(ms.find(m => m.id === mid)).notes.find(n => n.id === d.note.n.id) || {}, { x, y, ax, ay }));
  }
  if (d.door) {
    if (!d.door.at) return;
    return setMaps(ms => {
      const lv = curLv(ms.find(x => x.id === mid)), { ek, did } = d.g.dataset;
      lv.doors ??= [];
      if (ek) { delete lv.edges[ek]; lv.doors.push({ id: rid(), s: d.door.s, ...(d.door.f && { f: d.door.f }), ...d.door.at }); }
      else Object.assign(lv.doors.find(x => x.id === did) || {}, d.door.at);
    });
  }
  const cid = d.g.dataset.tok;
  if (cid) {
    const m = S_().maps.find(x => x.id === mid), t = m?.tokens?.[cid];
    if (t) moveToken(mid, cid, { lv: t.lv, x: Math.min(m.cols * TILE - 1, Math.max(0, t.x + d.dx)), y: Math.min(m.rows * TILE - 1, Math.max(0, t.y + d.dy)) });
    return;
  }
  setMaps(ms => {
    const m = ms.find(x => x.id === mid), o = curLv(m).objects?.find(x => x.id === d.g.dataset.oid);
    if (!o) return;
    const [fw, fh] = footprint(o);
    o.x = Math.min(m.cols * TILE - fw, Math.max(0, o.x + d.dx));
    o.y = Math.min(m.rows * TILE - fh, Math.max(0, o.y + d.dy));
  });
}
