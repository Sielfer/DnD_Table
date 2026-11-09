// Regole di D&D 3.5 usate dalla scheda e dal combattimento.
import { num, mod } from './util.js';

export const ABIL = { str: 'FOR', dex: 'DES', con: 'COS', int: 'INT', wis: 'SAG', cha: 'CAR' };
export const ABOPTS = Object.entries(ABIL);
// [mod. CA/attacco, mod. lotta]
export const SIZES = { Piccolissima: [8, -16], Minuta: [4, -12], Minuscola: [2, -8], Piccola: [1, -4], Media: [0, 0], Grande: [-1, 4], Enorme: [-2, 8], Mastodontica: [-4, 12], Colossale: [-8, 16] };
// [nome, caratteristica, penalità armatura]
export const SKILLS = [
  ['Acrobazia', 'dex', 1], ['Addestrare Animali', 'cha'], ['Artigianato ()', 'int'], ['Artista della Fuga', 'dex', 1], ['Ascoltare', 'wis'],
  ['Camuffare', 'cha'], ['Cavalcare', 'dex'], ['Cercare', 'int'], ['Concentrazione', 'con'],
  ['Conoscenze (arcane)', 'int'], ['Conoscenze (architettura e ingegneria)', 'int'], ['Conoscenze (dungeon)', 'int'], ['Conoscenze (geografia)', 'int'],
  ['Conoscenze (locali)', 'int'], ['Conoscenze (natura)', 'int'], ['Conoscenze (nobiltà e regalità)', 'int'], ['Conoscenze (piani)', 'int'],
  ['Conoscenze (religioni)', 'int'], ['Conoscenze (storia)', 'int'], ['Decifrare Scritture', 'int'], ['Diplomazia', 'cha'],
  ['Disattivare Congegni', 'int'], ['Equilibrio', 'dex', 1], ['Falsificare', 'int'], ['Guarire', 'wis'], ['Intimidire', 'cha'],
  ['Intrattenere ()', 'cha'], ['Muoversi Silenziosamente', 'dex', 1], ['Nascondersi', 'dex', 1], ['Nuotare', 'str', 1], ['Osservare', 'wis'],
  ['Percepire Intenzioni', 'wis'], ['Professione ()', 'wis'], ['Raccogliere Informazioni', 'cha'], ['Raggirare', 'cha'],
  ['Rapidità di Mano', 'dex', 1], ['Saltare', 'str', 1], ['Sapienza Magica', 'int'], ['Scalare', 'str', 1], ['Scassinare Serrature', 'dex'],
  ['Sopravvivenza', 'wis'], ['Utilizzare Corde', 'dex'], ['Utilizzare Oggetti Magici', 'cha'], ['Valutare', 'int'],
];

// Statistiche che talenti, buff e oggetti possono modificare.
export const MOD_TARGETS = [...ABOPTS, ['ac', 'CA'], ['atk', 'Attacco'], ['melee', 'Mischia'], ['ranged', 'Distanza'], ['dmg', 'Danni'],
  ['saves', 'Tiri salvezza'], ['fort', 'Tempra'], ['ref', 'Riflessi'], ['will', 'Volontà'], ['init', 'Iniziativa'], ['hp', 'PF massimi'], ['skills', 'Abilità (tutte)']];

// Espressione di un modificatore: numeri, + - * / ( ) e le variabili FOR…CAR (modificatori), LIV, BAB.
// Niente eval: le scrivono i giocatori e girano nel browser di tutti. Le divisioni arrotondano per difetto, come in D&D.
export function evalExpr(src, vars) {
  const t = String(src ?? '').match(/\d+(?:[.,]\d+)?|[A-Za-zÀ-ÿ]+|\S/g) || [];
  let i = 0;
  const prim = () => {
    const x = t[i++];
    if (x === '(') { const v = sum(); if (t[i++] !== ')') throw 0; return v; }
    if (x === '-') return -prim();
    if (x === '+') return prim();
    if (/^\d/.test(x)) return Number(x.replace(',', '.'));
    const k = x?.toUpperCase();
    if (Object.hasOwn(vars, k)) return vars[k];
    throw 0;
  };
  const prod = () => { let v = prim(); while (t[i] === '*' || t[i] === '/') v = t[i++] === '*' ? v * prim() : Math.floor(v / prim()); return v; };
  const sum = () => { let v = prod(); while (t[i] === '+' || t[i] === '-') v = t[i++] === '+' ? v + prod() : v - prod(); return v; };
  try { const v = sum(); return i === t.length && Number.isFinite(v) ? Math.floor(v) : NaN; } catch { return NaN; }
}
// Dadi nei Danni (es. "+1d6" di un'arma infuocata): si aggiungono al tiro così come sono.
export const isDice = e => /^\s*[+-]?\s*(\d*d\d+|\d+)(\s*[+-]\s*(\d*d\d+|\d+))*\s*$/i.test(e ?? '') && /d/i.test(e);

const list = (c, k) => (Array.isArray(c[k]) ? c[k].filter(Boolean) : []);
// Modificatori in vigore: talenti e capacità speciali sempre (i buff solo se accesi), gli oggetti finché sono "in uso".
export const activeMods = c => [...list(c, 'feats'), ...list(c, 'special')].filter(f => !f.buff || f.on).concat(list(c, 'gear').filter(g => g.on !== false))
  .flatMap(r => (Array.isArray(r.mods) ? r.mods.filter(m => m && m.t) : []));

export function calc(c) {
  const lvl = num(c.level);
  // "+7/+5/+3": il primo è il BAB usato nei calcoli, gli altri sono gli attacchi aggiuntivi
  const babs = String(c.bab ?? '').match(/[+-]?\d+/g)?.map(Number) || [0], bab = babs[0];
  const score = k => { const a = c.abil?.[k] || {}; return num(a.temp !== undefined && a.temp !== '' ? a.temp : (a.score === undefined || a.score === '' ? 10 : a.score)); };
  const vars = ab => ({ ...Object.fromEntries(ABOPTS.map(([k, l]) => [l, ab(k)])), LIV: lvl, LIVELLO: lvl, BAB: bab });
  // prima le caratteristiche (calcolate con quelle di partenza), poi il resto con le caratteristiche già modificate
  const mods = activeMods(c), bonus = {}, dmgDice = [];
  const add = (m, v) => { const n = evalExpr(m.e, v); if (!Number.isNaN(n)) bonus[m.t] = (bonus[m.t] || 0) + n; };
  const v0 = vars(k => mod(score(k)));
  mods.filter(m => ABIL[m.t]).forEach(m => add(m, v0));
  const B = t => bonus[t] || 0;
  const ab = k => mod(score(k) + B(k));
  const v1 = vars(ab);
  mods.filter(m => !ABIL[m.t]).forEach(m => (m.t === 'dmg' && isDice(m.e) ? dmgDice.push(m.e.trim()) : add(m, v1)));
  const [sz, gsz] = SIZES[c.size] || SIZES.Media;
  const a = c.ac || {};
  const dex = a.maxDex !== undefined && a.maxDex !== '' ? Math.min(ab('dex'), num(a.maxDex)) : ab('dex');
  // shortcut: il bonus "CA" dei modificatori vale anche per contatto e colto alla sprovvista; per distinguerli servirebbero i tipi di bonus
  const ac = 10 + num(a.armor) + num(a.shield) + dex + sz + num(a.natural) + num(a.deflection) + num(a.misc) + B('ac');
  // punti abilità 3.5: (punti di classe + mod. INT base, min. 1) × (livello + 3); gli Umani +1 a livello (+4 al 1°)
  const perLevel = Math.max(1, num(c.skillPts) + mod(c.abil?.int?.score || 10)) + (/^\s*uman[oaie]\b/i.test(c.race || '') ? 1 : 0);
  const save = (k, abil) => num(c.saves?.[k]?.base) + ab(abil) + num(c.saves?.[k]?.magic) + num(c.saves?.[k]?.misc) + B('saves') + B(k);
  return {
    ab, ac, bab, babs, bonus, vars: v1,
    touch: 10 + dex + sz + num(a.deflection) + num(a.misc) + B('ac'),
    ff: ac - Math.max(0, dex),
    init: ab('dex') + num(c.initMisc) + B('init'),
    melee: bab + ab('str') + sz + B('atk') + B('melee'),
    ranged: bab + ab('dex') + sz + B('atk') + B('ranged'),
    atk: B('atk'), dmg: B('dmg'), dmgDice,
    hpMax: c.hp?.max === undefined || c.hp?.max === '' ? null : num(c.hp.max) + B('hp'),
    skill: name => B('skills') + B('skill:' + name),
    grapple: bab + ab('str') + gsz + num(c.grappleMisc),
    fort: save('fort', 'con'), ref: save('ref', 'dex'), will: save('will', 'wis'),
    acp: num(a.acp),
    skillTot: (lvl ? perLevel * (lvl + 3) : 0) + num(c.skillMisc),
    // abilità non di classe: 2 punti per grado
    skillUsed: (c.skills || []).reduce((t, s) => t + num(s.ranks) * (s.cls ? 1 : 2), 0),
  };
}
