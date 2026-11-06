// Tracker di iniziativa: il master lo gestisce, i giocatori lo seguono.
import { useS, isMaster, canEdit, act, server, confirmBox, isNpc } from '../store.js';
import { calc } from '../rules.js';
import { num, sgn, rid } from '../util.js';
import { Field, CharField } from './common.jsx';

// Aggiorna subito in locale, poi lo manda al server.
function setTracker(f) {
  const t = structuredClone(server.get().tracker);
  f(t);
  t.turn = Math.min(t.turn, Math.max(0, t.list.length - 1));
  server.set(S => ({ ...S, tracker: t }));
  act('tracker', { tracker: t });
}
const d20 = () => 1 + Math.floor(Math.random() * 20);
const byInit = t => { t.list.sort((a, b) => num(b.init) - num(a.init)); t.turn = 0; };

export default function Combat() {
  const S = useS(), t = S.tracker, master = isMaster(S);
  const T = (i, f, n) => <Field value={t.list[i][f]} n={n} aria={f} onCommit={v => setTracker(t => { t.list[i][f] = v; })} />;
  const curRow = t.list.find((x, i) => (master ? i === t.turn : x.current));
  const curName = curRow && (S.characters[curRow.charId]?.name || curRow.name);
  const C = S.characters;
  const act_ = {
    next: () => setTracker(t => { if (++t.turn >= t.list.length) { t.turn = 0; t.round++; } }),
    // npc: false → i personaggi dei giocatori; true → i mostri e PNG del master (quelli nascosti restano nascosti anche qui)
    add: npc => setTracker(t => Object.values(C).filter(c => isNpc(c) === npc && !t.list.some(x => x.charId === c.id)).forEach(c => t.list.push({ id: rid(), charId: c.id, init: '', cond: '' }))),
    npc: () => setTracker(t => t.list.push({ id: rid(), name: 'PNG', init: '', initMod: '', hp: '', maxHp: '', ac: '', cond: '', hidden: false })),
    rollInit: () => setTracker(t => {
      t.list.forEach(x => { if (x.init === '' || x.init === undefined) { const c = C[x.charId]; x.init = d20() + (c ? calc(c).init : num(x.initMod)); } });
      byInit(t);
    }),
    sort: () => setTracker(byInit),
    reset: async () => { if (await confirmBox('Terminare il combattimento e svuotare il tracker?', { ok: 'Termina', danger: true })) setTracker(t => { t.list = []; t.round = 1; t.turn = 0; }); },
  };
  const move = (i, d) => setTracker(t => {
    const j = i + d;
    if (j < 0 || j >= t.list.length) return;
    [t.list[i], t.list[j]] = [t.list[j], t.list[i]];
    if (t.turn === i) t.turn = j; else if (t.turn === j) t.turn = i; // il turno segue chi stava agendo
  });
  const remove = i => setTracker(t => { if (i < t.turn) t.turn--; t.list.splice(i, 1); });

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="stat hl"><b>{t.round}</b><span>Round</span></div>
        {curName && <div className="stat"><b style={{ fontSize: 18 }}>{curName}</b><span>Turno di</span></div>}
      </div>
      {master && <div className="row tight" style={{ marginBottom: 10 }}>
        <button className="primary" onClick={act_.next} disabled={!t.list.length}>Turno successivo ▶</button>
        <button onClick={() => act_.add(false)}>+ Tutti i PG</button><button onClick={() => act_.add(true)}>+ Mostri e PNG</button><button onClick={act_.npc}>+ Riga libera</button>
        <button onClick={act_.rollInit}>🎲 Tira iniziative mancanti</button><button onClick={act_.sort}>Ordina per iniziativa</button>
        <button className="danger" onClick={act_.reset}>Fine combattimento</button>
      </div>}
      {t.list.length ? <div className="scroll"><table><tbody>
        <tr><th></th><th>Nome</th><th>Iniz.</th>{master && <th>Mod. iniz.</th>}<th>PF</th><th>CA</th><th>Condizioni</th>{master && <><th>Nascosto</th><th></th></>}</tr>
        {t.list.map((x, i) => {
          const c0 = x.charId && C[x.charId], hide = c0?.secret && !master, c = !hide && c0, k = c && calc(c);
          const name = hide ? c0.name : x.name; // mostro "solo master": per i giocatori è come un PNG
          const cur = master ? i === t.turn : x.current;
          const hp = c ? (canEdit(S, c) ? <span className="row tight nowrap"><CharField c={c} p={['hp', 'cur']} n aria="PF attuali" /> / {c.hp?.max}</span> : `${c.hp?.cur ?? ''} / ${c.hp?.max ?? ''}`)
            : master ? <span className="row tight nowrap">{T(i, 'hp', 1)} / {T(i, 'maxHp', 1)}</span> : '—';
          return <tr key={x.id || i} className={cur ? 'cur' : ''}><td>{cur ? '▶' : ''}</td>
            <td>{c ? <>{c.name}{master && c.hidden && <span title="Nascosto ai giocatori"> 🙈</span>}</> : master ? T(i, 'name') : name}</td>
            <td>{master ? T(i, 'init', 1) : x.init}</td>
            {master && <td>{c ? sgn(k.init) : T(i, 'initMod', 1)}</td>}
            <td>{hp}</td>
            <td>{c ? k.ac : master ? T(i, 'ac', 1) : ''}</td>
            <td>{master ? T(i, 'cond') : x.cond}</td>
            {master && <><td><input type="checkbox" checked={!!x.hidden} aria-label="nascosto" onChange={e => setTracker(t => { t.list[i].hidden = e.target.checked; })} /></td>
              <td className="nowrap"><button className="icon" onClick={() => move(i, -1)} aria-label="Su">↑</button><button className="icon" onClick={() => move(i, 1)} aria-label="Giù">↓</button><button className="icon danger" onClick={() => remove(i)} aria-label="Rimuovi">✕</button></td></>}
          </tr>;
        })}
      </tbody></table></div> : <p className="empty"><span className="big-ico">⚔️</span>Nessun combattimento in corso.</p>}
      {master && <p className="muted">I PNG nascosti non compaiono ai giocatori; PF e CA dei PNG sono visibili solo a te.</p>}
    </div>
  );
}
