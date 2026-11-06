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

export function calc(c) {
  const ab = k => { const a = c.abil?.[k] || {}; return mod(a.temp !== undefined && a.temp !== '' ? a.temp : (a.score === undefined || a.score === '' ? 10 : a.score)); };
  const [sz, gsz] = SIZES[c.size] || SIZES.Media;
  const a = c.ac || {};
  const dex = a.maxDex !== undefined && a.maxDex !== '' ? Math.min(ab('dex'), num(a.maxDex)) : ab('dex');
  const ac = 10 + num(a.armor) + num(a.shield) + dex + sz + num(a.natural) + num(a.deflection) + num(a.misc);
  // "+7/+5/+3": il primo è il BAB usato nei calcoli, gli altri sono gli attacchi aggiuntivi
  const babs = String(c.bab ?? '').match(/[+-]?\d+/g)?.map(Number) || [0], bab = babs[0];
  // punti abilità 3.5: (punti di classe + mod. INT base, min. 1) × (livello + 3); gli Umani +1 a livello (+4 al 1°)
  const lvl = num(c.level);
  const perLevel = Math.max(1, num(c.skillPts) + mod(c.abil?.int?.score || 10)) + (/^\s*uman[oaie]\b/i.test(c.race || '') ? 1 : 0);
  const save = (k, abil) => num(c.saves?.[k]?.base) + ab(abil) + num(c.saves?.[k]?.magic) + num(c.saves?.[k]?.misc);
  return {
    ab, ac, bab, babs,
    touch: 10 + dex + sz + num(a.deflection) + num(a.misc),
    ff: ac - Math.max(0, dex),
    init: ab('dex') + num(c.initMisc),
    melee: bab + ab('str') + sz,
    ranged: bab + ab('dex') + sz,
    grapple: bab + ab('str') + gsz + num(c.grappleMisc),
    fort: save('fort', 'con'), ref: save('ref', 'dex'), will: save('will', 'wis'),
    acp: num(a.acp),
    skillTot: (lvl ? perLevel * (lvl + 3) : 0) + num(c.skillMisc),
    // abilità non di classe: 2 punti per grado
    skillUsed: (c.skills || []).reduce((t, s) => t + num(s.ranks) * (s.cls ? 1 : 2), 0),
  };
}
