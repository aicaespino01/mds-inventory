# MDS Inventory

Inventory app for MDS Dental & Aesthetics Clinic. It runs in the browser and can be installed on a phone's home screen. Data is shared live between the clinic team through Firebase.

- **Live link:** https://aicaespino01.github.io/mds-inventory/

## How it works

- **Plain HTML/CSS/JavaScript.** No build step. Firebase SDK 11.10.0 is loaded from gstatic. SheetJS 0.20.3 is loaded only when someone downloads Excel.
- **`js/config.js`:** `FIREBASE_CONFIG = null` means **demo mode** (localStorage, this browser only). Add `?demo` to the URL to force demo mode.
- **`js/logic.js`:** all stock rules, as pure functions.
  - Batches by expiry date, used first-to-expire-first-out.
  - Builders for OUT, IN, COUNT and undo (reversal).
  - Monthly totals.
  - Tested by `tests/logic.test.mjs`.
- **`js/store-firebase.js` / `js/store-local.js`:** the same interface, two backends. Every stock change is one Firestore transaction that writes the item, a new entry in `movements`, and the monthly totals in `stats/{YYYY-MM}`.
- **`firestore.rules`:**
  - Only active users with a profile in `users/{uid}` can read or write.
  - Staff can change only stock fields.
  - Entries can't be deleted.
  - The owner UID can create the first admin profile.
- **Roles:**
  - `admin`: everything
  - `staff`: record and count
  - `viewer`: read only

## Data (Firestore)

| Collection | One document per | Key fields |
|---|---|---|
| `items` | item | name, category, unit, minLevel, cost, price, supplier, qty, batches[{id, qty, expiry}], counted, archived |
| `movements` | entry | type OUT/IN/COUNT/REVERSAL, reason, bucket, qty, delta, before, after, unitPrice, amount, by, byName, at, date, month, takenFrom/addedBatch, reversed |
| `stats` | month (`2026-11`) | sold/free/used/expired/in/adj {qty, amount}, items.{id}.{sold, free, used, expired, in, adj, counts} |
| `users` | login (uid) | name, email, role, active |
| `suppliers` | supplier | name, contactPerson, phone, phone2, messenger, email, address, paymentTerms, leadTime, minOrder, notes |

- **Items** also have `supplierId`, a copy of the supplier's name in `supplier`, and `orderQty` (the usual order quantity).
- **Expiry dates are tracked for Medicine items only.** Counting a medicine takes one line per expiry date (`buildCountBatches`), and undoing that count restores the earlier batches.

No patient names are stored.

## Making changes

1. **Run it locally:** `node tools/serve.mjs`, then open http://localhost:5180. With no Firebase config it runs in demo mode.
2. **Check the stock math:** `node --test tests/logic.test.mjs`
3. **Publish:** bump `CACHE` in `sw.js` and `APP_VERSION` in `js/config.js`, then commit and push to `main`. GitHub Pages updates in about 1 minute.
