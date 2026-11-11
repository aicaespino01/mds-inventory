// Shared app state + role helpers.
import { dateKey } from './logic.js';

export const S = {
  store: null,
  demo: false,
  auth: { state: 'loading' },
  profile: null,
  items: [],
  itemsById: new Map(),
  itemsLoaded: false,
  users: [],
  suppliers: [],
  suppliersById: new Map(),
  stats: null,
  statsMonth: null,
  recent: [],
  online: navigator.onLine,
  ui: {
    items: { q: '', cat: 'All', status: 'all' },
    count: { q: '', cat: 'All', draft: {} },
    record: { type: 'OUT', itemId: null, q: '', qty: 1, reason: '', unitPrice: '', unitCost: '', expiry: '', supplier: '', note: '', inReason: 'Delivery' },
  },
};

const subs = new Set();
export const onChange = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const changed = (what) => subs.forEach((fn) => fn(what));

export const role = () => S.profile?.role || 'viewer';
export const isAdmin = () => role() === 'admin';
export const canRecord = () => role() === 'admin' || role() === 'staff';
export const who = () => ({ uid: S.profile?.uid, name: S.profile?.name || S.profile?.email || '' });

export const supplierOf = (item) => (item?.supplierId ? S.suppliersById.get(item.supplierId) || null : null);
export const supplierName = (item) => supplierOf(item)?.name || item?.supplier || '';

export const ROLE_LABEL ={ admin: 'Admin', staff: 'Staff', viewer: 'View only' };

export function canUndo(mv) {
  if (!mv || mv.reversed || mv.type === 'REVERSAL' || !canRecord()) return false;
  if (mv.type === 'COUNT' && !mv.delta) return false;
  if (isAdmin()) return true;
  return mv.by === S.profile?.uid && mv.date === dateKey();
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export function initials(name = '') {
  const parts = String(name).trim().split(/[\s._@-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
