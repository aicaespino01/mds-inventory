// Starting item list, loaded once by the admin from the Home screen.
// - The 42 clinic supplies are copied from MDS_Inventory_Tracker_Updated.xlsx (procedure checklists):
//   names exactly as written there; unit only where the Excel has it. Costs are left blank
//   (kept private): type them in the app with Edit.
// - The others are items given to patients daily, plus clinic equipment.
// Everything starts at 0 and "Not counted" until the first shelf count.

const S = (name, unit = '') => ({ name, category: 'Clinic supply', unit, cost: null });

export const SEED_ITEMS = [
  { name: 'Amox', category: 'Medicine', unit: '', cost: null },
  { name: 'Clinda', category: 'Medicine', unit: '', cost: null },
  { name: 'Paracetamol', category: 'Medicine', unit: '', cost: null },
  { name: 'Interdental Brush', category: 'Oral care', unit: '', cost: null },
  { name: 'Orthohyl', category: 'Oral care', unit: '', cost: null }, // mouthwash
  { name: 'Povidone Iodine', category: 'Oral care', unit: '', cost: null }, // mouthwash
  { name: 'Aquazone (Ozone Water Irrigation)', category: 'Equipment', unit: '', cost: null }, // machine

  S('Alginate Powder', 'bag'),
  S('Amalgam Alloy'),
  S('Articulating Paper'),
  S('Bonding Agent'),
  S('Composite Resin'),
  S('Cotton Pellets'),
  S('Cotton Rolls', 'pcs'),
  S('Dental Cement'),
  S('Disclosing Solution'),
  S('Disposable Bib', 'pc'),
  S('Disposable Prophy Brush'),
  S('Disposable Prophy Cup'),
  S('EDTA 17%'),
  S('Endodontic Sealer'),
  S('Etching Gel 37%'),
  S('Face Mask', 'pc'),
  S('Fluoride Varnish'),
  S('Gauze Pads 2x2', 'pcs'),
  S('Gauze Pads 4x4'),
  S('Gingival Barrier'),
  S('Gutta Percha Points'),
  S('Hemostatic Agent'),
  S('H-Files (assorted sizes)'),
  S('HVE Tip'),
  S('Hydrogen Peroxide 35%'),
  S('Impression Trays (Lower)', 'pc'),
  S('Impression Trays (Upper)', 'pc'),
  S('K-Files (assorted sizes)'),
  S('Latex Gloves', 'pair'),
  S('Lidocaine 2% w/ Epi (1:100,000)'),
  S('Matrix Strip'),
  S('NaOCl 5.25% (Sodium Hypochlorite)'),
  S('Paper Points'),
  S('Pit & Fissure Sealant'),
  S('Prophylaxis Paste'),
  S('Pumice Powder'),
  S('Rubber Dam Sheet'),
  S('Saliva Ejector Tip'),
  S('Sealant Applicator Tips'),
  S('Suture Thread'),
  S('Suture Thread 3-0'),
  S('Temporary Restoration Material'),
];
