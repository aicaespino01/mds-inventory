// Record (item out / item in), Stock count, Add/Edit item.
import { S, isAdmin, canRecord, go, supplierName } from './state.js';
import * as L from './logic.js';
import { esc, toast, friendlyError, confirmBox, setBusy, num } from './ui.js';
import { icon } from './icons.js';
import { statusOf, pill, activeItems, movementRow, bindUndo, expiryText } from './views-home.js';

const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
const offline = () => !S.demo && !navigator.onLine;
const viewOnly = () => `<div class="empty">${icon('shield', 'empty-ic')}<h3>View only</h3><p>Your account can look at the inventory but can't record changes.</p></div>`;

// ================= RECORD =================

function selectItem(id) {
  const r = S.ui.record;
  const it = S.itemsById.get(id);
  if (!it) return;
  r.itemId = id;
  r.q = '';
  r.unitPrice = it.price ?? '';
  r.unitCost = it.cost ?? '';
  r.supplier = supplierName(it);
}

function pickResultsHtml() {
  const q = S.ui.record.q.trim().toLowerCase();
  const list = activeItems()
    .filter((it) => !q || it.name.toLowerCase().includes(q))
    .sort((a, b) => {
      if (q) {
        const sa = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const sb = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (sa !== sb) return sa - sb;
      }
      return byName(a, b);
    })
    .slice(0, 60);
  if (!list.length) return `<p class="muted pad">${S.items.length ? 'No item with that name.' : 'No items yet.'}</p>`;
  return list.map((it) => {
    const st = statusOf(it);
    return `<button type="button" class="pick" data-pick="${esc(it.id)}"><span class="pick-name">${esc(it.name)}</span>
      <span class="pick-qty">${st.notcounted ? '<span class="muted">Not counted</span>' : `${L.fmtQty(it.qty)} ${esc(it.unit)}`}</span></button>`;
  }).join('');
}

function pickedHtml(it) {
  const st = statusOf(it);
  return `<div class="picked">
    <div class="picked-main"><div class="row-title">${esc(it.name)}</div>
    <div class="row-sub">${st.notcounted ? 'Not counted yet' : `In the app: <b>${L.fmtQty(it.qty)} ${esc(it.unit)}</b>`}${st.nearest ? ' · ' + esc(expiryText(st)) : ''}</div></div>
    <button type="button" class="btn btn-ghost btn-sm" id="recChange">Change</button></div>`;
}

function totalHtml() {
  const r = S.ui.record;
  const it = S.itemsById.get(r.itemId);
  if (!it) return '';
  const qty = Number(r.qty) || 0;
  if (r.type === 'OUT' && r.reason === 'Sold') return `Total: <b>${L.fmtMoney(qty * (Number(r.unitPrice) || 0))}</b>`;
  if (r.type === 'OUT' && r.reason === 'Free') return it.price ? `Value given free: <b>${L.fmtMoney(qty * it.price)}</b>` : '';
  if (r.type === 'IN' && r.unitCost !== '') return `Total cost: <b>${L.fmtMoney(qty * (Number(r.unitCost) || 0))}</b>`;
  return '';
}

function myRecentHtml() {
  const mine = S.recent.filter((m) => m.by === S.profile?.uid).slice(0, 5);
  if (!mine.length) return '';
  return `<section class="card"><div class="card-head"><h2>Your recent entries</h2></div>
    <div class="mv-list">${mine.map((m) => movementRow(m)).join('')}</div></section>`;
}

export const RecordView = {
  title: 'Record',
  enter(params) {
    const r = S.ui.record;
    const t = params.get('type');
    if (t === 'IN' || t === 'OUT') r.type = t;
    const id = params.get('item');
    if (id) selectItem(id);
  },
  html() {
    if (!canRecord()) return viewOnly();
    const r = S.ui.record;
    const it = r.itemId ? S.itemsById.get(r.itemId) : null;
    if (r.itemId && !it && S.itemsLoaded) r.itemId = null;
    const units = it?.unit || '';
    const suppliers = [...new Set([...S.suppliers.map((s) => s.name), ...S.items.map((i) => supplierName(i))].filter(Boolean))];
    const isOut = r.type === 'OUT';
    return `
      <div class="page-head"><div><h1>Record item</h1><p class="muted">${isOut ? 'Given to a patient, sold, used in the clinic or thrown away.' : 'A delivery or new stock came in.'}</p></div></div>
      <div class="seg" role="tablist">
        <button role="tab" class="seg-out ${isOut ? 'on' : ''}" data-type="OUT" aria-selected="${isOut}">${icon('arrowOut')}Item OUT</button>
        <button role="tab" class="seg-in ${!isOut ? 'on' : ''}" data-type="IN" aria-selected="${!isOut}">${icon('arrowIn')}Item IN</button>
      </div>
      <form id="recForm" class="card form" novalidate>
        <div class="field"><label for="recQ">Item</label>
          <div id="recItem">${it ? pickedHtml(it) : `
            <div class="searchbar">${icon('search')}<input id="recQ" type="search" placeholder="Type the item name…" value="${esc(r.q)}" autocomplete="off"></div>
            <div class="pick-list" id="recResults">${pickResultsHtml()}</div>`}</div></div>

        <div class="field"><label for="recQty">Quantity</label>
          <div class="stepper">
            <button type="button" class="step" data-step="-1" aria-label="Less">${icon('minus')}</button>
            <input id="recQty" type="number" inputmode="decimal" step="any" min="0" value="${esc(num(r.qty))}">
            <button type="button" class="step" data-step="1" aria-label="More">${icon('plus')}</button>
            <span class="unit">${esc(units)}</span></div></div>

        ${isOut ? `
        <div class="field"><span class="label">Reason</span>
          <div class="reasons">${L.OUT_REASONS.map((o) => `
            <button type="button" class="reason ${r.reason === o.key ? 'on' : ''}" data-reason="${esc(o.key)}">
              <span class="reason-t">${esc(o.key)}</span><span class="reason-h">${esc(o.hint)}</span></button>`).join('')}</div></div>
        ${r.reason === 'Sold' ? `<div class="field"><label for="recPrice">Price per unit (₱)</label>
          <input id="recPrice" type="number" inputmode="decimal" step="any" min="0" value="${esc(num(r.unitPrice))}" placeholder="0.00"></div>` : ''}
        ` : `
        <div class="grid-2">
          ${it && L.tracksExpiry(it) ? `<div class="field"><label for="recExp">Expiry date</label>
            <input id="recExp" type="date" value="${esc(r.expiry)}">
            <p class="hint">Different expiry dates in one delivery? Save each date as its own Item IN.</p></div>` : ''}
          <div class="field"><label for="recCost">Cost per unit (₱)</label>
            <input id="recCost" type="number" inputmode="decimal" step="any" min="0" value="${esc(num(r.unitCost))}" placeholder="0.00"></div>
          <div class="field"><label for="recSup">Supplier</label>
            <input id="recSup" list="supList" value="${esc(r.supplier)}" autocomplete="off">
            <datalist id="supList">${suppliers.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
          <div class="field"><label for="recInReason">Type</label>
            <select id="recInReason">${L.IN_REASONS.map((x) => `<option ${r.inReason === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        </div>`}

        <div class="field"><label for="recNote">Note <span class="opt">(optional)</span></label>
          <input id="recNote" maxlength="120" value="${esc(r.note)}" placeholder="${isOut ? 'e.g. OR number' : 'e.g. DR / invoice number'}"></div>

        <div class="total-line" id="recTotal">${totalHtml()}</div>
        <button class="btn btn-primary btn-lg btn-block" type="submit" id="recSave">${icon('check')}Save</button>
      </form>
      <div id="recRecent">${myRecentHtml()}</div>`;
  },
  mount(root, _id, rerender) {
    if (!canRecord()) return;
    const r = S.ui.record;
    const $ = (s) => root.querySelector(s);
    const refreshTotal = () => { const t = $('#recTotal'); if (t) t.innerHTML = totalHtml(); };

    root.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { r.type = b.dataset.type; rerender(); }));
    const q = $('#recQ');
    if (q) {
      q.addEventListener('input', () => { r.q = q.value; $('#recResults').innerHTML = pickResultsHtml(); });
      q.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = root.querySelector('[data-pick]');
          if (first) { selectItem(first.dataset.pick); rerender(); $('#recQty')?.focus(); }
        }
      });
    }
    root.querySelector('#recItem').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) { selectItem(b.dataset.pick); rerender(); root.querySelector('#recQty')?.select(); return; }
      if (e.target.closest('#recChange')) { r.itemId = null; rerender(); root.querySelector('#recQ')?.focus(); }
    });
    const qty = $('#recQty');
    qty.addEventListener('input', () => { r.qty = qty.value; refreshTotal(); });
    root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const v = Math.max(0, L.round2((Number(r.qty) || 0) + Number(b.dataset.step)));
      r.qty = v;
      qty.value = v;
      refreshTotal();
    }));
    root.querySelectorAll('[data-reason]').forEach((b) => b.addEventListener('click', () => { r.reason = b.dataset.reason; rerender(); }));
    const bind = (sel, key, cb) => { const el = $(sel); if (el) el.addEventListener('input', () => { r[key] = el.value; cb?.(); }); };
    bind('#recPrice', 'unitPrice', refreshTotal);
    bind('#recCost', 'unitCost', refreshTotal);
    bind('#recExp', 'expiry');
    bind('#recSup', 'supplier');
    bind('#recNote', 'note');
    $('#recInReason')?.addEventListener('change', (e) => { r.inReason = e.target.value; });

    $('#recForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const it = S.itemsById.get(r.itemId);
      if (!it) return toast('Choose an item first.', 'error');
      const n = Number(r.qty);
      if (!(n > 0)) return toast('Enter a quantity more than 0.', 'error');
      if (r.type === 'OUT' && !r.reason) return toast('Choose a reason: Sold, Free, Used in clinic or Expired.', 'error');
      if (offline()) return toast('No internet. Saving needs a connection.', 'error');
      const btn = $('#recSave');
      setBusy(btn, true);
      try {
        const input = r.type === 'OUT'
          ? { type: 'OUT', itemId: it.id, qty: n, reason: r.reason, unitPrice: r.unitPrice, note: r.note }
          : { type: 'IN', itemId: it.id, qty: n, reason: r.inReason, expiry: L.tracksExpiry(it) ? r.expiry || null : null, unitCost: r.unitCost, supplier: r.supplier, note: r.note };
        await S.store.record(input);
        toast(`Saved: ${r.type === 'OUT' ? '−' : '+'}${L.fmtQty(n)} ${it.unit || ''} ${it.name} · ${r.type === 'OUT' ? r.reason : r.inReason}`.replace(/\s+/g, ' '));
        Object.assign(r, { itemId: null, q: '', qty: 1, note: '', expiry: '', unitPrice: '', unitCost: '', supplier: '' });
        rerender();
        root.querySelector('#recQ')?.focus();
      } catch (err) {
        toast(friendlyError(err), 'error');
        setBusy(btn, false);
      }
    });
    bindUndo(root);
  },
  update(root) {
    if (!canRecord()) return;
    const r = S.ui.record;
    const it = r.itemId ? S.itemsById.get(r.itemId) : null;
    const box = root.querySelector('#recItem');
    if (it) {
      if (box) box.innerHTML = pickedHtml(it);
    } else {
      const res = root.querySelector('#recResults');
      if (res) res.innerHTML = pickResultsHtml();
    }
    const rec = root.querySelector('#recRecent');
    if (rec) { rec.innerHTML = myRecentHtml(); bindUndo(rec); }
  },
};

// ================= COUNT =================

const countedThisMonth = (id) => (S.stats?.items?.[id]?.counts || 0) > 0;

function countListHtml() {
  const u = S.ui.count;
  const q = u.q.trim().toLowerCase();
  const list = activeItems()
    .filter((it) => u.cat === 'All' || it.category === u.cat)
    .filter((it) => !q || it.name.toLowerCase().includes(q))
    .sort(byName);
  if (!S.itemsLoaded) return '<p class="muted pad"><span class="spin"></span> Loading…</p>';
  if (!list.length) return `<p class="muted pad">${S.items.length ? 'No matching items.' : 'No items yet. Load the starting items from Home first.'}</p>`;
  return list.map((it) => (L.tracksExpiry(it) ? medRowHtml(it) : plainRowHtml(it))).join('');
}

// Medicines: one line per expiry date (each batch counted separately).
const blTemplate = (it) => {
  const live = L.sortFEFO((it.batches || []).filter((b) => b.qty > 0));
  return live.length ? live.map((b) => ({ expiry: b.expiry || '', qty: '', appQty: b.qty })) : [{ expiry: '', qty: '' }];
};
const medLines = (it) => S.ui.count.draft[it.id]?.lines || blTemplate(it);
function hasDraft(id) {
  const d = S.ui.count.draft[id];
  if (!d) return false;
  return d.lines ? d.lines.some((l) => l.qty !== '' && l.qty !== undefined) : d.actual !== undefined && d.actual !== '';
}
const rowSub = (it) => `${it.counted ? `In the app: ${L.fmtQty(it.qty)} ${esc(it.unit)}` : 'Not counted yet'}${countedThisMonth(it.id) ? ' · <span class="ok-t">✓ counted this month</span>' : ''}`;
function medTotalHtml(it) {
  if (!hasDraft(it.id)) return '';
  const total = L.round2(medLines(it).reduce((s, l) => s + (Number(l.qty) || 0), 0));
  return `Total: <b>${L.fmtQty(total)}</b> ${esc(it.unit)}`;
}

function medRowHtml(it) {
  const id = esc(it.id);
  return `<div class="count-row med ${hasDraft(it.id) ? 'has-val' : ''}" data-row="${id}">
    <div class="count-main"><div class="row-title">${esc(it.name)}</div><div class="row-sub">${rowSub(it)}</div></div>
    <div class="count-total" data-total="${id}">${medTotalHtml(it)}</div>
    <div class="bl-list">
      <div class="bl-head"><span>Expiry date</span><span>Qty on shelf</span></div>
      ${medLines(it).map((l, i) => `<div class="bl">
        <input type="date" data-blx="${id}" data-i="${i}" value="${esc(l.expiry || '')}" aria-label="Expiry date ${i + 1} of ${esc(it.name)}">
        <input type="number" inputmode="decimal" min="0" step="any" data-blq="${id}" data-i="${i}" value="${esc(num(l.qty))}"
          placeholder="${l.appQty != null ? 'App: ' + L.fmtQty(l.appQty) : 'Qty'}" aria-label="Quantity with this expiry date">
        <button type="button" class="icon-btn bl-del" data-bld="${id}" data-i="${i}" aria-label="Remove this line">${icon('x')}</button></div>`).join('')}
      <button type="button" class="link-btn bl-add" data-bla="${id}">${icon('plus')}Add another expiry date</button>
    </div></div>`;
}

function plainRowHtml(it) {
  const d = S.ui.count.draft[it.id] || {};
  return `<div class="count-row ${hasDraft(it.id) ? 'has-val' : ''}" data-row="${esc(it.id)}">
    <div class="count-main"><div class="row-title">${esc(it.name)}</div><div class="row-sub">${rowSub(it)}</div></div>
    <div class="count-in"><input type="number" inputmode="decimal" min="0" step="any" data-actual="${esc(it.id)}" value="${esc(num(d.actual))}" placeholder="Count" aria-label="Actual count of ${esc(it.name)}">
      <span class="unit">${esc(it.unit)}</span></div>
  </div>`;
}

function countHeadHtml() {
  const items = activeItems();
  const done = items.filter((it) => countedThisMonth(it.id)).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return `<div class="progress"><div class="progress-top"><span><b>${done}</b> of ${items.length} items counted in ${esc(L.monthLabel(L.monthKey()))}</span><span>${pct}%</span></div>
    <div class="progress-track"><span style="transform:scaleX(${pct / 100})"></span></div></div>`;
}

function countBarHtml() {
  const n = Object.keys(S.ui.count.draft).filter((id) => S.itemsById.has(id) && hasDraft(id)).length;
  return n ? `<div class="savebar-in"><span><b>${n}</b> item${n === 1 ? '' : 's'} ready to save</span>
    <div class="row-actions"><button class="btn btn-ghost" id="countClear">Clear</button><button class="btn btn-primary" id="countSave">${icon('check')}Save count</button></div></div>` : '';
}

let countPending = false;

export const CountView = {
  title: 'Count',
  html() {
    if (!canRecord()) return viewOnly();
    const u = S.ui.count;
    return `
      <div class="page-head"><div><h1>Stock count</h1>
        <p class="muted">Type what is actually on the shelf. Leave blank to skip an item. The app fixes any difference and records it.
        For medicines, type the quantity for each expiry date.</p></div></div>
      <div class="card" id="countHead">${countHeadHtml()}</div>
      <div class="searchbar">${icon('search')}<input id="countQ" type="search" placeholder="Search items" value="${esc(u.q)}" autocomplete="off"></div>
      <div class="chips">${[['All', 'All'], ...L.CATEGORIES.map((c) => [c, c])].map(([k, l]) => `<button class="chip ${u.cat === k ? 'on' : ''}" data-ccat="${esc(k)}">${esc(l)}</button>`).join('')}</div>
      <div class="card count-list" id="countList">${countListHtml()}</div>
      <div class="savebar" id="countBar">${countBarHtml()}</div>`;
  },
  mount(root, _id, rerender) {
    if (!canRecord()) return;
    const u = S.ui.count;
    const list = root.querySelector('#countList');
    const bar = root.querySelector('#countBar');
    const refreshBar = () => { bar.innerHTML = countBarHtml(); bindBar(); };
    root.querySelector('#countQ').addEventListener('input', (e) => { u.q = e.target.value; list.innerHTML = countListHtml(); });
    root.querySelectorAll('[data-ccat]').forEach((b) => b.addEventListener('click', () => { u.cat = b.dataset.ccat; rerender(); }));
    const ensureLines = (id) => {
      if (!u.draft[id]?.lines) u.draft[id] = { lines: blTemplate(S.itemsById.get(id)).map((l) => ({ ...l })) };
      return u.draft[id];
    };
    const relist = (focusSel) => {
      list.innerHTML = countListHtml();
      if (focusSel) list.querySelector(focusSel)?.focus();
      refreshBar();
    };
    list.addEventListener('input', (e) => {
      const a = e.target.closest('[data-actual]');
      const bl = e.target.closest('[data-blq],[data-blx]');
      if (a) {
        const id = a.dataset.actual;
        u.draft[id] = { actual: a.value };
        a.closest('.count-row').classList.toggle('has-val', a.value !== '');
        refreshBar();
      }
      if (bl) {
        const id = bl.dataset.blq || bl.dataset.blx;
        const d = ensureLines(id);
        d.lines[Number(bl.dataset.i)][bl.dataset.blq ? 'qty' : 'expiry'] = bl.value;
        const it = S.itemsById.get(id);
        bl.closest('.count-row').classList.toggle('has-val', hasDraft(id));
        const t = list.querySelector(`[data-total="${CSS.escape(id)}"]`);
        if (t && it) t.innerHTML = medTotalHtml(it);
        refreshBar();
      }
    });
    list.addEventListener('click', (e) => {
      const add = e.target.closest('[data-bla]');
      const del = e.target.closest('[data-bld]');
      if (add) {
        const id = add.dataset.bla;
        const d = ensureLines(id);
        d.lines.push({ expiry: '', qty: '' });
        relist(`[data-blx="${CSS.escape(id)}"][data-i="${d.lines.length - 1}"]`);
      }
      if (del) {
        const id = del.dataset.bld;
        const d = ensureLines(id);
        d.lines.splice(Number(del.dataset.i), 1);
        if (!d.lines.length) d.lines.push({ expiry: '', qty: '' });
        relist();
      }
    });
    list.addEventListener('focusout', () => {
      setTimeout(() => {
        if (countPending && !list.contains(document.activeElement)) { countPending = false; CountView.update(root); }
      }, 0);
    });
    const bindBar = () => {
      root.querySelector('#countClear')?.addEventListener('click', async () => {
        if (await confirmBox('Clear typed counts?', 'The numbers you typed (not yet saved) will be removed.', 'Clear')) { u.draft = {}; rerender(); }
      });
      root.querySelector('#countSave')?.addEventListener('click', async (e) => {
        if (offline()) return toast('No internet. Saving needs a connection.', 'error');
        const entries = Object.entries(u.draft).filter(([id]) => S.itemsById.has(id) && hasDraft(id));
        const btn = e.currentTarget;
        let ok = 0;
        const fails = [];
        for (let i = 0; i < entries.length; i++) {
          const [id, d] = entries[i];
          setBusy(btn, true, `Saving ${i + 1} of ${entries.length}…`);
          const it = S.itemsById.get(id);
          try {
            await S.store.count(d.lines
              ? { itemId: id, lines: d.lines.map(({ expiry, qty }) => ({ expiry: expiry || null, qty })) }
              : { itemId: id, actual: d.actual });
            delete u.draft[id];
            ok++;
          } catch (err) {
            fails.push(`${it?.name || 'Item'}: ${friendlyError(err)}`);
          }
        }
        if (fails.length) toast(`Saved ${ok}. Not saved: ${fails.join(' | ')}`, 'error');
        else toast(`Count saved for ${ok} item${ok === 1 ? '' : 's'}`);
        rerender();
      });
    };
    bindBar();
  },
  update(root) {
    if (!canRecord()) return;
    const list = root.querySelector('#countList');
    if (list && list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      countPending = true;
      const head = root.querySelector('#countHead');
      if (head) head.innerHTML = countHeadHtml();
      return;
    }
    if (list) list.innerHTML = countListHtml();
    const head = root.querySelector('#countHead');
    if (head) head.innerHTML = countHeadHtml();
  },
};

// ================= ADD / EDIT ITEM =================

export const ItemEditView = {
  title: 'Item',
  html(id) {
    if (!isAdmin()) return `<div class="empty">${icon('shield', 'empty-ic')}<h3>Admin only</h3><p>Only the admin can add or edit items.</p></div>`;
    const isNew = id === 'new';
    const it = isNew ? { category: 'Medicine' } : S.itemsById.get(id);
    if (!isNew && !S.itemsLoaded) return '<div class="card loading-card"><span class="spin"></span> Loading…</div>';
    if (!it) return '<div class="empty"><h3>Item not found</h3><a class="btn btn-ghost" href="#/items">Back to items</a></div>';
    const sups = [...S.suppliers].sort((a, b) => a.name.localeCompare(b.name));
    const batches = L.tracksExpiry(it) ? L.sortFEFO((it.batches || []).filter((b) => b.qty > 0)) : [];
    return `
      <a class="back" href="${isNew ? '#/items' : `#/item/${esc(id)}`}">${icon('back')}${isNew ? 'Items' : esc(it.name)}</a>
      <div class="page-head"><div><h1>${isNew ? 'Add item' : 'Edit item'}</h1>
        ${isNew ? '<p class="muted">New items start at 0. Record a delivery or do a count to add stock.</p>' : ''}</div></div>
      <form id="editForm" class="card form" novalidate>
        <div class="field"><label for="fName">Item name</label><input id="fName" required maxlength="80" value="${esc(it.name || '')}" placeholder="e.g. Amoxicillin 500mg"></div>
        <div class="grid-2">
          <div class="field"><label for="fCat">Category</label><select id="fCat">${L.CATEGORIES.map((c) => `<option value="${c}" ${it.category === c ? 'selected' : ''}>${c} (${esc(L.CATEGORY_HINT[c])})</option>`).join('')}</select></div>
          <div class="field"><label for="fUnit">Unit</label><input id="fUnit" list="unitList" maxlength="20" value="${esc(it.unit || '')}" placeholder="e.g. capsule, box, bottle">
            <datalist id="unitList">${L.UNITS.map((u) => `<option value="${u}">`).join('')}</datalist></div>
          <div class="field"><label for="fMin">Minimum level <span class="opt">(warn when at or below)</span></label><input id="fMin" type="number" inputmode="decimal" min="0" step="any" value="${esc(num(it.minLevel))}"></div>
          <div class="field"><label for="fOrder">Usual order quantity <span class="opt">(optional)</span></label><input id="fOrder" type="number" inputmode="decimal" min="0" step="any" value="${esc(num(it.orderQty))}" placeholder="e.g. 100"></div>
          <div class="field"><label for="fSup">Supplier</label>
            <select id="fSup"><option value="">— None —</option>${sups.map((s) => `<option value="${esc(s.id)}" ${it.supplierId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
            <p class="hint">${sups.length ? '' : 'No suppliers yet. '}<a href="#/supplier-edit/new">+ Add a new supplier</a></p></div>
          <div class="field"><label for="fCost">Cost per unit (₱)</label><input id="fCost" type="number" inputmode="decimal" min="0" step="any" value="${esc(num(it.cost))}"></div>
          <div class="field"><label for="fPrice">Selling price per unit (₱) <span class="opt">(if sold)</span></label><input id="fPrice" type="number" inputmode="decimal" min="0" step="any" value="${esc(num(it.price))}"></div>
        </div>
        <div class="field"><label for="fNotes">Notes <span class="opt">(optional)</span></label><textarea id="fNotes" rows="2" maxlength="300">${esc(it.notes || '')}</textarea></div>
        <div class="row-actions end"><a class="btn btn-ghost" href="${isNew ? '#/items' : `#/item/${esc(id)}`}">Cancel</a>
          <button class="btn btn-primary" type="submit" id="editSave">${icon('check')}${isNew ? 'Add item' : 'Save changes'}</button></div>
      </form>
      ${!isNew && batches.length ? `
      <section class="card"><div class="card-head"><h2>Fix expiry dates</h2></div>
        <p class="muted small pad-x">Change a date if it was typed wrong. To change quantities, use Stock count.</p>
        <div class="batch-edit">${batches.map((b) => `
          <div class="batch-row"><span class="batch-q">${L.fmtQty(b.qty)} ${esc(it.unit)}</span>
          <input type="date" value="${esc(b.expiry || '')}" data-bexp="${esc(b.id)}" aria-label="Expiry date">
          <button class="btn btn-ghost btn-sm" data-bsave="${esc(b.id)}">Save date</button></div>`).join('')}</div></section>` : ''}
      ${!isNew ? `<section class="card danger-zone"><div><h2>${it.archived ? 'Archived item' : 'Archive item'}</h2>
        <p class="muted small">${it.archived ? 'This item is hidden from lists. Restore it to use it again.' : 'Hide an item you no longer use. Its history is kept.'}</p></div>
        <button class="btn ${it.archived ? 'btn-ghost' : 'btn-danger-ghost'}" id="archBtn">${icon('archive')}${it.archived ? 'Restore item' : 'Archive'}</button></section>` : ''}`;
  },
  mount(root, id) {
    if (!isAdmin()) return;
    const isNew = id === 'new';
    const it = isNew ? null : S.itemsById.get(id);
    if (!isNew && !it) return;
    const v = (s) => root.querySelector(s).value;
    root.querySelector('#editForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = v('#fName').trim();
      if (!name) return toast('Enter the item name.', 'error');
      if (S.items.some((x) => x.id !== id && x.name.trim().toLowerCase() === name.toLowerCase())) return toast('An item with this name already exists.', 'error');
      const nums = ['#fMin', '#fCost', '#fPrice', '#fOrder'].map(v);
      if (nums.some((n) => n !== '' && Number(n) < 0)) return toast('Numbers cannot be negative.', 'error');
      if (offline()) return toast('No internet. Saving needs a connection.', 'error');
      const btn = root.querySelector('#editSave');
      setBusy(btn, true);
      try {
        const supId = v('#fSup');
        const data = {
          name, category: v('#fCat'), unit: v('#fUnit'), minLevel: nums[0], cost: nums[1], price: nums[2], orderQty: nums[3],
          supplierId: supId, supplier: S.suppliersById.get(supId)?.name || '', notes: v('#fNotes'),
        };
        const newId = await S.store.saveItem(data, isNew ? null : id);
        toast(isNew ? `${name} added` : 'Changes saved');
        go(`#/item/${newId}`);
      } catch (err) {
        toast(friendlyError(err), 'error');
        setBusy(btn, false);
      }
    });
    root.querySelectorAll('[data-bsave]').forEach((b) => b.addEventListener('click', async () => {
      const inp = root.querySelector(`[data-bexp="${CSS.escape(b.dataset.bsave)}"]`);
      if (offline()) return toast('No internet. Saving needs a connection.', 'error');
      setBusy(b, true, 'Saving');
      try {
        await S.store.setBatchExpiry(id, b.dataset.bsave, inp.value || null);
        toast('Expiry date saved');
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
      setBusy(b, false);
    }));
    root.querySelector('#archBtn')?.addEventListener('click', async () => {
      const archiving = !it.archived;
      if (archiving && !(await confirmBox(`Archive ${it.name}?`, 'It will be hidden from lists and counts. History is kept, and you can restore it later.', 'Archive', true))) return;
      try {
        await S.store.saveItem({ ...it, archived: archiving }, id);
        toast(archiving ? 'Item archived' : 'Item restored');
        go(archiving ? '#/items' : `#/item/${id}`);
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
    });
  },
  update() { /* keep what the admin is typing */ },
};

export { pill };
