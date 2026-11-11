// Reports, Activity, Team, More, and the login / no-access screens.
import { S, isAdmin, canRecord, go, ROLE_LABEL, initials } from './state.js';
import * as L from './logic.js';
import { esc, toast, friendlyError, modal, confirmBox, setBusy } from './ui.js';
import { icon } from './icons.js';
import { APP_NAME, APP_VERSION, CLINIC_NAME } from './config.js';
import { movementRow, bindUndo } from './views-home.js';

const offline = () => !S.demo && !navigator.onLine;

function monthNav(month, idPrefix) {
  return `<div class="month-nav"><button class="icon-btn" id="${idPrefix}Prev" aria-label="Previous month">${icon('left')}</button>
    <span>${esc(L.monthLabel(month))}</span>
    <button class="icon-btn" id="${idPrefix}Next" aria-label="Next month" ${month >= L.monthKey() ? 'disabled' : ''}>${icon('right')}</button></div>`;
}

// ================= REPORTS =================

const rep = { month: L.monthKey(), cache: {}, loading: '' };

function repStats() {
  if (rep.month === S.statsMonth) return S.stats || {};
  return rep.cache[rep.month];
}

async function downloadMonth(btn, month) {
  setBusy(btn, true, 'Preparing Excel…');
  try {
    const { exportMonthExcel } = await import('./export.js');
    const movements = await S.store.listMovements({ month });
    await exportMonthExcel({ month, items: S.items, movements });
    toast('Excel report downloaded');
  } catch (e) {
    toast(friendlyError(e), 'error');
  }
  setBusy(btn, false);
}

async function downloadBackup(btn) {
  setBusy(btn, true, 'Preparing backup…');
  try {
    const { exportBackupExcel } = await import('./export.js');
    const movements = await S.store.listAllMovements();
    await exportBackupExcel({ items: S.items, movements, users: S.users, suppliers: S.suppliers });
    toast('Full backup downloaded');
  } catch (e) {
    toast(friendlyError(e), 'error');
  }
  setBusy(btn, false);
}

export const ReportsView = {
  title: 'Reports',
  enter(params) { const m = params.get('m'); if (m) rep.month = m; },
  html() {
    const s = repStats();
    const g = (k) => (s && s[k]) || { qty: 0, amount: 0 };
    const head = `<div class="page-head"><div><h1>Reports</h1><p class="muted">Monthly totals and Excel download</p></div>${monthNav(rep.month, 'rep')}</div>`;
    if (s === undefined) return head + '<div class="card loading-card"><span class="spin"></span> Loading…</div>';
    const rows = Object.entries(s.items || {}).map(([id, v]) => ({ id, v, it: S.itemsById.get(id) }))
      .filter((x) => x.it && ['in', 'sold', 'free', 'used', 'expired', 'adj'].some((k) => v_(x.v[k])))
      .sort((a, b) => a.it.name.localeCompare(b.it.name));
    const tile = (label, n, sub, cls = '') => `<div class="mstat ${cls}"><div class="mstat-label">${label}</div><div class="mstat-n">${n}</div><div class="mstat-sub">${sub}</div></div>`;
    return head + `
      <section class="card">
        <div class="month-grid six">
          ${tile('Sold', L.fmtMoney(g('sold').amount), `${L.fmtQty(g('sold').qty)} items`)}
          ${tile('Given free', `${L.fmtQty(g('free').qty)} <small>items</small>`, `worth ${L.fmtMoney(g('free').amount)}`)}
          ${tile('Used in clinic', `${L.fmtQty(g('used').qty)} <small>items</small>`, `cost ${L.fmtMoney(g('used').amount)}`)}
          ${tile('Expired / damaged', `${L.fmtQty(g('expired').qty)} <small>items</small>`, `cost ${L.fmtMoney(g('expired').amount)}`)}
          ${tile('Received', `${L.fmtQty(g('in').qty)} <small>items</small>`, `cost ${L.fmtMoney(g('in').amount)}`)}
          ${tile('Count adjustments', `${g('adj').qty > 0 ? '+' : ''}${L.fmtQty(g('adj').qty)} <small>items</small>`, `${L.fmtMoney(g('adj').amount)} at cost`)}
        </div>
        <div class="row-actions pad-t">
          <button class="btn btn-primary" id="dlMonth">${icon('download')}Download Excel report</button>
          ${isAdmin() ? `<button class="btn btn-ghost" id="dlBackup">${icon('shield')}Full backup (all data)</button>` : ''}
        </div>
        <p class="muted small">The Excel file has 3 sheets: Summary, Stock now, and every entry for the month.${isAdmin() ? ' Download a full backup once a month and keep it in a safe folder.' : ''}</p>
      </section>
      <section class="card">
        <div class="card-head"><h2>By item</h2></div>
        ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th class="num">Received</th><th class="num">Sold</th><th class="num">Free</th><th class="num">Used</th><th class="num">Expired</th><th class="num">Count adj.</th><th class="num">In stock</th></tr></thead><tbody>
          ${rows.map(({ id, v, it }) => `<tr><td><a href="#/item/${esc(id)}">${esc(it.name)}</a></td>
            ${['in', 'sold', 'free', 'used', 'expired'].map((k) => `<td class="num">${v[k] ? L.fmtQty(v[k]) : '<span class="muted">–</span>'}</td>`).join('')}
            <td class="num">${v.adj ? (v.adj > 0 ? '+' : '') + L.fmtQty(v.adj) : '<span class="muted">–</span>'}</td>
            <td class="num"><b>${it.counted ? L.fmtQty(it.qty) : '–'}</b></td></tr>`).join('')}
          </tbody></table></div>` : '<p class="muted pad">No entries in this month.</p>'}
      </section>`;
  },
  mount(root, _id, rerender) {
    if (repStats() === undefined && rep.loading !== rep.month) {
      const m = rep.month;
      rep.loading = m;
      S.store.getStats(m).then((st) => { rep.cache[m] = st || {}; }).catch(() => { rep.cache[m] = {}; }).finally(() => { rep.loading = ''; rerender(); });
    }
    root.querySelector('#repPrev').addEventListener('click', () => go(`#/reports?m=${L.shiftMonth(rep.month, -1)}`));
    root.querySelector('#repNext').addEventListener('click', () => go(`#/reports?m=${L.shiftMonth(rep.month, 1)}`));
    root.querySelector('#dlMonth')?.addEventListener('click', (e) => downloadMonth(e.currentTarget, rep.month));
    root.querySelector('#dlBackup')?.addEventListener('click', (e) => downloadBackup(e.currentTarget));
  },
};
const v_ = (x) => !!x;

// ================= ACTIVITY =================

const act = { month: L.monthKey(), list: null, key: '', filter: 'all', topId: '' };
const ACT_FILTERS = [['all', 'All'], ['OUT', 'Out'], ['IN', 'In'], ['COUNT', 'Counts'], ['REVERSAL', 'Undo']];

async function loadAct(rerender) {
  const key = act.month;
  act.key = key;
  try {
    const list = await S.store.listMovements({ month: key });
    if (act.key === key) act.list = list;
  } catch (e) {
    act.list = [];
    toast(friendlyError(e), 'error');
  }
  rerender();
}

export const ActivityView = {
  title: 'Activity',
  enter(params) {
    const m = params.get('m') || L.monthKey();
    if (m !== act.month) { act.month = m; act.list = null; act.key = ''; }
  },
  html() {
    const list = (act.list || []).filter((m) => act.filter === 'all' || m.type === act.filter);
    return `<div class="page-head"><div><h1>Activity</h1><p class="muted">Every item in, item out, count and undo</p></div>${monthNav(act.month, 'act')}</div>
      <div class="chips">${ACT_FILTERS.map(([k, l]) => `<button class="chip ${act.filter === k ? 'on' : ''}" data-af="${k}">${l}</button>`).join('')}</div>
      <section class="card">${act.list === null ? '<p class="muted pad"><span class="spin"></span> Loading…</p>'
        : list.length ? `<div class="mv-list">${list.map((m) => movementRow(m)).join('')}</div>` : '<p class="muted pad">No entries.</p>'}</section>`;
  },
  mount(root, _id, rerender) {
    if (act.key !== act.month) loadAct(rerender);
    root.querySelector('#actPrev').addEventListener('click', () => go(`#/activity?m=${L.shiftMonth(act.month, -1)}`));
    root.querySelector('#actNext').addEventListener('click', () => go(`#/activity?m=${L.shiftMonth(act.month, 1)}`));
    root.querySelectorAll('[data-af]').forEach((b) => b.addEventListener('click', () => { act.filter = b.dataset.af; rerender(); }));
    bindUndo(root, () => loadAct(rerender));
    act.topId = S.recent[0]?.id || '';
  },
  update(root, _id, rerender) {
    // New entries arrived: refresh this month's list.
    const top = S.recent[0]?.id || '';
    if (top !== act.topId && act.month === L.monthKey()) { act.topId = top; loadAct(rerender); }
  },
};

// ================= TEAM =================

const roleHelp = `<ul class="role-help">
  <li><b>Admin</b>: everything, including adding items and team members</li>
  <li><b>Staff</b>: record items in/out and do counts</li>
  <li><b>View only</b>: can look, can't change anything</li></ul>`;

async function editUser(u) {
  const self = u.uid === S.profile?.uid;
  const body = `
    <div class="field"><label for="euName">Name</label><input id="euName" value="${esc(u.name || '')}" maxlength="40"></div>
    <div class="field"><label for="euRole">Role</label><select id="euRole" ${self ? 'disabled' : ''}>
      ${Object.entries(ROLE_LABEL).map(([k, l]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${self ? '<p class="muted small">You can\'t change your own role.</p>' : ''}</div>
    ${self ? '' : `<label class="check"><input type="checkbox" id="euActive" ${u.active !== false ? 'checked' : ''}> Login is active (untick to block this person)</label>`}`;
  let vals;
  const k = await modal({
    title: `Edit ${u.name || u.email}`, body,
    actions: [{ key: 'cancel', label: 'Cancel' }, { key: 'save', label: 'Save', kind: 'primary' }],
    onMount: (w) => {
      w._validate = () => {
        vals = { name: w.querySelector('#euName').value.trim(), role: w.querySelector('#euRole').value, active: self ? true : w.querySelector('#euActive').checked };
        if (!vals.name) { toast('Enter a name.', 'error'); return false; }
        return true;
      };
    },
  });
  if (k !== 'save') return;
  try {
    const patch = self ? { name: vals.name } : vals;
    await S.store.updateUser(u.uid, patch);
    toast('Saved');
  } catch (e) {
    toast(friendlyError(e), 'error');
  }
}

export const TeamView = {
  title: 'Team',
  html() {
    const users = [...S.users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return `<div class="page-head"><div><h1>Team</h1><p class="muted">Who can open MDS Inventory</p></div></div>
      ${isAdmin() ? `<section class="card"><div class="card-head"><h2>Add a person</h2></div>
        <form id="addUser" class="form" novalidate>
          <div class="grid-2">
            <div class="field"><label for="auName">Name</label><input id="auName" maxlength="40" placeholder="Full name" required></div>
            <div class="field"><label for="auEmail">Email</label><input id="auEmail" type="email" autocomplete="off" required></div>
            <div class="field"><label for="auPw">Temporary password</label><input id="auPw" type="text" autocomplete="new-password" minlength="6" placeholder="At least 6 characters" required></div>
            <div class="field"><label for="auRole">Role</label><select id="auRole"><option value="staff">Staff</option><option value="viewer">View only</option><option value="admin">Admin</option></select></div>
          </div>
          ${roleHelp}
          <div class="row-actions end"><button class="btn btn-primary" id="auSave" type="submit">${icon('plus')}Create login</button></div>
        </form></section>` : ''}
      <section class="card"><div class="card-head"><h2>People</h2></div>
        <div class="list">${users.map((u) => `
          <div class="row user-row ${u.active === false ? 'is-off' : ''}">
            <span class="avatar">${esc(initials(u.name || u.email))}</span>
            <div class="row-main"><div class="row-title">${esc(u.name || '—')}${u.uid === S.profile?.uid ? ' <span class="muted">(you)</span>' : ''}</div>
              <div class="row-sub">${esc(u.email || '')}</div></div>
            <span class="pill pill-role">${esc(ROLE_LABEL[u.role] || u.role)}</span>
            ${u.active === false ? '<span class="pill pill-out">Blocked</span>' : ''}
            ${isAdmin() ? `<button class="icon-btn" data-eu="${esc(u.uid)}" aria-label="Edit ${esc(u.name || '')}">${icon('edit')}</button>` : ''}
          </div>`).join('')}</div></section>`;
  },
  mount(root) {
    root.querySelectorAll('[data-eu]').forEach((b) => b.addEventListener('click', () => editUser(S.users.find((u) => u.uid === b.dataset.eu))));
    const f = root.querySelector('#addUser');
    if (!f) return;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = f.querySelector('#auName').value.trim();
      const email = f.querySelector('#auEmail').value.trim();
      const password = f.querySelector('#auPw').value;
      const role = f.querySelector('#auRole').value;
      if (!name) return toast('Enter a name.', 'error');
      if (!/^\S+@\S+\.\S+$/.test(email)) return toast('That email address looks wrong.', 'error');
      if (password.length < 6) return toast('Password must be at least 6 characters.', 'error');
      if (offline()) return toast('No internet. This needs a connection.', 'error');
      const btn = f.querySelector('#auSave');
      setBusy(btn, true, 'Creating…');
      try {
        await S.store.addUser({ name, email, password, role });
        toast(`Login created for ${name}. Give them their email and temporary password.`);
        f.reset();
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
      setBusy(btn, false);
    });
  },
  update(root, _id, rerender) {
    // Don't wipe the add-person form while typing.
    if (root.querySelector('#addUser')?.contains(document.activeElement)) return;
    rerender();
  },
};

// ================= MORE =================

function installHelp() {
  modal({
    title: 'Put MDS Inventory on your phone',
    body: `<div class="install">
      <h3>Android (Chrome)</h3><ol><li>Open the app link in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu (top right).</li><li>Tap <b>Add to Home screen</b> or <b>Install app</b>, then <b>Install</b>.</li></ol>
      <h3>iPhone (Safari)</h3><ol><li>Open the app link in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
      <p class="muted small">The MDS Inventory icon appears on your home screen and opens like a normal app.</p></div>`,
    actions: [{ key: 'ok', label: 'Got it', kind: 'primary' }],
  });
}

export const MoreView = {
  title: 'More',
  html() {
    const p = S.profile || {};
    const link = (href, ic, label, sub) => `<a class="row" href="${href}">${icon(ic, 'row-ic')}<div class="row-main"><div class="row-title">${label}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>${icon('chevron', 'row-chev')}</a>`;
    const btn = (id, ic, label, sub, cls = '') => `<button class="row ${cls}" id="${id}">${icon(ic, 'row-ic')}<div class="row-main"><div class="row-title">${label}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div></button>`;
    return `<div class="page-head"><div><h1>More</h1></div></div>
      <section class="card account">
        <span class="avatar avatar-lg">${esc(initials(p.name || p.email))}</span>
        <div><div class="account-name">${esc(p.name || '')}</div><div class="muted">${esc(p.email || '')}</div>
        <span class="pill pill-role">${esc(ROLE_LABEL[p.role] || '')}</span></div>
      </section>
      <section class="card list menu">
        ${link('#/order', 'alert', 'To order', 'Low and out-of-stock items, grouped by supplier')}
        ${link('#/suppliers', 'tag', 'Suppliers', 'Contact person, numbers, payment terms')}
        ${link('#/reports', 'chart', 'Reports', 'Monthly totals and Excel download')}
        ${link('#/activity', 'list', 'Activity', 'Every entry, with undo')}
        ${link('#/team', 'users', 'Team', isAdmin() ? 'Add and manage team logins' : 'Who can use the app')}
        ${isAdmin() ? link('#/edit/new', 'plus', 'Add item', 'New medicine, oral care item, supply or equipment') : ''}
        ${link('#/items?status=archived', 'archive', 'Archived items', 'Items you hid from the lists')}
        ${btn('installBtn', 'phone', 'Put the app on your phone', 'Home screen icon, opens like an app')}
      </section>
      <section class="card list menu">
        ${btn('pwBtn', 'key', 'Change my password', 'We email you a link to set a new one')}
        ${btn('outBtn', 'logout', 'Sign out', '', 'row-danger')}
      </section>
      ${S.demo ? `<section class="card demo-box"><div class="card-head"><h2>Demo mode</h2></div>
        <p class="muted small">Data is saved only in this browser. Switch roles to preview what each role can do.</p>
        <div class="chips">${Object.entries(ROLE_LABEL).map(([k, l]) => `<button class="chip ${p.role === k ? 'on' : ''}" data-demorole="${k}">${l}</button>`).join('')}</div>
        <button class="btn btn-danger-ghost" id="demoReset">${icon('refresh')}Reset demo data</button></section>` : ''}
      <p class="foot muted small">${esc(APP_NAME)} ${esc(APP_VERSION)} · ${S.demo ? 'Demo mode' : 'Live: shared with your team'} · ${esc(CLINIC_NAME)}</p>`;
  },
  mount(root) {
    root.querySelector('#installBtn').addEventListener('click', installHelp);
    root.querySelector('#pwBtn').addEventListener('click', async () => {
      const email = S.profile?.email;
      if (!(await confirmBox('Change password?', `We'll email a link to <b>${esc(email)}</b>. Open it and type your new password. Check Spam if you don't see it.`, 'Send link'))) return;
      try { await S.store.resetPassword(email); toast('Email sent. Check your inbox (and Spam).'); } catch (e) { toast(friendlyError(e), 'error'); }
    });
    root.querySelector('#outBtn').addEventListener('click', async () => {
      if (await confirmBox('Sign out?', 'You will need your email and password to sign in again.', 'Sign out')) S.store.signOut();
    });
    root.querySelectorAll('[data-demorole]').forEach((b) => b.addEventListener('click', () => S.store.setDemoRole(b.dataset.demorole)));
    root.querySelector('#demoReset')?.addEventListener('click', async () => {
      if (await confirmBox('Reset demo data?', 'All demo items and entries in this browser will be erased.', 'Reset', true)) { S.store.resetDemo(); go('#/home'); }
    });
  },
};

// ================= GATE SCREENS (outside the main app) =================

export function gateHtml(a) {
  const logo = `<img class="gate-logo" src="assets/logo.png" alt="${esc(CLINIC_NAME)}">`;
  if (a.state === 'loading') return `<div class="gate"><div class="gate-card center">${logo}<span class="spin big"></span></div></div>`;
  if (a.state === 'noAccess' || a.state === 'disabled') {
    return `<div class="gate"><div class="gate-card">${logo}
      <h1>${a.state === 'disabled' ? 'Login turned off' : 'Not set up yet'}</h1>
      <p class="muted">${a.state === 'disabled' ? 'This login has been blocked by the admin.' : 'This login is not added to MDS Inventory yet. Ask the admin to add you in Team.'}</p>
      <p class="small">Signed in as <b>${esc(a.user?.email || '')}</b></p>
      <button class="btn btn-ghost btn-block" id="gateOut">${icon('logout')}Sign out</button></div></div>`;
  }
  return `<div class="gate"><div class="gate-card">${logo}
    <h1>Inventory</h1><p class="muted">Sign in to continue</p>
    ${S.demo ? '<p class="demo-note">Demo mode: any email and password works.</p>' : ''}
    <form id="loginForm" class="form" novalidate>
      <div class="field"><label for="lgEmail">Email</label><input id="lgEmail" type="email" autocomplete="username" required></div>
      <div class="field"><label for="lgPw">Password</label>
        <div class="pw"><input id="lgPw" type="password" autocomplete="current-password" required>
        <button type="button" class="link-btn" id="pwShow">Show</button></div></div>
      <p class="form-error" id="lgErr" role="alert"></p>
      <button class="btn btn-primary btn-lg btn-block" type="submit" id="lgBtn">Sign in</button>
      <button type="button" class="link-btn center-t" id="lgForgot">Forgot password?</button>
    </form></div>
    <p class="gate-foot">${esc(CLINIC_NAME)}</p></div>`;
}

export function mountGate(root) {
  root.querySelector('#gateOut')?.addEventListener('click', () => S.store.signOut());
  const f = root.querySelector('#loginForm');
  if (!f) return;
  const err = f.querySelector('#lgErr');
  f.querySelector('#pwShow').addEventListener('click', (e) => {
    const pw = f.querySelector('#lgPw');
    pw.type = pw.type === 'password' ? 'text' : 'password';
    e.currentTarget.textContent = pw.type === 'password' ? 'Show' : 'Hide';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const email = f.querySelector('#lgEmail').value.trim();
    const pw = f.querySelector('#lgPw').value;
    if (!email || !pw) { err.textContent = 'Enter your email and password.'; return; }
    const btn = f.querySelector('#lgBtn');
    setBusy(btn, true, 'Signing in…');
    try { await S.store.signIn(email, pw); } catch (ex) { err.textContent = friendlyError(ex); setBusy(btn, false); }
  });
  f.querySelector('#lgForgot').addEventListener('click', async () => {
    const email = f.querySelector('#lgEmail').value.trim();
    if (!email) { err.textContent = 'Type your email first, then tap "Forgot password?" again.'; return; }
    try { await S.store.resetPassword(email); err.textContent = ''; toast('If that email has a login, a reset link was sent. Check Spam too.'); } catch (ex) { err.textContent = friendlyError(ex); }
  });
}
