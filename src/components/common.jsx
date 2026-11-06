// Pezzi usati da più schermate: campi che salvano al rilascio, tiri, segnalini, finestre di dialogo.
import { useEffect, useRef, useState } from 'react';
import { act, server, useDialog, dialog, useNotice, notice } from '../store.js';
import { get } from '../util.js';
import { tokColor, initials } from '../map/draw.js';

// Campo che salva quando esci (o premi Invio): mentre scrivi, gli aggiornamenti dagli altri non ti cancellano il testo.
export function Field({ value, onCommit, area, rows = 4, opts, check, n, ph, aria, style, className, autoFocus }) {
  const v = value ?? '';
  const [draft, setDraft] = useState(v);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(v); }, [v]);
  if (check) return <input type="checkbox" checked={!!value} aria-label={aria} onChange={e => onCommit(e.target.checked)} />;
  if (opts) {
    return (
      <select value={v} aria-label={aria} style={style} onChange={e => onCommit(e.target.value)}>
        {opts.map(x => { const [ov, ol] = Array.isArray(x) ? x : [x, x]; return <option key={ov} value={ov}>{ol}</option>; })}
      </select>
    );
  }
  const common = {
    value: draft, 'aria-label': aria, placeholder: ph, style, autoFocus,
    onChange: e => setDraft(e.target.value),
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; if (draft !== v) onCommit(draft); },
  };
  if (area) return <textarea rows={rows} className={className} {...common} />;
  return <input type={n ? 'number' : 'text'} className={n ? 'n' : className} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} {...common} />;
}

// Campo della scheda legato a un percorso nel personaggio: aggiorna subito in locale (i totali si ricalcolano), poi il server.
export function setChar(c, path, value) {
  server.set(S => {
    const ch = structuredClone(S.characters[c.id]);
    let o = ch;
    for (const k of path.slice(0, -1)) o = o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {};
    o[path.at(-1)] = value;
    return { ...S, characters: { ...S.characters, [c.id]: ch } };
  });
  return act('char.set', { id: c.id, path, value });
}
export const CharField = ({ c, p, def, ...o }) => <Field value={get(c, p) ?? def} onCommit={v => setChar(c, p, v)} aria={o.aria || p.join(' ')} {...o} />;

// Bottone che tira un dado: il server tira, tutti vedono il risultato.
export const Roll = ({ label, expr, children }) => (
  <button type="button" className="roll" title="Tira" onClick={() => act('roll', { expr, label })}>{children}</button>
);

export const Avatar = ({ c, size }) => {
  const st = size && { width: size, height: size, fontSize: size * .32 };
  return c.avatar
    ? <img className="avatar" src={c.avatar} alt="" style={st || undefined} />
    : <span className="avatar" style={{ background: tokColor(c.id), ...st }}>{initials(c)}</span>;
};

// Riduce un'immagine scelta dal giocatore a un ritratto 4:5 piccolo (ritaglio al centro), pronto da salvare nella scheda.
// Il segnalino in mappa ne usa il centro, ritagliato a cerchio.
export function toAvatar(file, W = 320, H = 400) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const iw = img.naturalWidth, ih = img.naturalHeight, s = Math.min(iw / W, ih / H), cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      cv.getContext('2d').drawImage(img, (iw - W * s) / 2, (ih - H * s) / 2, W * s, H * s, 0, 0, W, H);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', .85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Immagine non leggibile')); };
    img.src = url;
  });
}

// Disegno SVG già pronto come testo (le anteprime degli strumenti delle mappe)
export const Svg = ({ html }) => <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;

export const Tool = ({ on, onClick, pic, label, children }) => (
  <button type="button" className={`tool ${on ? 'on' : ''}`} aria-pressed={!!on} onClick={onClick}>
    <Svg html={pic} /><span>{label}</span>{children}
  </button>
);

export const Empty = ({ ico, children }) => <div className="panel empty"><span className="big-ico">{ico}</span>{children}</div>;

// --- Finestre di dialogo (ask/confirmBox in store.js) e avvisi ---
export function Dialogs() {
  const d = useDialog();
  const [text, setText] = useState('');
  useEffect(() => { if (d) setText(d.value ?? ''); }, [d]);
  if (!d) return null;
  const close = v => { dialog.set(null); d.resolve(v); };
  return (
    <div className="modalbg" onMouseDown={e => e.target === e.currentTarget && close(d.kind === 'prompt' ? null : false)}
      onKeyDown={e => e.key === 'Escape' && close(d.kind === 'prompt' ? null : false)}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={d.title}
        onSubmit={e => { e.preventDefault(); close(d.kind === 'prompt' ? text : true); }}>
        <h3>{d.title}</h3>
        {d.text && <p className="muted" style={{ marginTop: 0 }}>{d.text}</p>}
        {d.kind === 'prompt' && (d.area
          ? <textarea autoFocus rows={4} value={text} onChange={e => setText(e.target.value)} maxLength={d.max}
            onKeyDown={e => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.currentTarget.form.requestSubmit()} />
          : <input autoFocus value={text} onChange={e => setText(e.target.value)} maxLength={d.max} />)}
        <div className="actions">
          <button type="button" onClick={() => close(d.kind === 'prompt' ? null : false)}>Annulla</button>
          <button className={d.danger ? 'primary danger' : 'primary'} autoFocus={d.kind !== 'prompt'}>{d.ok || 'OK'}</button>
        </div>
      </form>
    </div>
  );
}

export function Notice() {
  const n = useNotice();
  return n && <div className={`notice ${n.kind === 'ok' ? 'ok' : ''}`} role="alert" onClick={() => notice.set(null)}>{n.text}</div>;
}
