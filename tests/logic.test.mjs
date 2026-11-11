// Checks the stock math. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const who = { uid: 'u1', name: 'Admin' };
const NOW = new Date(2026, 10, 9, 10, 0).getTime(); // 9 Nov 2026
const base = (over = {}) => ({ id: 'amox', name: 'Amox', unit: 'capsule', category: 'Medicine', qty: 0, batches: [], counted: false, cost: 5, price: 15, ...over });
const apply = (item, r) => ({ ...item, ...r.itemPatch });

test('first count adds stock with expiry and marks counted', () => {
  const r = L.buildCount(base(), { actual: 50, expiry: '2027-03-01' }, who, NOW);
  assert.equal(r.itemPatch.qty, 50);
  assert.equal(r.itemPatch.counted, true);
  assert.equal(r.itemPatch.batches[0].expiry, '2027-03-01');
  assert.equal(r.movement.delta, 50);
  assert.equal(r.movement.month, '2026-11');
  assert.deepEqual(r.statsInc.find(([k]) => k === 'items.amox.counts'), ['items.amox.counts', 1]);
});

test('OUT blocked before first count', () => {
  assert.throws(() => L.buildRecord(base(), { type: 'OUT', qty: 1, reason: 'Sold' }, who, NOW), /hasn't been counted/);
});

test('OUT uses earliest expiry first (FEFO) and computes sold amount', () => {
  let it = base();
  it = apply(it, L.buildCount(it, { actual: 10, expiry: '2027-06-01' }, who, NOW));
  it = apply(it, L.buildRecord(it, { type: 'IN', qty: 5, expiry: '2026-12-01', unitCost: 6 }, who, NOW));
  assert.equal(it.qty, 15);
  const r = L.buildRecord(it, { type: 'OUT', qty: 7, reason: 'Sold', unitPrice: 20 }, who, NOW);
  assert.deepEqual(r.movement.takenFrom.map((t) => [t.expiry, t.qty]), [['2026-12-01', 5], ['2027-06-01', 2]]);
  assert.equal(r.itemPatch.qty, 8);
  assert.equal(r.movement.amount, 140);
  assert.equal(r.movement.bucket, 'sold');
});

test('Sold uses item price when no price typed; Free valued at price; Used at cost', () => {
  let it = apply(base(), L.buildCount(base(), { actual: 10 }, who, NOW));
  assert.equal(L.buildRecord(it, { type: 'OUT', qty: 2, reason: 'Sold', unitPrice: '' }, who, NOW).movement.amount, 30);
  assert.equal(L.buildRecord(it, { type: 'OUT', qty: 2, reason: 'Free' }, who, NOW).movement.amount, 30);
  assert.equal(L.buildRecord(it, { type: 'OUT', qty: 2, reason: 'Used in clinic' }, who, NOW).movement.amount, 10);
});

test('OUT more than stock is refused with a clear message', () => {
  const it = apply(base(), L.buildCount(base(), { actual: 3 }, who, NOW));
  assert.throws(() => L.buildRecord(it, { type: 'OUT', qty: 4, reason: 'Sold' }, who, NOW), /Only 3 capsule of Amox left/);
});

test('OUT needs a reason and a positive qty', () => {
  const it = apply(base(), L.buildCount(base(), { actual: 3 }, who, NOW));
  assert.throws(() => L.buildRecord(it, { type: 'OUT', qty: 1 }, who, NOW), /Choose a reason/);
  assert.throws(() => L.buildRecord(it, { type: 'OUT', qty: 0, reason: 'Sold' }, who, NOW), /more than 0/);
});

test('undo of OUT puts stock back into the same batches and reverses totals', () => {
  let it = base();
  it = apply(it, L.buildCount(it, { actual: 10, expiry: '2027-01-01' }, who, NOW));
  const out = L.buildRecord(it, { type: 'OUT', qty: 4, reason: 'Free' }, who, NOW);
  it = apply(it, out);
  const mv = { ...out.movement, id: 'm1' };
  const rev = L.buildReversal(it, mv, who, NOW);
  assert.equal(rev.itemPatch.qty, 10);
  assert.equal(rev.itemPatch.batches[0].expiry, '2027-01-01');
  assert.deepEqual(rev.statsInc.find(([k]) => k === 'free.qty'), ['free.qty', -4]);
  assert.equal(rev.origPatch.reversed, true);
  assert.throws(() => L.buildReversal(it, { ...mv, reversed: true }, who, NOW), /already undone/);
});

test('undo of IN is refused if that stock was already given out', () => {
  let it = apply(base(), L.buildCount(base(), { actual: 0 }, who, NOW));
  const inn = L.buildRecord(it, { type: 'IN', qty: 5, expiry: '2027-01-01' }, who, NOW);
  it = apply(it, inn);
  it = apply(it, L.buildRecord(it, { type: 'OUT', qty: 3, reason: 'Sold' }, who, NOW));
  assert.throws(() => L.buildReversal(it, { ...inn.movement, id: 'in1' }, who, NOW), /already given out/);
});

test('count down removes earliest-expiring stock and records the difference', () => {
  let it = base();
  it = apply(it, L.buildCount(it, { actual: 10, expiry: '2027-05-01' }, who, NOW));
  it = apply(it, L.buildRecord(it, { type: 'IN', qty: 10, expiry: '2026-12-15' }, who, NOW));
  const r = L.buildCount(it, { actual: 17 }, who, NOW);
  assert.equal(r.movement.delta, -3);
  assert.equal(r.itemPatch.qty, 17);
  assert.equal(r.itemPatch.batches.find((b) => b.expiry === '2026-12-15').qty, 7);
  assert.equal(r.movement.amount, -15);
});

test('monthly totals add up and decimals stay clean', () => {
  let s = null;
  s = L.applyStatsInc(s, [['sold.qty', 0.1], ['sold.amount', 0.2]], '2026-11');
  s = L.applyStatsInc(s, [['sold.qty', 0.2], ['sold.amount', 0.1]], '2026-11');
  assert.equal(s.sold.qty, 0.3);
  assert.equal(s.sold.amount, 0.3);
});

test('status: not counted, out, low, expiring, expired', () => {
  const today = new Date(2026, 10, 9);
  assert.equal(L.itemStatus(base(), 60, today).code, 'notcounted');
  assert.equal(L.itemStatus(base({ counted: true, qty: 0 }), 60, today).code, 'out');
  assert.equal(L.itemStatus(base({ counted: true, qty: 5, minLevel: 10, batches: [{ id: 'b', qty: 5, expiry: null }] }), 60, today).code, 'low');
  assert.equal(L.itemStatus(base({ counted: true, qty: 5, batches: [{ id: 'b', qty: 5, expiry: '2026-12-01' }] }), 60, today).code, 'expiring');
  assert.equal(L.itemStatus(base({ counted: true, qty: 5, batches: [{ id: 'b', qty: 5, expiry: '2026-11-01' }] }), 60, today).code, 'expired');
  assert.equal(L.itemStatus(base({ counted: true, qty: 5, batches: [{ id: 'b', qty: 5, expiry: '2027-12-01' }] }), 60, today).code, 'ok');
});

test('changing an expiry date merges batches with the same date', () => {
  const b = [{ id: 'a', qty: 2, expiry: '2027-01-01' }, { id: 'c', qty: 3, expiry: '2027-02-01' }];
  const out = L.changeExpiry(b, 'c', '2027-01-01');
  assert.equal(out.length, 1);
  assert.equal(out[0].qty, 5);
});

test('summary for Excel skips undone entries', () => {
  const mvs = [
    { itemId: 'a', itemName: 'Amox', type: 'OUT', bucket: 'sold', qty: 2, delta: -2, amount: 30 },
    { itemId: 'a', itemName: 'Amox', type: 'OUT', bucket: 'sold', qty: 1, delta: -1, amount: 15, reversed: true },
    { itemId: 'a', itemName: 'Amox', type: 'REVERSAL', bucket: 'sold', qty: 1, delta: 1, amount: -15 },
  ];
  const { tot, byItem } = L.summarize(mvs);
  assert.equal(tot.sold.qty, 2);
  assert.equal(byItem.a.soldAmount, 30);
});

test('medicine count with two expiry dates keeps two batches', () => {
  const r = L.buildCountBatches(base(), [{ expiry: '2026-12-20', qty: 60 }, { expiry: '2027-08-01', qty: 40 }], who, NOW);
  assert.equal(r.itemPatch.qty, 100);
  assert.deepEqual(r.itemPatch.batches.map((b) => [b.expiry, b.qty]), [['2026-12-20', 60], ['2027-08-01', 40]]);
  assert.equal(r.movement.delta, 100);
});

test('medicine recount per batch: blank qty on a line is refused, 0 removes the batch', () => {
  let it = apply(base(), L.buildCountBatches(base(), [{ expiry: '2026-12-20', qty: 60 }, { expiry: '2027-08-01', qty: 40 }], who, NOW));
  assert.throws(() => L.buildCountBatches(it, [{ expiry: '2026-12-20', qty: 55 }, { expiry: '2027-08-01', qty: '' }], who, NOW), /quantity for each expiry date/);
  const r = L.buildCountBatches(it, [{ expiry: '2026-12-20', qty: 0 }, { expiry: '2027-08-01', qty: 38 }], who, NOW);
  assert.equal(r.itemPatch.qty, 38);
  assert.equal(r.itemPatch.batches.length, 1);
  assert.equal(r.movement.delta, -62);
  // same expiry typed twice is added together
  const r2 = L.buildCountBatches(it, [{ expiry: '2027-08-01', qty: 10 }, { expiry: '2027-08-01', qty: 5 }], who, NOW);
  assert.equal(r2.itemPatch.batches[0].qty, 15);
});

test('undo of a medicine count restores the old batches, but not after later changes', () => {
  let it = apply(base(), L.buildCountBatches(base(), [{ expiry: '2026-12-20', qty: 10 }], who, NOW));
  const c = L.buildCountBatches(it, [{ expiry: '2026-12-20', qty: 8 }, { expiry: '2027-01-10', qty: 5 }], who, NOW);
  const after = apply(it, c);
  const rev = L.buildReversal(after, { ...c.movement, id: 'c1' }, who, NOW);
  assert.deepEqual(rev.itemPatch.batches.map((b) => [b.expiry, b.qty]), [['2026-12-20', 10]]);
  assert.equal(rev.itemPatch.qty, 10);
  const changed = apply(after, L.buildRecord(after, { type: 'OUT', qty: 1, reason: 'Sold' }, who, NOW));
  assert.throws(() => L.buildReversal(changed, { ...c.movement, id: 'c1' }, who, NOW), /changed after the count/);
});

test('expiry is ignored for non-medicines', () => {
  const today = new Date(2026, 10, 9);
  const gauze = base({ category: 'Clinic supply', counted: true, qty: 5, batches: [{ id: 'b', qty: 5, expiry: '2026-11-01' }] });
  const st = L.itemStatus(gauze, 60, today);
  assert.equal(st.code, 'ok');
  assert.equal(st.nearest, null);
});

test('order message lists items with usual order quantity', () => {
  const msg = L.orderMessage({ contactPerson: 'Joy' }, [{ name: 'Amox', orderQty: 100, unit: 'capsule' }, { name: 'Gauze Pads 2x2' }], 'MDS Dental');
  assert.match(msg, /^Hi Joy!/);
  assert.match(msg, /- Amox: 100 capsule/);
  assert.match(msg, /- Gauze Pads 2x2\n/);
});
