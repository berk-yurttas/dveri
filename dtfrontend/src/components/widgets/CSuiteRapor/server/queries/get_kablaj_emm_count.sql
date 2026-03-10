SELECT COUNT(DISTINCT kalem_adi) AS count
FROM uretim_kalemleri
WHERE company_id = $1 AND kategori = 'Kablaj/EMM';
