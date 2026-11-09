// Tavolo virtuale D&D 3.5 — server senza dipendenze (solo Node).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

// Dentro TavoloDnD.exe (Electron) data.json sta accanto all'exe: la cartella arriva in TAVOLO_DIR.
const DIR = process.env.TAVOLO_DIR || __dirname;
const PORT = Number(process.env.PORT) || 3000;
const DATA = path.join(DIR, 'data.json');
// la pagina è l'interfaccia React compilata da Vite in un file solo (npm run ui)
const page = () => fs.readFileSync(path.join(__dirname, 'dist', 'index.html'));

const id = () => crypto.randomBytes(8).toString('hex');
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };

// Tiro di dadi: "2d6+1d4+3-1". Il server tira, così nessuno può barare.
function roll(expr) {
  const s = String(expr).replace(/\s+/g, '').toLowerCase();
  if (s.length > 100 || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) fail('Espressione non valida (es. 1d20+5)');
  let total = 0;
  const parts = [];
  for (const [, sign, term] of s.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const k = sign === '-' ? -1 : 1;
    if (term.includes('d')) {
      const [n0, m] = term.split('d').map(Number);
      const n = n0 || 1;
      if (n > 100 || m < 1 || m > 1000) fail('Massimo 100 dadi da 1000 facce');
      const r = Array.from({ length: n }, () => crypto.randomInt(1, m + 1));
      total += k * r.reduce((a, b) => a + b, 0);
      parts.push(`${sign}${term}[${r.join(',')}]`);
    } else {
      total += k * Number(term);
      parts.push(sign + term);
    }
  }
  return { total, detail: parts.join(' ') };
}

// --- Persistenza su data.json ---
const TEST = process.argv[2] === '--test';
let db = !TEST && fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, 'utf8')) : {};
db = { users: {}, sessions: {}, campaigns: {}, active: null, ...db };

const newCampaign = (name, old = {}) => {
  const cid = id();
  db.campaigns[cid] = { characters: {}, tracker: { round: 1, turn: 0, list: [] }, rolls: [], handouts: [], notes: '', story: '', ...old, id: cid, name };
  db.active = cid;
};
// Dati della versione senza campagne: diventano la prima campagna.
if (db.characters) {
  const { characters, tracker, rolls, handouts, notes } = db;
  newCampaign('Campagna 1', { characters, tracker, rolls, handouts, notes });
  for (const k of ['characters', 'tracker', 'rolls', 'handouts', 'notes']) delete db[k];
}
// Classe e livello erano un campo solo: "Ranger 6" diventa classe "Ranger", livello 6.
// Con più numeri ("Guerriero 2/Mago 3") non si tocca: lo divide a mano il giocatore.
function splitClassLevel(ch) {
  const m = ch.level === undefined && /^([^\d]+?)\s*(\d+)$/.exec(ch.cls || '');
  if (m) { ch.cls = m[1]; ch.level = m[2]; }
}
// Talenti, capacità speciali ed equipaggiamento erano un testo: ogni riga diventa uno slot (a cui ora si possono dare modificatori).
function migrateChar(ch) {
  splitClassLevel(ch);
  for (const k of ['feats', 'gear', 'special']) {
    if (typeof ch[k] === 'string') ch[k] = ch[k].split('\n').map(x => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).map(name => ({ name }));
  }
}
for (const camp of Object.values(db.campaigns)) Object.values(camp.characters).forEach(migrateChar);
if (!db.campaigns[db.active]) Object.keys(db.campaigns).length ? db.active = Object.keys(db.campaigns)[0] : newCampaign('Campagna 1');
// db.active è la campagna in gioco, scelta dal master. Un giocatore può sfogliarne un'altra (u.campaign),
// altrimenti segue quella in gioco.
const C = u => db.campaigns[u && u.role !== 'master' && Object.hasOwn(db.campaigns, String(u.campaign)) ? u.campaign : db.active];

let saveTimer;
function flush() {
  clearTimeout(saveTimer);
  if (TEST) return;
  fs.writeFileSync(DATA + '.tmp', JSON.stringify(db));
  fs.renameSync(DATA + '.tmp', DATA); // scrittura atomica: niente file corrotti se il PC si spegne
}
// Se la scrittura fallisce (disco pieno, file bloccato) il tavolo resta acceso e riprova.
function trySave() {
  try { flush(); } catch (e) { console.error(`Salvataggio non riuscito (${e.message}), riprovo tra 5 secondi`); saveTimer = setTimeout(trySave, 5000); }
}
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(trySave, 300); };
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGHUP', () => { flush(); process.exit(0); }); // finestra della console chiusa su Windows

// --- Account ---
function hash(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
const checkPin = (pin, stored) => {
  const a = Buffer.from(hash(pin, stored.split(':')[0])), b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const fails = {}; // PIN sbagliati per utente e dispositivo: dopo 10 blocco di 5 minuti

let master = Object.values(db.users).find(u => u.role === 'master');
let newPin = null; // PIN del master appena creato: la finestra del tavolo lo mostra finché il master non entra
function setMasterPin(pin = String(crypto.randomInt(1000, 10000))) {
  master ??= { id: id(), name: 'Master', role: 'master' };
  master.pin = hash(pin);
  db.users[master.id] = master;
  // le sessioni aperte con il vecchio PIN non valgono più
  for (const t of Object.keys(db.sessions)) if (db.sessions[t] === master.id) delete db.sessions[t];
  newPin = pin;
  if (!TEST) console.log(`Account master: nome "${master.name}", PIN ${pin}`);
  flush();
  return pin;
}
if (!master || process.env.MASTER_PIN) setMasterPin(process.env.MASTER_PIN || undefined);

const sidOf = req => /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
// Login (al primo accesso crea l'account). Restituisce il token di sessione.
function login(name, pin, ip) {
  const n = String(name || '').trim();
  if (!n || n.length > 40 || String(pin || '').length < 4) fail('Nome obbligatorio e PIN di almeno 4 caratteri');
  let u = Object.values(db.users).find(x => x.name.toLowerCase() === n.toLowerCase());
  const fk = u && u.id + ip; // anche per dispositivo: un giocatore non può tenere fuori il master
  if (u && fails[fk]?.until > Date.now()) fail('Troppi tentativi: riprova tra qualche minuto', 429);
  if (u && !u.pin) u.pin = hash(pin); // account tornato da un backup (che non contiene i PIN): il primo che entra sceglie il PIN
  if (u && !checkPin(pin, u.pin)) {
    const f = fails[fk] = { n: (fails[fk]?.n || 0) + 1, until: 0 };
    if (f.n >= 10) Object.assign(f, { n: 0, until: Date.now() + 5 * 60e3 });
    fail('PIN errato', 401);
  }
  if (u) delete fails[fk];
  if (u?.role === 'master') newPin = null; // il master lo conosce: la finestra non lo mostra più
  if (!u) { u = { id: id(), name: n, role: 'player', pin: hash(pin) }; db.users[u.id] = u; }
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = u.id;
  // tieni solo i 5 accessi più recenti per utente (telefono, PC, ...)
  for (const t of Object.keys(db.sessions).filter(t => db.sessions[t] === u.id).slice(0, -5)) delete db.sessions[t];
  return token;
}

function auth(req) {
  const uid = db.sessions[sidOf(req)];
  return uid ? db.users[uid] : null;
}

// --- Stato visto da ciascun utente (i giocatori non vedono i segreti del master) ---
// Nebbia di guerra: di un piano con la nebbia accesa ai giocatori arriva solo ciò che sta nei tasselli rivelati.
const T = 10; // quadretti per tassello, come nella pagina
const fogOn = (l, x, y) => !l.fog?.on || !!l.fog.shown?.[Math.floor(x / T) + ',' + Math.floor(y / T)]; // x, y in quadretti
function fogLevel(l) {
  if (!l.fog?.on) return l;
  const tile = (x, y) => !!l.fog.shown?.[x + ',' + y];
  const keep = (o, ok) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => { const [x, y, d] = k.split(','); return ok(+x, +y, d); }));
  const edge = (x, y, d) => tile(x, y) || (d === 'e' ? tile(x + 1, y) : tile(x, y + 1)); // basta uno dei due tasselli del lato
  return {
    ...l, tiles: keep(l.tiles, tile), edges: keep(l.edges, edge), edoor: keep(l.edoor, edge),
    objects: (l.objects || []).filter(o => fogOn(l, o.x, o.y)),
    doors: (l.doors || []).filter(d => fogOn(l, d.x, d.y) || (d.v ? fogOn(l, d.x - 1, d.y) : fogOn(l, d.x, d.y - 1))),
  };
}
// Ai giocatori: le mappe mostrate, senza ciò che è nella nebbia, solo le note accese,
// e i segnalini rivelati (i propri sempre).
function playerMap(m, u, camp) {
  const lv = id => m.levels?.find(l => l.id === id);
  const tokens = Object.fromEntries(Object.entries(m.tokens || {}).filter(([cid, t]) => !camp.characters[cid]?.hidden
    && (camp.characters[cid]?.owner === u.id || !lv(t.lv) || fogOn(lv(t.lv), t.x, t.y))));
  return { ...m, tokens, levels: m.levels?.map(l => ({ ...fogLevel(l), notes: (l.notes || []).filter(n => n.on) })) };
}
// Ai giocatori: i personaggi nascosti dal master (mostri non ancora rivelati) non arrivano proprio;
// delle schede "solo master" solo quanto basta per il segnalino.
const playerChars = chars => Object.fromEntries(Object.entries(chars).filter(([, c]) => !c.hidden)
  .map(([k, c]) => [k, c.secret ? { id: c.id, name: c.name, size: c.size, owner: c.owner, ...(c.avatar && { avatar: c.avatar }), secret: true } : c]));

function view(u) {
  const isMaster = u.role === 'master';
  const camp = C(u), t = camp.tracker;
  return {
    me: { id: u.id, name: u.name, role: u.role },
    users: Object.values(db.users).map(({ id, name, role }) => ({ id, name, role })),
    campaigns: Object.values(db.campaigns).map(({ id, name }) => ({ id, name })),
    active: camp.id,
    live: db.active,
    characters: isMaster ? camp.characters : playerChars(camp.characters),
    tracker: isMaster ? t : {
      round: t.round,
      list: t.list.map((c, i) => ({ ...c, current: i === t.turn }))
        .filter(c => !c.hidden && !camp.characters[c.charId]?.hidden)
        .map(c => (c.charId ? c : { name: c.name, init: c.init, cond: c.cond, current: c.current })),
    },
    rolls: isMaster ? camp.rolls : camp.rolls.filter(r => !r.secret),
    // handout: a tutti, oppure solo ai giocatori in "to"; agli altri non arriva proprio (e nessuno vede a chi altro è andato)
    handouts: isMaster ? camp.handouts : camp.handouts.filter(h => h.visible && (!h.to?.length || h.to.includes(u.id))).map(({ to, ...h }) => ({ ...h, private: !!to?.length })),
    notes: isMaster ? camp.notes : undefined,
    story: camp.story ?? '',
    recaps: camp.recaps ?? [],
    maps: isMaster ? camp.maps ?? [] : (camp.maps ?? []).filter(m => m.visible).map(m => playerMap(m, u, camp)),
  };
}

const clients = new Set();
const send = c => db.users[c.uid] && c.res.write(`data: ${JSON.stringify(view(db.users[c.uid]))}\n\n`);
const broadcast = () => { save(); clients.forEach(send); };

// --- Azioni ---
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
const needMaster = u => u.role === 'master' || fail('Solo il master può farlo', 403);
function canEdit(u, cid) {
  const chars = C(u).characters;
  const c = Object.hasOwn(chars, String(cid)) && chars[cid];
  if (!c) fail('Personaggio inesistente', 404);
  if (u.role !== 'master' && c.owner !== u.id) fail('Non è il tuo personaggio', 403);
  return c;
}

// Valori delle schede: la pagina scrive solo testo, numeri e sì/no; le liste (attacchi, abilità) sono righe di questi.
// Così nessuno può mandare dati che fanno andare in errore la pagina degli altri.
const scalar = v => v === null || typeof v === 'boolean' || Number.isFinite(v) || (typeof v === 'string' && v.length <= 20000);
const flat = r => r && typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length <= 50 && Object.values(r).every(scalar);
// talenti e oggetti hanno in più l'elenco dei loro modificatori: righe semplici anche queste
const row = r => flat(r && !Array.isArray(r) && { ...r, mods: null }) && (r.mods === undefined || (Array.isArray(r.mods) && r.mods.length <= 20 && r.mods.every(flat)));
const LISTS = ['attacks', 'skills', 'feats', 'gear', 'special'];
// campi con dentro altri campi; tutto il resto della scheda è un valore semplice
const NESTED = ['abil', 'hp', 'saves', 'ac', 'money', 'spells', ...LISTS];
// Avatar: un'immagine piccola già ridotta dalla pagina, come data URL. Solo questi formati, così nell'attributo src/href non entra altro.
const AVATAR = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const validAvatar = v => v === null || v === '' || (typeof v === 'string' && v.length <= 150000 && AVATAR.test(v));
const validValue = (p, v) => (p[0] === 'avatar' ? p.length === 1 && validAvatar(v)
  : LISTS.includes(p[0]) && p.length === 1 ? Array.isArray(v) && v.length <= 1000 && v.every(row)
  : LISTS.includes(p[0]) && p.length === 2 ? row(v)
  : LISTS.includes(p[0]) && p[2] === 'mods' ? p.length === 5 && scalar(v) : scalar(v));
// Decide solo il master: "solo master" (statistiche nascoste), "nascosto" (i giocatori non lo vedono proprio), "npc" (mostro o PNG)
const MASTER_FLAGS = ['secret', 'hidden', 'npc'];
function myRecap(u, rid) {
  const r = (C(u).recaps ?? []).find(x => x.id === rid);
  if (!r) fail('Riepilogo inesistente', 404);
  if (u.role !== 'master' && r.author !== u.id) fail('Non è un tuo riepilogo', 403);
  return r;
}
const campaignName = n => String(n || '').trim().slice(0, 80) || fail('Nome campagna obbligatorio');
const actions = {
  'campaign.create'(u, a) { needMaster(u); newCampaign(campaignName(a.name)); },
  'campaign.select'(u, a) {
    if (!Object.hasOwn(db.campaigns, String(a.id))) fail('Campagna inesistente', 404);
    if (u.role === 'master') {
      db.active = a.id;
      // si gioca qui: tutti i giocatori tornano sulla campagna in gioco
      for (const p of Object.values(db.users)) delete p.campaign;
    } else if (a.id === db.active) delete u.campaign;
    else u.campaign = a.id;
  },
  'campaign.rename'(u, a) { needMaster(u); C(u).name = campaignName(a.name); },
  'char.create'(u, a) {
    const data = a.data && typeof a.data === 'object' && !Array.isArray(a.data) ? a.data : {};
    const cid = id();
    // tiene solo i campi validi (la pagina manda nome ed elenco delle abilità)
    const ok = Object.fromEntries(Object.entries(data).filter(([k, v]) => !BAD_KEYS.includes(k) && !['id', 'owner', ...MASTER_FLAGS].includes(k) && validValue([k], v)));
    // il master può creare direttamente un mostro o PNG nascosto
    const flags = u.role === 'master' ? Object.fromEntries(MASTER_FLAGS.filter(k => data[k] === true).map(k => [k, true])) : {};
    C(u).characters[cid] = { ...ok, ...flags, id: cid, owner: u.id };
    return { id: cid };
  },
  'char.set'(u, a) {
    const c = canEdit(u, a.id);
    const p = a.path;
    if (!Array.isArray(p) || !p.length || ['id', 'owner'].includes(p[0]) || (p.length > 1 && !NESTED.includes(p[0]))
      || !p.every(k => (typeof k === 'string' || (Number.isInteger(k) && k >= 0 && k < 1000)) && !BAD_KEYS.includes(k))) fail('Campo non valido');
    if (!validValue(p, a.value)) fail('Valore non valido');
    if (MASTER_FLAGS.includes(p[0])) needMaster(u);
    // nelle liste un indice punta a una riga che c'è (o alla prossima, per aggiungerla): niente buchi che rompono la pagina
    let w = c;
    for (const [i, k] of p.entries()) {
      if (LISTS.includes(p[0]) && Number.isInteger(k) && !(Array.isArray(w) && k <= w.length - (i < p.length - 1 ? 1 : 0))) fail('Riga inesistente');
      w = w?.[k];
    }
    let o = c;
    for (const k of p.slice(0, -1)) o = o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {};
    o[p.at(-1)] = a.value;
  },
  'char.delete'(u, a) { canEdit(u, a.id); delete C(u).characters[a.id]; },
  'char.owner'(u, a) {
    needMaster(u);
    const c = canEdit(u, a.id);
    if (!Object.hasOwn(db.users, String(a.owner))) fail('Utente inesistente');
    c.owner = a.owner;
  },
  roll(u, a) {
    const camp = C(u);
    camp.rolls.push({
      id: id(), who: u.name, label: String(a.label || '').slice(0, 100), expr: String(a.expr).slice(0, 100),
      ...roll(a.expr), secret: u.role === 'master' && !!a.secret, time: Date.now(),
    });
    camp.rolls = camp.rolls.slice(-200);
  },
  tracker(u, a) {
    needMaster(u);
    if (!Array.isArray(a.tracker?.list)) fail('Tracker non valido');
    C().tracker = a.tracker;
  },
  handouts(u, a) {
    needMaster(u);
    if (!Array.isArray(a.handouts)) fail('Handout non validi');
    C().handouts = a.handouts;
  },
  notes(u, a) { needMaster(u); C().notes = String(a.notes ?? ''); },
  story(u, a) { needMaster(u); C().story = String(a.story ?? ''); },
  // Riepiloghi sotto la storia: li scrive chiunque; ognuno modifica e cancella i suoi, il master tutti.
  'recap.add'(u) {
    const camp = C(u);
    camp.recaps ??= [];
    if (camp.recaps.length >= 500) fail('Troppi riepiloghi');
    const r = { id: id(), title: `Riepilogo ${camp.recaps.length + 1}`, text: '', author: u.id, time: Date.now() };
    camp.recaps.push(r);
    return { id: r.id };
  },
  'recap.set'(u, a) {
    const r = myRecap(u, a.id);
    if (!['title', 'text'].includes(a.field)) fail('Campo non valido');
    r[a.field] = String(a.value ?? '').slice(0, a.field === 'title' ? 200 : 50000);
  },
  'recap.delete'(u, a) { const r = myRecap(u, a.id), camp = C(u); camp.recaps = camp.recaps.filter(x => x !== r); },
  maps(u, a) {
    needMaster(u);
    if (!Array.isArray(a.maps) || !a.maps.every(m => m && typeof m === 'object')) fail('Mappe non valide');
    // i segnalini si muovono solo con "token": una mappa vecchia del master non deve riportarli indietro
    const old = C().maps ?? [];
    for (const m of a.maps) { const o = old.find(x => x.id === m.id); if (o?.tokens) m.tokens = o.tokens; else delete m.tokens; }
    C().maps = a.maps;
  },
  // Segnalino di un personaggio su una mappa: { lv, x, y } in quadretti. Il giocatore muove solo il suo.
  token(u, a) {
    canEdit(u, a.char);
    const m = (C(u).maps ?? []).find(x => x.id === a.map && (u.role === 'master' || x.visible));
    if (!m) fail('Mappa inesistente', 404);
    m.tokens ??= {};
    if (a.remove) return void delete m.tokens[a.char];
    const W = (m.cols || 1) * 10, H = (m.rows || 1) * 10, x = a.x, y = a.y;
    if (!(m.levels ?? []).some(l => l.id === a.lv) || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= W || y >= H) fail('Posizione non valida');
    m.tokens[a.char] = { lv: a.lv, x, y };
  },
};

// --- Backup delle campagne ---
// Il file contiene tutte le campagne, segreti del master compresi, e gli account (senza PIN né accessi):
// chiunque può scaricarlo, così una copia c'è anche se il PC del tavolo si rompe. Ripristinarlo può solo il master.
const BACKUP = 'tavolo-dnd35-backup';
const backupOf = u => ({
  app: BACKUP, version: 1, time: Date.now(), by: u.name,
  users: Object.values(db.users).map(({ id, name, role }) => ({ id, name, role })),
  campaigns: Object.values(db.campaigns),
});
const safeId = v => typeof v === 'string' && /^[\w-]{1,64}$/.test(v) && !BAD_KEYS.includes(v);
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
// Controlla il file e rimette in forma ogni campagna (i campi mancanti tornano vuoti, come in una campagna nuova).
function readBackup(b) {
  if (!plain(b) || b.app !== BACKUP || !Array.isArray(b.campaigns)) fail('Non è un file di backup del tavolo');
  const camps = b.campaigns.map(c => {
    if (!plain(c) || !safeId(c.id) || !plain(c.characters ?? {})) fail('Backup rovinato: una campagna non si legge');
    const arr = k => (Array.isArray(c[k]) ? c[k] : []);
    const t = plain(c.tracker) && Array.isArray(c.tracker.list) ? c.tracker : { round: 1, turn: 0, list: [] };
    const chars = Object.fromEntries(Object.entries(c.characters ?? {}).filter(([k, ch]) => safeId(k) && plain(ch)));
    return { ...c, name: String(c.name || 'Campagna').slice(0, 80), characters: chars, tracker: t, rolls: arr('rolls'), handouts: arr('handouts'),
      maps: arr('maps'), recaps: arr('recaps'), notes: String(c.notes ?? ''), story: String(c.story ?? '') };
  });
  if (new Set(camps.map(c => c.id)).size !== camps.length) fail('Backup rovinato: campagne doppie');
  const users = (Array.isArray(b.users) ? b.users : []).filter(x => plain(x) && safeId(x.id) && typeof x.name === 'string' && x.name.trim());
  return { camps, users, time: Number(b.time) || null, by: String(b.by || '') };
}
const counts = c => ({ characters: Object.keys(c.characters).length, maps: (c.maps ?? []).length, recaps: (c.recaps ?? []).length });
// Cosa c'è nel file e cosa c'è già sul tavolo: la stessa campagna ha lo stesso id anche se nel frattempo è stata rinominata.
function restorePreview(b) {
  const { camps, time, by } = readBackup(b);
  return {
    time, by,
    campaigns: camps.map(c => {
      const cur = Object.hasOwn(db.campaigns, c.id) && db.campaigns[c.id];
      return { id: c.id, name: c.name, counts: counts(c), exists: !!cur, ...(cur && { current: { name: cur.name, counts: counts(cur), live: db.active === c.id } }) };
    }),
  };
}
// Gli account del backup: lo stesso id se c'è già, altrimenti lo stesso nome; il master del backup è il master di adesso.
// Chi manca torna senza PIN: lo sceglie al primo accesso.
function restoreUsers(users) {
  const map = {};
  for (const x of users) {
    const same = Object.hasOwn(db.users, x.id) && db.users[x.id];
    const byName = Object.values(db.users).find(y => y.name.toLowerCase() === x.name.trim().toLowerCase());
    if (x.role === 'master') map[x.id] = master.id;
    else if (same || byName) map[x.id] = (same || byName).id;
    else { const nu = { id: x.id, name: x.name.trim().slice(0, 40), role: 'player' }; db.users[nu.id] = nu; map[x.id] = nu.id; }
  }
  return map;
}
// choices: { id campagna: 'overwrite' (stessa campagna: sostituisce), 'copy' (stessa campagna: accanto, con un id nuovo), 'add' (campagna nuova) }.
// Le campagne non nominate restano come sono.
function restoreApply(b, choices) {
  const { camps, users } = readBackup(b);
  if (!plain(choices)) fail('Scelte non valide');
  const todo = camps.filter(c => Object.hasOwn(choices, c.id) && choices[c.id] !== 'skip');
  for (const c of todo) {
    const ch = choices[c.id], exists = Object.hasOwn(db.campaigns, c.id);
    if (!(exists ? ['overwrite', 'copy'] : ['add']).includes(ch)) fail(`Scelta non valida per "${c.name}"`);
  }
  if (!todo.length) fail('Nessuna campagna da ripristinare');
  // prima di sovrascrivere, una copia dei dati di adesso accanto a data.json
  if (!TEST && todo.some(c => choices[c.id] === 'overwrite')) fs.writeFileSync(path.join(DIR, 'data-prima-del-ripristino.json'), JSON.stringify(db));
  const um = restoreUsers(users), uid = x => um[x] ?? x;
  const done = { overwrite: 0, copy: 0, add: 0 };
  for (const c of todo) {
    for (const k of Object.keys(c.characters)) { c.characters[k].owner = uid(c.characters[k].owner); migrateChar(c.characters[k]); }
    c.handouts = c.handouts.map(h => (plain(h) && Array.isArray(h.to) ? { ...h, to: h.to.map(uid) } : h));
    c.recaps = c.recaps.map(r => (plain(r) ? { ...r, author: uid(r.author) } : r));
    const ch = choices[c.id];
    if (ch === 'copy') { c.id = id(); c.name = `${c.name} (backup)`.slice(0, 80); }
    db.campaigns[c.id] = c;
    done[ch]++;
  }
  flush();
  return done;
}

if (TEST) {
  assert.strictEqual(roll('5').total, 5);
  assert.strictEqual(roll('2+3-1').total, 4);
  for (let i = 0; i < 200; i++) {
    const t = roll('1d20+5').total;
    assert(t >= 6 && t <= 25);
    const u = roll('3d6 - 1d4').total;
    assert(u >= -1 && u <= 17);
  }
  assert.match(roll('d8').detail, /^d8\[[1-8]\]$/);
  for (const bad of ['', '1d20+', 'abc', '1d0', '101d6', '1d20*2']) assert.throws(() => roll(bad), bad);

  // i giocatori non vedono i segreti del master
  const p = db.users.p = { id: 'p', name: 'P', role: 'player' };
  const camp = C(p);
  camp.rolls.push({ id: 'r', secret: true });
  camp.tracker.list.push({ name: 'Orco', hidden: true }, { name: 'Goblin', hp: 5, maxHp: 7, ac: 15 });
  camp.notes = 'segreto';
  camp.handouts.push({ title: 'bozza', visible: false });
  const v = view(p);
  assert.strictEqual(v.rolls.length, 0);
  assert.deepStrictEqual(v.tracker.list.map(x => x.name), ['Goblin']);
  assert.strictEqual(v.tracker.list[0].hp, undefined);
  assert.strictEqual(v.notes, undefined);
  // la storia la leggono tutti, ma la scrive solo il master
  assert.throws(() => actions.story(p, { story: 'x' }));
  // riepiloghi: il giocatore scrive il suo, non quello degli altri; il master li corregge tutti
  const rp = actions['recap.add'](p).id, rm = actions['recap.add'](master).id;
  actions['recap.set'](p, { id: rp, field: 'text', value: 'Abbiamo trovato la cripta' });
  assert.throws(() => actions['recap.set'](p, { id: rm, field: 'text', value: 'x' }));
  assert.throws(() => actions['recap.set'](p, { id: rp, field: 'author', value: 'x' }));
  assert.throws(() => actions['recap.delete'](p, { id: rm }));
  actions['recap.set'](master, { id: rp, field: 'title', value: 'Sessione 3' });
  assert.deepStrictEqual(view(p).recaps.map(r => [r.title, r.text]), [['Sessione 3', 'Abbiamo trovato la cripta'], ['Riepilogo 2', '']]);
  actions['recap.delete'](p, { id: rp });
  assert.deepStrictEqual(view(p).recaps.map(r => r.id), [rm]);
  actions.story(master, { story: 'Inizio' });
  assert.strictEqual(view(p).story, 'Inizio');
  // mappe: i giocatori vedono solo quelle mostrate dal master
  assert.throws(() => actions.maps(p, { maps: [] }));
  actions.maps(master, { maps: [{ id: 'a', visible: true }, { id: 'b', visible: false }] });
  assert.deepStrictEqual(view(p).maps.map(m => m.id), ['a']);
  assert.strictEqual(view(master).maps.length, 2);
  // note: al giocatore arrivano solo quelle accese, il master le vede tutte
  actions.maps(master, { maps: [{ id: 'a', visible: true, levels: [{ id: 'L', notes: [{ id: 'n1', text: 'trappola', on: false }, { id: 'n2', text: 'altare', on: true }] }] }] });
  assert.deepStrictEqual(view(p).maps[0].levels[0].notes.map(n => n.id), ['n2']);
  assert.strictEqual(view(master).maps[0].levels[0].notes.length, 2);
  // segnalini: il giocatore muove il suo personaggio sulle mappe visibili, il master tutti
  const own = actions['char.create'](p, {}).id, other = actions['char.create'](master, {}).id;
  actions.maps(master, { maps: [{ id: 'a', visible: true, cols: 1, rows: 1, levels: [{ id: 'L' }] }, { id: 'b', visible: false, cols: 1, rows: 1, levels: [{ id: 'L' }] }] });
  actions.token(p, { map: 'a', char: own, lv: 'L', x: 3, y: 4 });
  assert.deepStrictEqual(view(p).maps[0].tokens[own], { lv: 'L', x: 3, y: 4 });
  assert.throws(() => actions.token(p, { map: 'a', char: other, lv: 'L', x: 1, y: 1 }));
  assert.throws(() => actions.token(p, { map: 'b', char: own, lv: 'L', x: 1, y: 1 }));
  assert.throws(() => actions.token(p, { map: 'a', char: own, lv: 'L', x: 10, y: 0 }));
  assert.throws(() => actions.token(p, { map: 'a', char: '__proto__', lv: 'L', x: 1, y: 1 }));
  actions.token(master, { map: 'a', char: other, lv: 'L', x: 0, y: 0 });
  actions.maps(master, { maps: [{ id: 'a', visible: true, cols: 1, rows: 1, levels: [{ id: 'L' }], tokens: {} }] });
  assert.strictEqual(Object.keys(view(p).maps[0].tokens).length, 2); // il salvataggio delle mappe non li cancella
  actions.token(p, { map: 'a', char: own, remove: true });
  assert.deepStrictEqual(Object.keys(view(p).maps[0].tokens), [other]);
  actions['char.delete'](p, { id: own });
  actions['char.delete'](master, { id: other });
  assert.strictEqual(v.handouts.length, 0);
  // handout privati: arrivano solo ai destinatari, che non vedono a chi altro è andato
  login('Bea', '2222', 'pc');
  const bea = Object.values(db.users).find(x => x.name === 'Bea');
  actions.handouts(master, { handouts: [{ id: 'h1', title: 'A tutti', visible: true }, { id: 'h2', title: 'Solo Bea', visible: true, to: [bea.id] }, { id: 'h3', title: 'Bozza', visible: false, to: [p.id] }] });
  assert.deepStrictEqual(view(p).handouts.map(h => h.title), ['A tutti']);
  assert.deepStrictEqual(view(bea).handouts.map(h => [h.title, h.private, h.to]), [['A tutti', false, undefined], ['Solo Bea', true, undefined]]);
  actions.handouts(master, { handouts: [] });

  // percorsi pericolosi in char.set
  const cid = actions['char.create'](p, {}).id;
  actions['char.set'](p, { id: cid, path: ['attacks'], value: [{}] });
  actions['char.set'](p, { id: cid, path: ['attacks', 0, 'name'], value: 'Ascia' });
  for (const path of [['attacks', 1e9, 'name'], ['attacks', -1], ['__proto__', 'x'], ['owner'], ['name', 'x'], ['secret']]) {
    assert.throws(() => actions['char.set'](p, { id: cid, path, value: 1 }), String(path));
  }
  // valori che manderebbero in errore la pagina degli altri
  for (const [path, value] of [[['skills'], 5], [['skills', 0], null], [['name'], { x: 1 }], [['attacks'], [[1]]], [['hp', 'cur'], 'x'.repeat(30000)]]) {
    assert.throws(() => actions['char.set'](p, { id: cid, path, value }), JSON.stringify(path));
  }
  actions['char.set'](p, { id: cid, path: ['skills'], value: [{ name: 'Nuotare', ab: 'str', acp: true }] });
  // talenti e oggetti con modificatori; nelle liste niente buchi
  actions['char.set'](p, { id: cid, path: ['feats'], value: [{ name: 'Ira', buff: true, mods: [{ t: 'str', e: '+4' }] }] });
  actions['char.set'](p, { id: cid, path: ['feats', 0, 'mods', 0, 'e'], value: '+6' });
  actions['char.set'](p, { id: cid, path: ['feats', 1], value: { name: 'Allerta' } }); // la prossima riga si può aggiungere
  for (const [path, value] of [[['feats', 0, 'mods'], 5], [['feats', 0, 'mods', 0], { t: 'str' }], [['feats', 0, 'mods', 3, 'e'], '+1'],
    [['feats', 5, 'name'], 'x'], [['feats', 3], {}], [['skills', 9, 'name'], 'x'], [['feats', 0], { mods: [[1]] }], [['feats', 0], { mods: 'x' }]]) {
    assert.throws(() => actions['char.set'](p, { id: cid, path, value }), JSON.stringify(path));
  }
  assert.deepStrictEqual(C(p).characters[cid].feats.map(f => [f.name, f.mods?.[0]?.e]), [['Ira', '+6'], ['Allerta', undefined]]);
  // talenti ed equipaggiamento scritti come testo diventano slot
  const old = { cls: 'Ladro 5', feats: '- Allerta\n\n* Schivare ', gear: 'x1 Corda', special: 'Visione crepuscolare' };
  migrateChar(old);
  assert.deepStrictEqual([old.level, old.feats, old.gear, old.special], ['5', [{ name: 'Allerta' }, { name: 'Schivare' }], [{ name: 'x1 Corda' }], [{ name: 'Visione crepuscolare' }]]);
  actions['char.set'](p, { id: cid, path: ['special'], value: [{ name: 'Sangue elfico', src: 'Razza', notes: '+1 Osservare', mods: [{ t: 'skill:Osservare', e: '+1' }] }] });
  assert.strictEqual(C(p).characters[cid].special[0].mods[0].e, '+1');
  assert.strictEqual(actions['char.create'](p, { data: { name: 'X', secret: true, skills: 7 } }) && Object.values(C(p).characters).some(c => c.secret || c.skills === 7), false);
  // schede "solo master": ai giocatori arriva solo nome e taglia
  const drago = actions['char.create'](master, { data: { name: 'Drago', size: 'Enorme' } }).id;
  actions['char.set'](master, { id: drago, path: ['hp', 'max'], value: 200 });
  actions['char.set'](master, { id: drago, path: ['secret'], value: true });
  assert.deepStrictEqual(Object.keys(view(p).characters[drago]).sort(), ['id', 'name', 'owner', 'secret', 'size']);
  assert.strictEqual(view(master).characters[drago].hp.max, 200);
  // nebbia: al giocatore arrivano solo i tasselli rivelati, i lati che li toccano, ciò che c'è sopra, e i segnalini rivelati o suoi
  const mine = actions['char.create'](p, {}).id;
  actions.maps(master, { maps: [{ id: 'f', visible: true, cols: 2, rows: 1, levels: [{ id: 'L', fog: { on: true, shown: { '0,0': 1 } },
    tiles: { '0,0': {}, '1,0': {} }, edges: { '0,0,e': 2, '1,0,e': 5 }, objects: [{ type: 'barrel', x: 3, y: 3 }, { type: 'chest', x: 15, y: 3 }],
    doors: [{ v: true, x: 10, y: 2, n: 2 }, { v: true, x: 20, y: 2, n: 2 }] }] }] });
  actions.token(master, { map: 'f', char: drago, lv: 'L', x: 15, y: 5 });
  actions.token(p, { map: 'f', char: mine, lv: 'L', x: 16, y: 5 });
  const fl = view(p).maps[0].levels[0];
  assert.deepStrictEqual([Object.keys(fl.tiles), Object.keys(fl.edges), fl.objects.map(o => o.type), fl.doors.map(d => d.x)], [['0,0'], ['0,0,e'], ['barrel'], [10]]);
  assert.deepStrictEqual(Object.keys(view(p).maps[0].tokens), [mine]);
  assert.strictEqual(Object.keys(view(master).maps[0].levels[0].tiles).length, 2);
  // mostri nascosti: il master li crea e li mette in mappa; i giocatori non ne sanno nulla finché lui non li mostra
  const orco = actions['char.create'](master, { data: { name: 'Orco', npc: true, hidden: true, secret: true } }).id;
  assert.strictEqual(actions['char.create'](p, { data: { name: 'Furbo', hidden: true } }) && Object.values(C(p).characters).some(c => c.hidden && c.owner === p.id), false);
  assert.throws(() => actions['char.set'](p, { id: mine, path: ['hidden'], value: true }));
  actions.maps(master, { maps: [{ id: 'f', visible: true, cols: 2, rows: 1, levels: [{ id: 'L', tiles: {} }] }] });
  actions.token(master, { map: 'f', char: orco, lv: 'L', x: 1, y: 1 });
  actions.tracker(master, { tracker: { round: 1, turn: 0, list: [{ charId: orco, init: 5 }, { charId: mine, init: 3 }] } });
  const hiddenNow = () => [orco in view(p).characters, orco in view(p).maps[0].tokens, view(p).tracker.list.length];
  assert.deepStrictEqual(hiddenNow(), [false, false, 1]);
  actions['char.set'](master, { id: orco, path: ['hidden'], value: false });
  assert.deepStrictEqual(hiddenNow(), [true, true, 2]);
  // avatar: solo immagini piccole in data URL
  actions['char.set'](p, { id: mine, path: ['avatar'], value: 'data:image/webp;base64,AAAA' });
  for (const bad of ['data:image/svg+xml;base64,AAAA', 'data:image/png;base64,AA"onerror="x', 'http://x/y.png', 'data:image/png;base64,' + 'A'.repeat(150000)]) {
    assert.throws(() => actions['char.set'](p, { id: mine, path: ['avatar'], value: bad }), bad.slice(0, 30));
  }
  // classe e livello separati
  for (const [cls, want] of [['Ranger 6', ['Ranger', '6']], ['Guerriero 2/Mago 3', ['Guerriero 2/Mago 3', undefined]], ['Mago', ['Mago', undefined]]]) {
    const ch = { cls };
    splitClassLevel(ch);
    assert.deepStrictEqual([ch.cls, ch.level], want, cls);
  }

  // login: blocco dopo 10 PIN errati, solo per quel dispositivo; massimo 5 sessioni per utente
  const status = f => { try { f(); } catch (e) { return e.status; } };
  login('Luca', '1111', 'pc');
  for (let i = 0; i < 10; i++) assert.strictEqual(status(() => login('Luca', '0000', 'pc')), 401);
  assert.strictEqual(status(() => login('Luca', '1111', 'pc')), 429);
  for (let i = 0; i < 6; i++) login('Luca', '1111', 'telefono');
  const luca = Object.values(db.users).find(x => x.name === 'Luca');
  assert.strictEqual(Object.values(db.sessions).filter(s => s === luca.id).length, 5);

  // nuovo PIN del master: la finestra lo mostra finché il master non entra; le sessioni col PIN vecchio non valgono più
  const mtok = login('Master', setMasterPin(), 'pc');
  assert.strictEqual(newPin, null);
  setMasterPin('5555');
  assert.deepStrictEqual([newPin, db.sessions[mtok], db.sessions[Object.keys(db.sessions).find(t => db.sessions[t] === luca.id)]], ['5555', undefined, luca.id]);

  // backup: stessa campagna (stesso id) da sovrascrivere o copiare, campagna diversa da aggiungere, account ritrovati
  const bk = JSON.parse(JSON.stringify(backupOf(p)));
  const cur = C(master), curId = cur.id, nChars = Object.keys(cur.characters).length;
  assert(bk.campaigns.length >= 1 && bk.users.every(x => !('pin' in x)));
  cur.story = 'cambiata dopo il backup';
  const other2 = { ...structuredClone(bk.campaigns[0]), id: 'c0ffee', name: 'Altra campagna', characters: { k1: { id: 'k1', name: 'Nuovo', owner: 'sconosciuto' } } };
  bk.campaigns.push(other2);
  bk.users.push({ id: 'sconosciuto', name: 'Gianni', role: 'player' }, { id: 'mvecchio', name: 'Master', role: 'master' });
  other2.handouts = [{ id: 'h', to: ['mvecchio'] }];
  const pv = restorePreview(bk);
  assert.deepStrictEqual(pv.campaigns.map(c => [c.id, c.exists]), [[curId, true], ['c0ffee', false]]);
  assert.strictEqual(pv.campaigns[0].current.counts.characters, nChars);
  for (const bad of [{}, { app: 'x', campaigns: [] }, { app: BACKUP, campaigns: [{ id: '__proto__' }] }, { app: BACKUP, campaigns: [{ id: 'a' }, { id: 'a' }] }]) {
    assert.throws(() => restorePreview(bad), JSON.stringify(bad));
  }
  assert.throws(() => restoreApply(bk, { [curId]: 'add' })); // la stessa campagna non si "aggiunge": si sovrascrive o si copia
  assert.throws(() => restoreApply(bk, { c0ffee: 'overwrite' }));
  assert.throws(() => restoreApply(bk, {}));
  const before = Object.keys(db.campaigns).length;
  assert.deepStrictEqual(restoreApply(bk, { [curId]: 'overwrite', c0ffee: 'add' }), { overwrite: 1, copy: 0, add: 1 });
  assert.strictEqual(db.campaigns[curId].story, 'Inizio');
  assert.strictEqual(Object.keys(db.campaigns).length, before + 1);
  const gianni = Object.values(db.users).find(x => x.name === 'Gianni');
  assert.deepStrictEqual([gianni.pin, db.campaigns.c0ffee.characters.k1.owner, db.campaigns.c0ffee.handouts[0].to[0]], [undefined, gianni.id, master.id]);
  restoreApply(bk, { [curId]: 'copy' });
  assert.strictEqual(Object.keys(db.campaigns).length, before + 2);
  // l'account tornato dal backup sceglie il PIN al primo accesso, poi vale quello
  login('Gianni', '4321', 'pc');
  assert.strictEqual(status(() => login('Gianni', '0000', 'pc')), 401);
  console.log('ok');
  process.exit(0);
}

// --- HTTP ---
const json = (res, status, obj, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
};
const body = (req, max = 8e6) => new Promise((resolve, reject) => {
  let s = '';
  req.on('data', d => { s += d; if (s.length > max) { reject(Object.assign(new Error('Richiesta troppo grande'), { status: 413 })); req.destroy(); } });
  req.on('end', () => {
    try {
      const v = JSON.parse(s);
      v && typeof v === 'object' ? resolve(v) : reject(new Error('JSON non valido'));
    } catch { reject(new Error('JSON non valido')); }
  });
});

// Indirizzi del PC sulla rete di casa. Prima quelli buoni per i giocatori; in fondo le schede virtuali (WSL, VirtualBox, VPN),
// che da un telefono non si raggiungono. shortcut: si riconoscono dal nome e da 192.168.56.x (VirtualBox), può sbagliare su reti strane.
const VIRTUAL = /vethernet|virtual|vmware|wsl|hyper-v|tailscale|zerotier|vpn|docker/i;
const lanIps = () => Object.entries(os.networkInterfaces())
  .flatMap(([name, list]) => list.filter(i => i.family === 'IPv4' && !i.internal).map(i => ({ ip: i.address, other: VIRTUAL.test(name) || /^192\.168\.56\./.test(i.address) || !/^(192\.168|10)\./.test(i.address) })))
  .sort((a, b) => a.other - b.other);
const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page());
    }
    // Il controllo sul content-type blocca i form di altri siti (CSRF) insieme a SameSite.
    if (req.method === 'POST' && !String(req.headers['content-type']).startsWith('application/json')) fail('Content-Type non valido');

    // Solo dal PC che ospita il tavolo (la finestra dell'app): indirizzi per i giocatori e PIN del master.
    // Anche il nome nella richiesta deve essere locale: una pagina esterna non può leggerlo cambiando DNS.
    if (pathname.startsWith('/api/host')) {
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
        && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
      if (!local) fail('Solo dal PC del tavolo', 403);
      if (req.method === 'GET' && pathname === '/api/host') return json(res, 200, { port: PORT, ips: lanIps(), pin: newPin });
      if (req.method === 'POST' && pathname === '/api/host/pin') { const pin = setMasterPin(); broadcast(); return json(res, 200, { pin }); }
    }

    if (req.method === 'POST' && pathname === '/api/login') {
      const { name, pin } = await body(req);
      const token = login(name, pin, req.socket.remoteAddress);
      broadcast();
      return json(res, 200, { ok: true }, { 'set-cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` });
    }

    const user = auth(req);
    if (!user) fail('Non autenticato', 401);

    if (req.method === 'GET' && pathname === '/api/me') return json(res, 200, { id: user.id, name: user.name, role: user.role });
    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const c = { res, uid: user.id };
      clients.add(c);
      send(c);
      req.on('close', () => clients.delete(c));
      return;
    }
    if (req.method === 'POST' && pathname === '/api/logout') {
      delete db.sessions[sidOf(req)];
      save();
      return json(res, 200, { ok: true }, { 'set-cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (req.method === 'GET' && pathname === '/api/backup') {
      const day = new Date().toISOString().slice(0, 10);
      res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': `attachment; filename="tavolo-backup-${day}.json"`, 'cache-control': 'no-store' });
      return res.end(JSON.stringify(backupOf(user)));
    }
    // ripristino: senza "choices" dice solo cosa c'è nel file; con "choices" lo applica
    if (req.method === 'POST' && pathname === '/api/restore') {
      needMaster(user);
      const { backup, choices } = await body(req, 200e6);
      if (!choices) return json(res, 200, restorePreview(backup));
      const done = restoreApply(backup, choices);
      broadcast();
      return json(res, 200, { ok: true, done });
    }
    if (req.method === 'POST' && pathname === '/api/action') {
      const a = await body(req);
      if (!Object.hasOwn(actions, a.type)) fail('Azione sconosciuta');
      const result = actions[a.type](user, a);
      broadcast();
      return json(res, 200, { ok: true, ...result });
    }
    fail('Non trovato', 404);
  } catch (e) {
    if (!res.headersSent) json(res, e.status || 400, { error: e.message });
  }
});

// Accende il tavolo su tutta la rete di casa. Rifiuta se la porta è occupata (per esempio da un altro programma).
const start = () => new Promise((resolve, reject) => server.once('error', reject).listen(PORT, '0.0.0.0', () => resolve(PORT)));
module.exports = { start, flush, PORT };

// "npm start": il tavolo senza finestra, si apre dal browser
if (require.main === module) {
  start().then(() => {
    console.log(`Tavolo pronto. Sul tuo PC: http://localhost:${PORT}`);
    for (const { ip } of lanIps()) console.log(`Per i giocatori sulla stessa rete: http://${ip}:${PORT}`);
  }, e => { console.error(e.code === 'EADDRINUSE' ? `La porta ${PORT} è già occupata: il tavolo è già acceso?` : e.message); process.exit(1); });
}
