-- Alt Yapı Kapsamı: sum for a specific firma
SELECT SUM(amount) AS amount
FROM alt_yapi_kapsami
WHERE firma = $1;

