SELECT name, value, unit, trend
FROM aselsan_kaynakli_durma
WHERE company_id = $1
ORDER BY id;

