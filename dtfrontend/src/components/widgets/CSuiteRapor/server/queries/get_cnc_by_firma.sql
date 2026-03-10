-- CNC: aggregate for a specific firma
SELECT eksen_sayisi, SUM(amount) AS amount
FROM cnc_sayisi
WHERE firma = $1
GROUP BY eksen_sayisi
ORDER BY eksen_sayisi;


