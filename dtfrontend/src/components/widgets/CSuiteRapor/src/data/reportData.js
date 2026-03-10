/**
 * Hardcoded constants for the report.
 * - companies:           dropdown list (provided directly, not from DB)
 * - tedarikciLabels:     category names for "Tedarikçi Kapasite Analizi"
 * - aselsanDurmaLabels:  category names for "Aselsan Kaynaklı Durma"
 *
 * Numeric values (value, trend, etc.) still come from the database via the API.
 */

export const companies = [
  'Tüm Şirketler',
  'Anadolu Holding',
  'Türk Telekom',
  'Arçelik A.Ş.',
  'Vestel Elektronik',
  'Ford Otosan',
];

export const tedarikciLabels = [
  'Talaşlı İmalat',
  'Kablaj/EMM',
  'Kart Dizgi',
];

export const aselsanDurmaLabels = [
  'Talaşlı İmalat',
  'Kablaj/EMM',
  'Kart Dizgi',
];
