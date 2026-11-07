import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { server, useS, useUi, setUi, isMaster, act, ask, login, logout, loggedOut, say, interaction } from '../store.js';
import { TEXTURES } from '../map/draw.js';
import { Dialogs, Notice, Svg, Avatar } from './common.jsx';
import Dice from './Dice.jsx';
import Sheets from './Sheets.jsx';
import Combat from './Combat.jsx';
import { Handouts, Story } from './Texts.jsx';
import Maps from './Maps.jsx';
import Backup from './Backup.jsx';

const TABS = [['sheets', '📜', 'Schede'], ['combat', '⚔️', 'Combattimento'], ['handouts', '📨', 'Handout'], ['story', '📖', 'Storia'], ['maps', '🗺️', 'Mappe']];

// Indirizzi per i giocatori e PIN del master: li vede solo chi usa il PC che ospita il tavolo (la finestra dell'app).
function useHost() {
  const [host, setHost] = useState(null);
  const load = () => fetch('/api/host').then(r => (r.ok ? r.json() : null)).then(setHost, () => setHost(null));
  useEffect(() => { load(); }, []);
  return [host, load];
}

function HostInfo({ host, reload }) {
  const copy = t => navigator.clipboard?.writeText(t).then(() => say('Indirizzo copiato', 'ok'), () => {});
  const url = ip => `http://${ip}:${host.port}`;
  const main = host.ips.filter(i => !i.other), other = host.ips.filter(i => i.other);
  const urls = (main.length ? main : other).map(i => url(i.ip));
  const newPin = async () => {
    const r = await fetch('/api/host/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (r.ok) reload(); else say('Non riuscito');
  };
  return (
    <div>
      <h2>Per i giocatori</h2>
      {urls.length ? <>
        <p className="muted" style={{ marginTop: 0 }}>Dal telefono o dal PC, sulla stessa rete Wi-Fi o di casa, aprite nel browser:</p>
        {urls.map(u => <div className="addr" key={u}><code>{u}</code><button type="button" className="icon" onClick={() => copy(u)} title="Copia">📋</button></div>)}
        {main.length > 0 && other.length > 0 && <p className="muted" style={{ fontSize: 12 }}>Se non funziona, prova uno di questi (reti virtuali o VPN): {other.map(i => url(i.ip)).join(' · ')}</p>}
      </> : <p className="muted">Questo PC non è collegato a nessuna rete: i giocatori non possono entrare.</p>}
      <p className="muted" style={{ fontSize: 12 }}>La prima volta Windows chiede il permesso per il firewall: consenti le <b>reti private</b>.</p>
      <h2 style={{ marginTop: 16 }}>Master</h2>
      {host.pin
        ? <p style={{ margin: 0 }}>Entra come <b>Master</b> con il PIN <span className="pin">{host.pin}</span></p>
        : <p className="muted" style={{ margin: 0 }}>Il master entra con il nome <b>Master</b> e il suo PIN.</p>}
      <button type="button" style={{ marginTop: 10 }} onClick={newPin}>Nuovo PIN del master</button>
    </div>
  );
}

function Login({ onIn, host, reloadHost }) {
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = await login(f.get('name'), f.get('pin')).catch(() => null);
    if (r?.ok) onIn();
    else setErr((await r?.json().catch(() => ({})))?.error || 'Il tavolo non risponde');
  };
  return (
    <>
      <div className="panel login">
        <h2><span className="logo">d20</span>Tavolo D&amp;D 3.5</h2>
        <form onSubmit={submit}>
          <label htmlFor="lname">Nome</label><input id="lname" name="name" required maxLength={40} autoComplete="username" autoFocus defaultValue={host?.pin ? 'Master' : ''} />
          <label htmlFor="lpin" style={{ marginTop: 12 }}>PIN</label><input id="lpin" name="pin" type="password" inputMode="numeric" required minLength={4} autoComplete="current-password" />
          <p className="muted">Prima volta? Scegli nome e PIN: l'account viene creato. Il master entra con il nome "Master".</p>
          <button className="primary">Entra</button>
          <p className="err" role="alert">{err}</p>
        </form>
      </div>
      {host && <div className="panel hostcard"><HostInfo host={host} reload={reloadHost} /></div>}
    </>
  );
}

function Header({ S, host, reloadHost }) {
  const ui = useUi(), master = isMaster(S);
  const [hostOpen, setHostOpen] = useState(false);
  const campName = S.campaigns.find(c => c.id === S.active)?.name;
  useEffect(() => { document.title = `${campName} · Tavolo D&D 3.5`; }, [campName]);
  const rename = async () => { const name = await ask('Nuovo nome della campagna', campName); if (name) act('campaign.rename', { name }); };
  const create = async () => { const name = await ask('Nome della nuova campagna'); if (name) act('campaign.create', { name }); };
  const out = async () => { await logout(); location.reload(); };
  return (
    <header className="top">
      <div className="brand"><span className="logo">d20</span><span className="title">Tavolo D&amp;D 3.5</span></div>
      <div className="camp">
        <select aria-label="Campagna" value={S.active} onChange={e => act('campaign.select', { id: e.target.value })}>
          {S.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.id === S.live ? ' ▶ in gioco' : ''}</option>)}
        </select>
        {master ? <><button onClick={rename}>Rinomina</button><button onClick={create}>+ Campagna</button></>
          : S.active !== S.live && <span className="muted">stai sfogliando, non è la campagna in gioco</span>}
      </div>
      <nav className="tabs">
        {TABS.map(([t, ico, l]) => (
          <button key={t} className={ui.tab === t ? 'on' : ''} onClick={() => setUi({ tab: t })} title={l}>
            <span className="ico" aria-hidden="true">{ico}</span><span className="lbl2">{t === 'handouts' && master ? 'Handout e note' : l}</span>
          </button>
        ))}
      </nav>
      <span className="spacer" />
      {host && (
        <span style={{ position: 'relative' }}>
          <button onClick={() => { setHostOpen(!hostOpen); reloadHost(); }} aria-expanded={hostOpen} title="Indirizzi per i giocatori">📡 Giocatori</button>
          {hostOpen && <div className="pop"><HostInfo host={host} reload={reloadHost} /></div>}
        </span>
      )}
      <Backup master={master} />
      <span className="who"><Avatar c={S.me} /><span className="name">{S.me.name}</span><small>({master ? 'master' : 'giocatore'})</small></span>
      <button onClick={out}>Esci</button>
    </header>
  );
}

export default function App() {
  const S = useS(), ui = useUi();
  const out = useSyncExternalStore(loggedOut.subscribe, loggedOut.get);
  const [phase, setPhase] = useState('loading');
  const [host, reloadHost] = useHost();
  const es = useRef(null);

  const boot = async () => {
    const r = await fetch('/api/me').catch(() => null);
    if (!r) return setTimeout(boot, 2000); // il tavolo si sta accendendo o è spento: riprova
    if (r.status === 401) return setPhase('login');
    loggedOut.set(false);
    setPhase('in');
    es.current?.close();
    const src = es.current = new EventSource('/api/events');
    src.onmessage = e => {
      const next = JSON.parse(e.data);
      if (interaction.paint) next.maps = server.get().maps; // mentre dipingi i tasselli sono solo qui (si salvano al rilascio)
      server.set(next);
    };
    src.onerror = () => { if (src.readyState === EventSource.CLOSED) setTimeout(boot, 2000); };
  };
  useEffect(() => { boot(); return () => es.current?.close(); }, []);
  // sessione scaduta (per esempio dopo un nuovo PIN del master): si torna all'accesso
  useEffect(() => { if (out) { es.current?.close(); server.set(null); setPhase('login'); } }, [out]);

  const page = phase === 'login' ? <Login onIn={boot} host={host} reloadHost={reloadHost} />
    : !S ? <p className="empty">Collegamento al tavolo…</p>
    : <>
      <Header S={S} host={host} reloadHost={reloadHost} />
      <div className={`layout ${ui.tab === 'maps' ? 'wide' : ''}`}>
        <main>{{ sheets: <Sheets />, combat: <Combat />, handouts: <Handouts />, story: <Story />, maps: <Maps /> }[ui.tab] || <Sheets />}</main>
        <Dice S={S} />
      </div>
    </>;
  return <><Svg html={TEXTURES} />{page}<Dialogs /><Notice /></>;
}
