// Tavolo virtuale D&D 3.5 — server senza dipendenze (solo Node).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

// Dentro TavoloDnD.exe la pagina è incorporata e data.json sta accanto all'exe.
const sea = (() => { try { return require('node:sea'); } catch { return null; } })();
const isExe = !!sea?.isSea();
const DIR = isExe ? path.dirname(process.execPath) : __dirname;
const PORT = Number(process.env.PORT) || 3000;
const DATA = path.join(DIR, 'data.json');
const page = () => (isExe ? sea.getAsset('index.html', 'utf8') : fs.readFileSync(path.join(__dirname, 'index.html')));
const openBrowser = () => {
  if (process.env.NO_BROWSER) return;
  const url = `http://localhost:${PORT}`;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  require('child_process').exec(cmd);
};

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
for (const camp of Object.values(db.campaigns)) Object.values(camp.characters).forEach(splitClassLevel);
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
if (!master || process.env.MASTER_PIN) {
  const pin = process.env.MASTER_PIN || String(crypto.randomInt(1000, 10000));
  master ??= { id: id(), name: 'Master', role: 'master' };
  master.pin = hash(pin);
  db.users[master.id] = master;
  if (!TEST) console.log(`Account master: nome "${master.name}", PIN ${pin}`);
  flush();
}

const sidOf = req => /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
// Login (al primo accesso crea l'account). Restituisce il token di sessione.
function login(name, pin, ip) {
  const n = String(name || '').trim();
  if (!n || n.length > 40 || String(pin || '').length < 4) fail('Nome obbligatorio e PIN di almeno 4 caratteri');
  let u = Object.values(db.users).find(x => x.name.toLowerCase() === n.toLowerCase());
  const fk = u && u.id + ip; // anche per dispositivo: un giocatore non può tenere fuori il master
  if (u && fails[fk]?.until > Date.now()) fail('Troppi tentativi: riprova tra qualche minuto', 429);
  if (u && !checkPin(pin, u.pin)) {
    const f = fails[fk] = { n: (fails[fk]?.n || 0) + 1, until: 0 };
    if (f.n >= 10) Object.assign(f, { n: 0, until: Date.now() + 5 * 60e3 });
    fail('PIN errato', 401);
  }
  if (u) delete fails[fk];
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
function view(u) {
  const isMaster = u.role === 'master';
  const camp = C(u), t = camp.tracker;
  return {
    me: { id: u.id, name: u.name, role: u.role },
    users: Object.values(db.users).map(({ id, name, role }) => ({ id, name, role })),
    campaigns: Object.values(db.campaigns).map(({ id, name }) => ({ id, name })),
    active: camp.id,
    live: db.active,
    characters: camp.characters,
    tracker: isMaster ? t : {
      round: t.round,
      list: t.list.map((c, i) => ({ ...c, current: i === t.turn }))
        .filter(c => !c.hidden)
        .map(c => (c.charId ? c : { name: c.name, init: c.init, cond: c.cond, current: c.current })),
    },
    rolls: isMaster ? camp.rolls : camp.rolls.filter(r => !r.secret),
    handouts: isMaster ? camp.handouts : camp.handouts.filter(h => h.visible),
    notes: isMaster ? camp.notes : undefined,
    story: camp.story ?? '',
    // ai giocatori solo le mappe mostrate, e su ogni piano solo le note che il master ha acceso
    maps: isMaster ? camp.maps ?? [] : (camp.maps ?? []).filter(m => m.visible)
      .map(m => ({ ...m, levels: m.levels?.map(l => ({ ...l, notes: (l.notes || []).filter(n => n.on) })) })),
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
    C(u).characters[cid] = { ...data, id: cid, owner: u.id };
    return { id: cid };
  },
  'char.set'(u, a) {
    const c = canEdit(u, a.id);
    const p = a.path;
    if (!Array.isArray(p) || !p.length || ['id', 'owner'].includes(p[0])
      || !p.every(k => (typeof k === 'string' || (Number.isInteger(k) && k >= 0 && k < 1000)) && !BAD_KEYS.includes(k))) fail('Campo non valido');
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

  // percorsi pericolosi in char.set
  const cid = actions['char.create'](p, {}).id;
  actions['char.set'](p, { id: cid, path: ['attacks', 0, 'name'], value: 'Ascia' });
  for (const path of [['attacks', 1e9, 'name'], ['attacks', -1], ['__proto__', 'x'], ['owner']]) {
    assert.throws(() => actions['char.set'](p, { id: cid, path, value: 1 }), String(path));
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
  console.log('ok');
  process.exit(0);
}

// --- HTTP ---
const json = (res, status, obj, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
};
const body = req => new Promise((resolve, reject) => {
  let s = '';
  req.on('data', d => { s += d; if (s.length > 8e6) { reject(Object.assign(new Error('Richiesta troppo grande'), { status: 413 })); req.destroy(); } });
  req.on('end', () => {
    try {
      const v = JSON.parse(s);
      v && typeof v === 'object' ? resolve(v) : reject(new Error('JSON non valido'));
    } catch { reject(new Error('JSON non valido')); }
  });
});

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page());
    }
    // Il controllo sul content-type blocca i form di altri siti (CSRF) insieme a SameSite.
    if (req.method === 'POST' && !String(req.headers['content-type']).startsWith('application/json')) fail('Content-Type non valido');

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
}).on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  // doppio clic con il tavolo già acceso: apri solo il browser
  console.log(`Il tavolo è già acceso sulla porta ${PORT}.`);
  openBrowser();
  setTimeout(() => process.exit(0), 1500);
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`Tavolo pronto. Sul tuo PC: http://localhost:${PORT}`);
  for (const ip of ips) console.log(`Per i giocatori sulla stessa rete: http://${ip}:${PORT}`);
  if (isExe) console.log('Lascia aperta questa finestra durante la partita: chiudendola il tavolo si spegne.');
  if (isExe) openBrowser();
});
