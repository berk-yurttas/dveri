-- Dizgi Hattı: aggregate ALL firma rows (used when "Tüm Şirketler")
SELECT eksen_sayisi, SUM(amount) AS amount
FROM dizgi_hatti
GROUP BY eksen_sayisi
ORDER BY eksen_sayisi;

