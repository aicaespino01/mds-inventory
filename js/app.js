// MDS Inventory: start-up, layout and page switching.
import { FIREBASE_CONFIG, APP_NAME } from './config.js';
import { S, changed, onChange, canRecord, ROLE_LABEL, initials } from './state.js';
import * as L from './logic.js';
import { esc } from './ui.js';
import { icon } from './icons.js';
import { HomeView, ItemsView, ItemView } from './views-home.js';
import { RecordView, CountView, ItemEditView } from './views-forms.js';
import { ReportsView, ActivityView, TeamView, MoreView, gateHtml, mountGate } from './views-more.js';
import { SuppliersView, SupplierView, SupplierEditView, OrderView } from './views-suppliers.js';

const ROUTES = {
  home: HomeView, items: ItemsView, item: ItemView, record: RecordView, count: CountView, edit: ItemEditView,
  reports: ReportsView, activity: ActivityView, team: TeamView, more: MoreView,
  suppliers: SuppliersView, supplier: SupplierView, 'supplier-edit': SupplierEditView, order: OrderView,
};
const NAV_OF = { item: 'items', edit: 'items', reports: 'more', activity: 'more', team: 'more', suppliers: 'more', supplier: 'more', 'supplier-edit': 'more', order: 'more' };

const $app = document.getElementById('app');
let current = { name: null, id: null, view: null };
let shellOn = false;
let dataUnsubs = [];

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [name, id] = (path || '').split('/');
  return { name: ROUTES[name] ? name : 'home', id: id ? decodeURIComponent(id) : null, params: new URLSearchParams(qs || '') };
}

// ---------- data ----------

function startData() {
  stopData();
  const st = S.store;
  dataUnsubs.push(st.watchItems((items) => {
    S.items = items;
    S.itemsById = new Map(items.map((i) => [i.id, i]));
    S.itemsLoaded = true;
    changed('items');
  }));
  dataUnsubs.push(st.watchUsers((users) => { S.users = users; changed('users'); }));
  dataUnsubs.push(st.watchSuppliers((list) => {
    S.suppliers = list;
    S.suppliersById = new Map(list.map((x) => [x.id, x]));
    changed('suppliers');
  }));
  watchMonth();
  dataUnsubs.push(st.watchRecent(25, (list) => { S.recent = list; changed('recent'); }));
}

let statsUnsub = null;
function watchMonth() {
  const m = L.monthKey();
  if (S.statsMonth === m && statsUnsub) return;
  statsUnsub?.();
  S.statsMonth = m;
  S.stats = null;
  statsUnsub = S.store.watchStats(m, (st) => { S.stats = st; changed('stats'); });
}

function stopData() {
  dataUnsubs.forEach((u) => u?.());
  dataUnsubs = [];
  statsUnsub?.();
  statsUnsub = null;
  S.statsMonth = null;
  Object.assign(S, { items: [], itemsById: new Map(), itemsLoaded: false, users: [], suppliers: [], suppliersById: new Map(), stats: null, recent: [] });
}

// ---------- layout ----------

const NAV = [
  ['home', 'home', 'Home'],
  ['items', 'box', 'Items'],
  ['count', 'clipboard', 'Count'],
  ['more', 'more', 'More'],
];

function shellHtml() {
  const p = S.profile || {};
  const side = NAV.map(([k, ic, label]) => `<a class="side-link" data-nav="${k}" href="#/${k}">${icon(ic)}<span>${label}</span></a>`).join('');
  const sideExtra = [['order', 'alert', 'To order'], ['suppliers', 'tag', 'Suppliers'], ['reports', 'chart', 'Reports'], ['activity', 'list', 'Activity'], ['team', 'users', 'Team']]
    .map(([k, ic, label]) => `<a class="side-link" data-nav2="${k}" href="#/${k}">${icon(ic)}<span>${label}</span></a>`).join('');
  const tab = (k, ic, label) => `<a class="tab" data-nav="${k}" href="#/${k}">${icon(ic)}<span>${label}</span></a>`;
  return `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#/home"><img src="assets/logo.png" alt="MDS Dental & Aesthetics Clinic"><span class="brand-sub">Inventory</span></a>
        ${canRecord() ? `<a class="btn btn-primary btn-block side-cta" href="#/record">${icon('plus')}Record item</a>` : ''}
        <nav class="side-nav">${side}<div class="side-sep"></div>${sideExtra}</nav>
        <a class="side-user" href="#/more"><span class="avatar">${esc(initials(p.name || p.email))}</span>
          <span class="side-user-t"><b>${esc(p.name || '')}</b><small>${esc(ROLE_LABEL[p.role] || '')}</small></span></a>
      </aside>
      <div class="main-col">
        <header class="topbar">
          <a class="top-brand" href="#/home"><img src="assets/logo.png" alt="MDS Dental"></a>
          <span class="top-title" id="topTitle"></span>
          <a class="avatar" href="#/more" aria-label="Account">${esc(initials(p.name || p.email))}</a>
        </header>
        <div id="banners"></div>
        <main id="view" class="view" tabindex="-1"></main>
      </div>
      <nav class="tabbar" aria-label="Main">
        ${tab('home', 'home', 'Home')}${tab('items', 'box', 'Items')}
        ${canRecord() ? `<a class="tab tab-add" data-nav="record" href="#/record" aria-label="Record item"><span class="tab-add-btn">${icon('plus')}</span><span>Record</span></a>` : ''}
        ${canRecord() ? tab('count', 'clipboard', 'Count') : tab('reports', 'chart', 'Reports')}${tab('more', 'more', 'More')}
      </nav>
    </div>`;
}

function renderBanners() {
  const b = document.getElementById('banners');
  if (!b) return;
  let h = '';
  if (S.demo) h += `<div class="banner banner-demo">${icon('info')}<span><b>Demo mode.</b> Data is saved only on this device. It is not shared yet.</span></div>`;
  if (!S.online && !S.demo) h += `<div class="banner banner-off">${icon('alert')}<span><b>No internet.</b> You can look at the last data, but saving needs a connection.</span></div>`;
  b.innerHTML = h;
}

function renderShell() {
  $app.innerHTML = shellHtml();
  shellOn = true;
  renderBanners();
}

function highlightNav(name) {
  const key = NAV_OF[name] || name;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === key));
  document.querySelectorAll('[data-nav2]').forEach((a) => a.classList.toggle('on', a.dataset.nav2 === name));
  if (NAV_OF[name] === 'more') document.querySelectorAll('.side-link[data-nav="more"]').forEach((a) => a.classList.remove('on'));
}

// ---------- page switching ----------

function renderView(keepScroll = false) {
  const root = document.getElementById('view');
  if (!root || !current.view) return;
  const y = window.scrollY;
  root.innerHTML = current.view.html(current.id);
  current.view.mount?.(root, current.id, () => renderView(true));
  if (keepScroll) window.scrollTo(0, y);
}

function route() {
  if (S.auth.state !== 'ready') return;
  if (!shellOn) renderShell();
  watchMonth();
  const { name, id, params } = parseHash();
  const view = ROUTES[name];
  const same = current.name === name && current.id === id;
  current = { name, id, view };
  view.enter?.(params, id);
  const t = document.getElementById('topTitle');
  if (t) t.textContent = view.title;
  document.title = `${view.title} · ${APP_NAME}`;
  highlightNav(name);
  renderView(same);
  if (!same) window.scrollTo(0, 0);
}

let pending = false;
onChange(() => {
  if (pending || S.auth.state !== 'ready') return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const root = document.getElementById('view');
    if (!root || !current.view) return;
    if (current.view.update) current.view.update(root, current.id, () => renderView(true));
    else renderView(true);
  });
});

// ---------- sign-in state ----------

let lastRole = null;
function onAuth(a) {
  const wasReady = S.auth.state === 'ready';
  S.auth = a;
  S.profile = a.profile || null;
  if (a.state === 'ready') {
    if (!wasReady) startData();
    if (!shellOn || lastRole !== a.profile.role) { shellOn = false; lastRole = a.profile.role; }
    route();
    return;
  }
  if (wasReady) stopData();
  shellOn = false;
  lastRole = null;
  current = { name: null, id: null, view: null };
  $app.innerHTML = gateHtml(a);
  mountGate($app);
}

// ---------- start ----------

async function boot() {
  S.demo = !FIREBASE_CONFIG || new URLSearchParams(location.search).has('demo');
  try {
    if (S.demo) S.store = (await import('./store-local.js')).createLocalStore();
    else S.store = (await import('./store-firebase.js')).createFirebaseStore(FIREBASE_CONFIG);
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="gate"><div class="gate-card"><img class="gate-logo" src="assets/logo.png" alt="MDS Dental">
      <h1>Can't start</h1><p class="muted">The app could not load. Check the internet connection, then try again.</p>
      <button class="btn btn-primary btn-block" onclick="location.reload()">Try again</button></div></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  const net = () => { S.online = navigator.onLine; renderBanners(); };
  window.addEventListener('online', net);
  window.addEventListener('offline', net);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.auth.state === 'ready') watchMonth(); });
  S.store.onAuth(onAuth);

  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !local) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
