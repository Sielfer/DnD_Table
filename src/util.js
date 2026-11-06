// Piccoli aiuti usati ovunque.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = v => Number(v) || 0;
export const mod = s => Math.floor((num(s) - 10) / 2);
export const sgn = n => (n >= 0 ? '+' : '') + n;
export const get = (o, p) => p.reduce((a, k) => a?.[k], o);
export const rid = () => Math.random().toString(36).slice(2, 10);
