// Schede dei personaggi: elenco a sinistra, scheda completa a destra.
import { useS, useUi, setUi, isMaster, canEdit, act, confirmBox, isNpc } from '../store.js';
import { calc, ABOPTS, SIZES, SKILLS } from '../rules.js';
import { num, sgn } from '../util.js';
import { CharField, Roll, Avatar, Empty, setChar, toAvatar } from './common.jsx';
import { say } from '../store.js';
import { tokColor, initials } from '../map/draw.js';

// Immagine scelta dal giocatore → ridotta e salvata nella scheda.
const pickFor = c => async e => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try { await setChar(c, ['avatar'], await toAvatar(f)); } catch (err) { say(err.message); }
};
const removeBtn = c => c.avatar && <button type="button" className="icon rm" title="Togli immagine" aria-label="Togli immagine" onClick={() => setChar(c, ['avatar'], '')}>✕</button>;

// Con la finestra stretta, al posto del ritratto il cerchietto accanto al nome (si cambia allo stesso modo).
function MiniAvatar({ c, edit }) {
  if (!edit) return <span className="mini"><Avatar c={c} size={48} /></span>;
  return (
    <span className="mini">
      <label title="Cambia immagine"><Avatar c={c} size={48} /><span className="cam" aria-hidden="true">📷</span>
        <input type="file" accept="image/*" onChange={pickFor(c)} hidden aria-label="Immagine del personaggio" /></label>
      {removeBtn(c)}
    </span>
  );
}

// Il ritratto a sinistra della scheda: chi può modificarla ci clicca sopra per scegliere un'immagine.
function Portrait({ c, edit }) {
  const face = c.avatar ? <img src={c.avatar} alt={`Ritratto di ${c.name || 'personaggio'}`} />
    : <span className="initials" style={{ background: tokColor(c.id) }}>{initials(c)}</span>;
  if (!edit) return <div className="portrait">{face}</div>;
  const pick = pickFor(c);
  return (
    <div className="portrait">
      <label title="Cambia immagine">{face}
        <span className="cam">📷 {c.avatar ? 'Cambia immagine' : 'Aggiungi un\'immagine'}</span>
        <input type="file" accept="image/*" onChange={pick} hidden aria-label="Immagine del personaggio" /></label>
      {removeBtn(c)}
    </div>
  );
}

export default function Sheets() {
  const S = useS(), ui = useUi(), master = isMaster(S);
  const chars = Object.values(S.characters).filter(c => !c.secret || master); // le schede "solo master" ai giocatori arrivano vuote
  const cur = S.characters[ui.charId] && chars.includes(S.characters[ui.charId]) ? S.characters[ui.charId] : chars.find(c => c.owner === S.me.id) || chars[0];
  const owner = id => S.users.find(u => u.id === id)?.name ?? '?';
  const skills = SKILLS.map(([name, ab, acp]) => ({ name, ab, acp: !!acp }));
  const create = async data => { const r = await act('char.create', { data: { skills, ...data } }); if (r.id) setUi({ charId: r.id }); };
  // i mostri del master nascono nascosti: li mostra lui quando entrano in scena
  const newMonster = () => create({ name: 'Nuovo mostro', npc: true, hidden: true, secret: true });
  const item = c => (
    <div key={c.id} className="charitem">
      <button className={c === cur ? 'on' : ''} onClick={() => setUi({ charId: c.id })}>
        <Avatar c={c} /><span>{c.name || 'Senza nome'}<small>{isNpc(c) ? (c.secret ? 'statistiche nascoste' : 'mostro / PNG') : owner(c.owner)}{c.cls ? ` · ${c.cls} ${c.level || ''}` : ''}</small></span>
      </button>
      {master && isNpc(c) && <button className="icon eye" title={c.hidden ? 'Nascosto ai giocatori: clic per mostrarlo' : 'Visibile ai giocatori: clic per nasconderlo'}
        aria-label={c.hidden ? 'Mostra ai giocatori' : 'Nascondi ai giocatori'} onClick={() => setChar(c, ['hidden'], !c.hidden)}>{c.hidden ? '🙈' : '👁'}</button>}
    </div>
  );
  const pcs = chars.filter(c => !isNpc(c)), npcs = chars.filter(isNpc);
  return (
    <div className="sheetwrap">
      <div className="panel charlist"><h2>Personaggi</h2>
        {pcs.map(item)}
        <button className="add" onClick={() => create({ name: 'Nuovo personaggio' })}>+ Nuovo personaggio</button>
        {(master || npcs.length > 0) && <h2 style={{ marginTop: 16 }}>Mostri e PNG</h2>}
        {npcs.map(item)}
        {master && <button className="add" onClick={newMonster}>+ Mostro / PNG nascosto</button>}
      </div>
      <div>{cur ? <Sheet c={cur} S={S} /> : <Empty ico="📜">Crea un personaggio per iniziare.</Empty>}</div>
    </div>
  );
}

function Sheet({ c, S }) {
  const k = calc(c), edit = canEdit(S, c), master = isMaster(S);
  const R = (n, label, expr) => <Roll expr={expr || '1d20' + sgn(n)} label={(c.name || '') + ': ' + label}>{expr ? '🎲' : sgn(n)}</Roll>;
  const F = (label, p, o = {}) => <div key={p.join()}><label>{label}</label><CharField c={c} p={p} aria={label} {...o} /></div>;
  const iter = t => (k.babs.length > 1 ? k.babs.map(b => sgn(t - k.bab + b)).join('/') : Array.from({ length: Math.max(1, Math.min(4, Math.ceil(k.bab / 5))) }, (_, i) => sgn(t - 5 * i)).join('/'));
  const addRow = list => setChar(c, [list], [...(c[list] || []), list === 'skills' ? { name: '', ab: 'int' } : {}]);
  const delRow = (list, i) => setChar(c, [list], c[list].filter((_, j) => j !== i));
  const del = (list, i) => <button type="button" className="icon danger" onClick={() => delRow(list, i)} aria-label="Rimuovi">✕</button>;
  const delChar = async () => { if (await confirmBox(`Eliminare definitivamente "${c.name}"?`, { ok: 'Elimina', danger: true })) act('char.delete', { id: c.id }); };
  const spellAb = c.spells?.ab || 'int';
  const hpMax = num(c.hp?.max), hpCur = num(c.hp?.cur);

  return (
    <fieldset disabled={!edit}>
      <div className="panel sheethead"><div className="sheetgrid">
        <Portrait c={c} edit={edit} />
        <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="row"><MiniAvatar c={c} edit={edit} /><h2 style={{ margin: 0, fontSize: 20 }}>{c.name || 'Senza nome'}</h2>
            {isNpc(c) && <span className="tag">{c.hidden ? '🙈 nascosto' : '👁 visibile'}</span>}</div>
          {edit ? <button type="button" className="danger" onClick={delChar}>Elimina personaggio</button> : <span className="muted">sola lettura</span>}
        </div>
        <div className="stats">
          <div className="stat hl"><b>{k.ac}</b><span>CA</span></div>
          <div className="stat"><b>{c.hp?.cur ?? '—'}<small className="muted">/{c.hp?.max ?? '—'}</small></b><span>PF</span>
            {hpMax > 0 && <div className="hpbar"><i style={{ width: `${Math.max(0, Math.min(100, hpCur / hpMax * 100))}%`, background: hpCur / hpMax < .3 ? 'var(--danger)' : undefined }} /></div>}</div>
          <div className="stat"><b>{sgn(k.init)}</b><span>Iniziativa</span></div>
          <div className="stat"><b>{sgn(k.fort)}/{sgn(k.ref)}/{sgn(k.will)}</b><span>Temp/Rifl/Vol</span></div>
          <div className="stat"><b>{sgn(k.melee)}</b><span>Mischia</span></div>
          <div className="stat"><b>{sgn(k.ranged)}</b><span>Distanza</span></div>
        </div>
        <div className="grid">
          {F('Nome', ['name'])}
          {master && <div><label>Giocatore</label>
            <select aria-label="Giocatore" value={c.owner} onChange={e => act('char.owner', { id: c.id, owner: e.target.value })}>
              {S.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>}
          {master && <div style={{ gridColumn: 'span 2' }}><label>Solo per il master</label>
            <label className="inline"><CharField c={c} p={['npc']} check aria="Mostro o PNG" /> mostro o PNG</label>
            <label className="inline"><CharField c={c} p={['hidden']} check aria="Nascosto ai giocatori" /> nascosto ai giocatori (né scheda né segnalino)</label>
            <label className="inline"><CharField c={c} p={['secret']} check aria="Statistiche nascoste" /> statistiche nascoste (si vede solo il segnalino)</label></div>}
          {F('Classe', ['cls'])}{F('Livello', ['level'], { n: 1 })}{F('Razza', ['race'])}{F('Allineamento', ['align'])}{F('Divinità', ['deity'])}
          {F('Taglia', ['size'], { opts: Object.keys(SIZES), def: 'Media' })}{F('Età', ['age'])}{F('Sesso', ['gender'])}{F('Altezza', ['height'])}{F('Peso', ['weight'])}
          {F('Punti esperienza', ['xp'])}{F('Velocità', ['speed'])}
        </div>
        </div>
      </div>
      </div>

      <div className="cols wide">
        <div className="panel"><h2>Caratteristiche</h2><div className="scroll"><table><tbody>
          <tr><th></th><th>Punteggio</th><th>Temp.</th><th>Mod.</th></tr>
          {ABOPTS.map(([a, l]) => <tr key={a}><th>{l}</th><td><CharField c={c} p={['abil', a, 'score']} n aria={l} /></td><td><CharField c={c} p={['abil', a, 'temp']} n aria={l + ' temporaneo'} /></td><td>{R(k.ab(a), 'prova di ' + l)}</td></tr>)}
        </tbody></table></div></div>

        <div className="panel"><h2>Punti ferita</h2><div className="grid">{F('Massimi', ['hp', 'max'], { n: 1 })}{F('Attuali', ['hp', 'cur'], { n: 1 })}{F('Non letali', ['hp', 'nl'], { n: 1 })}</div>
          <h2 style={{ marginTop: 12 }}>Tiri salvezza</h2><div className="scroll"><table><tbody>
            <tr><th></th><th>Tot.</th><th>Base</th><th>Car.</th><th>Magia</th><th>Vari</th></tr>
            {[['fort', 'Tempra', 'con'], ['ref', 'Riflessi', 'dex'], ['will', 'Volontà', 'wis']].map(([s, l, a]) => <tr key={s}><th>{l}</th><td>{R(k[s], l)}</td>
              <td><CharField c={c} p={['saves', s, 'base']} n aria={l + ' base'} /></td><td className="muted">{sgn(k.ab(a))}</td>
              <td><CharField c={c} p={['saves', s, 'magic']} n aria={l + ' magia'} /></td><td><CharField c={c} p={['saves', s, 'misc']} n aria={l + ' vari'} /></td></tr>)}
          </tbody></table></div></div>

        <div className="panel"><h2>Classe Armatura</h2><div className="row" style={{ marginBottom: 8 }}><span className="big">CA {k.ac}</span><span>Contatto <b>{k.touch}</b></span><span>Colto alla sprovvista <b>{k.ff}</b></span></div>
          <div className="grid">{F('Armatura', ['ac', 'armor'], { n: 1 })}{F('Scudo', ['ac', 'shield'], { n: 1 })}{F('Naturale', ['ac', 'natural'], { n: 1 })}{F('Deviazione', ['ac', 'deflection'], { n: 1 })}
            {F('Vari', ['ac', 'misc'], { n: 1 })}{F('Des. massima', ['ac', 'maxDex'], { n: 1 })}{F('Penalità armatura', ['ac', 'acp'], { n: 1, ph: '-2' })}{F('Fallim. incant. %', ['ac', 'asf'], { n: 1 })}</div></div>

        <div className="panel"><h2>Combattimento</h2><div className="scroll"><table><tbody>
          <tr><th>Iniziativa</th><td>{R(k.init, 'iniziativa')}</td><td><label>vari</label><CharField c={c} p={['initMisc']} n aria="iniziativa vari" /></td></tr>
          <tr><th>Bonus attacco base</th><td><CharField c={c} p={['bab']} ph="+7/+5/+3" aria="BAB" /></td><td className="muted">{iter(k.bab)}</td></tr>
          <tr><th>Mischia</th><td>{R(k.melee, 'attacco in mischia')}</td><td className="muted">{iter(k.melee)}</td></tr>
          <tr><th>Distanza</th><td>{R(k.ranged, 'attacco a distanza')}</td><td className="muted">{iter(k.ranged)}</td></tr>
          <tr><th>Lotta</th><td>{R(k.grapple, 'lotta')}</td><td><label>vari</label><CharField c={c} p={['grappleMisc']} n aria="lotta vari" /></td></tr>
        </tbody></table></div>
          <div className="grid" style={{ marginTop: 8 }}>{F('Riduzione del danno', ['dr'])}{F('Resistenza agli incantesimi', ['sr'])}</div></div>
      </div>

      <div className="panel"><h2>Attacchi</h2><div className="scroll"><table><tbody>
        <tr><th>Arma</th><th>Bonus</th><th></th><th>Danni</th><th></th><th>Critico</th><th>Gittata</th><th>Note</th><th></th></tr>
        {(c.attacks || []).map((x, i) => <tr key={i}>
          <td><CharField c={c} p={['attacks', i, 'name']} aria="arma" /></td><td><CharField c={c} p={['attacks', i, 'bonus']} ph="+5/+0" aria="bonus" /></td>
          <td>{R(parseInt(x.bonus) || 0, x.name || 'attacco')}</td><td><CharField c={c} p={['attacks', i, 'dmg']} ph="1d8+3" aria="danni" /></td>
          <td>{/^[\dd+\-\s]+$/i.test(x.dmg || '') && /d/i.test(x.dmg) ? R(0, 'danni ' + (x.name || ''), x.dmg) : null}</td>
          <td><CharField c={c} p={['attacks', i, 'crit']} ph="19-20/x2" aria="critico" /></td><td><CharField c={c} p={['attacks', i, 'range']} aria="gittata" /></td>
          <td><CharField c={c} p={['attacks', i, 'notes']} aria="note" /></td><td>{del('attacks', i)}</td></tr>)}
      </tbody></table></div><button type="button" onClick={() => addRow('attacks')}>+ Attacco</button></div>

      <div className="panel"><h2>Abilità</h2>
        <div className="row" style={{ marginBottom: 8, alignItems: 'end' }}>
          <div><label>Punti per livello (classe)</label><CharField c={c} p={['skillPts']} n aria="punti abilità per livello" /></div>
          <div><label>Correzione</label><CharField c={c} p={['skillMisc']} n ph="0" aria="correzione punti abilità" /></div>
          <span>Spesi <b>{k.skillUsed}</b> su <b>{k.skillTot}</b></span>
          <span className="big" style={k.skillTot - k.skillUsed < 0 ? { color: 'var(--danger)' } : undefined}>Da assegnare {k.skillTot - k.skillUsed}</span>
        </div>
        <p className="muted" style={{ margin: '0 0 6px' }}>Cl. = abilità di classe (1 punto per grado, le altre 2) · Pen. = applica la penalità di armatura ({k.acp}) · Correzione: multiclasse, aumenti di INT, talenti</p>
        <div className="scroll"><table><tbody>
          <tr><th>Cl.</th><th>Abilità</th><th>Car.</th><th>Tot.</th><th>Gradi</th><th>Vari</th><th>Pen.</th><th></th></tr>
          {(c.skills || []).map((s, i) => <tr key={i}>
            <td><CharField c={c} p={['skills', i, 'cls']} check aria="di classe" /></td><td><CharField c={c} p={['skills', i, 'name']} aria="abilità" /></td>
            <td><CharField c={c} p={['skills', i, 'ab']} opts={ABOPTS} aria="caratteristica" /></td><td>{R(num(s.ranks) + k.ab(s.ab) + num(s.misc) + (s.acp ? k.acp : 0), s.name)}</td>
            <td><CharField c={c} p={['skills', i, 'ranks']} n aria="gradi" /></td><td><CharField c={c} p={['skills', i, 'misc']} n aria="vari" /></td>
            <td><CharField c={c} p={['skills', i, 'acp']} check aria="penalità armatura" /></td><td>{del('skills', i)}</td></tr>)}
        </tbody></table></div><button type="button" onClick={() => addRow('skills')}>+ Abilità</button></div>

      <div className="cols">
        <div className="panel"><h2>Talenti</h2><CharField c={c} p={['feats']} area rows={6} /></div>
        <div className="panel"><h2>Capacità speciali</h2><CharField c={c} p={['special']} area rows={6} /></div>
        <div className="panel"><h2>Linguaggi</h2><CharField c={c} p={['langs']} area rows={6} /></div>
      </div>

      <div className="cols wide">
        <div className="panel"><h2>Equipaggiamento</h2><CharField c={c} p={['gear']} area rows={10} />
          <div className="grid" style={{ marginTop: 8 }}>{[['pp', 'Platino (mp)'], ['gp', 'Oro (mo)'], ['sp', 'Argento (ma)'], ['cp', 'Rame (mr)']].map(([m, l]) => F(l, ['money', m], { n: 1 }))}</div></div>
        <div className="panel"><h2>Incantesimi</h2><div className="grid">{F('Caratteristica', ['spells', 'ab'], { opts: ABOPTS, def: 'int' })}{F('Livello incantatore', ['spells', 'cl'], { n: 1 })}</div>
          <div className="scroll"><table style={{ margin: '8px 0' }}><tbody>
            <tr><th>Liv.</th><th>Al giorno</th><th>Bonus</th><th>Usati</th><th>CD</th></tr>
            {Array.from({ length: 10 }, (_, l) => <tr key={l}><th>{l}</th>
              <td><CharField c={c} p={['spells', 'lv', l, 'day']} n aria={`livello ${l} al giorno`} /></td><td><CharField c={c} p={['spells', 'lv', l, 'bonus']} n aria={`livello ${l} bonus`} /></td>
              <td><CharField c={c} p={['spells', 'lv', l, 'used']} n aria={`livello ${l} usati`} /></td><td>{10 + l + k.ab(spellAb)}</td></tr>)}
          </tbody></table></div>
          <label>Incantesimi conosciuti / preparati</label><CharField c={c} p={['spells', 'list']} area rows={8} aria="elenco incantesimi" /></div>
      </div>

      <div className="panel"><h2>Note</h2><CharField c={c} p={['notes']} area rows={6} /></div>
      <div className="panel"><h2>Storia personale</h2><CharField c={c} p={['backstory']} area rows={12} aria="Storia personale" /></div>
    </fieldset>
  );
}
