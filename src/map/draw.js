// --- Disegno delle mappe in SVG (testo): 1 unità = 1 quadretto ---
import { esc } from '../util.js';
import {
  TILE, E, GLYPH, edgeOf, edgeSpan, floorOf, wallAt, doorFits, OBJ, CLIMB, FLAT, baseDims, footprint, space, tileMask, noteBox,
} from './geo.js';

// Texture dei materiali (si ripetono su tutta la mappa senza giunture tra i tasselli). Vanno una volta nella pagina.
export const TEXTURES = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <!-- griglia: linea scura su una fascia chiara più larga, così si vede sui pavimenti chiari, sulla roccia scura e anche
       sul pavimento a mattoni, dove cade proprio sulle fughe scure. Ogni quadretto disegna i suoi quattro lati: metà
       della linea per parte, così è centrata sul bordo e larga per intero. -->
  <pattern id="mapgrid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M0 0H1V1H0Z" fill="none" stroke="#f4f1ea" stroke-width=".16"/><path d="M0 0H1V1H0Z" fill="none" stroke="#111" stroke-width=".06"/></pattern>
  <pattern id="tex-roccia" width="3" height="3" patternUnits="userSpaceOnUse">
    <rect width="3" height="3" fill="#2d2a27"/>
    <path d="M.2 .4l.6-.3.5.4-.2.6-.7.1zM1.9 1.6l.7-.2.3.6-.5.5-.6-.3zM.6 2.2l.5.1.1.5-.6.1z" fill="#252220"/>
    <path d="M1.3 .3l.4.1-.1.3zM2.5 .9l.2.2-.3.1zM.3 1.5l.3.1-.2.2zM1.6 2.6l.3-.1.1.3z" fill="#3b3733"/>
  </pattern>
  <pattern id="tex-pietra" width="2" height="2" patternUnits="userSpaceOnUse">
    <rect width="2" height="2" fill="#6c665d"/>
    <rect x=".05" y=".05" width=".9" height=".9" rx=".08" fill="#b3ada2"/><rect x="1.05" y=".05" width=".9" height=".9" rx=".08" fill="#a69f93"/>
    <rect x="-.45" y="1.05" width=".9" height=".9" rx=".08" fill="#aca599"/><rect x=".55" y="1.05" width=".9" height=".9" rx=".08" fill="#bab4a9"/><rect x="1.55" y="1.05" width=".9" height=".9" rx=".08" fill="#aca599"/>
    <path d="M.2 .3h.15M1.6 .7h.1M.9 1.5h.15M1.8 1.3h.1" stroke="#8f887d" stroke-width=".05"/>
  </pattern>
  <pattern id="tex-legno" width="4" height="1" patternUnits="userSpaceOnUse">
    <rect width="4" height="1" fill="#6e4726"/>
    <rect y=".03" width="4" height=".44" fill="#b27d46"/><rect y=".53" width="4" height=".44" fill="#a6713d"/>
    <path d="M2.6 .03v.44M1.1 .53v.44M3.7 .53v.44" stroke="#6e4726" stroke-width=".05"/>
    <path d="M.1 .2q.6-.06 1.2 0t1.1 0M2.7 .32q.5.05 1.2 0M.2 .72q.4-.05.8 0M1.3 .82q.9.06 1.9 0" fill="none" stroke="#8d5d30" stroke-width=".03"/>
  </pattern>
  <pattern id="tex-erba" width="2" height="2" patternUnits="userSpaceOnUse">
    <rect width="2" height="2" fill="#73a04e"/>
    <circle cx=".5" cy=".6" r=".45" fill="#7dab57"/><circle cx="1.5" cy="1.5" r=".5" fill="#6a9647"/>
    <path d="M.3 .5l-.06-.2M.35 .5l.04-.22M.4 .5l.1-.17M1.3 1.3l-.05-.2M1.35 1.3l.05-.2M1.42 1.3l.1-.15M1.6 .4l-.04-.18M1.65 .4l.06-.18M.7 1.6l-.06-.18M.76 1.6l.05-.2" stroke="#4f7d33" stroke-width=".05" stroke-linecap="round"/>
    <path d="M.9 .2l.03-.12M.2 1.2l.03-.12M1.8 .9l.03-.12" stroke="#a7cc7a" stroke-width=".04" stroke-linecap="round"/>
  </pattern>
  <pattern id="tex-sabbia" width="2" height="2" patternUnits="userSpaceOnUse">
    <rect width="2" height="2" fill="#dcc590"/>
    <path d="M0 .6q.5-.15 1 0t1 0M0 1.6q.5-.15 1 0t1 0" fill="none" stroke="#c9ae74" stroke-width=".06"/>
    <g fill="#b99d63"><circle cx=".3" cy=".2" r=".03"/><circle cx="1.2" cy=".35" r=".03"/><circle cx=".8" cy="1.1" r=".03"/><circle cx="1.7" cy="1.25" r=".03"/><circle cx=".2" cy="1.9" r=".03"/></g>
    <g fill="#efdcae"><circle cx=".6" cy=".35" r=".03"/><circle cx="1.5" cy=".9" r=".03"/><circle cx="1.1" cy="1.85" r=".03"/></g>
  </pattern>
  <pattern id="tex-acqua" width="2" height="1" patternUnits="userSpaceOnUse">
    <rect width="2" height="1" fill="#4a82bb"/>
    <path d="M0 .3q.25-.14.5 0t.5 0" fill="none" stroke="#86b7e3" stroke-width=".07" stroke-linecap="round"/>
    <path d="M1 .8q.25-.14.5 0t.5 0" fill="none" stroke="#6ea2d4" stroke-width=".07" stroke-linecap="round"/>
  </pattern>
  <pattern id="tex-lava" width="2" height="2" patternUnits="userSpaceOnUse">
    <rect width="2" height="2" fill="#e8662a"/>
    <path d="M.1 .1l.7.05.1.55-.5.2-.35-.3zM1.05 .2l.8-.1.1.7-.6.2-.3-.4zM.2 1.1l.6-.1.3.6-.4.35-.5-.3zM1.2 1.1l.7.1-.05.7-.6.05-.15-.45z" fill="#4a1d10"/>
    <path d="M.9 .1l.15.9M0 1l2 .05M1.1 1.2l-.1.8" stroke="#ffc04d" stroke-width=".06"/>
  </pattern>
  <pattern id="tex-onde" width="2" height="1" patternUnits="userSpaceOnUse">
    <path d="M0 .3q.25-.14.5 0t.5 0" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width=".07" stroke-linecap="round"/>
    <path d="M1 .8q.25-.14.5 0t.5 0" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width=".07" stroke-linecap="round"/>
  </pattern>
  <clipPath id="half-a" clipPathUnits="objectBoundingBox"><path d="M-1 -1H2V.4L-1 .6z"/></clipPath>
  <clipPath id="half-b" clipPathUnits="objectBoundingBox"><path d="M-1 .6L2 .4V2H-1z"/></clipPath>
</defs></svg>`;

// Porta o finestra lunga L quadretti, disegnata in verticale lungo x=0 (poi ruotata per i lati orizzontali).
// Le parti aperte (battente, ante) vanno verso x negativo: chi chiama specchia il disegno verso il pavimento.
export function glyph(s, L) {
  const frame = '#141210', wood = '#d18a3a', woodDark = '#7a4a1c', hi = '#ffe2a6', glass = '#a8e4ff';
  const post = t => `<rect x="-.45" y="${t - .22}" width=".9" height=".44" rx=".08" fill="${frame}"/>`;
  if (s === E.porta) {
    let planks = '';
    for (let t = 1; t < L; t++) planks += `M-.3 ${t}H.3`;
    return `<rect x="-.48" y="-.12" width=".96" height="${L + .24}" rx=".12" fill="${frame}"/>
      <rect x="-.34" y=".06" width=".68" height="${L - .12}" rx=".08" fill="${wood}" stroke="${hi}" stroke-width=".09"/>
      <path d="${planks}" stroke="${woodDark}" stroke-width=".07"/>
      <circle cx=".16" cy="${L / 2}" r=".12" fill="${hi}" stroke="${frame}" stroke-width=".04"/>`;
  }
  if (s === E.portaAperta) {
    return `<path d="M0 ${L}A${L} ${L} 0 0 1 ${-L} 0" fill="${hi}" fill-opacity=".12" stroke="${hi}" stroke-width=".1" stroke-dasharray=".3 .2"/>
      ${post(0)}${post(L)}
      <rect x="${-L}" y="-.2" width="${L}" height=".4" rx=".08" fill="${wood}" stroke="${frame}" stroke-width=".09"/>
      <path d="M${-L + .15} 0H-.15" stroke="${hi}" stroke-width=".06"/>`;
  }
  if (s === E.finestra) {
    let bars = '';
    for (let t = 1; t < L; t++) bars += `M-.2 ${t}H.2`;
    return `<rect x="-.42" y="-.12" width=".84" height="${L + .24}" rx=".1" fill="${frame}"/>
      <rect x="-.24" y=".08" width=".48" height="${L - .16}" fill="${glass}" stroke="#fff" stroke-width=".06"/>
      <path d="M-.08 .25V${L - .25}" stroke="#fff" stroke-width=".07" stroke-opacity=".9"/>
      <path d="${bars}" stroke="${frame}" stroke-width=".09"/>`;
  }
  // finestra aperta: telaio vuoto e due ante girate verso l'interno
  const leaf = Math.min(L / 2, 1.6);
  const pane = (y0, dir) => `<g transform="translate(0 ${y0}) rotate(${dir * 45})"><rect x="${-leaf}" y="-.14" width="${leaf}" height=".28" fill="${glass}" stroke="${frame}" stroke-width=".08"/></g>`;
  return `${post(0)}${post(L)}<rect x="-.12" y="0" width=".24" height="${L}" fill="${glass}" fill-opacity=".25"/>
    ${pane(0, -1)}${pane(L, 1)}`;
}

// f: senso di apertura scelto dal master. bit 1: si apre verso l'altro lato; bit 2: cardini all'altra estremità.
const glyphG = (s, right, line, t0, L, floorA, f = 0) =>
  `<g transform="${right ? `translate(${line} ${t0})` : `translate(${t0} ${line}) rotate(-90)`}${(right ? !floorA : floorA) !== !!(f & 1) ? ' scale(-1 1)' : ''}${f & 2 ? ` translate(0 ${L}) scale(1 -1)` : ''}">${glyph(s, L)}</g>`;
export const doorGlyph = (F, { v, x, y, n, f }, s) => glyphG(s, v, v ? x : y, v ? y : x, n, Array.from({ length: n }, (_, i) => (v ? F(x - 1, y + i) : F(x + i, y - 1))).some(Boolean), f);

// Pavimenti, muri, porte e oggetti di un piano (senza la roccia di sfondo): serve anche per il piano visto in trasparenza.
// grid: opacità della griglia dei quadretti (0: niente griglia)
function layerSvg(m, mode, grid) {
  const W = m.cols * TILE, H = m.rows * TILE;
  const { floor, F } = floorOf(m);
  let rects = '', walls = '', glyphs = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W;) {
    const c = floor[y][x];
    let n = 1;
    while (x + n < W && floor[y][x + n] === c) n++;
    if (c?.startsWith('acqua')) rects += `<rect x="${x}" y="${y}" width="${n}" height="1.02" fill="${c.slice(5)}"/><rect x="${x}" y="${y}" width="${n}" height="1.02" fill="url(#tex-onde)"/>`;
    else if (c) rects += `<rect x="${x}" y="${y}" width="${n}" height="1.02" fill="url(#tex-${c})"/>`;
    x += n;
  }
  const doors = (m.doors || []).filter(dr => doorFits(m, F, dr)); // se il muro sotto non c'è più, la porta non si vede
  const doorSeg = new Set(doors.flatMap(({ v, x, y, n }) => Array.from({ length: n }, (_, i) => (v ? `${x - 1},${y + i},r` : `${x + i},${y - 1},b`))));
  const side = (x, y, right) => {
    if (wallAt(m, F, x, y, right) && !doorSeg.has(`${x},${y},${right ? 'r' : 'b'}`)) walls += right ? `M${x + 1} ${y}V${y + 1}` : `M${x} ${y + 1}H${x + 1}`;
  };
  for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) { if (y >= 0) side(x, y, true); if (x >= 0) side(x, y, false); }
  // in modalità "porte" ogni disegno si può trascinare
  const grab = (attrs, g) => (mode === 'edge' ? `<g data-door="1" ${attrs}>${g}</g>` : g);
  for (const dr of doors) glyphs += grab(`data-did="${dr.id}" data-n="${dr.n}" data-s="${dr.s}" data-f="${dr.f || 0}"`, doorGlyph(F, dr, dr.s));

  // porte e finestre: un disegno per lato, lungo quanto il pavimento nel varco
  for (const [k, s] of Object.entries(m.edges || {})) {
    if (!GLYPH.has(s)) continue;
    const [tx, ty, d] = k.split(','), x = +tx, y = +ty, right = d === 'e';
    if (right ? x < -1 || x >= m.cols || y < 0 || y >= m.rows : y < -1 || y >= m.rows || x < 0 || x >= m.cols) continue;
    const line = (right ? x + 1 : y + 1) * TILE, base = (right ? y : x) * TILE;
    const on = [];
    const [lo, hi] = edgeSpan(m, x, y, d); // il varco, anche dove arriva un corridoio spostato
    for (let p = lo; p < hi; p++) if (right ? F(line - 1, base + p) || F(line, base + p) : F(base + p, line - 1) || F(base + p, line)) on.push(p);
    if (!on.length) continue;
    let t0 = base + on[0], L = on.at(-1) - on[0] + 1;
    // il battente e le ante si aprono verso il pavimento (il lato A è a sinistra o sopra)
    const floorA = on.some(p => (right ? F(line - 1, base + p) : F(base + p, line - 1)));
    // porta più stretta del varco: al centro, e muro ai due lati
    const o = m.edoor?.[k], n = Math.min(L, o?.n || L), off = Math.floor((L - n) / 2);
    for (let p = t0; p < t0 + L; p++) if (p < t0 + off || p >= t0 + off + n) walls += right ? `M${line} ${p}V${p + 1}` : `M${p} ${line}H${p + 1}`;
    t0 += off;
    L = n;
    glyphs += grab(`data-ek="${k}" data-n="${L}" data-s="${s}" data-f="${o?.f || 0}"`, glyphG(s, right, line, t0, L, floorA, o?.f));
  }
  return `${rects}${grid ? `<rect data-grid width="${W}" height="${H}" fill="url(#mapgrid)" opacity="${grid}" pointer-events="none"/>` : ''}
    <path d="${walls}" stroke="#000" stroke-opacity=".35" stroke-width=".7" stroke-linecap="round" fill="none"/>
    <path d="${walls}" stroke="#2b2724" stroke-width=".3" stroke-linecap="square" fill="none"/>
    ${glyphs}${(m.arrivals || []).map(o => objSvg(o, true)).join('')}${[...(m.objects || [])].sort((a, b) => FLAT.has(b.type) - FLAT.has(a.type)).map(o => objSvg(o, false, mode === 'obj')).join('')}`;
}

// Nebbia di guerra sui tasselli non rivelati: nera per i giocatori, in trasparenza per il master.
function fogSvg(m, mode, master) {
  if (!m.fog?.on) return '';
  let d = '';
  for (let ty = 0; ty < m.rows; ty++) for (let tx = 0; tx < m.cols; tx++) if (!m.fog.shown?.[tx + ',' + ty]) d += `M${tx * TILE} ${ty * TILE}h${TILE}v${TILE}h-${TILE}z`;
  return `<path d="${d}" fill="#0b0c10" opacity="${master ? (mode === 'fog' ? .6 : .35) : 1}" pointer-events="none"/>`;
}

const DOT = ['#ffffff55', '#5fd38a', '#e3a85c', '#6fc3ff', '#e3a85c', '#9fd8ff', '#9fd8ff'];
// La mappa intera. ctx: { chars, me, master, tokChar, hideNotes, zoom, grid } della vista di chi guarda.
export function drawMap(m, mode, ctx) {
  const W = m.cols * TILE, H = m.rows * TILE;
  // il piano sopra o sotto, trasparente e non cliccabile, sopra quello mostrato
  const ghost = m.ghost ? `<g data-ghost opacity="${m.ghost.op}" pointer-events="none">${layerSvg(m.ghost.view)}</g>` : '';
  let overlay = '';
  if (mode && mode !== 'tok') {
    let lines = '';
    for (let x = 1; x < m.cols; x++) lines += `M${x * TILE} 0V${H}`;
    for (let y = 1; y < m.rows; y++) lines += `M0 ${y * TILE}H${W}`;
    overlay = `<path d="${lines}" stroke="#9b85ff" stroke-opacity=".7" stroke-width=".1" stroke-dasharray=".6 .4" fill="none" pointer-events="none"/>`;
    if (mode === 'edge') {
      const dot = (cx, cy, s) => `<circle cx="${cx}" cy="${cy}" r=".55" fill="${DOT[s] || DOT[0]}" stroke="#000" stroke-width=".1" opacity=".85" pointer-events="none"/>`;
      for (let ty = 0; ty < m.rows; ty++) for (let tx = 0; tx < m.cols; tx++) {
        overlay += dot((tx + 1) * TILE, ty * TILE + TILE / 2, edgeOf(m, tx, ty, 'e')) + dot(tx * TILE + TILE / 2, (ty + 1) * TILE, edgeOf(m, tx, ty, 's'));
        if (!tx) overlay += dot(0, ty * TILE + TILE / 2, edgeOf(m, tx, ty, 'w'));
        if (!ty) overlay += dot(tx * TILE + TILE / 2, 0, edgeOf(m, tx, ty, 'n'));
      }
    }
  }
  return `<svg id="mapsvg" data-id="${m.id}" viewBox="-.5 -.5 ${W + 1} ${H + 1}" role="img" aria-label="Mappa ${esc(m.name)}"
    style="display:block;width:${ctx.zoom ? `${(W + 1) * ctx.zoom}px` : '100%'};max-width:none;border-radius:10px;cursor:${mode && mode !== 'view' ? 'crosshair' : 'default'}">
    <rect x="-.5" y="-.5" width="${W + 1}" height="${H + 1}" fill="url(#tex-roccia)"/>
    ${layerSvg(m, mode, ctx.grid ?? .5)}${ghost}${fogSvg(m, mode, ctx.master)}${tokensSvg(m, mode, ctx)}${notesSvg(m, mode, ctx.hideNotes)}${overlay}</svg>`;
}

// --- Oggetti ---
function ladderShape(L, ruined, scale = 1) {
  const r = .3 * scale, frame = '#141210', wood = '#c9873f';
  let rails = `M${-r} ${-L / 2}V${L / 2}M${r} ${-L / 2}V${L / 2}`, rungs = '';
  if (ruined) rails = `M${-r} ${-L / 2}V${L / 2}M${r} ${-L / 2}V${-L * .05}M${r} ${L * .2}V${L / 2}`; // montante spezzato
  const n = Math.round(L / .4);
  for (let i = 1; i < n; i++) {
    if (ruined && (i === 2 || i === 3)) continue; // pioli mancanti
    const y = -L / 2 + i * L / n, tilt = ruined && i === n - 2 ? .18 : 0;
    rungs += `M${-r} ${y}L${r} ${y + tilt}`;
  }
  return `<path d="${rails}${rungs}" stroke="${frame}" stroke-width="${.24 * scale}" stroke-linecap="round" fill="none"/>
    <path d="${rails}${rungs}" stroke="${wood}" stroke-width="${.12 * scale}" stroke-linecap="round" fill="none"/>`;
}

// Arredo e natura, centrati in 0,0 a rotazione 0. Rotti: due metà spostate e schegge; piante: secche.
const WOOD = '#a8703a', WOOD_D = '#7a4a1c', INK = '#141210';
// Pianta infestata: ragnatele e macchie di muffa viola.
const blight = s => `<g transform="scale(${s})"><path d="M-.62 -.62L.62 .62M.62 -.62L-.62 .62M-.72 0H.72M0 -.72V.72" stroke="#eef" stroke-opacity=".5" stroke-width=".025"/>
  <circle r=".3" fill="none" stroke="#eef" stroke-opacity=".5" stroke-width=".025"/><circle r=".56" fill="none" stroke="#eef" stroke-opacity=".4" stroke-width=".025"/>
  <g fill="#9b5fc0" stroke="#3a1f4a" stroke-width=".03"><circle cx="-.45" cy="-.2" r=".12"/><circle cx=".3" cy="-.45" r=".1"/><circle cx=".45" cy=".3" r=".13"/><circle cx="-.2" cy=".45" r=".09"/><circle cx=".08" cy=".05" r=".07"/></g></g>`;
function decorShape(t, ruined, w, h, inf) {
  const k = `stroke="${INK}" stroke-width=".07"`;
  if (t === 'tree') {
    if (ruined) return `<g stroke="#4a3520" stroke-linecap="round" fill="none"><path d="M0 0L.75 -.45M0 0L-.7 -.55M0 0L-.6 .6M0 0L.55 .7M0 0L.1 -.9" stroke-width=".14"/>
      <path d="M.45 -.27L.6 -.05M-.42 -.33L-.5 -.1M-.35 .35L-.1 .55M.33 .42L.55 .35" stroke-width=".07"/></g><circle r=".24" fill="#5a4026" stroke="${INK}" stroke-width=".06"/>`;
    const [o, c, l, st] = inf ? ['#56603f', '#647048', '#8a8f6a', '#2c3320'] : ['#3f7a32', '#4d8f3c', '#6aab52', '#1f3d17'];
    return `<circle cx=".1" cy=".12" r=".92" fill="#000" opacity=".22"/>
      <g stroke="${st}" stroke-width=".06">${[[-.4, -.3, .5], [.38, -.32, .48], [.42, .35, .5], [-.36, .4, .48]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${o}"/>`).join('')}<circle r=".55" fill="${c}"/></g>
      <circle cx="-.2" cy="-.25" r=".22" fill="${l}" opacity=".7"/>${inf ? blight(1) : ''}`;
  }
  if (t === 'bush') {
    const [a, b, c] = ruined ? ['#8a7444', '#7a6a3a', '#6b5a32'] : inf ? ['#5f6a45', '#6a7048', '#545e3c'] : ['#4f8a3a', '#5a9a42', '#467d33'];
    return `<g stroke="${ruined ? '#4a3d22' : inf ? '#2c3320' : '#2f4f1f'}" stroke-width=".05"><circle cx="-.15" cy="-.1" r=".28" fill="${a}"/><circle cx=".17" cy="-.06" r=".26" fill="${b}"/><circle cy=".17" r=".27" fill="${c}"/></g>
      ${ruined ? '<path d="M-.3 -.3l.15.1M.3 .25l-.12-.05M.25 -.32l-.05.12" stroke="#4a3d22" stroke-width=".05"/>' : inf ? blight(.45) : '<circle cx="-.18" cy="-.16" r=".08" fill="#8cc46a"/>'}`;
  }
  const seats = [-1.4, -.7, 0, .7, 1.4], GOLD = '#d4a93c';
  const s = {
    bed: `<rect x="-.45" y="-.95" width=".9" height="1.9" rx=".08" fill="${WOOD_D}" ${k}/><rect x="-.37" y="-.5" width=".74" height="1.37" rx=".06" fill="#a8453c" stroke="#5e221d" stroke-width=".05"/>
      <path d="M-.37 -.3H.37" stroke="#d98a7a" stroke-width=".06"/><rect x="-.32" y="-.86" width=".64" height=".28" rx=".1" fill="#efe6d2" stroke="#8d8270" stroke-width=".04"/>`,
    chair: `<rect x="-.3" y="-.2" width=".6" height=".54" rx=".06" fill="${WOOD}" ${k}/><rect x="-.34" y="-.4" width=".68" height=".18" rx=".05" fill="${WOOD_D}" ${k}/>`,
    table: `<rect x="${-w / 2 + .08}" y="${-h / 2 + .08}" width="${w - .16}" height="${h - .16}" rx=".08" fill="#9c6a35" ${k}/>
      <path d="${Array.from({ length: Math.max(0, Math.floor((h - .56) / .28) + 1) }, (_, i) => `M${-w / 2 + .12} ${(-h / 2 + .36 + i * .28).toFixed(2)}H${w / 2 - .12}`).join('')}" stroke="${WOOD_D}" stroke-width=".04"/>`,
    barrel: `<circle r=".42" fill="${WOOD_D}" ${k}/><circle r=".33" fill="${WOOD}" stroke="#4a4a4a" stroke-width=".06"/><path d="M-.33 -.1H.33M-.33 .1H.33" stroke="${WOOD_D}" stroke-width=".03"/>`,
    crate: `<rect x="-.4" y="-.4" width=".8" height=".8" fill="#b98b4e" ${k}/><rect x="-.32" y="-.32" width=".64" height=".64" fill="none" stroke="#7a5a2c" stroke-width=".05"/>
      <path d="M-.32 -.32L.32 .32M.32 -.32L-.32 .32" stroke="#7a5a2c" stroke-width=".07"/>`,
    chest: `<rect x="-.42" y="-.3" width=".84" height=".6" rx=".08" fill="#8a5a2b" ${k}/><path d="M-.22 -.3V.3M.22 -.3V.3" stroke="#c9b26a" stroke-width=".07"/>
      <rect x="-.07" y=".12" width=".14" height=".14" fill="#e3c86a" stroke="${INK}" stroke-width=".03"/>`,
    mirror: `<ellipse rx=".3" ry=".42" fill="#c9a24a" ${k}/><ellipse rx=".22" ry=".33" fill="#cfe9f5"/>${ruined
      ? '<path d="M.02 -.05L-.15 -.25M.02 -.05L.18 -.2M.02 -.05L.12 .25M.02 -.05L-.18 .12" stroke="#4a5a66" stroke-width=".04"/>'
      : '<path d="M-.1 -.18q.06-.1.15-.12" stroke="#fff" stroke-width=".05" fill="none"/>'}`,
    rug: `<rect x="-.95" y="-1.42" width="1.9" height="2.84" rx=".05" fill="#8e2f3a" stroke="#5a1a22" stroke-width=".05"/><rect x="-.75" y="-1.22" width="1.5" height="2.44" fill="none" stroke="#d8a54a" stroke-width=".08"/>
      <path d="M0 -.85L.5 0L0 .85L-.5 0z" fill="#c4693a" stroke="#d8a54a" stroke-width=".05"/><path d="${[-.9, -.6, -.3, 0, .3, .6, .9].map(x => `M${x} -1.42V-1.52M${x} 1.42V1.52`).join('')}" stroke="#d8a54a" stroke-width=".04"/>`,
    shelf: `<rect x="${-w / 2 + .05}" y="-.35" width="${w - .1}" height=".7" fill="#6e4726" ${k}/>${Array.from({ length: Math.floor((w - .2) / .215) }, (_, i) =>
      `<rect x="${(-w / 2 + .15 + i * .215).toFixed(3)}" y="-.25" width=".17" height=".42" fill="${['#8e2f3a', '#2f5a8e', '#3f7a32', '#c9a24a', '#5a3a7a', '#c4693a'][i % 6]}"/>`).join('')}`,
    wardrobe: `<rect x="-.95" y="-.4" width="1.9" height=".8" rx=".05" fill="${WOOD_D}" ${k}/><path d="M0 -.4V.4" stroke="${INK}" stroke-width=".06"/><circle cx="-.12" r=".05" fill="#e3c86a"/><circle cx=".12" r=".05" fill="#e3c86a"/>`,
    brazier: `<circle r=".38" fill="#3a3a3a" ${k}/><circle r=".27" fill="${ruined ? '#2a2522' : '#e8662a'}"/>${ruined
      ? '<g fill="#555"><circle cx="-.08" cy=".05" r=".06"/><circle cx=".1" cy="-.06" r=".05"/></g>'
      : '<g fill="#ffc04d"><circle cx="-.08" cy=".04" r=".1"/><circle cx=".09" cy="-.06" r=".08"/><circle cx=".02" cy=".12" r=".06"/></g>'}`,
    // disegnata per 1×1 e ingrandita alla sua misura: i bordi restano sottili
    statue: `<g transform="scale(${w})"><rect x="-.42" y="-.42" width=".84" height=".84" fill="#8f8a82" stroke="${INK}" stroke-width="${.07 / w}"/>${w > 1 ? `<rect x="-.36" y="-.36" width=".72" height=".72" fill="none" stroke="#a7a198" stroke-width="${.03 / w}"/>` : ''}
      <ellipse rx=".3" ry=".15" cy=".06" fill="#c4beb4" stroke="#6a655e" stroke-width="${.04 / w}"/><circle r=".16" cy="-.04" fill="#d6d0c6" stroke="#6a655e" stroke-width="${.04 / w}"/></g>`,
    altar: `<rect x="-.92" y="-.4" width="1.84" height=".8" fill="#9d978d" ${k}/><rect x="-.78" y="-.28" width="1.56" height=".56" fill="#b8b2a8"/><circle cx="-.6" r=".08" fill="#ffe2a6"/><circle cx=".6" r=".08" fill="#ffe2a6"/>`,
    boulder: `<path d="M-.38 -.1L-.2 -.38L.18 -.4L.4 -.12L.34 .28L0 .4L-.32 .3z" fill="#8a847a" ${k}/><path d="M-.18 -.28L.12 -.3L.2 -.12" stroke="#b5afa4" stroke-width=".05" fill="none"/>`,
    throne: `<rect x="-.95" y="-.95" width="1.9" height="1.9" rx=".08" fill="#6e1a26" ${k}/><rect x="-.82" y="-.82" width="1.64" height="1.64" fill="none" stroke="#d8a54a" stroke-width=".06"/>
      <path d="M-.6 -.4V-.8L-.4 -.65L-.2 -.88L0 -.68L.2 -.88L.4 -.65L.6 -.8V-.4z" fill="${GOLD}" ${k}/>
      <rect x="-.62" y="-.42" width=".2" height=".95" rx=".06" fill="${GOLD}" ${k}/><rect x=".42" y="-.42" width=".2" height=".95" rx=".06" fill="${GOLD}" ${k}/>
      <rect x="-.42" y="-.4" width=".84" height=".88" rx=".08" fill="#a3243a" stroke="#5e1420" stroke-width=".05"/><circle cy="-.62" r=".08" fill="#3e8ef7" stroke="${INK}" stroke-width=".03"/>`,
    canopy: `<rect x="-.95" y="-1.45" width="1.9" height="2.9" rx=".06" fill="${WOOD_D}" ${k}/><rect x="-.8" y="-.9" width="1.6" height="2.2" rx=".06" fill="#5a3a7a" stroke="#d8a54a" stroke-width=".06"/>
      <path d="M-.8 -.6H.8" stroke="#d8a54a" stroke-width=".05"/><rect x="-.72" y="-1.3" width=".64" height=".32" rx=".12" fill="#efe6d2" stroke="#8d8270" stroke-width=".04"/><rect x=".08" y="-1.3" width=".64" height=".32" rx=".12" fill="#efe6d2" stroke="#8d8270" stroke-width=".04"/>
      <path d="M-.88 -1.3V1.3M.88 -1.3V1.3" stroke="#8e2f3a" stroke-width=".1" stroke-dasharray=".25 .08"/>
      <g fill="${GOLD}" ${k}><circle cx="-.86" cy="-1.36" r=".1"/><circle cx=".86" cy="-1.36" r=".1"/><circle cx="-.86" cy="1.36" r=".1"/><circle cx=".86" cy="1.36" r=".1"/></g>`,
    banquet: `${seats.map(x => `<rect x="${x - .22}" y="-.95" width=".44" height=".3" rx=".05" fill="${WOOD}" ${k}/><rect x="${x - .22}" y=".65" width=".44" height=".3" rx=".05" fill="${WOOD}" ${k}/>`).join('')}
      <rect x="-1.9" y="-.55" width="3.8" height="1.1" rx=".06" fill="#e8e0cc" ${k}/><rect x="-1.9" y="-.15" width="3.8" height=".3" fill="#8e2f3a"/>
      ${seats.map(x => `<circle cx="${x}" cy="-.35" r=".13" fill="#f7f3ea" stroke="#9a9384" stroke-width=".03"/><circle cx="${x}" cy=".35" r=".13" fill="#f7f3ea" stroke="#9a9384" stroke-width=".03"/>`).join('')}
      <g fill="${GOLD}" stroke="${INK}" stroke-width=".02"><circle cx="-1.05" r=".07"/><circle cx=".35" r=".07"/><circle cx="1.05" r=".07"/></g><ellipse cx="-.35" rx=".25" ry=".12" fill="#c4693a" stroke="${INK}" stroke-width=".03"/>`,
    carpet: `<rect x="-.8" y="-2.92" width="1.6" height="5.84" fill="#a01c2c" stroke="#5a1a22" stroke-width=".05"/><rect x="-.65" y="-2.77" width="1.3" height="5.54" fill="none" stroke="#d8a54a" stroke-width=".07"/>
      <path d="M0 -.5L.35 0L0 .5L-.35 0z" fill="#d8a54a"/><path d="${[-.6, -.3, 0, .3, .6].map(x => `M${x} -2.92V-3M${x} 2.92V3`).join('')}" stroke="#d8a54a" stroke-width=".04"/>`,
    candelabra: `${ruined ? '' : '<circle r=".48" fill="#ffc04d" opacity=".18"/>'}<circle r=".3" fill="#b8902f" ${k}/><path d="M-.32 0H.32M0 -.32V.32" stroke="${GOLD}" stroke-width=".08" stroke-linecap="round"/>
      ${[[0, 0], [-.32, 0], [.32, 0], [0, -.32], [0, .32]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".08" fill="#efe6d2" stroke="${INK}" stroke-width=".02"/>${ruined ? '' : `<circle cx="${x}" cy="${y}" r=".05" fill="#ffc04d"/>`}`).join('')}`,
    banner: `<path d="M-.43 -.38H.43" stroke="${GOLD}" stroke-width=".08" stroke-linecap="round"/><path d="M-.3 -.36H.3V.4L0 .2L-.3 .4z" fill="#8e2f3a" ${k}/>
      <path d="M-.16 -.22H.16V.12L0 .02L-.16 .12z" fill="#d8a54a"/><circle cx="-.43" cy="-.38" r=".06" fill="${GOLD}"/><circle cx=".43" cy="-.38" r=".06" fill="${GOLD}"/>`,
    coffer: `<rect x="-.42" y="-.3" width=".84" height=".6" rx=".08" fill="#4a2a5e" ${k}/><path d="M-.42 -.05H.42M-.25 -.3V.3M.25 -.3V.3" stroke="${GOLD}" stroke-width=".06"/>
      <circle cy="-.05" r=".09" fill="#e5484d" stroke="${GOLD}" stroke-width=".03"/><g fill="#f2c14e" stroke="#8a6a1a" stroke-width=".02"><circle cx=".38" cy=".4" r=".07"/><circle cx=".24" cy=".44" r=".06"/><circle cx="-.36" cy=".42" r=".06"/></g>`,
    fountain: `<circle r=".95" fill="url(#tex-pietra)" ${k}/><circle r=".75" fill="${ruined ? '#3a332c' : '#4a82bb'}" stroke="#4a4540" stroke-width=".06"/>
      ${ruined ? '' : '<circle r=".75" fill="url(#tex-onde)"/><circle r=".46" fill="none" stroke="#cfe9f5" stroke-width=".04" opacity=".7"/>'}<circle r=".22" fill="#b3ada2" ${k}/><circle r=".1" fill="${ruined ? '#6c665d' : '#cfe9f5'}"/>`,
  }[t];
  if (!ruined) return s;
  return `<g clip-path="url(#half-a)" transform="translate(-.06 -.07) rotate(-7)">${s}</g><g clip-path="url(#half-b)" transform="translate(.06 .06) rotate(6)">${s}</g>
    <g fill="#4a3d30"><circle cx="${w * .4}" cy="${-h * .38}" r=".05"/><circle cx="${-w * .42}" cy="${h * .35}" r=".045"/><circle cx="${w * .35}" cy="${h * .42}" r=".035"/></g>`;
}

// Disegno centrato in 0,0 a rotazione 0.
function objShape(o, arrival) {
  const [w, h] = baseDims(o), frame = '#141210';
  if (OBJ[o.type][3] !== 'pass') return decorShape(o.type, o.ruined, w, h, o.inf);
  const dash = arrival ? 'stroke="#ffe2a6" stroke-width=".12" stroke-dasharray=".35 .25"' : `stroke="${frame}" stroke-width=".12"`;
  if (o.type === 'stairs') {
    const n = Math.max(4, Math.round(h * 2)); // un gradino ogni 75 cm
    let steps = '';
    for (let i = 0; i < n; i++) {
      if (o.ruined && (i === 2 || i === 3)) continue;
      const c = 205 - (o.dir === 'down' ? n - 1 - i : i) * 16; // gradini più chiari = più in alto; la freccia indica dove si cammina
      steps += `<rect x="${-w / 2 + .1}" y="${-h / 2 + i * h / n + .05}" width="${w - .2}" height="${h / n - .08}" fill="rgb(${c} ${c - 10} ${c - 24})"/>`;
    }
    // macerie disegnate per la scala 2×3, adattate alla misura
    const ruin = o.ruined ? `<rect x="${-w / 2 + .1}" y="${-h / 2 + 2 * h / n}" width="${w - .2}" height="${2 * h / n}" fill="#1a1714"/><g transform="scale(${w / 2} ${h / 3})">
      <g fill="#7d746a"><circle cx="-.5" cy="-.3" r=".16"/><circle cx=".1" cy=".1" r=".12"/><circle cx=".55" cy="-.15" r=".18"/><circle cx="-.15" cy="-.05" r=".09"/></g>
      <path d="M-.9 -1.1l.4.3-.2.3.5.2M.4 .9l.3-.3.3.15" stroke="#1a1714" stroke-width=".07" fill="none"/></g>` : '';
    const arrow = `<path d="M0 ${h / 2 - .35}V${-h / 2 + .55}" stroke="${frame}" stroke-width=".14"/><path d="M-.3 ${-h / 2 + .7}L0 ${-h / 2 + .3}L.3 ${-h / 2 + .7}z" fill="${frame}"/>`;
    return `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx=".08" fill="#4b443c" ${dash}/>${steps}${ruin}${o.ruined ? '' : arrow}`;
  }
  if (o.type === 'spiral') {
    // gradini a spicchio attorno al palo, più chiari = più in alto; si sale girando in senso orario
    const n = 9, R = .9, r = .22, p = (rad, a) => `${(rad * Math.cos(a)).toFixed(3)} ${(rad * Math.sin(a)).toFixed(3)}`;
    const k = w / 2, dash = arrival ? `stroke="#ffe2a6" stroke-width="${.12 / k}" stroke-dasharray="${.35 / k} ${.25 / k}"` : `stroke="${frame}" stroke-width="${.12 / k}"`; // disegnata per 2×2 e ingrandita: bordi sottili
    let steps = '';
    for (let i = 0; i < n; i++) {
      if (o.ruined && (i === 3 || i === 4)) continue;
      const a0 = -Math.PI / 2 + i / n * 2 * Math.PI, a1 = a0 + 2 * Math.PI / n, c = 110 + (o.dir === 'down' ? n - 1 - i : i) * 12;
      steps += `<path d="M${p(r, a0)}L${p(R, a0)}A${R} ${R} 0 0 1 ${p(R, a1)}L${p(r, a1)}z" fill="rgb(${c} ${c - 10} ${c - 24})" stroke="${frame}" stroke-width="${.04 / k}"/>`;
    }
    const e = -Math.PI / 2 - .5, tip = [.58 * Math.cos(e), .58 * Math.sin(e)], t = [-Math.sin(e), Math.cos(e)], nrm = [Math.cos(e), Math.sin(e)];
    const head = [[tip[0] + t[0] * .22, tip[1] + t[1] * .22], [tip[0] + nrm[0] * .13, tip[1] + nrm[1] * .13], [tip[0] - nrm[0] * .13, tip[1] - nrm[1] * .13]].map(q => q.map(v => v.toFixed(3)).join(' '));
    const arrow = `<path d="M${p(.58, -Math.PI / 2 + .35)}A.58 .58 0 1 1 ${p(.58, e)}" stroke="${frame}" stroke-width="${.1 / k}" fill="none"/><path d="M${head[0]}L${head[1]}L${head[2]}z" fill="${frame}"/>`;
    const ruin = o.ruined ? `<g fill="#7d746a"><circle cx=".55" cy=".35" r=".12"/><circle cx=".3" cy=".6" r=".09"/><circle cx=".62" cy=".05" r=".08"/></g>` : '';
    return `<g transform="scale(${k})"><circle r=".97" fill="#1a1714" ${dash}/>${steps}${ruin}<circle r="${r}" fill="#3a332c" stroke="${frame}" stroke-width="${.06 / k}"/>${o.ruined ? '' : arrow}</g>`;
  }
  if (o.type === 'ladder') return `${arrival ? `<rect x="-.5" y="-1" width="1" height="2" fill="none" ${dash}/>` : ''}${ladderShape(h - .1, o.ruined)}`;
  if (o.type === 'well') {
    return `<circle r=".95" fill="url(#tex-pietra)" stroke="${frame}" stroke-width=".14"/><circle r=".6" fill="#163049" stroke="#0b1622" stroke-width=".1"/>
      <path d="M-.35 -.2a.45 .45 0 0 1 .5 -.25" stroke="#5d90c4" stroke-width=".08" fill="none"/>`;
  }
  const ladder = o.ladder ? `<g opacity="${o.type === 'pit' ? .9 : 1}">${ladderShape(1.5, o.ruined, .8)}</g>` : '';
  if (o.type === 'hole') {
    // apertura nel soffitto: cerchio di luce tratteggiato
    return `<circle r=".92" fill="#fff3c4" fill-opacity=".3" stroke="#ffe9a0" stroke-width=".12" stroke-dasharray=".3 .2"/>
      <path d="M-.5 -.5l.25 .25M.5 -.5l-.25 .25M-.5 .5l.25 -.25M.5 .5l-.25 -.25" stroke="#ffe9a0" stroke-width=".06"/>${ladder}`;
  }
  // buco nel pavimento: pozzo buio con bordo
  return `<circle r=".92" fill="#080706" stroke="#4a433b" stroke-width=".18"/><circle r=".66" fill="none" stroke="#1d1a17" stroke-width=".12"/>${ladder}`;
}

function objSvg(o, arrival, draggable) {
  const [fw, fh] = footprint(o), cx = o.x + fw / 2, cy = o.y + fh / 2;
  const label = CLIMB.has(o.type) ? (o.dir === 'down' ? 'GIÙ' : 'SU') : '';
  const txt = (t, dy, col) => `<text x="${cx}" y="${cy + dy}" font-size=".55" font-weight="800" text-anchor="middle" dominant-baseline="central"
    fill="${col}" stroke="#000" stroke-width=".16" paint-order="stroke" font-family="system-ui, sans-serif">${t}</text>`;
  return `<g opacity="${arrival ? .85 : 1}" ${draggable ? `data-oid="${o.id}"` : ''}><g transform="translate(${cx} ${cy}) rotate(${o.rot * 90})">${objShape(o, arrival)}</g>
    ${label ? txt(label, o.ruined ? -.4 : 0, '#fff') : ''}${o.ruined && OBJ[o.type][3] === 'pass' ? txt('INAGIBILE', label ? .4 : 0, '#ff6b5e') : ''}</g>`;
}

// --- Segnalini ---
const TOK_COLORS = ['#e5484d', '#3e8ef7', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e93d82', '#ad7f58'];
export const tokColor = cid => TOK_COLORS[Math.abs([...String(cid)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 0)) % TOK_COLORS.length];
export const initials = c => String(c.name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
// Segnalini dei personaggi sul piano mostrato; quelli che puoi muovere si trascinano.
function tokensSvg(m, mode, { chars, me, master, tokChar }) {
  return Object.entries(m.tokens || {}).filter(([cid, t]) => t.lv === m.lvId && chars[cid]).map(([cid, t]) => {
    const c = chars[cid], mine = mode === 'tok' && (master || c.owner === me), s = space(c), n = Math.max(1, s), k = Math.max(s, .3); // k: i piccolissimi restano cliccabili
    const r = .46 * k, sw = .1 * Math.sqrt(k);
    // con l'avatar: l'immagine ritagliata nel cerchio; senza: le iniziali sul colore del personaggio
    const face = c.avatar
      ? `<clipPath id="tc-${cid}"><circle r="${r}"/></clipPath><circle r="${r}" fill="${tokColor(cid)}"/>
        <image href="${esc(c.avatar)}" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" clip-path="url(#tc-${cid})" preserveAspectRatio="xMidYMid slice"/>`
      : `<circle r="${r}" fill="${tokColor(cid)}"/>
        <text font-size="${.42 * Math.max(k, .5)}" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="system-ui, sans-serif">${esc(initials(c))}</text>`;
    // un mostro ancora nascosto ai giocatori: il master lo vede trasparente e tratteggiato
    const ring = c.hidden ? `stroke="#ffd84d" stroke-dasharray="${.2 * k} ${.12 * k}"` : `stroke="${cid === tokChar && mine ? '#fff' : '#111'}"`;
    return `<g data-cid="${cid}" ${mine ? `data-tok="${cid}"` : ''} ${c.hidden ? 'opacity=".6"' : ''}><g transform="translate(${t.x + n / 2} ${t.y + n / 2})"><title>${esc(c.name || 'Senza nome')} (${esc(c.size || 'Media')})${c.hidden ? ' · nascosto ai giocatori' : ''}</title>
      ${face}<circle r="${r}" fill="none" ${ring} stroke-width="${sw}"/>
      <text y="${.46 * k + .32}" font-size=".34" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#fff" stroke="#000" stroke-width=".12" paint-order="stroke" font-family="system-ui, sans-serif">${esc(String(c.name || '').slice(0, 14))}</text></g></g>`;
  }).join('');
}

// --- Note ---
export function noteInner(n, editable) {
  const { lines, w, h } = noteBox(n.text);
  const dx = n.ax - n.x, dy = n.ay - n.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  // la freccia parte da dietro il riquadro; niente freccia se la punta è dentro il riquadro
  const arrow = Math.abs(dx) > w / 2 + .3 || Math.abs(dy) > h / 2 + .3 ? (() => {
    const bx = n.ax - ux * .7, by = n.ay - uy * .7, f = v => v.toFixed(2);
    const head = `M${f(n.ax)} ${f(n.ay)}L${f(bx - uy * .32)} ${f(by + ux * .32)}L${f(bx + uy * .32)} ${f(by - ux * .32)}z`;
    return `<path d="M${n.x} ${n.y}L${f(bx)} ${f(by)}" stroke="#2a2116" stroke-width=".26" stroke-linecap="round"/><path d="M${n.x} ${n.y}L${f(bx)} ${f(by)}" stroke="#f2d58a" stroke-width=".12"/>
      <path d="${head}" fill="#f2d58a" stroke="#2a2116" stroke-width=".07" stroke-linejoin="round"/>`;
  })() : '';
  return `${arrow}${editable ? `<circle data-ntip cx="${n.ax}" cy="${n.ay}" r=".5" fill="transparent"/>` : ''}
    <rect x="${n.x - w / 2}" y="${n.y - h / 2}" width="${w}" height="${h}" rx=".25" fill="#fff6dc" stroke="#5a4a2a" stroke-width=".08" ${n.on ? '' : 'stroke-dasharray=".3 .2"'}/>
    <text x="${n.x}" y="${n.y - h / 2 + .27}" font-size=".62" text-anchor="middle" fill="#2a2116" font-family="Georgia, 'Times New Roman', serif">
      ${lines.map((l, i) => `<tspan x="${n.x}" dy="${i ? .85 : .62}">${esc(l)}</tspan>`).join('')}</text>`;
}
// Il master vede anche le note spente (più chiare, bordo tratteggiato); in modalità "note" le trascina.
function notesSvg(m, mode, hide) {
  if (hide) return '';
  const editable = mode === 'note';
  return (m.notes || []).map(n => `<g ${editable ? `data-note="${n.id}"` : 'pointer-events="none"'} ${n.on ? '' : 'opacity=".75"'}>${noteInner(n, editable)}</g>`).join('');
}

// --- Anteprime per i bottoni degli strumenti ---
export const icon = (inner, vb = '0 0 10 10') => `<svg viewBox="${vb}" width="52" height="52" aria-hidden="true">${inner}</svg>`;
// t: il tassello da disegnare (per i corridoi anche larghezza e spostamento)
export function kindIcon(kind, t = { kind, w: 2 }) {
  const m = { tiles: { '0,0': t }, edges: kind === 'corr' ? { '0,0,e': 1, '0,0,s': 1, '-1,0,e': 1, '0,-1,s': 1 } : {} };
  let d = '';
  tileMask(m, 0, 0).forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
  return icon(`<rect width="10" height="10" fill="url(#tex-roccia)"/><path d="${d}" fill="url(#tex-pietra)" stroke="#2b2724" stroke-width=".05"/>`);
}
export const edgeIcon = s => icon(`<rect x="-2.5" y="-.5" width="5" height="5" fill="url(#tex-pietra)"/>
  ${s === E.muro ? '<path d="M0 -.5V4.5" stroke="#2b2724" stroke-width=".4"/>' : s === E.aperto ? '' : '<path d="M0 -.5V0M0 4V4.5" stroke="#2b2724" stroke-width=".4"/>'}
  ${s === 'toggle' ? glyph(E.portaAperta, 4) : s === 'flip' // porta aperta dall'altra parte, con una freccia che gira
    ? `<g transform="scale(-1 1)">${glyph(E.portaAperta, 4)}</g><path d="M-1.6 3.6a1.4 1.4 0 0 1 -.2-2" stroke="#9b85ff" stroke-width=".25" fill="none"/><path d="M-2.2 1.9l.5-.6.4.7z" fill="#9b85ff"/>` : GLYPH.has(s) ? glyph(s, 4) : ''}`, '-2.5 -.5 5 5');
export const doorLenIcon = (s, v) => icon(`<rect x="-2.5" y="-.5" width="5" height="5" fill="url(#tex-pietra)"/><path d="M0 -.5V4.5" stroke="#2b2724" stroke-width=".4"/><g transform="translate(0 ${(4 - (v || 4)) / 2})">${glyph(s, v || 4)}</g>`, '-2.5 -.5 5 5');
export const tokIcon = c => icon(c.avatar
  ? `<clipPath id="ti-${c.id}"><circle cx="5" cy="5" r="4.3"/></clipPath><image href="${esc(c.avatar)}" x=".7" y=".7" width="8.6" height="8.6" clip-path="url(#ti-${c.id})" preserveAspectRatio="xMidYMid slice"/>
    <circle cx="5" cy="5" r="4.3" fill="none" stroke="#111" stroke-width=".6"/>`
  : `<circle cx="5" cy="5" r="4.3" fill="${tokColor(c.id)}" stroke="#111" stroke-width=".6"/>
  <text x="5" y="5" font-size="3.8" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="system-ui, sans-serif">${esc(initials(c))}</text>`);
export const objIcon = o => {
  const s = Math.max(3.4, ...baseDims(o).map(n => n + .4)); // gli oggetti lunghi entrano interi
  return icon(`<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" fill="url(#tex-pietra)"/>${objShape({ dir: 'up', rot: 0, ...o })}`, `${-s / 2} ${-s / 2} ${s} ${s}`);
};
export const crossIcon = icon('<path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="#e5484d" stroke-width="1.2" stroke-linecap="round"/>');
