// DEMO MODE store: same functions as the Firebase store, but data lives only in this browser.
// Used for testing and for trying the app before Firebase is set up.
import { buildRecord, buildAnyCount, buildReversal, applyStatsInc, newId, cleanItemFields, changeExpiry, cleanSupplierFields } from './logic.js';

const KEY = 'mds-inventory-demo-v1';
const fresh = () => ({
  items: {}, movements: {}, stats: {}, suppliers: {},
  users: { demo: { uid: 'demo', name: 'Demo Admin', email: 'demo@example.com', role: 'admin', active: true, createdAt: Date.now() } },
  me: 'demo', signedIn: true,
});
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const tick = () => new Promise((r) => setTimeout(r, 150));

export function createLocalStore() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { db = fresh(); }
  // Old demo data used a "Take-home" category (removed 9 Nov 2026).
  for (const it of Object.values(db.items)) if (it.category === 'Take-home') it.category = 'Oral care';
  db.suppliers = db.suppliers || {};
  const subs = new Set();
  let authCb = null;

  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage blocked: keep in memory */ }
    subs.forEach((f) => f());
  };
  const watch = (get, cb) => {
    const f = () => cb(get());
    subs.add(f);
    setTimeout(f, 0);
    return () => subs.delete(f);
  };
  const profile = () => ({ ...db.users[db.me], uid: db.me });
  const who = () => ({ uid: db.me, name: profile().name });
  const emitAuth = () => {
    if (!authCb) return;
    if (!db.signedIn) return authCb({ state: 'signedOut' });
    authCb({ state: 'ready', user: { uid: db.me, email: profile().email }, profile: profile() });
  };
  const commit = (itemId, r, origId) => {
    Object.assign(db.items[itemId], r.itemPatch);
    const id = newId('m');
    db.movements[id] = { ...r.movement, id };
    if (origId) Object.assign(db.movements[origId], r.origPatch);
    db.stats[r.statsMonth] = applyStatsInc(db.stats[r.statsMonth], r.statsInc, r.statsMonth);
    persist();
    return clone(db.movements[id]);
  };

  return {
    mode: 'demo',
    onAuth(cb) { authCb = cb; setTimeout(emitAuth, 0); return () => { authCb = null; }; },
    async signIn() { await tick(); db.signedIn = true; persist(); emitAuth(); },
    async signOut() { db.signedIn = false; persist(); emitAuth(); },
    async resetPassword() { await tick(); },
    setDemoRole(r) { db.users[db.me].role = r; persist(); emitAuth(); },
    resetDemo() { db = fresh(); persist(); emitAuth(); },

    watchItems: (cb) => watch(() => Object.values(db.items).map(clone), cb),
    watchUsers: (cb) => watch(() => Object.values(db.users).map(clone), cb),
    watchSuppliers: (cb) => watch(() => Object.values(db.suppliers).map(clone), cb),
    async saveSupplier(data, id) {
      await tick();
      const now = Date.now();
      const clean = cleanSupplierFields(data);
      if (id) Object.assign(db.suppliers[id], clean, { updatedAt: now });
      else {
        id = newId('s');
        db.suppliers[id] = { id, ...clean, createdAt: now, updatedAt: now };
      }
      for (const it of Object.values(db.items)) if (it.supplierId === id) it.supplier = clean.name;
      persist();
      return id;
    },
    async deleteSupplier(id) {
      await tick();
      delete db.suppliers[id];
      for (const it of Object.values(db.items)) if (it.supplierId === id) { it.supplierId = ''; it.supplier = ''; }
      persist();
    },
    watchStats: (m, cb) => watch(() => clone(db.stats[m] || null), cb),
    async getStats(m) { await tick(); return clone(db.stats[m] || null); },
    watchRecent: (n, cb) => watch(() => Object.values(db.movements).sort((a, b) => b.at - a.at).slice(0, n).map(clone), cb),
    async listMovements({ month, itemId } = {}) {
      await tick();
      return Object.values(db.movements)
        .filter((m) => (!month || m.month === month) && (!itemId || m.itemId === itemId))
        .sort((a, b) => b.at - a.at).map(clone);
    },
    async listAllMovements() { return this.listMovements({}); },

    async saveItem(data, id) {
      await tick();
      const now = Date.now();
      const clean = cleanItemFields(data);
      if (id) Object.assign(db.items[id], clean, { updatedAt: now, updatedBy: db.me });
      else {
        id = newId('i');
        db.items[id] = { id, ...clean, qty: 0, batches: [], counted: false, archived: false, createdAt: now, updatedAt: now, updatedBy: db.me };
      }
      persist();
      return id;
    },
    async seedItems(list) {
      await tick();
      const now = Date.now();
      for (const it of list) {
        const id = newId('i');
        db.items[id] = { id, ...cleanItemFields(it), qty: 0, batches: [], counted: false, archived: false, createdAt: now, updatedAt: now, updatedBy: db.me };
      }
      persist();
    },
    async setBatchExpiry(itemId, batchId, expiry) {
      await tick();
      const it = db.items[itemId];
      it.batches = changeExpiry(it.batches, batchId, expiry);
      it.updatedAt = Date.now();
      persist();
    },
    async record(input) {
      await tick();
      return commit(input.itemId, buildRecord(clone(db.items[input.itemId]), input, who(), Date.now()));
    },
    async count(input) {
      await tick();
      return commit(input.itemId, buildAnyCount(clone(db.items[input.itemId]), input, who(), Date.now()));
    },
    async reverse(mvId) {
      await tick();
      const mv = db.movements[mvId];
      const r = buildReversal(clone(db.items[mv?.itemId]), clone(mv), who(), Date.now());
      return commit(mv.itemId, r, mvId);
    },
    async addUser({ name, email, role }) {
      await tick();
      const e = String(email).trim().toLowerCase();
      if (Object.values(db.users).some((u) => u.email === e)) throw Object.assign(new Error(), { code: 'auth/email-already-in-use' });
      const uid = newId('u');
      db.users[uid] = { uid, name: String(name).trim(), email: e, role, active: true, createdAt: Date.now() };
      persist();
    },
    async updateUser(uid, patch) {
      await tick();
      Object.assign(db.users[uid], patch);
      persist();
      if (uid === db.me) emitAuth();
    },
  };
}
