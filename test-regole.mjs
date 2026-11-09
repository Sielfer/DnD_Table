// Controlli sulle regole della scheda: espressioni dei modificatori, talenti, buff e oggetti (npm test).
import assert from 'node:assert';
import { calc, evalExpr, isDice } from './src/rules.js';

const V = { FOR: 3, CAR: 2, LIV: 7, BAB: 5 };
for (const [e, want] of [['+5', 5], ['-2', -2], ['LIV/2', 3], ['1 + liv / 2', 4], ['car*2', 4], ['(FOR+1)*2', 8], ['-(2+1)', -3], ['1,5*2', 3], ['', NaN],
  ['5+', NaN], ['abc', NaN], ['1/0', NaN], ['alert(1)', NaN], ['constructor', NaN], ['__proto__', NaN], ['2)', NaN]]) {
  assert.deepStrictEqual(evalExpr(e, V), want, e);
}
assert.deepStrictEqual(['+1d6', '2d4+1', '+3', 'CAR', '1d6+FOR'].map(isDice), [true, true, false, false, false]);

// un guerriero di 7° livello con FOR 16 (+3) e CAR 10
const base = { level: 7, bab: '+7', abil: { str: { score: 16 }, cha: { score: 10 } }, hp: { max: 50 }, skills: [{ name: 'Ascoltare', ab: 'wis', ranks: 2 }] };
const k0 = calc(base);
assert.deepStrictEqual([k0.ab('str'), k0.melee, k0.ac, k0.will, k0.hpMax], [3, 10, 10, 0, 50]);

const ira = { name: 'Ira', buff: true, on: false, mods: [{ t: 'str', e: '+4' }, { t: 'con', e: '+4' }, { t: 'will', e: '+2' }, { t: 'ac', e: '-2' }] };
const allerta = { name: 'Allerta', mods: [{ t: 'skill:Ascoltare', e: '+2' }, { t: 'skill:Osservare', e: '+2' }] };
const anello = { name: 'Anello', on: true, mods: [{ t: 'cha', e: '+5' }, { t: 'str', e: '+5' }] };
const spada = { name: 'Spada infuocata', mods: [{ t: 'dmg', e: '+1d6' }, { t: 'dmg', e: 'FOR/2' }, { t: 'atk', e: '1' }] };
const c = { ...base, feats: [ira, allerta], gear: [anello, spada] };

// talento normale sempre attivo, buff spento non conta, oggetto in uso conta (gli oggetti senza "on" sono in uso)
let k = calc(c);
assert.deepStrictEqual([k.ab('str'), k.ab('cha'), k.skill('Ascoltare'), k.skill('Nuotare'), k.will, k.ac], [5, 2, 2, 0, 0, 10]);
// FOR/2 dei danni usa la Forza già modificata (+5 dall'anello): 21 → mod. +5 → 2
assert.deepStrictEqual([k.dmg, k.dmgDice, k.atk, k.melee], [2, ['+1d6'], 1, 7 + 5 + 1]);

// buff acceso: FOR 16+5+4 = 25 → +7, CA -2, Volontà +2
ira.on = true;
k = calc(c);
assert.deepStrictEqual([k.ab('str'), k.ac, k.touch, k.will, k.melee], [7, 8, 8, 2, 7 + 7 + 1]);

// anello tolto, espressione sbagliata ignorata, righe rovinate non rompono il calcolo
anello.on = false;
c.feats.push(null, { name: 'Rotto', mods: [{ t: 'ac', e: 'boh' }, null, { e: '5' }] });
k = calc(c);
assert.deepStrictEqual([k.ab('str'), k.ab('cha'), k.ac], [5, 0, 8]);
assert.deepStrictEqual(calc({ ...base, feats: 'testo vecchio', gear: 5 }).melee, 10);

// capacità speciali: come i talenti (sempre, o da buff solo se accese)
const elfo = { name: 'Sangue elfico', src: 'Razza', mods: [{ t: 'skill:Osservare', e: '+1' }, { t: 'skill:Ascoltare', e: '+1' }] };
const nemico = { name: 'Nemico prescelto', src: 'Ranger', buff: true, mods: [{ t: 'skill:Osservare', e: '+2' }, { t: 'dmg', e: '+2' }] };
const r = { ...base, special: [elfo, nemico] };
assert.deepStrictEqual([calc(r).skill('Osservare'), calc(r).skill('Ascoltare'), calc(r).dmg], [1, 1, 0]);
nemico.on = true;
assert.deepStrictEqual([calc(r).skill('Osservare'), calc(r).dmg], [3, 2]);
console.log('ok');
