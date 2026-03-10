SELECT name, value, unit, trend
FROM tedarikci_kapasite
WHERE company_id = $1
ORDER BY id;

