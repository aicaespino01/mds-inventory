// App settings.
// FIREBASE_CONFIG is filled in after the Firebase setup.
// While it is null the app runs in DEMO MODE: data is saved only on this device.
// The Firebase web config is meant to be public; the data is protected by logins + firestore.rules.

export const FIREBASE_CONFIG = null;

export const APP_NAME = 'MDS Inventory';
export const CLINIC_NAME = 'MDS Dental & Aesthetics Clinic';
export const APP_VERSION = '1.0.1';

// Warn this many days before an item expires.
export const EXPIRY_WARN_DAYS = 60;
