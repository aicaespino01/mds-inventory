// LIVE store: Firebase Auth (logins) + Cloud Firestore (shared database, updates every phone in real time).
// Every stock change runs in a transaction so two people saving at once can't break the numbers.
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, createUserWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, query,
  where, orderBy, limit, getDocs, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, increment, writeBatch,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { buildRecord, buildAnyCount, buildReversal, cleanItemFields, changeExpiry, cleanSupplierFields } from './logic.js';

export function createFirebaseStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  }

  let profile = null;
  const who = () => ({ uid: profile?.uid, name: profile?.name || profile?.email || '' });
  const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : Date.now());
  const mvFrom = (snap) => {
    const d = snap.data({ serverTimestamps: 'estimate' });
    return { ...d, id: snap.id, at: toMs(d.at), reversedAt: d.reversedAt ? toMs(d.reversedAt) : undefined };
  };
  const statsPayload = (inc, month) => {
    const o = { month };
    for (const [path, v] of inc) {
      const parts = path.split('.');
      let t = o;
      for (let i = 0; i < parts.length - 1; i++) t = t[parts[i]] = t[parts[i]] || {};
      t[parts[parts.length - 1]] = increment(v);
    }
    return o;
  };
  const logErr = (where_) => (e) => console.error(`[${where_}]`, e);

  // Writes one stock change (item + entry + monthly totals) atomically.
  const txWrite = (tx, itemRef, r) => {
    const mvRef = doc(collection(db, 'movements'));
    tx.update(itemRef, r.itemPatch);
    tx.set(mvRef, { ...r.movement, at: serverTimestamp() });
    tx.set(doc(db, 'stats', r.statsMonth), statsPayload(r.statsInc, r.statsMonth), { merge: true });
    return { ...r.movement, id: mvRef.id };
  };

  return {
    mode: 'firebase',

    onAuth(cb) {
      let unsubMe = null;
      return onAuthStateChanged(auth, (user) => {
        unsubMe?.();
        unsubMe = null;
        profile = null;
        if (!user) return cb({ state: 'signedOut' });
        cb({ state: 'loading' });
        const ref = doc(db, 'users', user.uid);
        let triedSetup = false;
        unsubMe = onSnapshot(ref, async (snap) => {
          if (!snap.exists()) {
            if (snap.metadata.fromCache) return; // wait for the server answer
            if (!triedSetup) {
              // First login of the clinic owner: the security rules allow only her to create her own admin profile.
              triedSetup = true;
              try {
                await setDoc(ref, {
                  uid: user.uid, name: (user.email || '').split('@')[0], email: (user.email || '').toLowerCase(),
                  role: 'admin', active: true, createdAt: Date.now(), createdBy: 'setup',
                });
                return;
              } catch { /* not the owner */ }
            }
            return cb({ state: 'noAccess', user: { email: user.email } });
          }
          const p = { ...snap.data(), uid: user.uid };
          if (p.active === false) return cb({ state: 'disabled', user: { email: user.email } });
          profile = p;
          cb({ state: 'ready', user: { uid: user.uid, email: user.email }, profile: p });
        }, (err) => cb({ state: 'noAccess', user: { email: user.email }, error: err }));
      });
    },
    signIn: (email, pw) => signInWithEmailAndPassword(auth, String(email).trim(), pw),
    signOut: () => signOut(auth),
    resetPassword: (email) => sendPasswordResetEmail(auth, String(email).trim()),

    watchItems: (cb) => onSnapshot(collection(db, 'items'), (qs) => cb(qs.docs.map((d) => ({ ...d.data(), id: d.id }))), logErr('items')),
    watchUsers: (cb) => onSnapshot(collection(db, 'users'), (qs) => cb(qs.docs.map((d) => ({ ...d.data(), uid: d.id }))), logErr('users')),
    watchStats: (month, cb) => onSnapshot(doc(db, 'stats', month), (s) => cb(s.exists() ? s.data() : null), logErr('stats')),
    async getStats(month) {
      const s = await getDoc(doc(db, 'stats', month));
      return s.exists() ? s.data() : null;
    },
    watchRecent: (n, cb) => onSnapshot(query(collection(db, 'movements'), orderBy('at', 'desc'), limit(n)),
      (qs) => cb(qs.docs.map(mvFrom)), logErr('recent')),
    async listMovements({ month, itemId } = {}) {
      const cons = [];
      if (month) cons.push(where('month', '==', month));
      if (itemId) cons.push(where('itemId', '==', itemId));
      const qs = await getDocs(query(collection(db, 'movements'), ...cons));
      return qs.docs.map(mvFrom).sort((a, b) => b.at - a.at);
    },
    async listAllMovements() {
      const qs = await getDocs(collection(db, 'movements'));
      return qs.docs.map(mvFrom).sort((a, b) => b.at - a.at);
    },

    watchSuppliers: (cb) => onSnapshot(collection(db, 'suppliers'), (qs) => cb(qs.docs.map((d) => ({ ...d.data(), id: d.id }))), logErr('suppliers')),
    async saveSupplier(data, id) {
      const clean = cleanSupplierFields(data);
      const now = Date.now();
      const ref = id ? doc(db, 'suppliers', id) : doc(collection(db, 'suppliers'));
      const batch = writeBatch(db);
      if (id) batch.update(ref, { ...clean, updatedAt: now, updatedBy: who().uid });
      else batch.set(ref, { ...clean, createdAt: now, updatedAt: now, updatedBy: who().uid });
      if (id) {
        // Keep the supplier name shown on items up to date.
        const linked = await getDocs(query(collection(db, 'items'), where('supplierId', '==', id)));
        linked.docs.forEach((d) => batch.update(d.ref, { supplier: clean.name, updatedAt: now, updatedBy: who().uid }));
      }
      await batch.commit();
      return ref.id;
    },
    async deleteSupplier(id) {
      const batch = writeBatch(db);
      const linked = await getDocs(query(collection(db, 'items'), where('supplierId', '==', id)));
      linked.docs.forEach((d) => batch.update(d.ref, { supplierId: '', supplier: '', updatedAt: Date.now(), updatedBy: who().uid }));
      batch.delete(doc(db, 'suppliers', id));
      await batch.commit();
    },

    async saveItem(data, id) {
      const clean = cleanItemFields(data);
      const now = Date.now();
      if (id) {
        await updateDoc(doc(db, 'items', id), { ...clean, updatedAt: now, updatedBy: who().uid });
        return id;
      }
      const ref = doc(collection(db, 'items'));
      await setDoc(ref, { ...clean, qty: 0, batches: [], counted: false, archived: false, createdAt: now, updatedAt: now, updatedBy: who().uid });
      return ref.id;
    },
    async seedItems(list) {
      const batch = writeBatch(db);
      const now = Date.now();
      for (const it of list) {
        batch.set(doc(collection(db, 'items')), {
          ...cleanItemFields(it), qty: 0, batches: [], counted: false, archived: false, createdAt: now, updatedAt: now, updatedBy: who().uid,
        });
      }
      await batch.commit();
    },
    async setBatchExpiry(itemId, batchId, expiry) {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'items', itemId);
        const s = await tx.get(ref);
        if (!s.exists()) throw new Error('Item not found.');
        tx.update(ref, { batches: changeExpiry(s.data().batches, batchId, expiry), updatedAt: Date.now(), updatedBy: who().uid });
      });
    },

    record(input) {
      return runTransaction(db, async (tx) => {
        const ref = doc(db, 'items', input.itemId);
        const s = await tx.get(ref);
        if (!s.exists()) throw new Error('Item not found.');
        return txWrite(tx, ref, buildRecord({ ...s.data(), id: s.id }, input, who(), Date.now()));
      });
    },
    count(input) {
      return runTransaction(db, async (tx) => {
        const ref = doc(db, 'items', input.itemId);
        const s = await tx.get(ref);
        if (!s.exists()) throw new Error('Item not found.');
        return txWrite(tx, ref, buildAnyCount({ ...s.data(), id: s.id }, input, who(), Date.now()));
      });
    },
    reverse(mvId) {
      return runTransaction(db, async (tx) => {
        const mRef = doc(db, 'movements', mvId);
        const ms = await tx.get(mRef);
        if (!ms.exists()) throw new Error('Entry not found.');
        const mv = { ...ms.data(), id: ms.id };
        const iRef = doc(db, 'items', mv.itemId);
        const is = await tx.get(iRef);
        const r = buildReversal(is.exists() ? { ...is.data(), id: is.id } : null, mv, who(), Date.now());
        const out = txWrite(tx, iRef, r);
        tx.update(mRef, { ...r.origPatch, reversedAt: serverTimestamp() });
        return out;
      });
    },

    // Creates a login for a team member without signing the admin out (uses a temporary second app).
    async addUser({ name, email, password, role }) {
      const sec = initializeApp(config, `add-user-${Date.now()}`);
      try {
        const secAuth = initializeAuth(sec, { persistence: inMemoryPersistence });
        const cred = await createUserWithEmailAndPassword(secAuth, String(email).trim(), password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid, name: String(name).trim(), email: String(email).trim().toLowerCase(), role,
          active: true, createdAt: Date.now(), createdBy: who().uid,
        });
        await signOut(secAuth);
      } finally {
        await deleteApp(sec);
      }
    },
    updateUser: (uid, patch) => updateDoc(doc(db, 'users', uid), patch),
  };
}
