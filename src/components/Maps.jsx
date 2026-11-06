// Mappe: la barra in alto, la tavolozza degli strumenti (agganciata o libera) e la mappa.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useS, useUi, setUi, uiStore, isMaster, confirmBox, isNpc } from '../store.js';
import { num } from '../util.js';
import {
  TILE, MAX_TILES, TERRAIN, WATER, hex, KINDS, GLYPH, EDGE_TOOLS, DOOR_LENS, MODES, OBJ, OBJ_GROUPS, CLIMB, ROUND, VEG, VEG_STATES,
  SIZE_OPTS, ruinLabel, sizeIdx, meters, levelsOf, curLevel, levelView, corrStep,
} from '../map/geo.js';
import { drawMap, icon, kindIcon, edgeIcon, doorLenIcon, tokIcon, objIcon, crossIcon } from '../map/draw.js';
import { Field, Tool, Empty, setChar } from './common.jsx';
import {
  setMaps, undoCount, undoLast, redraw, grow, newMap, addLevel, moveToken, zoomTo, zoomStep, focusTok, mapClick,
  onPointerDown, onPointerMove, onPointerUp,
} from './mapActions.js';
import { interaction } from '../store.js';

const useCount = s => useSyncExternalStore(s.subscribe, s.get);
const Group = ({ label, children }) => <div className="toolgroup"><label>{label}</label><div className="tools">{children}</div></div>;
const Hint = ({ children }) => <p className="hint">{children}</p>;

// Le interazioni con il puntatore e la tastiera valgono per tutta la finestra, finché la scheda Mappe è aperta.
function useMapInput(master) {
  useEffect(() => {
    let pal = null;
    const down = e => {
      const h = e.button === 0 && !e.target.closest('button') && e.target.closest?.('.palhead');
      if (h && !matchMedia('(max-width: 1100px)').matches) {
        const r = h.parentElement.getBoundingClientRect();
        pal = { el: h.parentElement, dx: e.clientX - r.left, dy: e.clientY - r.top };
        e.preventDefault();
        return;
      }
      onPointerDown(e);
    };
    const move = e => {
      if (!pal) return onPointerMove(e);
      pal.x = Math.max(0, Math.min(innerWidth - 160, e.clientX - pal.dx));
      pal.y = Math.max(0, Math.min(innerHeight - 50, e.clientY - pal.dy));
      pal.el.classList.add('floating');
      Object.assign(pal.el.style, { left: pal.x + 'px', top: pal.y + 'px' });
    };
    const up = () => {
      const p = pal;
      pal = null;
      if (p?.x !== undefined) setUi({ palPos: { x: p.x, y: p.y } });
      else if (!p) onPointerUp();
    };
    const wheel = e => {
      if (!e.ctrlKey || !e.target.closest?.('.mapscroll')) return;
      e.preventDefault(); // Ctrl + rotellina (o il pizzico sul touchpad) ingrandisce la mappa, non la pagina
      zoomTo(zoomStep(e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    };
    const key = e => {
      const ui = uiStore.get();
      if (e.key === 'Escape' && ui.mapFull && !document.fullscreenElement) return setUi({ mapFull: false });
      // scorciatoie dell'editor (non mentre scrivi in un campo o con una finestra di dialogo aperta)
      if (!master || e.altKey || e.target.closest?.('input, textarea, select, .modal')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undoLast(); }
      const mode = !e.ctrlKey && !e.metaKey && MODES[+e.key - 1]?.[0];
      if (mode) return setUi({ mapMode: mode });
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && ui.mapMode === 'obj') setUi(u => ({ obj: { ...u.obj, rot: (u.obj.rot + 1) % 4 } }));
    };
    const fs = () => { if (!document.fullscreenElement && uiStore.get().mapFull) setUi({ mapFull: false }); };
    addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up); // sul telefono il dito che scorre la mappa non dipinge
    addEventListener('wheel', wheel, { passive: false });
    addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', fs);
    return () => {
      removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('wheel', wheel);
      removeEventListener('keydown', key);
      document.removeEventListener('fullscreenchange', fs);
    };
  }, [master]);
}

// La mappa disegnata. Mentre trascini un oggetto il disegno resta fermo (lo sposta il trascinamento).
function Canvas({ view, mode, ctx }) {
  const n = useCount(redraw);
  const key = JSON.stringify([view, mode, ctx]);
  const last = useRef('');
  const html = useMemo(() => drawMap(view, mode, ctx), [key]);
  if (!interaction.drag) last.current = html;
  return (
    <div key={n} className="canvas" dangerouslySetInnerHTML={{ __html: last.current }}
      onClick={e => mapClick(e)}
      onContextMenu={e => { if (e.target.closest('#mapsvg') && ctx.master && mode !== 'tok') { e.preventDefault(); mapClick(e, true); } }} />
  );
}

export default function Maps() {
  const S = useS(), ui = useUi(), master = isMaster(S);
  const undoN = useCount(undoCount);
  useMapInput(master);
  const list = S.maps || [];
  list.forEach(levelsOf);
  const cur = list.find(m => m.id === ui.mapId) || list[0];
  const [op, setOp] = useState(ui.ghostOp ?? 40);
  useEffect(() => setOp(ui.ghostOp ?? 40), [ui.ghostOp]);
  // griglia: mentre trascini il cursore cambia subito il disegno; al rilascio si ricorda
  const [gridDraft, setGridDraft] = useState(ui.gridOp ?? 50);
  useEffect(() => setGridDraft(ui.gridOp ?? 50), [ui.gridOp]);
  const gridInput = e => { setGridDraft(+e.target.value); document.querySelector('#mapsvg [data-grid]')?.setAttribute('opacity', e.target.value / 100); };
  const gridSave = e => setUi({ gridOp: +e.target.value });

  if (!cur) {
    return master
      ? <Empty ico="🗺️"><p>Nessuna mappa ancora.</p><button className="primary" onClick={newMap}>+ Nuova mappa</button></Empty>
      : <Empty ico="🗺️">Il master non ha ancora mostrato nessuna mappa.</Empty>;
  }

  const lv = curLevel(cur, ui.levels), view = levelView(cur, lv);
  const mode = master ? ui.mapMode : 'tok';
  const z = ui.mapZoom;
  const placed = Object.keys(cur.tokens || {}).filter(cid => S.characters[cid]);
  const hasNotes = cur.levels.some(l => l.notes?.length);
  const above = cur.levels.find(l => l.z === lv.z + 1), below = cur.levels.find(l => l.z === lv.z - 1);
  const gl = ui.ghost === 'up' ? above : ui.ghost === 'down' ? below : null;
  if (gl) view.ghost = { view: { ...levelView(cur, gl), arrivals: [] }, op: (ui.ghostOp ?? 40) / 100 };
  // per il disegno servono solo i personaggi sulla mappa, e di loro solo ciò che si vede nel segnalino
  const chars = Object.fromEntries(Object.keys(cur.tokens || {}).filter(cid => S.characters[cid]).map(cid => {
    const { id, name, size, owner, avatar, hidden } = S.characters[cid];
    return [cid, { id, name, size, owner, avatar, hidden }];
  }));
  const gridOp = ui.gridOn === false ? 0 : (ui.gridOp ?? 50) / 100;
  const ctx = { chars, me: S.me.id, master, tokChar: ui.tokChar, hideNotes: !!ui.hideNotes, zoom: z, grid: gridOp };
  const edit = f => setMaps(ms => f(ms.find(m => m.id === cur.id)));
  const setLv = f => setMaps(ms => f(curLevel(ms.find(m => m.id === cur.id), ui.levels)));

  const full = () => {
    const on = !ui.mapFull;
    setUi({ mapFull: on });
    // anche la finestra a tutto schermo, se lo permette; Esc esce da entrambi
    if (on) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen();
  };
  const bar = (
    <div className="mapbar">
      <select aria-label="Mappa" style={{ fontWeight: 600 }} value={cur.id} onChange={e => setUi({ mapId: e.target.value })}>
        {list.map(m => <option key={m.id} value={m.id}>{m.name || 'Senza nome'}{master && m.visible ? ' · visibile' : ''}</option>)}
      </select>
      {master && <><button onClick={newMap}>+ Nuova mappa</button>
        <button onClick={undoLast} disabled={!undoN} title="Annulla l'ultima modifica (Ctrl+Z)">↶ Annulla</button></>}
      <span className="spacer" />
      {placed.length > 0 && <select aria-label="Zoom su un personaggio" value="" onChange={e => e.target.value && focusTok(e.target.value)}>
        <option value="">🔍 Zoom su…</option>{placed.map(cid => <option key={cid} value={cid}>{S.characters[cid].name || 'Senza nome'}</option>)}
      </select>}
      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
        <button className={ui.gridOn === false ? '' : 'on'} aria-pressed={ui.gridOn !== false} onClick={() => setUi({ gridOn: ui.gridOn === false })} title="Mostra o nascondi la griglia dei quadretti">▦ Griglia</button>
        {ui.gridOn !== false && <input type="range" min="5" max="100" step="5" value={gridDraft} style={{ width: 90 }} onChange={gridInput} onPointerUp={gridSave} onKeyUp={gridSave}
          aria-label="Trasparenza della griglia" title={`Griglia: ${gridDraft}%`} />}
      </span>
      {hasNotes && <button className={ui.hideNotes ? '' : 'on'} aria-pressed={!ui.hideNotes} onClick={() => setUi({ hideNotes: !ui.hideNotes })} title="Mostra o nascondi le note nella tua vista">📝 Note</button>}
      <span className="zoomgrp">
        <button onClick={() => zoomTo(zoomStep(.8))} aria-label="Rimpicciolisci la mappa" title="Rimpicciolisci (anche Ctrl + rotellina)">−</button>
        <button className={z ? '' : 'on'} onClick={() => zoomTo(0)} title="Larga quanto lo spazio">Adatta</button>
        <button onClick={() => zoomTo(zoomStep(1.25))} aria-label="Ingrandisci la mappa" title="Ingrandisci (anche Ctrl + rotellina)">+</button>
      </span>
      <button onClick={full}>{ui.mapFull ? 'Esci da tutto schermo' : '⛶ Tutto schermo'}</button>
    </div>
  );

  // --- piani e trasparenza ---
  const levels = [...cur.levels].sort((a, b) => b.z - a.z); // il piano più alto in cima
  const levelBar = (
    <div className="toolgroup"><label>Piani</label><nav className="levels">
      {master && <button onClick={() => addLevel(cur.id, 'up')}>+ Piano sopra</button>}
      {levels.map(l => <button key={l.id} className={l === lv ? 'on' : ''} onClick={() => setUi(u => ({ levels: { ...u.levels, [cur.id]: l.id } }))}>{l.name}</button>)}
      {master && <button onClick={() => addLevel(cur.id, 'down')}>+ Piano sotto</button>}
    </nav></div>
  );
  // mentre trascini il cursore la mappa cambia subito; al rilascio si salva
  const ghostInput = e => { setOp(+e.target.value); document.querySelector('#mapsvg [data-ghost]')?.setAttribute('opacity', e.target.value / 100); };
  const ghostSave = () => setUi({ ghostOp: op });
  const ghostBar = cur.levels.length > 1 && (
    <div className="toolgroup"><label>Vedi in trasparenza</label><div className="row tight">
      {[['', 'Nessuno', true], ['up', 'Piano sopra', above], ['down', 'Piano sotto', below]].map(([v, l, ok]) =>
        <button key={v} className={(gl ? ui.ghost : '') === v ? 'on' : ''} disabled={!ok} onClick={() => setUi({ ghost: v || null })}>{l}</button>)}</div>
      {gl && <><label style={{ marginTop: 8 }}>Opacità: {op}%</label>
        <input type="range" min="10" max="90" step="5" value={op} onChange={ghostInput} onPointerUp={ghostSave} onKeyUp={ghostSave} aria-label="Opacità del piano in trasparenza" /></>}
    </div>
  );

  // --- personaggi: il master li muove tutti, il giocatore solo i suoi ---
  const movable = Object.values(S.characters).filter(c => master || c.owner === S.me.id);
  const where = c => { const t = cur.tokens?.[c.id], l = t && cur.levels.find(x => x.id === t.lv); return !l ? ' (fuori)' : l === lv ? '' : ` (${l.name})`; };
  const tokTool = c => <Tool key={c.id} on={ui.tokChar === c.id} onClick={() => setUi({ tokChar: ui.tokChar === c.id ? null : c.id })} pic={tokIcon(c)}
    label={(c.hidden ? '🙈 ' : '') + (c.name || 'Senza nome') + where(c)} />;
  const sel = movable.find(c => c.id === ui.tokChar);
  const selTools = sel && (cur.tokens?.[sel.id] || (master && isNpc(sel))) && <>
    {cur.tokens?.[sel.id] && <Tool onClick={() => moveToken(cur.id, sel.id, null)} pic={crossIcon} label="Togli dalla mappa" />}
    {/* il master rivela un mostro quando entra in scena (e può rinasconderlo) */}
    {master && isNpc(sel) && <Tool on={!sel.hidden} onClick={() => setChar(sel, ['hidden'], !sel.hidden)} pic={tokIcon(sel)}
      label={sel.hidden ? '👁 Mostra ai giocatori' : '🙈 Nascondi ai giocatori'} />}
  </>;
  const pcs = movable.filter(c => !isNpc(c)), npcs = movable.filter(isNpc);
  const tokBar = <>
    {movable.length ? <>
      {pcs.length > 0 && <Group label="Personaggi">{pcs.map(tokTool)}</Group>}
      {npcs.length > 0 && <Group label={master ? 'Mostri e PNG · 🙈 = nascosti ai giocatori' : 'Mostri e PNG'}>{npcs.map(tokTool)}</Group>}
    </> : <p className="muted">Nessun personaggio da mettere sulla mappa.{master && ' Crea mostri e PNG dalla scheda Schede.'}</p>}
    {selTools && <Group label={sel.name || 'Selezionato'}>{selTools}</Group>}
  </>;
  const tokHint = <Hint>Scegli un personaggio e clicca sulla mappa per metterlo lì, anche su un altro piano. Trascina un segnalino per spostarlo.</Hint>;

  let tools;
  if (!master) tools = <>{cur.levels.length > 1 && <>{levelBar}{ghostBar}</>}{tokBar}{movable.length > 0 && tokHint}</>;
  else {
    const b = ui.brush, ob = ui.obj;
    let body;
    if (mode === 'brush') {
      const w = hex(b.water), waterIcon = c => icon(`<rect width="3" height="3" fill="${c}"/><rect width="3" height="3" fill="url(#tex-onde)"/>`, '0 0 3 3');
      const brush = patch => setUi(u => ({ brush: { ...u.brush, ...patch } }));
      body = <>
        <Group label="Tipo di tassello">{KINDS.map(([v, l]) => <Tool key={v} on={b.kind === v} onClick={() => brush({ kind: v })} pic={kindIcon(v)} label={l} />)}</Group>
        {b.kind === 'corr' && <Group label="Larghezza">{[[2, '3 m'], [4, '6 m']].map(([v, l]) => <Tool key={v} on={num(b.w) === v} onClick={() => brush({ w: v })}
          pic={icon(`<rect width="10" height="10" fill="url(#tex-roccia)"/><rect x="${5 - v / 2}" width="${v}" height="10" fill="url(#tex-pietra)"/>`)} label={l} />)}</Group>}
        {b.kind === 'corr' && <div className="toolgroup"><label>Posizione nel tassello</label>
          <div className="posgrid">{[-1, 0, 1].flatMap(oy => [-1, 0, 1].map(ox => {
            const on = num(b.ox) === ox && num(b.oy) === oy, step = corrStep(b.w);
            const name = `${['in alto', '', 'in basso'][oy + 1]} ${['a sinistra', '', 'a destra'][ox + 1]}`.trim() || 'al centro';
            return <button key={ox + ',' + oy} type="button" className={`tool ${on ? 'on' : ''}`} aria-pressed={on} title={`Corridoio ${name}`} aria-label={`Corridoio ${name}`}
              onClick={() => brush({ ox, oy })} dangerouslySetInnerHTML={{ __html: kindIcon('corr', { kind: 'corr', w: b.w, ox: ox * step, oy: oy * step }) }} />;
          }))}</div>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Clic su un corridoio già dipinto per spostarlo. Le stanze vicine aprono da sole il passaggio dove arriva.</p>
        </div>}
        {b.kind !== 'vuoto' && <Group label="Materiale">{Object.entries(TERRAIN).map(([v, l]) => <Tool key={v} on={b.terrain === v} onClick={() => brush({ terrain: v })} pic={icon(`<rect width="10" height="10" fill="url(#tex-${v})"/>`, '0 0 3 3')} label={l} />)}</Group>}
        {b.kind !== 'vuoto' && b.terrain === 'acqua' && <Group label="Tipo di acqua">
          {WATER.map(([c, l]) => <Tool key={c} on={w === c} onClick={() => brush({ water: c })} pic={waterIcon(c)} label={l} />)}
          <Tool on={!WATER.some(([c]) => c === w)} pic={waterIcon(w)} label="Altro colore">
            <input type="color" className="colorpick" value={w} aria-label="Colore dell'acqua" onChange={e => brush({ water: hex(e.target.value) })} />
          </Tool>
        </Group>}
        <Hint>Clic o trascina per dipingere i tasselli; <b>tasto destro</b> per tornare roccia. I corridoi si collegano da soli ai tasselli vicini; tra due stanze apri tu il passaggio.</Hint>
      </>;
    } else if (mode === 'edge') {
      const et = ui.edgeTool, dl = ui.doorLen || 0;
      body = <>
        <Group label="Strumento per i lati">{EDGE_TOOLS.map(([v, l]) => <Tool key={v} on={String(et) === String(v)} onClick={() => setUi({ edgeTool: v })} pic={edgeIcon(v)} label={l} />)}</Group>
        {GLYPH.has(et) && <Group label="Larghezza">{DOOR_LENS.map(([v, l]) => <Tool key={v} on={dl === v} onClick={() => setUi({ doorLen: v })} pic={doorLenIcon(et, v)} label={l} />)}</Group>}
        <Hint>Clic su un pallino per mettere lo strumento scelto su quel lato, anche sul bordo esterno. Con <b>Apri / chiudi</b> apri e chiudi porte e finestre durante la partita. Con <b>Senso di apertura</b> ogni clic cambia verso dove si apre la porta. <b>Aperto</b> unisce due stanze grandi in una sala. Trascina una porta per spostarla lungo il muro. Il <b>tasto destro</b> rimette il muro.</Hint>
      </>;
    } else if (mode === 'tok') {
      body = <>{tokBar}{tokHint}</>;
    } else if (mode === 'fog') {
      const f = lv.fog || {}, hide = ui.fogTool === 'hide';
      const fogIcon = shown => icon(`<rect width="10" height="10" fill="url(#tex-pietra)"/>${shown ? '' : '<rect width="10" height="10" fill="#0b0c10" opacity=".85"/>'}`);
      const all = on => setMaps(ms => {
        const m = ms.find(x => x.id === cur.id), l = curLevel(m, ui.levels), shown = {};
        if (on) for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) shown[x + ',' + y] = 1;
        l.fog = { on: true, ...l.fog, shown };
      });
      body = <>
        <Group label="Su questo piano"><Tool on={!!f.on} onClick={() => setLv(l => { l.fog = { shown: {}, ...l.fog, on: !l.fog?.on }; })} pic={fogIcon(false)} label={f.on ? 'Nebbia attiva' : 'Nebbia spenta'} /></Group>
        <Group label="Pennello"><Tool on={!hide} onClick={() => setUi({ fogTool: 'show' })} pic={fogIcon(true)} label="Rivela" /><Tool on={hide} onClick={() => setUi({ fogTool: 'hide' })} pic={fogIcon(false)} label="Copri" /></Group>
        <div className="row tight" style={{ marginBottom: 12 }}><button onClick={() => all(true)}>Rivela tutto</button><button onClick={() => all(false)}>Copri tutto</button></div>
        <Hint>Con la nebbia attiva i giocatori vedono solo i tasselli rivelati: tutto il resto non arriva proprio al loro dispositivo. I loro personaggi li vedono sempre. Clic o trascina per rivelare o coprire; il <b>tasto destro</b> fa il contrario.</Hint>
      </>;
    } else if (mode === 'note') {
      const ns = lv.notes || [];
      const setAll = on => setLv(l => l.notes?.forEach(n => { n.on = on; }));
      body = <>
        {ns.length ? <div className="toolgroup"><label>Note di questo piano · spuntate = le vedono i giocatori</label>
          {ns.map(n => <label key={n.id} className="inline" style={{ marginBottom: 6, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={!!n.on} onChange={e => setLv(l => { const x = l.notes?.find(y => y.id === n.id); if (x) x.on = e.target.checked; })} />
            <span>{n.text.length > 60 ? n.text.slice(0, 60) + '…' : n.text}</span></label>)}
          <div className="row tight"><button onClick={() => setAll(true)}>Mostra tutte</button><button onClick={() => setAll(false)}>Nascondi tutte</button></div></div>
          : <p className="muted">Nessuna nota su questo piano.</p>}
        <Hint>Clic sulla mappa per scrivere una nota: la freccia punta dove hai cliccato. Trascina il riquadro o la punta della freccia per spostarli. Clic su una nota per cambiarla, <b>tasto destro</b> per toglierla.</Hint>
      </>;
    } else {
      const st = OBJ[ob.type] ? ob.type : 'stairs', so = SIZE_OPTS[st]?.[sizeIdx(st, ob.sz)];
      const sample = { ...ob, type: st, ...(so && { w: so[0], h: so[1] }) };
      const og = OBJ_GROUPS.some(([g]) => g === ui.objGroup) ? ui.objGroup : OBJ[ob.type]?.[3] || 'pass';
      const obj = patch => setUi(u => ({ obj: { ...u.obj, ...patch } }));
      body = <>
        <nav className="subtabs">{OBJ_GROUPS.map(([g, l]) => <button key={g} className={g === og ? 'on' : ''} onClick={() => setUi({ objGroup: g })}>{l}</button>)}</nav>
        <div className="toolgroup"><div className="tools">{Object.entries(OBJ).filter(([, o]) => o[3] === og).map(([v, [, , l]]) =>
          <Tool key={v} on={ob.type === v} onClick={() => obj({ type: v })} pic={objIcon({ type: v, ladder: true })} label={l} />)}</div></div>
        <Group label="Strumenti">
          <Tool on={ob.type === 'ruin'} onClick={() => obj({ type: 'ruin' })} pic={objIcon({ type: 'stairs', ruined: true })} label="Rovina / ripara" />
          <Tool on={ob.type === 'erase'} onClick={() => obj({ type: 'erase' })} pic={crossIcon} label="Gomma" />
        </Group>
        {OBJ[ob.type] && <Group label="Opzioni">
          {CLIMB.has(ob.type) && <><Tool on={ob.dir !== 'down'} onClick={() => obj({ dir: 'up' })} pic={objIcon({ ...sample, dir: 'up', rot: 0 })} label="Sale" />
            <Tool on={ob.dir === 'down'} onClick={() => obj({ dir: 'down' })} pic={objIcon({ ...sample, dir: 'down', rot: 0 })} label="Scende" /></>}
          {SIZE_OPTS[ob.type]?.map(([w, h, l], i) => <Tool key={l} on={sizeIdx(ob.type, ob.sz) === i} onClick={() => obj({ sz: { ...ob.sz, [ob.type]: i } })}
            pic={objIcon({ ...sample, w, h, ruined: false })} label={`${l} (${meters(w)}×${meters(h)} m)`} />)}
          {!ROUND.has(ob.type) && <Tool onClick={() => obj({ rot: (ob.rot + 1) % 4 })} pic={objIcon({ ...sample, rot: ob.rot })} label={`Ruota (${ob.rot * 90}°)`} />}
          {(ob.type === 'hole' || ob.type === 'pit') && <Tool on={ob.ladder} onClick={() => obj({ ladder: !ob.ladder })} pic={objIcon({ ...sample, ladder: true, ruined: false })} label="Con scala a pioli" />}
          {VEG.has(ob.type) ? VEG_STATES.map(([v, l]) => <Tool key={v} on={(ob.veg || 'lush') === v} onClick={() => obj({ veg: v })} pic={objIcon({ type: ob.type, ruined: v === 'dry', inf: v === 'inf' })} label={l} />)
            : ob.type === 'well' || ((ob.type === 'hole' || ob.type === 'pit') && !ob.ladder) ? null
            : <Tool on={ob.ruined} onClick={() => obj({ ruined: !ob.ruined })} pic={objIcon({ ...sample, ruined: true })} label={ruinLabel(ob.type)} />}
        </Group>}
        <Hint>{ob.type === 'erase' ? 'Clic su un oggetto per toglierlo.'
          : ob.type === 'ruin' ? 'Clic su un oggetto per romperlo o ripararlo, anche durante la partita.'
          : 'Clic sul quadretto dove mettere l\'oggetto; trascina un oggetto per spostarlo. Scale e buchi compaiono da soli (tratteggiati) sul piano collegato.'
            + (VEG.has(ob.type) ? ' Clic su una pianta uguale già messa per cambiarne lo stato.' : '')} Il <b>tasto destro</b> toglie un oggetto.</Hint>
      </>;
    }
    tools = <>
      {levelBar}{ghostBar}
      <div className="row tight" style={{ marginBottom: 12, alignItems: 'end' }}>
        <div style={{ flex: 1, minWidth: 140 }}><label>Nome del piano</label><Field value={lv.name} aria="Nome del piano" onCommit={v => setLv(l => { l.name = v || l.name; })} /></div>
        {cur.levels.length > 1 && <button className="danger" onClick={async () => {
          if (await confirmBox(`Eliminare il piano "${lv.name}" con tutto quello che contiene?`, { ok: 'Elimina', danger: true })) edit(m => { m.levels = m.levels.filter(x => x.id !== lv.id); });
        }}>Elimina piano</button>}
      </div>
      <nav className="modes">{MODES.map(([v, l, ico], i) => <button key={v} className={mode === v ? 'on' : ''} onClick={() => setUi({ mapMode: v })} title={`Tasto ${i + 1}`}>
        <span className="ico">{ico}</span>{l}<kbd>{i + 1}</kbd></button>)}</nav>
      {body}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Scorciatoie: <b>1–6</b> strumenti · <b>R</b> ruota · <b>Ctrl+Z</b> annulla · <b>Ctrl + rotellina</b> zoom · <b>+ / −</b> ai bordi per allargare o stringere.</p>
    </>;
  }

  const p = ui.palPos;
  const palette = (
    <aside className={`palette ${p ? 'floating' : ''} ${ui.palMin ? 'min' : ''}`} style={p ? { left: Math.min(p.x, innerWidth - 160), top: Math.min(p.y, innerHeight - 50) } : undefined}>
      <div className="palhead" title="Trascina per spostare gli strumenti"><b>🧰 Strumenti</b><span className="spacer" />
        {p && <button onClick={() => setUi({ palPos: null })} title="Rimetti accanto alla mappa">Aggancia</button>}
        <button onClick={() => setUi({ palMin: !ui.palMin })} aria-label={`${ui.palMin ? 'Mostra' : 'Riduci'} gli strumenti`}>{ui.palMin ? 'Mostra' : '—'}</button></div>
      {!ui.palMin && <div className="palbody">{tools}</div>}
    </aside>
  );
  const canvas = <Canvas view={view} mode={mode} ctx={ctx} />;
  const side = (d, what) => <div className={`grow grow-${d}`}><span>
    <button onClick={() => grow(cur.id, d, 1)} title={`Aggiungi ${what}`}>+</button><button onClick={() => grow(cur.id, d, -1)} title={`Togli ${what}`}>−</button></span></div>;

  return <>
    {master && <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Impostazioni della mappa</h2>
        <button className="danger" onClick={async () => {
          if (await confirmBox(`Eliminare la mappa "${cur.name}"?`, { ok: 'Elimina', danger: true })) setMaps(ms => ms.splice(ms.findIndex(m => m.id === cur.id), 1));
        }}>Elimina mappa</button></div>
      <div className="grid">
        <div><label>Nome</label><Field value={cur.name} aria="Nome mappa" onCommit={v => edit(m => { m.name = v; })} /></div>
        {[['cols', 'Tasselli in larghezza'], ['rows', 'Tasselli in altezza']].map(([f, l]) => <div key={f}><label>{l}</label>
          <Field n value={cur[f]} aria={l} onCommit={v => edit(m => { m[f] = Math.min(MAX_TILES, Math.max(1, parseInt(v) || 1)); })} /></div>)}
        <div><label>Giocatori</label><label className="inline"><input type="checkbox" checked={!!cur.visible} onChange={e => edit(m => { m.visible = e.target.checked; })} /> mostra ai giocatori</label></div>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>{cur.cols * TILE}×{cur.rows * TILE} quadretti = {cur.cols * 15}×{cur.rows * 15} m · ogni tassello è 10×10 quadretti (15 m di lato)</p>
    </div>}
    <div className={`panel mapstage ${ui.mapFull ? 'full' : ''}`}>
      {bar}
      <div className={`mapbody ${p ? '' : 'docked'}`}>
        {palette}
        <div className="mapscroll">
          {master && mode !== 'tok'
            ? <div className={`growwrap ${z ? '' : 'fit'}`}>{side('n', 'una fila di tasselli in alto')}{side('w', 'una colonna di tasselli a sinistra')}{canvas}{side('e', 'una colonna di tasselli a destra')}{side('s', 'una fila di tasselli in basso')}</div>
            : canvas}
        </div>
      </div>
    </div>
  </>;
}
