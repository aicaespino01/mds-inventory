// Home dashboard, Items list, Item details.
import { S, isAdmin, canRecord, canUndo, go, supplierOf, supplierName } from './state.js';
import * as L from './logic.js';
import { esc, toast, friendlyError, confirmBox, setBusy } from './ui.js';
import { icon } from './icons.js';
import { EXPIRY_WARN_DAYS } from './config.js';
import { SEED_ITEMS } from './seed.js';

// ---------- shared pieces ----------

export const statusOf = (it) => L.itemStatus(it, EXPIRY_WARN_DAYS);
export const pill = (st) => `<span class="pill pill-${st.code}">${esc(st.label)}</span>`;
export const activeItems = () => S.items.filter((i) => !i.archived);
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

export function expiryText(st) {
  if (!st.nearest) return '';
  if (st.days < 0) return `Expired ${L.fmtDate(st.nearest)}`;
  if (st.days === 0) return 'Expires today';
  if (st.days <= EXPIRY_WARN_DAYS) return `Expires in ${st.days} day${st.days === 1 ? '' : 's'}`;
  return `Exp. ${L.fmtDate(st.nearest)}`;
}

const MV_ICON = { OUT: 'arrowOut', IN: 'arrowIn', COUNT: 'clipboard', REVERSAL: 'undo' };

export function movementRow(mv, { showItem = true } = {}) {
  const sign = mv.delta > 0 ? '+' : mv.delta < 0 ? '−' : '±';
  const qtyTxt = `${sign}${L.fmtQty(Math.abs(mv.delta || 0))} ${esc(mv.unit || '')}`.trim();
  const reasonTxt = mv.type === 'COUNT' ? 'Shelf count' : mv.reason || '';
  const extras = [];
  if (mv.type === 'OUT' && mv.bucket === 'sold' && mv.amount) extras.push(L.fmtMoney(mv.amount));
  if (mv.type === 'OUT' && mv.bucket === 'free' && mv.amount) extras.push(`worth ${L.fmtMoney(mv.amount)}`);
  if (mv.type === 'IN' && mv.expiry) extras.push(`exp. ${L.fmtDate(mv.expiry)}`);
  if (mv.type === 'IN' && mv.supplier) extras.push(mv.supplier);
  if (mv.type === 'COUNT') extras.push(`${L.fmtQty(mv.before)} → ${L.fmtQty(mv.after)}`);
  const sub = [...(showItem ? [reasonTxt] : []), ...extras, mv.byName, L.fmtDayTime(mv.at), mv.note ? `“${mv.note}”` : '']
    .filter(Boolean).map(esc).join(' · ');
  const undo = canUndo(mv) ? `<button class="link-btn" data-undo="${esc(mv.id)}">${icon('undo')}Undo</button>` : '';
  return `
    <div class="mv ${mv.reversed ? 'mv-undone' : ''}">
      <div class="mv-ic mv-${mv.type.toLowerCase()} ${mv.bucket ? 'mvb-' + mv.bucket : ''}">${icon(MV_ICON[mv.type] || 'box')}</div>
      <div class="mv-main">
        <div class="mv-title">${showItem ? `<a href="#/item/${esc(mv.itemId)}">${esc(mv.itemName)}</a>` : esc(reasonTxt)}
          ${mv.reversed ? '<span class="pill pill-undone">Undone</span>' : ''}</div>
        <div class="mv-sub">${sub}</div>
      </div>
      <div class="mv-end"><div class="mv-qty ${mv.delta < 0 ? 'neg' : mv.delta > 0 ? 'pos' : ''}">${qtyTxt}</div>${undo}</div>
    </div>`;
}

export async function handleUndo(id, after) {
  const ok = await confirmBox('Undo this entry?', 'The stock will go back to how it was before this entry. The undo is also recorded.', 'Undo entry');
  if (!ok) return;
  if (!S.demo && !navigator.onLine) return toast('No internet. Undo needs a connection.', 'error');
  try {
    await S.store.reverse(id);
    toast('Entry undone');
    after?.();
  } catch (e) {
    toast(friendlyError(e), 'error');
  }
}

export function bindUndo(root, after) {
  root.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', () => handleUndo(b.dataset.undo, after)));
}

const emptyBox = (title, text, action = '') => `<div class="empty">${icon('box', 'empty-ic')}<h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;

// ---------- HOME ----------

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

async function loadStarter(btn) {
  setBusy(btn, true, 'Loading items…');
  try {
    await S.store.seedItems(SEED_ITEMS);
    toast(`${SEED_ITEMS.length} starting items added`);
  } catch (e) {
    toast(friendlyError(e), 'error');
    setBusy(btn, false);
  }
}

export const HomeView = {
  title: 'Home',
  html() {
    const first = (S.profile?.name || '').split(/\s+/)[0];
    const head = `<div class="page-head"><div><h1>${greeting()}${first ? ', ' + esc(first) : ''}</h1>
      <p class="muted">${esc(new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</p></div>
      ${canRecord() ? `<a class="btn btn-primary hide-sm" href="#/record">${icon('plus')}Record item</a>` : ''}</div>`;

    if (!S.itemsLoaded) return head + '<div class="card loading-card"><span class="spin"></span> Loading…</div>';
    const items = activeItems();
    if (!items.length) {
      return head + `<div class="card setup-card">
        <div class="setup-ic">${icon('box')}</div>
        <div><h2>Let's set up your item list</h2>
        ${isAdmin()
          ? `<p>Start with <b>${SEED_ITEMS.length} items</b>: the clinic's 42 procedure supplies, plus Amox, Clinda, Paracetamol, Interdental Brush, Orthohyl, Povidone Iodine and Aquazone. You can edit, add or archive items any time.</p>
             <div class="row-actions"><button class="btn btn-primary" id="seedBtn">${icon('download')}Load starting items</button>
             <a class="btn btn-ghost" href="#/edit/new">${icon('plus')}Add one item</a></div>`
          : '<p>The item list is empty. Ask the admin to load the starting items.</p>'}</div></div>`;
    }

    const rows = items.map((it) => ({ it, st: statusOf(it) }));
    const c = { out: 0, low: 0, exp: 0, nc: 0 };
    rows.forEach(({ st }) => {
      if (st.out) c.out++;
      if (st.low) c.low++;
      if (st.expired || st.expiring) c.exp++;
      if (st.notcounted) c.nc++;
    });
    const s = S.stats || {};
    const g = (k) => s[k] || { qty: 0, amount: 0 };

    const ncCard = c.nc
      ? `<div class="card notice-card"><div class="notice-ic">${icon('clipboard')}</div>
          <div class="notice-main"><b>${c.nc} of ${items.length} items not counted yet.</b>
          <span>Count what's on the shelf so the app knows what you have.</span></div>
          ${canRecord() ? `<a class="btn btn-primary" href="#/count">Start count</a>` : ''}</div>`
      : '';

    const statCard = (key, n, label, sub, ic) => `
      <a class="stat stat-${key}" href="#/items?status=${key}">
        <div class="stat-top"><span class="stat-ic">${icon(ic)}</span><span class="stat-n">${n}</span></div>
        <div class="stat-label">${label}</div><div class="stat-sub">${sub}</div></a>`;

    const attention = rows
      .filter(({ st }) => st.out || st.low || st.expired || st.expiring)
      .sort((a, b) => {
        const rank = (st) => (st.expired ? 0 : st.out ? 1 : st.low ? 2 : 3);
        return rank(a.st) - rank(b.st) || byName(a.it, b.it);
      })
      .slice(0, 8);

    const tops = Object.entries(s.items || {})
      .map(([id, v]) => ({ id, n: L.round2((v.sold || 0) + (v.free || 0) + (v.used || 0)), it: S.itemsById.get(id) }))
      .filter((x) => x.n > 0 && x.it)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    const topMax = tops[0]?.n || 1;

    const month = L.monthLabel(L.monthKey());
    return head + ncCard + `
      <div class="stats">
        ${statCard('out', c.out, 'Out of stock', 'Need to order', 'alert')}
        ${statCard('low', c.low, 'Low stock', 'At or below minimum', 'chart')}
        ${statCard('expiring', c.exp, 'Expiring', `Medicines: within ${EXPIRY_WARN_DAYS} days or expired`, 'clock')}
        ${statCard('all', items.length, 'Items', `${c.nc ? c.nc + ' not counted' : 'All counted'}`, 'box')}
      </div>

      <section class="card">
        <div class="card-head"><h2>This month <span class="muted">· ${esc(month)}</span></h2><a class="link" href="#/reports">Report ${icon('chevron')}</a></div>
        <div class="month-grid">
          <div class="mstat"><div class="mstat-label">Sold</div><div class="mstat-n">${L.fmtMoney(g('sold').amount)}</div><div class="mstat-sub">${L.fmtQty(g('sold').qty)} items</div></div>
          <div class="mstat"><div class="mstat-label">Given free</div><div class="mstat-n">${L.fmtQty(g('free').qty)} <small>items</small></div><div class="mstat-sub">worth ${L.fmtMoney(g('free').amount)}</div></div>
          <div class="mstat"><div class="mstat-label">Used in clinic</div><div class="mstat-n">${L.fmtQty(g('used').qty)} <small>items</small></div><div class="mstat-sub">cost ${L.fmtMoney(g('used').amount)}</div></div>
          <div class="mstat"><div class="mstat-label">Received</div><div class="mstat-n">${L.fmtQty(g('in').qty)} <small>items</small></div><div class="mstat-sub">cost ${L.fmtMoney(g('in').amount)}</div></div>
        </div>
      </section>

      <div class="two-col">
        <section class="card">
          <div class="card-head"><h2>Needs attention</h2><a class="link" href="#/order">Order list ${icon('chevron')}</a></div>
          ${attention.length ? `<div class="list">${attention.map(({ it, st }) => `
            <a class="row" href="#/item/${esc(it.id)}"><div class="row-main"><div class="row-title">${esc(it.name)}</div>
            <div class="row-sub">${L.fmtQty(it.qty)} ${esc(it.unit)} left${st.nearest && (st.expired || st.expiring) ? ' · ' + esc(expiryText(st)) : ''}</div></div>${pill(st)}</a>`).join('')}</div>`
            : `<p class="muted pad">${c.nc === items.length ? 'Nothing to show until the first count.' : 'Nothing needs attention. 👍'}</p>`}
        </section>
        <section class="card">
          <div class="card-head"><h2>Most given out this month</h2></div>
          ${tops.length ? `<div class="bars">${tops.map((t) => `
            <a class="bar-row" href="#/item/${esc(t.id)}"><span class="bar-name">${esc(t.it.name)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (t.n / topMax) * 100)}%"></span></span>
            <span class="bar-n">${L.fmtQty(t.n)}</span></a>`).join('')}</div>`
            : '<p class="muted pad">No items given out yet this month.</p>'}
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h2>Recent activity</h2><a class="link" href="#/activity">See all ${icon('chevron')}</a></div>
        ${S.recent.length ? `<div class="mv-list">${S.recent.slice(0, 8).map((m) => movementRow(m)).join('')}</div>` : '<p class="muted pad">No entries yet.</p>'}
      </section>`;
  },
  mount(root) {
    root.querySelector('#seedBtn')?.addEventListener('click', (e) => loadStarter(e.currentTarget));
    bindUndo(root);
  },
};

// ---------- ITEMS ----------

const STATUS_FILTERS = [
  ['all', 'All'], ['attention', 'Needs attention'], ['low', 'Low'], ['out', 'Out'], ['expiring', 'Expiring'], ['notcounted', 'Not counted'],
];

function matchStatus(st, it, f) {
  if (f === 'archived') return it.archived;
  if (it.archived) return false;
  switch (f) {
    case 'low': return st.low;
    case 'out': return st.out;
    case 'expiring': return st.expiring || st.expired;
    case 'notcounted': return st.notcounted;
    case 'attention': return st.out || st.low || st.expiring || st.expired;
    default: return true;
  }
}

function itemsListHtml() {
  const u = S.ui.items;
  const q = u.q.trim().toLowerCase();
  const all = S.items.map((it) => ({ it, st: statusOf(it) }));
  const shown = all
    .filter(({ it, st }) => matchStatus(st, it, u.status))
    .filter(({ it }) => u.cat === 'All' || it.category === u.cat)
    .filter(({ it }) => !q || it.name.toLowerCase().includes(q) || (it.supplier || '').toLowerCase().includes(q))
    .sort((a, b) => byName(a.it, b.it));
  const total = all.filter(({ it }) => !it.archived).length;
  if (!S.itemsLoaded) return '<div class="card loading-card"><span class="spin"></span> Loading…</div>';
  if (!total && u.status !== 'archived') {
    return emptyBox('No items yet', isAdmin() ? 'Go to Home and load the starting items, or add one.' : 'Ask the admin to set up the item list.',
      isAdmin() ? `<a class="btn btn-primary" href="#/edit/new">${icon('plus')}Add item</a>` : '');
  }
  if (!shown.length) return emptyBox('No matching items', 'Try another search or filter.');
  return `<p class="muted small list-count">Showing ${shown.length} of ${total} items</p>
    <div class="card list item-list">${shown.map(({ it, st }) => `
      <a class="row item-row" href="#/item/${esc(it.id)}">
        <div class="row-main"><div class="row-title">${esc(it.name)}</div>
          <div class="row-sub">${esc(it.category)}${it.unit ? ' · ' + esc(it.unit) : ''}${st.nearest ? ' · ' + esc(expiryText(st)) : ''}</div></div>
        <div class="row-end">${st.notcounted ? '' : `<div class="qty">${L.fmtQty(it.qty)}<span>${esc(it.unit)}</span></div>`}${pill(st)}</div>
      </a>`).join('')}</div>`;
}

export const ItemsView = {
  title: 'Items',
  enter(params) {
    S.ui.items.status = params.get('status') || 'all';
    S.ui.items.cat = params.get('cat') || 'All';
  },
  html() {
    const u = S.ui.items;
    const chips = (list, cur, attr) => list.map(([k, label]) => `<button class="chip ${cur === k ? 'on' : ''}" data-${attr}="${esc(k)}">${esc(label)}</button>`).join('');
    const statusList = isAdmin() ? [...STATUS_FILTERS, ['archived', 'Archived']] : STATUS_FILTERS;
    return `
      <div class="page-head"><div><h1>Items</h1><p class="muted">Medicines, oral care, clinic supplies and equipment</p></div>
        ${isAdmin() ? `<a class="btn btn-primary" href="#/edit/new">${icon('plus')}Add item</a>` : ''}</div>
      <div class="searchbar">${icon('search')}<input id="itemQ" type="search" placeholder="Search items or supplier" value="${esc(u.q)}" autocomplete="off"></div>
      <div class="chips">${chips([['All', 'All'], ...L.CATEGORIES.map((c) => [c, c])], u.cat, 'cat')}</div>
      <div class="chips">${chips(statusList, u.status, 'status')}</div>
      <div id="itemList">${itemsListHtml()}</div>`;
  },
  mount(root) {
    const list = root.querySelector('#itemList');
    root.querySelector('#itemQ').addEventListener('input', (e) => {
      S.ui.items.q = e.target.value;
      list.innerHTML = itemsListHtml();
    });
    const to = (status, cat) => go(`#/items?status=${encodeURIComponent(status)}&cat=${encodeURIComponent(cat)}`);
    root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => to(S.ui.items.status, b.dataset.cat)));
    root.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => to(b.dataset.status, S.ui.items.cat)));
  },
  update(root) {
    root.querySelector('#itemList').innerHTML = itemsListHtml();
  },
};

// ---------- ITEM DETAILS ----------

const hist = { key: '', list: null, loading: false, month: L.monthKey(), itemId: null, stamp: 0 };

async function loadHistory(itemId, rerender) {
  const key = `${itemId}|${hist.month}`;
  hist.loading = true;
  hist.key = key;
  try {
    const list = await S.store.listMovements({ itemId, month: hist.month });
    if (hist.key === key) hist.list = list;
  } catch (e) {
    if (hist.key === key) hist.list = [];
    toast(friendlyError(e), 'error');
  }
  hist.loading = false;
  rerender();
}

export const ItemView = {
  title: 'Item',
  enter(params, id) {
    if (hist.itemId !== id) {
      hist.itemId = id;
      hist.month = L.monthKey();
      hist.list = null;
      hist.key = '';
    }
  },
  html(id) {
    const it = S.itemsById.get(id);
    if (!S.itemsLoaded) return '<div class="card loading-card"><span class="spin"></span> Loading…</div>';
    if (!it) return emptyBox('Item not found', 'It may have been removed.', '<a class="btn btn-ghost" href="#/items">Back to items</a>');
    const st = statusOf(it);
    const med = L.tracksExpiry(it);
    const sup = supplierOf(it);
    const batches = med ? L.sortFEFO((it.batches || []).filter((b) => b.qty > 0)) : [];
    const info = [
      ['Category', esc(it.category)],
      ['Unit', esc(it.unit || '—')],
      ['Minimum level', it.minLevel ? `${L.fmtQty(it.minLevel)} ${esc(it.unit)}` : '<span class="muted">Not set</span>'],
      ['Cost per unit', it.cost != null ? L.fmtMoney(it.cost) : '<span class="muted">—</span>'],
      ['Selling price', it.price != null ? L.fmtMoney(it.price) : '<span class="muted">—</span>'],
      ['Usual order', it.orderQty ? `${L.fmtQty(it.orderQty)} ${esc(it.unit)}` : '<span class="muted">—</span>'],
      ['Supplier', sup ? `<a href="#/supplier/${esc(sup.id)}">${esc(sup.name)}</a>${sup.phone ? `<br><a class="small" href="tel:${esc(String(sup.phone).replace(/[^d+]/g, ''))}">${esc(sup.phone)}</a>` : ''}` : esc(supplierName(it) || '—')],
    ];
    return `
      <a class="back" href="#/items">${icon('back')}Items</a>
      <div class="page-head item-head"><div><h1>${esc(it.name)}</h1><div class="head-pills">${pill(st)}${it.archived ? '' : ''}</div></div>
        ${isAdmin() ? `<a class="btn btn-ghost" href="#/edit/${esc(it.id)}">${icon('edit')}Edit</a>` : ''}</div>

      <div class="item-top">
        <section class="card stock-card">
          <div class="stock-label">In stock</div>
          <div class="stock-n">${st.notcounted ? '—' : L.fmtQty(it.qty)} <span>${esc(it.unit)}</span></div>
          <div class="stock-sub">${st.notcounted ? 'Not counted yet' : med ? (st.nearest ? esc(expiryText(st)) : 'No expiry dates recorded') : it.minLevel ? `Minimum: ${L.fmtQty(it.minLevel)} ${esc(it.unit)}` : 'No minimum level set'}</div>
          ${canRecord() && !it.archived ? `<div class="stock-actions">
            <a class="btn btn-out" href="#/record?type=OUT&item=${esc(it.id)}">${icon('arrowOut')}Item out</a>
            <a class="btn btn-in" href="#/record?type=IN&item=${esc(it.id)}">${icon('arrowIn')}Item in</a></div>` : ''}
        </section>
        <section class="card">
          <dl class="info">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
          ${it.notes ? `<p class="notes">${esc(it.notes)}</p>` : ''}
        </section>
      </div>

      ${med ? `<section class="card">
        <div class="card-head"><h2>Stock by expiry date</h2></div>
        ${batches.length ? `<table class="table"><thead><tr><th>Expiry date</th><th class="num">Qty</th><th>Status</th></tr></thead><tbody>
          ${batches.map((b) => {
            const d = b.expiry ? L.daysUntil(b.expiry) : null;
            const tag = d === null ? '<span class="muted">No date</span>' : d < 0 ? '<span class="pill pill-expired">Expired</span>' : d <= EXPIRY_WARN_DAYS ? `<span class="pill pill-expiring">${d} days left</span>` : '<span class="pill pill-ok">OK</span>';
            return `<tr><td>${b.expiry ? esc(L.fmtDate(b.expiry)) : '<span class="muted">Not recorded</span>'}</td><td class="num">${L.fmtQty(b.qty)}</td><td>${tag}</td></tr>`;
          }).join('')}</tbody></table>
          <p class="muted small pad-x">When items go out, the app uses the stock that expires first.</p>`
          : '<p class="muted pad">No stock recorded.</p>'}
      </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>History</h2>
          <div class="month-nav"><button class="icon-btn" id="hPrev" aria-label="Previous month">${icon('left')}</button>
          <span>${esc(L.monthLabel(hist.month))}</span>
          <button class="icon-btn" id="hNext" aria-label="Next month" ${hist.month >= L.monthKey() ? 'disabled' : ''}>${icon('right')}</button></div></div>
        ${hist.list === null ? '<p class="muted pad"><span class="spin"></span> Loading…</p>'
          : hist.list.length ? `<div class="mv-list">${hist.list.map((m) => movementRow(m, { showItem: false })).join('')}</div>`
          : '<p class="muted pad">No entries this month.</p>'}
      </section>`;
  },
  mount(root, id, rerender) {
    const it = S.itemsById.get(id);
    if (!it) return;
    const key = `${id}|${hist.month}`;
    if (hist.key !== key || (it.updatedAt || 0) !== hist.stamp) {
      hist.stamp = it.updatedAt || 0;
      if (!hist.loading || hist.key !== key) loadHistory(id, rerender);
    }
    root.querySelector('#hPrev')?.addEventListener('click', () => { hist.month = L.shiftMonth(hist.month, -1); hist.list = null; rerender(); });
    root.querySelector('#hNext')?.addEventListener('click', () => { hist.month = L.shiftMonth(hist.month, 1); hist.list = null; rerender(); });
    bindUndo(root);
  },
};
