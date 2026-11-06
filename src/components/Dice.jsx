// Pannello dei dadi; su schermi stretti sale dal basso e l'ultimo tiro compare in una notifica.
import { useEffect, useRef, useState } from 'react';
import { act, isMaster } from '../store.js';

function RollLine({ r }) {
  const nat = /^1d20\[(20|1)\]/.exec(r.detail);
  return <>
    <span className="tot">{r.total}</span><b>{r.who}</b> {r.label}{r.secret ? ' 🔒' : ''}
    <br /><small className="muted">{r.expr} → {r.detail}</small>{nat && <> <span className="crit">{nat[1] === '20' ? '20 naturale!' : '1 naturale'}</span></>}
  </>;
}

const narrowQ = typeof matchMedia === 'function' ? matchMedia('(max-width: 1100px)') : null;

export default function Dice({ S }) {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState('');
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState(false);
  const [toast, setToast] = useState(null);
  const seen = useRef({ camp: S.active, roll: S.rolls.at(-1)?.id });
  const master = isMaster(S);

  // notifica solo per tiri nuovi nella stessa campagna, e solo quando il pannello è chiuso su schermo stretto
  useEffect(() => {
    const last = S.rolls.at(-1);
    if (S.active === seen.current.camp && last && last.id !== seen.current.roll && narrowQ?.matches && !open) {
      setToast(last);
      const t = setTimeout(() => setToast(null), 5000);
      seen.current = { camp: S.active, roll: last.id };
      return () => clearTimeout(t);
    }
    seen.current = { camp: S.active, roll: last?.id };
  }, [S.rolls, S.active]);
  useEffect(() => {
    const close = e => e.key === 'Escape' && setOpen(false);
    const reset = () => setOpen(false);
    addEventListener('keydown', close);
    narrowQ?.addEventListener('change', reset);
    return () => { removeEventListener('keydown', close); narrowQ?.removeEventListener('change', reset); };
  }, []);

  const roll = async (e, x = expr.trim()) => {
    e?.preventDefault();
    if (!x) return;
    const r = await act('roll', { expr: x, label, secret: master && secret });
    if (r.ok) setLabel('');
  };
  return <>
    <aside className={`panel ${open ? 'open' : ''}`} aria-label="Dadi" id="dicepanel">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>🎲 Dadi</h2><button type="button" className="diceclose" onClick={() => setOpen(false)} aria-label="Chiudi">✕</button></div>
      <form className="rollform" onSubmit={roll}>
        <input placeholder="1d20+5" aria-label="Espressione" value={expr} onChange={e => setExpr(e.target.value)} />
        <input placeholder="Motivo" aria-label="Motivo" value={label} onChange={e => setLabel(e.target.value)} />
        <button className="primary">Tira</button>
      </form>
      <div className="dice">
        {['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100'].map(d => <button key={d} type="button" onClick={() => roll(null, d)}>{d.slice(1)}</button>)}
      </div>
      {master && <label className="inline" style={{ marginBottom: 8 }}><input type="checkbox" checked={secret} onChange={e => setSecret(e.target.checked)} /> tiro segreto (solo master)</label>}
      <div className="log" aria-live="polite">
        {S.rolls.length ? S.rolls.slice().reverse().map(r => <div key={r.id}><RollLine r={r} /></div>) : <p className="muted">Nessun tiro.</p>}
      </div>
    </aside>
    <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
    <div className={`toast ${toast ? 'show' : ''}`} role="status" onClick={() => { setOpen(true); setToast(null); }}>{toast && <RollLine r={toast} />}</div>
    <button className="dicefab" onClick={() => { setOpen(!open); setToast(null); }} aria-label="Dadi" aria-controls="dicepanel" aria-expanded={open}>🎲</button>
  </>;
}
