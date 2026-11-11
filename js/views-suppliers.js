// Suppliers (contact details for ordering) and the To-order list.
import { S, isAdmin, go } from './state.js';
import * as L from './logic.js';
import { esc, toast, friendlyError, confirmBox, setBusy } from './ui.js';
import { icon } from './icons.js';
import { CLINIC_NAME } from './config.js';
import { statusOf, pill, activeItems } from './views-home.js';

const offline = () => !S.demo && !navigator.onLine;
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
const telHref = (p) => `tel:${String(p).replace(/[^\d+]/g, '')}`;
const itemsOf = (supId) => activeItems().filter((i) => i.supplierId === supId).sort(byName);
const needsOrder = (it) => { const st = statusOf(it); return st.out || st.low; };

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function contactHtml(s, { compact = false } = {}) {
  const row = (ic, label, val) => (val ? `<div class="ct-row">${icon(ic)}<div><span class="ct-label">${label}</span><span class="ct-val">${val}</span></div></div>` : '');
  const phones = [s.phone, s.phone2].filter(Boolean);
  return `<div class="contact ${compact ? 'compact' : ''}">
    ${row('users', 'Contact person', esc(s.contactPerson))}
    ${phones.map((p, i) => row('phone', i ? 'Other number' : 'Mobile / phone', `<a href="${esc(telHref(p))}">${esc(p)}</a>`)).join('')}
    ${row('info', 'Viber / Messenger / Facebook', esc(s.messenger))}
    ${row('file', 'Email', s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '')}
    ${compact ? '' : row('home', 'Address', esc(s.address))}
    ${row('tag', 'Payment terms', esc(s.paymentTerms))}
    ${row('clock', 'Delivery time', esc(s.leadTime))}
    ${row('box', 'Minimum order', esc(s.minOrder))}
    ${compact ? '' : row('edit', 'Notes', esc(s.notes))}
  </div>`;
}

// ================= SUPPLIERS LIST =================

export const SuppliersView = {
  title: 'Suppliers',
  html() {
    const list = [...S.suppliers].sort(byName);
    return `<a class="back" href="#/more">${icon('back')}More</a>
      <div class="page-head"><div><h1>Suppliers</h1><p class="muted">Who to call when it's time to order</p></div>
        ${isAdmin() ? `<a class="btn btn-primary" href="#/supplier-edit/new">${icon('plus')}Add supplier</a>` : ''}</div>
      ${list.length ? `<div class="card list">${list.map((s) => {
        const its = itemsOf(s.id);
        const need = its.filter(needsOrder).length;
        return `<a class="row" href="#/supplier/${esc(s.id)}">
          <span class="avatar avatar-sup">${icon('box')}</span>
          <div class="row-main"><div class="row-title">${esc(s.name)}</div>
            <div class="row-sub">${[s.contactPerson, s.phone].filter(Boolean).map(esc).join(' · ') || 'No contact details yet'}</div></div>
          <div class="row-end"><span class="muted small">${its.length} item${its.length === 1 ? '' : 's'}</span>
            ${need ? `<span class="pill pill-low">${need} to order</span>` : ''}</div></a>`;
      }).join('')}</div>`
        : `<div class="empty">${icon('users', 'empty-ic')}<h3>No suppliers yet</h3>
          <p>Add each supplier once with their contact person and number. Then pick the supplier on each item.</p>
          ${isAdmin() ? `<a class="btn btn-primary" href="#/supplier-edit/new">${icon('plus')}Add supplier</a>` : ''}</div>`}`;
  },
};

// ================= SUPPLIER DETAILS =================

export const SupplierView = {
  title: 'Supplier',
  html(id) {
    const s = S.suppliersById.get(id);
    if (!s) return `<div class="empty"><h3>Supplier not found</h3><a class="btn btn-ghost" href="#/suppliers">Back to suppliers</a></div>`;
    const its = itemsOf(id);
    const need = its.filter(needsOrder);
    return `<a class="back" href="#/suppliers">${icon('back')}Suppliers</a>
      <div class="page-head"><div><h1>${esc(s.name)}</h1></div>
        ${isAdmin() ? `<a class="btn btn-ghost" href="#/supplier-edit/${esc(id)}">${icon('edit')}Edit</a>` : ''}</div>
      <section class="card">
        ${contactHtml(s)}
        <div class="row-actions pad-t">
          ${s.phone ? `<a class="btn btn-primary" href="${esc(telHref(s.phone))}">${icon('phone')}Call</a>` : ''}
          ${s.phone ? `<button class="btn btn-ghost" id="copyNum">${icon('file')}Copy number</button>` : ''}
          ${need.length ? `<button class="btn btn-ghost" id="copyOrder">${icon('list')}Copy order message (${need.length})</button>` : ''}
        </div>
      </section>
      <section class="card"><div class="card-head"><h2>Items from this supplier</h2></div>
        ${its.length ? `<div class="list">${its.map((it) => { const st = statusOf(it); return `<a class="row" href="#/item/${esc(it.id)}">
          <div class="row-main"><div class="row-title">${esc(it.name)}</div><div class="row-sub">${st.notcounted ? 'Not counted' : `${L.fmtQty(it.qty)} ${esc(it.unit)} left`}${it.minLevel ? ` · minimum ${L.fmtQty(it.minLevel)}` : ''}</div></div>${pill(st)}</a>`; }).join('')}</div>`
          : `<p class="muted pad">No items linked yet. Open an item, tap <b>Edit</b>, and choose this supplier.</p>`}
      </section>`;
  },
  mount(root, id) {
    const s = S.suppliersById.get(id);
    if (!s) return;
    root.querySelector('#copyNum')?.addEventListener('click', async () => { await copyText(s.phone); toast('Number copied'); });
    root.querySelector('#copyOrder')?.addEventListener('click', async () => {
      await copyText(L.orderMessage(s, itemsOf(id).filter(needsOrder), CLINIC_NAME));
      toast('Order message copied. Paste it in Viber, Messenger or SMS.');
    });
  },
};

// ================= ADD / EDIT SUPPLIER =================

const PH = {
  name: 'e.g. ABC Dental Supply', contactPerson: 'e.g. Ms. Joy', phone: 'e.g. 0917 123 4567', phone2: '',
  messenger: 'e.g. Viber 0917 123 4567', email: '', address: '', paymentTerms: 'e.g. COD, 30 days',
  leadTime: 'e.g. 2–3 days', minOrder: 'e.g. ₱3,000', notes: 'e.g. order before 3 PM for next-day delivery',
};

export const SupplierEditView = {
  title: 'Supplier',
  html(id) {
    if (!isAdmin()) return `<div class="empty">${icon('shield', 'empty-ic')}<h3>Admin only</h3><p>Only the admin can add or edit suppliers.</p></div>`;
    const isNew = id === 'new';
    const s = isNew ? {} : S.suppliersById.get(id);
    if (!s) return `<div class="empty"><h3>Supplier not found</h3><a class="btn btn-ghost" href="#/suppliers">Back</a></div>`;
    const field = ([k, label]) => {
      const type = k === 'email' ? 'email' : k.startsWith('phone') ? 'tel' : 'text';
      const inner = k === 'notes' || k === 'address'
        ? `<textarea id="s_${k}" rows="2" maxlength="300" placeholder="${esc(PH[k])}">${esc(s[k] || '')}</textarea>`
        : `<input id="s_${k}" type="${type}" maxlength="80" value="${esc(s[k] || '')}" placeholder="${esc(PH[k])}" ${k === 'name' ? 'required' : ''}>`;
      return `<div class="field ${k === 'notes' || k === 'address' ? 'span-2' : ''}"><label for="s_${k}">${label}${k === 'name' ? '' : ' <span class="opt">(optional)</span>'}</label>${inner}</div>`;
    };
    return `<a class="back" href="${isNew ? '#/suppliers' : `#/supplier/${esc(id)}`}">${icon('back')}${isNew ? 'Suppliers' : esc(s.name)}</a>
      <div class="page-head"><div><h1>${isNew ? 'Add supplier' : 'Edit supplier'}</h1></div></div>
      <form id="supForm" class="card form" novalidate>
        <div class="grid-2">${L.SUPPLIER_FIELDS.map(field).join('')}</div>
        <div class="row-actions end"><a class="btn btn-ghost" href="${isNew ? '#/suppliers' : `#/supplier/${esc(id)}`}">Cancel</a>
          <button class="btn btn-primary" type="submit" id="supSave">${icon('check')}${isNew ? 'Add supplier' : 'Save changes'}</button></div>
      </form>
      ${isNew ? '' : `<section class="card danger-zone"><div><h2>Delete supplier</h2>
        <p class="muted small">Items stay, but they will have no supplier.</p></div>
        <button class="btn btn-danger-ghost" id="supDel">${icon('x')}Delete</button></section>`}`;
  },
  mount(root, id) {
    if (!isAdmin()) return;
    const isNew = id === 'new';
    const f = root.querySelector('#supForm');
    if (!f) return;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      for (const [k] of L.SUPPLIER_FIELDS) data[k] = f.querySelector(`#s_${k}`).value;
      const name = data.name.trim();
      if (!name) return toast('Enter the supplier name.', 'error');
      if (S.suppliers.some((x) => x.id !== id && x.name.trim().toLowerCase() === name.toLowerCase())) return toast('A supplier with this name already exists.', 'error');
      if (offline()) return toast('No internet. Saving needs a connection.', 'error');
      const btn = f.querySelector('#supSave');
      setBusy(btn, true);
      try {
        const newId = await S.store.saveSupplier(data, isNew ? null : id);
        toast(isNew ? `${name} added` : 'Changes saved');
        go(`#/supplier/${newId}`);
      } catch (err) {
        toast(friendlyError(err), 'error');
        setBusy(btn, false);
      }
    });
    root.querySelector('#supDel')?.addEventListener('click', async () => {
      const s = S.suppliersById.get(id);
      const n = itemsOf(id).length;
      if (!(await confirmBox(`Delete ${s.name}?`, `This can't be undone.${n ? ` ${n} item${n === 1 ? '' : 's'} will have no supplier.` : ''}`, 'Delete', true))) return;
      try {
        await S.store.deleteSupplier(id);
        toast('Supplier deleted');
        go('#/suppliers');
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
    });
  },
  update() { /* keep what the admin is typing */ },
};

// ================= TO ORDER =================

export const OrderView = {
  title: 'To order',
  html() {
    const need = activeItems().filter(needsOrder).sort(byName);
    const groups = new Map();
    for (const it of need) {
      const key = S.suppliersById.has(it.supplierId) ? it.supplierId : '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    const keys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : S.suppliersById.get(a).name.localeCompare(S.suppliersById.get(b).name)));
    return `<div class="page-head"><div><h1>To order</h1><p class="muted">Items that are out of stock or at their minimum, grouped by supplier</p></div></div>
      ${!need.length ? `<div class="empty">${icon('check', 'empty-ic')}<h3>Nothing to order</h3><p>No item is out of stock or at its minimum level.<br>Tip: set a <b>Minimum level</b> on each item so the app knows when to warn you.</p></div>` : ''}
      ${keys.map((k) => {
        const s = k ? S.suppliersById.get(k) : null;
        const its = groups.get(k);
        return `<section class="card order-card">
          <div class="card-head"><h2>${s ? `<a href="#/supplier/${esc(s.id)}">${esc(s.name)}</a>` : 'No supplier set'}</h2>
            <span class="pill pill-low">${its.length} item${its.length === 1 ? '' : 's'}</span></div>
          ${s ? contactHtml(s, { compact: true }) : '<p class="muted small">Open these items, tap Edit, and choose their supplier.</p>'}
          <div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th class="num">Stock</th><th class="num">Min.</th><th class="num">Order</th></tr></thead><tbody>
            ${its.map((it) => `<tr><td><a href="#/item/${esc(it.id)}">${esc(it.name)}</a> ${pill(statusOf(it))}</td>
              <td class="num">${L.fmtQty(it.qty)} ${esc(it.unit)}</td><td class="num">${it.minLevel ? L.fmtQty(it.minLevel) : '–'}</td>
              <td class="num">${it.orderQty ? L.fmtQty(it.orderQty) : '–'}</td></tr>`).join('')}
          </tbody></table></div>
          ${s ? `<div class="row-actions pad-t">
            ${s.phone ? `<a class="btn btn-primary btn-sm" href="${esc(telHref(s.phone))}">${icon('phone')}Call</a>` : ''}
            <button class="btn btn-ghost btn-sm" data-copyorder="${esc(s.id)}">${icon('list')}Copy order message</button></div>` : ''}
        </section>`;
      }).join('')}`;
  },
  mount(root) {
    root.querySelectorAll('[data-copyorder]').forEach((b) => b.addEventListener('click', async () => {
      const s = S.suppliersById.get(b.dataset.copyorder);
      await copyText(L.orderMessage(s, itemsOf(s.id).filter(needsOrder), CLINIC_NAME));
      toast('Order message copied. Paste it in Viber, Messenger or SMS.');
    }));
  },
};
