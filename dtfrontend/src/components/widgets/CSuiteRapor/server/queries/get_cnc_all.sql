-- CNC: aggregate ALL firma rows (used when "Tüm Şirketler" is selected)
SELECT eksen_sayisi, SUM(amount) AS amount
FROM cnc_sayisi
GROUP BY eksen_sayisi
ORDER BY eksen_sayisi;


