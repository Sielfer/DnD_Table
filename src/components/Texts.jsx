// Handout (con le note private del master) e storia della campagna.
import { useS, isMaster, act, confirmBox, server } from '../store.js';
import { rid } from '../util.js';
import { Field, Empty } from './common.jsx';

export function Handouts() {
  const S = useS();
  if (!isMaster(S)) {
    return S.handouts.length
      ? S.handouts.map(h => <div className="panel" key={h.id}>
        <div className="row" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{h.title || 'Senza titolo'}</h2>{h.private && <span className="tag">🔒 privato</span>}</div>
        <div className="pre">{h.text}</div></div>)
      : <Empty ico="📨">Il master non ha ancora condiviso nulla.</Empty>;
  }
  const save = handouts => act('handouts', { handouts });
  // sempre dall'ultimo stato: un campo salvato all'uscita non deve riportare indietro gli altri
  const now = () => server.get().handouts;
  const set = (i, f, v) => save(now().map((h, j) => (j === i ? { ...h, [f]: v } : h)));
  const del = async i => { if (await confirmBox('Eliminare questo handout?', { ok: 'Elimina', danger: true })) save(now().filter((_, j) => j !== i)); };
  // a chi va: nessuno (bozza), tutti, oppure solo i giocatori scelti (to)
  const players = S.users.filter(u => u.role !== 'master');
  const send = (i, patch) => save(now().map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const toggle = (i, uid) => {
    const h = now()[i], cur = h.visible ? h.to || [] : [];
    const to = cur.includes(uid) ? cur.filter(x => x !== uid) : [...cur, uid];
    send(i, to.length ? { visible: true, to } : { visible: false, to: [] }); // tolto l'ultimo: torna bozza
  };
  const Recipients = ({ h, i }) => {
    const priv = h.visible && h.to?.length > 0;
    return (
      <div className="recips"><span className="lbl">Chi lo vede</span>
        <button className={!h.visible ? 'on' : ''} onClick={() => send(i, { visible: false, to: [] })} title="Lo vedi solo tu">✏️ Bozza</button>
        <button className={h.visible && !priv ? 'on' : ''} onClick={() => send(i, { visible: true, to: [] })}>👥 Tutti</button>
        <span className="muted">o solo:</span>
        {players.map(u => <button key={u.id} className={priv && h.to.includes(u.id) ? 'on' : ''} aria-pressed={!!(priv && h.to.includes(u.id))} onClick={() => toggle(i, u.id)}>{u.name}</button>)}
        {!players.length && <span className="muted">nessun giocatore ancora</span>}
      </div>
    );
  };
  return <>
    <div className="panel"><h2>🔒 Note private del master</h2><Field area rows={8} aria="Note private" value={S.notes} onCommit={v => act('notes', { notes: v })} /></div>
    {S.handouts.map((h, i) => (
      <div className="panel" key={h.id || i}>
        <div className="row">
          <Field value={h.title} ph="Titolo" aria="Titolo" style={{ flex: 1, width: 'auto', fontWeight: 600 }} onCommit={v => set(i, 'title', v)} />
          <button className="danger" onClick={() => del(i)}>Elimina</button>
        </div>
        <Recipients h={h} i={i} />
        <div style={{ marginTop: 8 }}><Field area rows={6} aria="Testo" value={h.text} onCommit={v => set(i, 'text', v)} /></div>
      </div>
    ))}
    <button className="primary" onClick={() => save([...S.handouts, { id: rid(), title: '', text: '', visible: false }])}>+ Nuovo handout</button>
  </>;
}

export function Story() {
  const S = useS(), master = isMaster(S);
  const who = id => S.users.find(u => u.id === id)?.name ?? '?';
  const when = t => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const del = async r => { if (await confirmBox(`Eliminare "${r.title || 'Riepilogo'}"?`, { ok: 'Elimina', danger: true })) act('recap.delete', { id: r.id }); };
  return <>
    <div className="panel"><h2>Storia della campagna</h2>
      {master
        ? <><Field area rows={20} aria="Storia della campagna" value={S.story} onCommit={v => act('story', { story: v })} /><p className="muted">I giocatori la leggono ma non possono modificarla.</p></>
        : S.story ? <div className="pre">{S.story}</div> : <p className="muted">Il master non ha ancora scritto la storia.</p>}
    </div>
    {/* riepiloghi: ognuno scrive il suo per ampliare la storia; il master li può correggere tutti */}
    {(S.recaps || []).map(r => {
      const mine = master || r.author === S.me.id;
      return (
        <div className="panel" key={r.id}>
          <div className="row" style={{ marginBottom: 8 }}>
            {mine ? <Field value={r.title} ph="Titolo" aria="Titolo del riepilogo" style={{ flex: 1, width: 'auto', fontWeight: 700 }} onCommit={v => act('recap.set', { id: r.id, field: 'title', value: v })} />
              : <h2 style={{ flex: 1, margin: 0 }}>{r.title || 'Riepilogo'}</h2>}
            <span className="muted nowrap">✍️ {who(r.author)} · {when(r.time)}</span>
            {mine && <button className="icon danger" onClick={() => del(r)} aria-label="Elimina il riepilogo">✕</button>}
          </div>
          {mine ? <Field area rows={8} aria="Testo del riepilogo" value={r.text} ph="Cosa è successo? Luoghi, personaggi incontrati, indizi…" onCommit={v => act('recap.set', { id: r.id, field: 'text', value: v })} />
            : r.text ? <div className="pre">{r.text}</div> : <p className="muted">Ancora vuoto.</p>}
        </div>
      );
    })}
    <button className="primary" onClick={() => act('recap.add')}>+ Nuovo riepilogo</button>
  </>;
}
