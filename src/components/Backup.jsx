// Backup delle campagne: tutti lo scaricano, il master lo ripristina scegliendo campagna per campagna.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { confirmBox, say, loggedOut } from '../store.js';

const post = async (data) => {
  const r = await fetch('/api/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }).catch(() => null);
  const j = await r?.json().catch(() => ({}));
  if (!r) throw new Error('Il tavolo non risponde: è ancora acceso?');
  if (r.status === 401) loggedOut.set(true);
  if (!r.ok) throw new Error(j?.error || 'Errore');
  return j;
};

const when = t => (t ? new Date(t).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : 'data sconosciuta');
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const what = n => [pl(n.characters, 'scheda', 'schede'), pl(n.maps, 'mappa', 'mappe'), pl(n.recaps, 'riepilogo', 'riepiloghi')].join(' · ');

// Finestra del ripristino: una riga per campagna del file, con la scelta già proposta
// (la stessa campagna si sovrascrive, una campagna diversa si aggiunge).
function Restore({ file, preview, onClose }) {
  const [choice, setChoice] = useState(() => Object.fromEntries(preview.campaigns.map(c => [c.id, c.exists ? 'overwrite' : 'add'])));
  const [busy, setBusy] = useState(false);
  const set = (id, v) => setChoice(o => ({ ...o, [id]: v }));
  const go = async e => {
    e.preventDefault();
    const over = preview.campaigns.filter(c => choice[c.id] === 'overwrite');
    if (!preview.campaigns.some(c => choice[c.id] !== 'skip')) return say('Scegli almeno una campagna da ripristinare');
    if (over.length && !await confirmBox(over.length === 1 ? `Sovrascrivere "${over[0].current.name}"?` : `Sovrascrivere ${over.length} campagne?`, {
      text: `${over.map(c => `"${c.current.name}"`).join(', ')} tornerà com'era nel backup del ${when(preview.time)}: tutto quello che è cambiato dopo andrà perso. `
        + 'Una copia dei dati di adesso resta in data-prima-del-ripristino.json, accanto a data.json.',
      ok: 'Sovrascrivi', danger: true,
    })) return;
    setBusy(true);
    try {
      const { done } = await post({ backup: file, choices: choice });
      const n = (k, one, many) => done[k] && `${done[k]} ${done[k] === 1 ? one : many}`;
      const parts = [n('overwrite', 'sovrascritta', 'sovrascritte'), n('copy', 'aggiunta come copia', 'aggiunte come copia'), n('add', 'aggiunta', 'aggiunte')].filter(Boolean);
      say(`Backup ripristinato: campagne ${parts.join(', ')}`, 'ok');
      onClose();
    } catch (err) { say(err.message); setBusy(false); }
  };
  return (
    <div className="modalbg" style={{ zIndex: 90 }} /* sotto la richiesta di conferma */ onMouseDown={e => e.target === e.currentTarget && onClose()} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <form className="modal restore" role="dialog" aria-modal="true" aria-label="Ripristina backup" onSubmit={go}>
        <h3>Ripristina backup</h3>
        <p className="muted" style={{ marginTop: 0 }}>Backup del {when(preview.time)}{preview.by && `, scaricato da ${preview.by}`}.</p>
        <ul className="restorelist">
          {preview.campaigns.map(c => (
            <li key={c.id}>
              <div><b>{c.name}</b> <span className={`badge ${c.exists ? 'same' : 'new'}`}>{c.exists ? 'già sul tavolo' : 'campagna diversa'}</span></div>
              <div className="muted small">Nel backup: {what(c.counts)}</div>
              {c.exists && <div className="muted small">Sul tavolo adesso{c.current.name !== c.name && <> come "{c.current.name}"</>}{c.current.live && ' (in gioco)'}: {what(c.current.counts)}</div>}
              <select aria-label={`Cosa fare con ${c.name}`} value={choice[c.id]} onChange={e => set(c.id, e.target.value)}>
                {c.exists ? <>
                  <option value="overwrite">Sovrascrivi con il backup</option>
                  <option value="copy">Aggiungi come copia</option>
                </> : <option value="add">Aggiungi al tavolo</option>}
                <option value="skip">Non toccare</option>
              </select>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" onClick={onClose}>Annulla</button>
          <button className="primary" disabled={busy}>{busy ? 'Ripristino…' : 'Ripristina'}</button>
        </div>
      </form>
    </div>
  );
}

export default function Backup({ master }) {
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(false); // bottone a sinistra (intestazione andata a capo): la finestrella si apre verso destra
  const [restore, setRestore] = useState(null);
  const input = useRef(null);
  const pick = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      let file;
      try { file = JSON.parse(await f.text()); } catch { throw new Error('Il file non è un backup del tavolo'); }
      setRestore({ file, preview: await post({ backup: file }) });
      setOpen(false);
    } catch (err) { say(err.message); }
  };
  return (
    <span style={{ position: 'relative' }}>
      <button onClick={e => { setLeft(e.currentTarget.getBoundingClientRect().right < 380 && !matchMedia('(max-width: 1100px)').matches); setOpen(!open); }} aria-expanded={open} title="Backup delle campagne">💾 Backup</button>
      {open && (
        <div className="pop" style={left ? { left: 0, right: 'auto' } : undefined}>
          <h2>Backup</h2>
          <p className="muted" style={{ marginTop: 0 }}>Un file con tutte le campagne del tavolo: schede, mappe, storia, handout e note. Tienine una copia: se il PC del tavolo si rompe, il master lo ripristina.</p>
          <a className="btn primary" href="/api/backup" download onClick={() => setOpen(false)}>Scarica backup</a>
          {master && <>
            <h2 style={{ marginTop: 16 }}>Ripristina</h2>
            <p className="muted" style={{ marginTop: 0 }}>Scegli un file di backup: prima di cambiare qualcosa ti mostra le campagne che contiene e ti chiede cosa farne.</p>
            <button onClick={() => input.current.click()}>Ripristina da file…</button>
            <input ref={input} type="file" accept=".json,application/json" hidden onChange={pick} />
          </>}
        </div>
      )}
      {/* fuori dall'intestazione, che con la sfocatura terrebbe la finestra chiusa dentro di sé */}
      {restore && createPortal(<Restore {...restore} onClose={() => setRestore(null)} />, document.body)}
    </span>
  );
}
