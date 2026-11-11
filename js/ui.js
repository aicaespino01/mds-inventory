// Small screen helpers: escaping, toasts, dialogs, friendly error messages.
import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg, kind = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = `toast show toast-${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, kind === 'error' ? 6000 : 3200);
}

// modal({ title, body (html), actions: [{ key, label, kind }] }) -> Promise<key | null>
export function modal({ title, body = '', actions = [{ key: 'ok', label: 'OK', kind: 'primary' }], onMount }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
        <div class="modal-head"><h2 id="mTitle">${esc(title)}</h2>
          <button class="icon-btn" data-k="__close" aria-label="Close">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-actions">${actions.map((a) => `<button class="btn btn-${a.kind || 'ghost'}" data-k="${esc(a.key)}">${esc(a.label)}</button>`).join('')}</div>
      </div>`;
    const close = (k) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      resolve(k);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return close(null);
      const b = e.target.closest('[data-k]');
      if (!b) return;
      const k = b.dataset.k;
      if (k === '__close') return close(null);
      if (wrap._validate && k !== 'cancel' && wrap._validate(k) === false) return;
      close(k);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    onMount?.(wrap);
    (wrap.querySelector('input,select,textarea') || wrap.querySelector('.btn-primary,.btn-danger'))?.focus();
  });
}

export async function confirmBox(title, body, okLabel = 'OK', danger = false) {
  const k = await modal({
    title, body: `<p>${body}</p>`,
    actions: [{ key: 'cancel', label: 'Cancel' }, { key: 'ok', label: okLabel, kind: danger ? 'danger' : 'primary' }],
  });
  return k === 'ok';
}

export function friendlyError(e) {
  const code = e?.code || '';
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/invalid-email': 'That email address looks wrong.',
    'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.',
    'auth/network-request-failed': 'No internet connection.',
    'auth/email-already-in-use': 'This email already has a login.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-disabled': 'This login has been turned off.',
    'permission-denied': "You don't have permission to do this.",
    unavailable: 'No internet connection. Try again when you are back online.',
    'failed-precondition': 'Something changed at the same time. Please try again.',
    aborted: 'Someone else saved at the same time. Please try again.',
  };
  if (map[code]) return map[code];
  return e?.message || 'Something went wrong. Please try again.';
}

export function setBusy(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span>${esc(label || 'Saving…')}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export const debounce = (fn, ms = 150) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

export const num = (v) => (v === '' || v === null || v === undefined ? '' : String(v));
