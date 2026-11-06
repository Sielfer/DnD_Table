// Stato dell'app: quello che manda il server (S) e le preferenze di chi guarda (ui, salvate nel browser).
import { useSyncExternalStore } from 'react';

function createStore(initial, onSet) {
  let v = initial;
  const subs = new Set();
  return {
    get: () => v,
    set(f) { v = typeof f === 'function' ? f(v) : f; onSet?.(v); subs.forEach(s => s()); },
    subscribe: s => { subs.add(s); return () => subs.delete(s); },
  };
}
const useStore = s => useSyncExternalStore(s.subscribe, s.get);

// --- Stato del server (null finché non si entra) ---
export const server = createStore(null);
export const useS = () => useStore(server);
export const isMaster = S => S?.me.role === 'master';
export const canEdit = (S, c) => isMaster(S) || c.owner === S.me.id;
// mostro o PNG: segnato così dal master, o una scheda "solo master" fatta prima che ci fosse la spunta
export const isNpc = c => !!(c.npc || c.secret);

// --- Preferenze di chi guarda ---
const UI0 = {
  tab: 'sheets', charId: null, mapId: null, mapMode: 'brush', edgeTool: 2, brush: { kind: 'corr', w: 2, terrain: 'pietra' },
  obj: { type: 'stairs', dir: 'up', rot: 0, ruined: false, ladder: true, veg: 'lush' }, levels: {}, mapZoom: 28, palPos: null, palMin: false,
};
let saved = {};
try { saved = JSON.parse(localStorage.getItem('ui') || '{}'); } catch {}
export const uiStore = createStore({ ...UI0, ...saved, mapFull: false }, v => {
  // il tutto schermo non sopravvive a un ricaricamento
  try { localStorage.setItem('ui', JSON.stringify({ ...v, mapFull: undefined })); } catch {}
});
export const useUi = () => useStore(uiStore);
export const setUi = patch => uiStore.set(u => ({ ...u, ...(typeof patch === 'function' ? patch(u) : patch) }));

// --- Messaggi (errori, avvisi) e dialoghi al posto di alert/prompt/confirm, che nella finestra dell'app non ci sono ---
export const notice = createStore(null);
export const useNotice = () => useStore(notice);
let noticeTimer;
export function say(text, kind = 'error') {
  notice.set({ text, kind, id: Date.now() });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.set(null), 5000);
}

export const dialog = createStore(null);
export const useDialog = () => useStore(dialog);
// Chiede un testo: restituisce la stringa scritta, o null se annullato.
export const ask = (title, value = '', opts = {}) => new Promise(resolve => dialog.set({ kind: 'prompt', title, value, resolve, ...opts }));
// Chiede conferma: true / false.
export const confirmBox = (title, opts = {}) => new Promise(resolve => dialog.set({ kind: 'confirm', title, resolve, ...opts }));

// --- Server ---
export const loggedOut = createStore(false);
const post = (url, data) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
export async function act(type, data = {}) {
  const r = await post('/api/action', { type, ...data }).catch(() => null);
  const j = await r?.json().catch(() => ({}));
  if (!r) say('Il tavolo non risponde: è ancora acceso?');
  else if (r.status === 401) loggedOut.set(true);
  else if (!r.ok) say(j.error || 'Errore');
  return j || {};
}
export const login = (name, pin) => post('/api/login', { name, pin });
export const logout = () => post('/api/logout', {});

// Mentre il master dipinge, i tasselli nuovi sono solo qui: gli aggiornamenti dal server non li devono cancellare.
export const interaction = { paint: null, drag: null };
