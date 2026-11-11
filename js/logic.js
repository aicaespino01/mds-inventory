// Stock rules shared by demo mode and Firebase mode.
// Pure functions only: no screen code, no network. Tested by tests/logic.test.mjs.

// A category says WHAT the item is. Whether it went home with a patient is recorded by the
// OUT reason (Sold / Free), so no item ever needs two categories.
export const CATEGORIES = ['Medicine', 'Oral care', 'Clinic supply', 'Equipment'];
export const CATEGORY_HINT = {
  Medicine: 'Amox, Clinda, Paracetamol…',
  'Oral care': 'Mouthwash, interdental brush…',
  'Clinic supply': 'Used during treatment: gauze, gloves, lidocaine…',
  Equipment: 'Machines and tools: counted, not used up',
};

export const OUT_REASONS = [
  { key: 'Sold', bucket: 'sold', hint: 'Charged to the patient' },
  { key: 'Free', bucket: 'free', hint: 'Not charged to the patient' },
  { key: 'Used in clinic', bucket: 'used', hint: 'Used during treatment' },
  { key: 'Expired / damaged', bucket: 'expired', hint: 'Thrown away' },
];

export const IN_REASONS = ['Delivery', 'Other'];

export const UNITS = ['pc', 'pcs', 'box', 'pack', 'bottle', 'tube', 'bag', 'pair', 'capsule', 'tablet',
  'vial', 'cartridge', 'syringe', 'roll', 'kit', 'set', 'jar', 'sachet'];

export const BUCKET_LABEL = {
  sold: 'Sold', free: 'Given free', used: 'Used in clinic', expired: 'Expired / damaged',
  in: 'Received', adj: 'Count adjustment',
};

export const STATUS_LABEL = {
  ok: 'In stock', low: 'Low stock', out: 'Out of stock', expired: 'Has expired stock',
  expiring: 'Expiring soon', notcounted: 'Not counted', archived: 'Archived',
};

export class StockError extends Error {}

// ---------- numbers & dates ----------

export function round2(n) {
  const x = Number(n) || 0;
  const r = Math.round((x + Math.sign(x) * Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export function parseDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

export function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}

export function daysUntil(str, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseDate(str) - t) / 86400000);
}

export const isDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export function newId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- formatting ----------

export const fmtQty = (n) => round2(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });

export function fmtMoney(n) {
  const x = round2(n);
  const s = Math.abs(x).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (x < 0 ? '−₱' : '₱') + s;
}

export const fmtDate = (str) => (str ? parseDate(str).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
export const fmtDayTime = (ms) => {
  const d = new Date(ms);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + ', ' + fmtTime(ms);
};

// ---------- batches (stock grouped by expiry date) ----------
// Each item keeps batches: [{ id, qty, expiry: 'YYYY-MM-DD' | null, addedAt }]
// Stock goes out "first to expire, first out" (FEFO).

export function sortFEFO(batches = []) {
  return [...batches].sort((a, b) => {
    const ea = a.expiry || '9999-99-99';
    const eb = b.expiry || '9999-99-99';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return (a.addedAt || 0) - (b.addedAt || 0);
  });
}

export const sumQty = (batches = []) => round2(batches.reduce((s, b) => s + (Number(b.qty) || 0), 0));

export function takeFEFO(batches, qty) {
  let remaining = round2(qty);
  const out = sortFEFO(batches).map((b) => ({ ...b }));
  const taken = [];
  for (const b of out) {
    if (remaining <= 0) break;
    if (!(b.qty > 0)) continue;
    const t = Math.min(b.qty, remaining);
    b.qty = round2(b.qty - t);
    remaining = round2(remaining - t);
    taken.push({ batchId: b.id, qty: round2(t), expiry: b.expiry || null });
  }
  if (remaining > 0) throw new StockError('Not enough stock.');
  return { batches: out.filter((b) => b.qty > 0), taken };
}

export function addToBatches(batches, qty, expiry, now) {
  const out = (batches || []).map((b) => ({ ...b }));
  const exp = expiry || null;
  let b = out.find((x) => (x.expiry || null) === exp);
  if (b) b.qty = round2(b.qty + qty);
  else {
    b = { id: newId('b'), qty: round2(qty), expiry: exp, addedAt: now };
    out.push(b);
  }
  return { batches: sortFEFO(out), added: { batchId: b.id, qty: round2(qty), expiry: exp } };
}

export function returnToBatches(batches, taken, now) {
  const out = (batches || []).map((b) => ({ ...b }));
  for (const t of taken || []) {
    const b = out.find((x) => x.id === t.batchId) || out.find((x) => (x.expiry || null) === (t.expiry || null));
    if (b) b.qty = round2(b.qty + t.qty);
    else out.push({ id: t.batchId || newId('b'), qty: round2(t.qty), expiry: t.expiry || null, addedAt: now });
  }
  return sortFEFO(out);
}

export function removeAdded(batches, added) {
  const out = (batches || []).map((b) => ({ ...b }));
  const b = added && (out.find((x) => x.id === added.batchId) || out.find((x) => (x.expiry || null) === (added.expiry || null)));
  if (!b || b.qty < added.qty - 1e-9) {
    throw new StockError("Some of this stock was already given out, so it can't be undone. Do a count instead.");
  }
  b.qty = round2(b.qty - added.qty);
  return out.filter((x) => x.qty > 0);
}

export function changeExpiry(batches, batchId, expiry) {
  const exp = expiry || null;
  const out = (batches || []).map((b) => ({ ...b }));
  const b = out.find((x) => x.id === batchId);
  if (!b) throw new StockError('Batch not found.');
  const twin = out.find((x) => x !== b && (x.expiry || null) === exp);
  if (twin) {
    twin.qty = round2(twin.qty + b.qty);
    return sortFEFO(out.filter((x) => x !== b));
  }
  b.expiry = exp;
  return sortFEFO(out);
}

// ---------- item fields ----------

const numOrNull = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : round2(v));

export function cleanItemFields(d) {
  const out = {
    name: String(d.name || '').trim(),
    category: CATEGORIES.includes(d.category) ? d.category : 'Clinic supply',
    unit: String(d.unit || '').trim(),
    minLevel: numOrNull(d.minLevel),
    cost: numOrNull(d.cost),
    price: numOrNull(d.price),
    supplier: String(d.supplier || '').trim(),
    supplierId: String(d.supplierId || ''),
    orderQty: numOrNull(d.orderQty),
    notes: String(d.notes || '').trim(),
  };
  if ('archived' in d) out.archived = !!d.archived;
  return out;
}

// ---------- suppliers ----------

export const SUPPLIER_FIELDS = [
  ['name', 'Supplier / company name'],
  ['contactPerson', 'Contact person'],
  ['phone', 'Mobile / phone number'],
  ['phone2', 'Other number'],
  ['messenger', 'Viber / Messenger / Facebook'],
  ['email', 'Email'],
  ['address', 'Address'],
  ['paymentTerms', 'Payment terms'],
  ['leadTime', 'Delivery time'],
  ['minOrder', 'Minimum order'],
  ['notes', 'Notes'],
];

export function cleanSupplierFields(d) {
  const out = {};
  for (const [k] of SUPPLIER_FIELDS) out[k] = String(d[k] || '').trim();
  return out;
}

// Message to copy into Viber / Messenger / SMS when ordering.
export function orderMessage(supplier, items, clinicName) {
  const hi = supplier?.contactPerson ? `Hi ${supplier.contactPerson}!` : 'Hi!';
  const lines = items.map((it) => `- ${it.name}${it.orderQty ? `: ${fmtQty(it.orderQty)} ${it.unit || ''}`.trimEnd() : ''}`);
  return `${hi} This is ${clinicName}. We'd like to order:\n${lines.join('\n')}\n\nPlease confirm the price and delivery date. Thank you!`;
}

// ---------- status ----------

// Expiry dates are tracked for medicines only (fewer steps; stock levels matter most for other items).
export const tracksExpiry = (item) => item?.category === 'Medicine';

export function itemStatus(item, warnDays = 60, today = new Date()) {
  const qty = round2(item.qty || 0);
  const dated = tracksExpiry(item) ? sortFEFO((item.batches || []).filter((b) => b.qty > 0 && b.expiry)) : [];
  const nearest = dated[0]?.expiry || null;
  const days = nearest ? daysUntil(nearest, today) : null;
  let expiredQty = 0;
  let expiringQty = 0;
  for (const b of dated) {
    const d = daysUntil(b.expiry, today);
    if (d < 0) expiredQty += b.qty;
    else if (d <= warnDays) expiringQty += b.qty;
  }
  const counted = !!item.counted;
  const min = Number(item.minLevel) || 0;
  const f = {
    notcounted: !counted,
    out: counted && qty <= 0,
    low: counted && qty > 0 && min > 0 && qty <= min,
    expired: expiredQty > 0,
    expiring: expiringQty > 0,
  };
  let code = 'ok';
  if (item.archived) code = 'archived';
  else if (f.notcounted) code = 'notcounted';
  else if (f.out) code = 'out';
  else if (f.expired) code = 'expired';
  else if (f.low) code = 'low';
  else if (f.expiring) code = 'expiring';
  return { code, label: STATUS_LABEL[code], nearest, days, expiredQty: round2(expiredQty), expiringQty: round2(expiringQty), ...f };
}

// ---------- building entries ----------

function base(item, who, now) {
  const d = new Date(now);
  return {
    itemId: item.id, itemName: item.name, unit: item.unit || '', category: item.category || '',
    by: who.uid, byName: who.name || '', at: now, date: dateKey(d), month: monthKey(d), reversed: false,
  };
}

const given = (v) => v !== undefined && v !== null && v !== '';

export function buildRecord(item, input, who, now = Date.now()) {
  if (!item) throw new StockError('Item not found.');
  if (item.archived) throw new StockError('This item is archived.');
  const qty = round2(input.qty);
  if (!(qty > 0)) throw new StockError('Enter a quantity more than 0.');
  const before = round2(item.qty || 0);
  const mv = { ...base(item, who, now), type: input.type, qty, note: String(input.note || '').trim() };
  let batches;

  if (input.type === 'OUT') {
    const reason = OUT_REASONS.find((r) => r.key === input.reason);
    if (!reason) throw new StockError('Choose a reason: Sold, Free, Used in clinic or Expired.');
    if (!item.counted) {
      throw new StockError(`${item.name} hasn't been counted yet. Do a count or record a delivery first.`);
    }
    let r;
    try {
      r = takeFEFO(item.batches || [], qty);
    } catch (e) {
      if (e instanceof StockError) {
        throw new StockError(`Only ${fmtQty(before)} ${item.unit || ''} of ${item.name} left in the app. Record the delivery or fix the count first.`.replace(/\s+/g, ' '));
      }
      throw e;
    }
    batches = r.batches;
    mv.takenFrom = r.taken;
    mv.reason = reason.key;
    mv.bucket = reason.bucket;
    let unitValue;
    if (reason.bucket === 'sold') unitValue = given(input.unitPrice) ? input.unitPrice : item.price;
    else if (reason.bucket === 'free') unitValue = item.price;
    else unitValue = item.cost;
    mv.unitPrice = round2(unitValue || 0);
    mv.amount = round2(qty * mv.unitPrice);
    mv.delta = -qty;
  } else if (input.type === 'IN') {
    const expiry = input.expiry || null;
    if (expiry && !isDateStr(expiry)) throw new StockError('The expiry date looks wrong.');
    const r = addToBatches(item.batches || [], qty, expiry, now);
    batches = r.batches;
    mv.addedBatch = r.added;
    mv.reason = IN_REASONS.includes(input.reason) ? input.reason : 'Delivery';
    mv.bucket = 'in';
    mv.expiry = expiry;
    mv.unitPrice = round2((given(input.unitCost) ? input.unitCost : item.cost) || 0);
    mv.amount = round2(qty * mv.unitPrice);
    mv.supplier = String(input.supplier || '').trim();
    mv.delta = qty;
  } else {
    throw new StockError('Unknown entry type.');
  }

  const itemPatch = { qty: sumQty(batches), batches, counted: true, updatedAt: now, updatedBy: who.uid };
  mv.before = before;
  mv.after = itemPatch.qty;
  return { itemPatch, movement: mv, statsInc: statsFor(mv, item.id, 1), statsMonth: mv.month };
}

export function buildCount(item, input, who, now = Date.now()) {
  if (!item) throw new StockError('Item not found.');
  const raw = input.actual;
  if (!given(raw) || Number.isNaN(Number(raw)) || Number(raw) < 0) {
    throw new StockError(`Enter a count of 0 or more for ${item.name}.`);
  }
  const actual = round2(raw);
  const before = round2(item.qty || 0);
  const delta = round2(actual - before);
  const expiry = input.expiry || null;
  if (expiry && !isDateStr(expiry)) throw new StockError('The expiry date looks wrong.');
  let batches = (item.batches || []).map((b) => ({ ...b }));
  const mv = {
    ...base(item, who, now), type: 'COUNT', reason: 'Count adjustment', bucket: 'adj',
    qty: Math.abs(delta), delta, before, note: String(input.note || '').trim(),
  };
  if (delta < 0) {
    const r = takeFEFO(batches, -delta);
    batches = r.batches;
    mv.takenFrom = r.taken;
  } else if (delta > 0) {
    const r = addToBatches(batches, delta, expiry, now);
    batches = r.batches;
    mv.addedBatch = r.added;
    mv.expiry = expiry;
  }
  mv.unitPrice = round2(item.cost || 0);
  mv.amount = round2(delta * mv.unitPrice);
  const itemPatch = { qty: sumQty(batches), batches, counted: true, updatedAt: now, updatedBy: who.uid };
  mv.after = itemPatch.qty;
  return { itemPatch, movement: mv, statsInc: statsFor(mv, item.id, 1), statsMonth: mv.month };
}

// Count of a medicine, one line per expiry date: lines = [{ expiry, qty }].
// The counted lines become the item's batches exactly.
export function buildCountBatches(item, lines, who, now = Date.now()) {
  if (!item) throw new StockError('Item not found.');
  const used = (lines || []).filter((l) => given(l.qty) || l.expiry);
  if (!used.length) throw new StockError(`Enter a count for ${item.name}.`);
  const clean = used.map((l) => {
    if (!given(l.qty) || Number.isNaN(Number(l.qty)) || Number(l.qty) < 0) {
      throw new StockError(`${item.name}: enter the quantity for each expiry date, or remove the empty line with ×.`);
    }
    if (l.expiry && !isDateStr(l.expiry)) throw new StockError(`${item.name}: an expiry date looks wrong.`);
    return { qty: round2(l.qty), expiry: l.expiry || null };
  });
  const merged = [];
  for (const l of clean) {
    const m = merged.find((x) => x.expiry === l.expiry);
    if (m) m.qty = round2(m.qty + l.qty);
    else merged.push({ ...l });
  }
  const prev = (item.batches || []).map((b) => ({ ...b }));
  const batches = sortFEFO(merged.filter((l) => l.qty > 0).map((l) => {
    const old = prev.find((b) => (b.expiry || null) === l.expiry);
    return { id: old?.id || newId('b'), qty: l.qty, expiry: l.expiry, addedAt: old?.addedAt || now };
  }));
  const before = round2(item.qty || 0);
  const after = sumQty(batches);
  const delta = round2(after - before);
  const mv = {
    ...base(item, who, now), type: 'COUNT', reason: 'Count adjustment', bucket: 'adj',
    qty: Math.abs(delta), delta, before, after, prevBatches: prev, newBatches: batches, note: '',
  };
  mv.unitPrice = round2(item.cost || 0);
  mv.amount = round2(delta * mv.unitPrice);
  const itemPatch = { qty: after, batches, counted: true, updatedAt: now, updatedBy: who.uid };
  return { itemPatch, movement: mv, statsInc: statsFor(mv, item.id, 1), statsMonth: mv.month };
}

export const buildAnyCount = (item, input, who, now = Date.now()) =>
  (input.lines ? buildCountBatches(item, input.lines, who, now) : buildCount(item, input, who, now));

const sameBatches = (a = [], b = []) => {
  const k = (list) => sortFEFO(list.filter((x) => x.qty > 0)).map((x) => `${x.expiry || ''}:${round2(x.qty)}`).join('|');
  return k(a) === k(b);
};

export function buildReversal(item, mv, who, now = Date.now()) {
  if (!mv) throw new StockError('Entry not found.');
  if (mv.reversed) throw new StockError('This entry was already undone.');
  if (mv.type === 'REVERSAL') throw new StockError("An undo can't be undone. Record a new entry instead.");
  if (!item) throw new StockError('Item not found.');
  if (!mv.delta) throw new StockError('Nothing to undo: this count did not change the stock.');
  let batches = item.batches || [];
  if (mv.prevBatches) {
    if (!sameBatches(batches, mv.newBatches)) {
      throw new StockError("This item changed after the count, so the count can't be undone. Do a new count instead.");
    }
    batches = mv.prevBatches.map((b) => ({ ...b }));
  } else if (mv.delta < 0) batches = returnToBatches(batches, mv.takenFrom, now);
  else batches = removeAdded(batches, mv.addedBatch);
  const before = round2(item.qty || 0);
  const rev = {
    ...base(item, who, now), type: 'REVERSAL', reason: `Undo: ${mv.reason}`, bucket: mv.bucket,
    qty: mv.qty, delta: round2(-mv.delta), refId: mv.id, refDate: mv.date, statsMonth: mv.month,
    unitPrice: mv.unitPrice || 0, amount: round2(-(mv.amount || 0)), before, note: '',
  };
  const itemPatch = { qty: sumQty(batches), batches, updatedAt: now, updatedBy: who.uid };
  rev.after = itemPatch.qty;
  const origPatch = { reversed: true, reversedBy: who.uid, reversedByName: who.name || '', reversedAt: now };
  return { itemPatch, movement: rev, origPatch, statsInc: statsFor(mv, item.id, -1), statsMonth: mv.month };
}

// ---------- monthly totals ----------
// stats/{YYYY-MM} = { sold:{qty,amount}, free:{...}, used:{...}, expired:{...}, in:{...}, adj:{...},
//                     items: { [itemId]: { sold, free, used, expired, in, adj, counts } } }

export function statsFor(mv, itemId, sign) {
  const r = (pairs) => pairs.map(([k, v]) => [k, round2(v)]);
  if (mv.type === 'COUNT') {
    const inc = [['adj.qty', sign * mv.delta], ['adj.amount', sign * (mv.amount || 0)], [`items.${itemId}.adj`, sign * mv.delta]];
    if (sign > 0) inc.push([`items.${itemId}.counts`, 1]);
    return r(inc);
  }
  const b = mv.bucket;
  return r([[`${b}.qty`, sign * mv.qty], [`${b}.amount`, sign * (mv.amount || 0)], [`items.${itemId}.${b}`, sign * mv.qty]]);
}

export function applyStatsInc(stats, inc, month) {
  const out = JSON.parse(JSON.stringify(stats || {}));
  out.month = month;
  for (const [path, v] of inc) {
    const parts = path.split('.');
    let o = out;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    const k = parts[parts.length - 1];
    o[k] = round2((o[k] || 0) + v);
  }
  return out;
}

// Totals for a list of movements (used by the Excel report). Undone entries and undo rows are skipped.
export function summarize(movements) {
  const tot = {};
  const byItem = {};
  for (const m of movements) {
    if (m.reversed || m.type === 'REVERSAL') continue;
    const b = m.bucket || (m.type === 'COUNT' ? 'adj' : m.type === 'IN' ? 'in' : '');
    if (!b) continue;
    const q = b === 'adj' ? m.delta : m.qty;
    tot[b] = tot[b] || { qty: 0, amount: 0 };
    tot[b].qty = round2(tot[b].qty + q);
    tot[b].amount = round2(tot[b].amount + (m.amount || 0));
    const it = (byItem[m.itemId] = byItem[m.itemId] || { name: m.itemName, unit: m.unit, category: m.category });
    it[b] = round2((it[b] || 0) + q);
    it[b + 'Amount'] = round2((it[b + 'Amount'] || 0) + (m.amount || 0));
  }
  return { tot, byItem };
}
