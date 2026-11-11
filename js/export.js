// Excel downloads (uses SheetJS, loaded only when someone clicks Download).
import * as L from './logic.js';
import { CLINIC_NAME, EXPIRY_WARN_DAYS } from './config.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Could not load the Excel tool. Check the internet connection.'));
    document.head.appendChild(s);
  });
}

const MONEY = '#,##0.00';

function sheet(XLSX, rows, widths, moneyCols = [], headerRow = 0) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    for (const c of moneyCols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = MONEY;
    }
  }
  return ws;
}

const stockRows = (items) => {
  const head = ['Item', 'Category', 'Unit', 'In stock', 'Minimum level', 'Status', 'Nearest expiry', 'Cost per unit (₱)', 'Selling price (₱)', 'Stock value at cost (₱)', 'Supplier'];
  const rows = items
    .filter((i) => !i.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((it) => {
      const st = L.itemStatus(it, EXPIRY_WARN_DAYS);
      return [it.name, it.category, it.unit || '', st.notcounted ? '' : L.round2(it.qty), it.minLevel ?? '', st.label,
        st.nearest ? L.fmtDate(st.nearest) : '', it.cost ?? '', it.price ?? '', it.cost != null ? L.round2((it.qty || 0) * it.cost) : '', it.supplier || ''];
    });
  return [head, ...rows];
};

const activityRows = (movements) => {
  const head = ['Date', 'Time', 'Item', 'Entry', 'Reason', 'Qty change', 'Unit', 'Price / cost per unit (₱)', 'Amount (₱)', 'Stock after', 'Recorded by', 'Note', 'Undone'];
  const typeName = { OUT: 'Item out', IN: 'Item in', COUNT: 'Count', REVERSAL: 'Undo' };
  const rows = [...movements].sort((a, b) => a.at - b.at).map((m) => [
    L.fmtDate(m.date), L.fmtTime(m.at), m.itemName, typeName[m.type] || m.type, m.reason || '', L.round2(m.delta || 0), m.unit || '',
    m.unitPrice || 0, L.round2(m.amount || 0), L.round2(m.after ?? 0), m.byName || '', m.note || '', m.reversed ? 'Yes' : '',
  ]);
  return [head, ...rows];
};

function save(XLSX, wb, name) {
  XLSX.writeFile(wb, name.replace(/[\\/:*?"<>|]/g, '-'));
}

export async function exportMonthExcel({ month, items, movements }) {
  const XLSX = await loadXLSX();
  const { tot, byItem } = L.summarize(movements);
  const t = (k) => tot[k] || { qty: 0, amount: 0 };
  const label = L.monthLabel(month);

  const summary = [
    [CLINIC_NAME],
    [`Inventory report — ${label}`],
    [`Downloaded ${new Date().toLocaleString('en-PH')}`],
    [],
    ['', 'Items', 'Amount (₱)'],
    ['Sold (charged to patients)', t('sold').qty, t('sold').amount],
    ['Given free (value at selling price)', t('free').qty, t('free').amount],
    ['Used in clinic (at cost)', t('used').qty, t('used').amount],
    ['Expired / damaged (at cost)', t('expired').qty, t('expired').amount],
    ['Received / deliveries (at cost)', t('in').qty, t('in').amount],
    ['Count adjustments (at cost)', t('adj').qty, t('adj').amount],
    [],
    ['Item', 'Category', 'Unit', 'Received', 'Sold', 'Given free', 'Used in clinic', 'Expired / damaged', 'Count adj.', 'Sold amount (₱)', 'In stock now'],
  ];
  const headerAt = summary.length - 1;
  const ids = new Set([...Object.keys(byItem), ...items.filter((i) => !i.archived).map((i) => i.id)]);
  const lines = [...ids].map((id) => {
    const it = items.find((i) => i.id === id);
    const b = byItem[id] || {};
    return [it?.name || b.name || '(removed item)', it?.category || b.category || '', it?.unit || b.unit || '',
      b.in || 0, b.sold || 0, b.free || 0, b.used || 0, b.expired || 0, b.adj || 0, b.soldAmount || 0,
      it && it.counted ? L.round2(it.qty) : ''];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const wsSum = sheet(XLSX, [...summary, ...lines], [34, 14, 10, 10, 10, 11, 14, 16, 11, 16, 12], [2], 4);
  for (let r = headerAt + 1; r < headerAt + 1 + lines.length; r++) {
    const cell = wsSum[XLSX.utils.encode_cell({ r, c: 9 })];
    if (cell && typeof cell.v === 'number') cell.z = MONEY;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, stockRows(items), [34, 14, 10, 10, 13, 18, 15, 16, 16, 20, 20], [7, 8, 9]), 'Stock now');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, activityRows(movements), [13, 10, 32, 10, 18, 11, 9, 20, 13, 11, 16, 24, 8], [7, 8]), 'Activity');
  save(XLSX, wb, `MDS Inventory - ${label}.xlsx`);
}

export async function exportBackupExcel({ items, movements, users, suppliers = [] }) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, stockRows(items), [34, 14, 10, 10, 13, 18, 15, 16, 16, 20, 20], [7, 8, 9]), 'Stock now');
  const batchRows = [['Item', 'Unit', 'Qty', 'Expiry date']];
  items.filter((i) => !i.archived && L.tracksExpiry(i)).sort((a, b) => a.name.localeCompare(b.name)).forEach((it) => {
    L.sortFEFO((it.batches || []).filter((b) => b.qty > 0)).forEach((b) => batchRows.push([it.name, it.unit || '', b.qty, b.expiry ? L.fmtDate(b.expiry) : '']));
  });
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, batchRows, [34, 10, 10, 15]), 'Medicine expiry');
  const supRows = [L.SUPPLIER_FIELDS.map(([, label]) => label), ...[...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((x) => L.SUPPLIER_FIELDS.map(([k]) => x[k] || ''))];
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, supRows, L.SUPPLIER_FIELDS.map(([k]) => (k === 'notes' || k === 'address' ? 30 : 18))), 'Suppliers');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, activityRows(movements), [13, 10, 32, 10, 18, 11, 9, 20, 13, 11, 16, 24, 8], [7, 8]), 'All activity');
  const userRows = [['Name', 'Email', 'Role', 'Active'], ...users.map((u) => [u.name || '', u.email || '', u.role || '', u.active === false ? 'No' : 'Yes'])];
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, userRows, [22, 30, 10, 8]), 'Team');
  // Raw copy of everything, so the app's data can be fully restored if ever needed.
  const raw = [['type', 'id', 'json']];
  items.forEach((i) => raw.push(['item', i.id, JSON.stringify(i)]));
  suppliers.forEach((x) => raw.push(['supplier', x.id, JSON.stringify(x)]));
  movements.forEach((m) => raw.push(['entry', m.id, JSON.stringify(m)]));
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, raw, [8, 24, 120]), 'Raw data');
  save(XLSX, wb, `MDS Inventory - FULL BACKUP ${L.dateKey()}.xlsx`);
}
