-- CMM: aggregate ALL firma rows (used when "Tüm Şirketler" is selected)
SELECT eksen_sayisi, SUM(amount) AS amount
FROM cmm_sayisi
GROUP BY eksen_sayisi
ORDER BY eksen_sayisi;


