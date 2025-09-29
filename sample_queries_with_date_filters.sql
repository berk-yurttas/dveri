-- Sample ClickHouse queries with TestBaslangicTarih filters

-- 1. Filter for tests started in the last 30 days
SELECT
    tc.DemirbasNo,
    sum(toSecondsFromHHMMSS(assumeNotNull(tt.TestSuresi))) AS ToplamSureSaniye
FROM REHIS_TestKayit_Test_TabloTestGrup g
LEFT JOIN REHIS_TestKayit_Test_TabloTest tt ON tt.TestGrupID = g.TestGrupID
LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = g.SetupHashID
LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
WHERE tc.CihazID = 14
  AND tt.TestBaslangicTarih >= now() - INTERVAL 30 DAY
  AND tt.TestBaslangicTarih IS NOT NULL
GROUP BY
    tc.DemirbasNo;

-- 2. Filter for tests started between specific dates
SELECT
    tc.DemirbasNo,
    sum(toSecondsFromHHMMSS(assumeNotNull(tt.TestSuresi))) AS ToplamSureSaniye
FROM REHIS_TestKayit_Test_TabloTestGrup g
LEFT JOIN REHIS_TestKayit_Test_TabloTest tt ON tt.TestGrupID = g.TestGrupID
LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = g.SetupHashID
LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
WHERE tc.CihazID = 14
  AND tt.TestBaslangicTarih >= '2024-01-01 00:00:00'
  AND tt.TestBaslangicTarih <= '2024-12-31 23:59:59'
  AND tt.TestBaslangicTarih IS NOT NULL
GROUP BY
    tc.DemirbasNo;

-- 3. Filter for tests started today
SELECT
    tc.DemirbasNo,
    sum(toSecondsFromHHMMSS(assumeNotNull(tt.TestSuresi))) AS ToplamSureSaniye
FROM REHIS_TestKayit_Test_TabloTestGrup g
LEFT JOIN REHIS_TestKayit_Test_TabloTest tt ON tt.TestGrupID = g.TestGrupID
LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = g.SetupHashID
LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
WHERE tc.CihazID = 14
  AND toDate(tt.TestBaslangicTarih) = today()
  AND tt.TestBaslangicTarih IS NOT NULL
GROUP BY
    tc.DemirbasNo;

-- 4. Filter for tests started in current month
SELECT
    tc.DemirbasNo,
    sum(toSecondsFromHHMMSS(assumeNotNull(tt.TestSuresi))) AS ToplamSureSaniye
FROM REHIS_TestKayit_Test_TabloTestGrup g
LEFT JOIN REHIS_TestKayit_Test_TabloTest tt ON tt.TestGrupID = g.TestGrupID
LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = g.SetupHashID
LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
WHERE tc.CihazID = 14
  AND toYYYYMM(tt.TestBaslangicTarih) = toYYYYMM(now())
  AND tt.TestBaslangicTarih IS NOT NULL
GROUP BY
    tc.DemirbasNo;

-- 5. Filter for tests started in current year
SELECT
    tc.DemirbasNo,
    sum(toSecondsFromHHMMSS(assumeNotNull(tt.TestSuresi))) AS ToplamSureSaniye
FROM REHIS_TestKayit_Test_TabloTestGrup g
LEFT JOIN REHIS_TestKayit_Test_TabloTest tt ON tt.TestGrupID = g.TestGrupID
LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = g.SetupHashID
LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
WHERE tc.CihazID = 14
  AND toYear(tt.TestBaslangicTarih) = toYear(now())
  AND tt.TestBaslangicTarih IS NOT NULL
GROUP BY
    tc.DemirbasNo;

-- 6. Parameterized version (most flexible)
SELECT
    tc.DemirbasNo,
    sum(toSecondsFromHHMMSS(assumeNotNull(tt.TestSuresi))) AS ToplamSureSaniye
FROM REHIS_TestKayit_Test_TabloTestGrup g
LEFT JOIN REHIS_TestKayit_Test_TabloTest tt ON tt.TestGrupID = g.TestGrupID
LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = g.SetupHashID
LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
WHERE tc.CihazID = 14
  AND tt.TestBaslangicTarih >= {start_date:DateTime64}
  AND tt.TestBaslangicTarih <= {end_date:DateTime64}
  AND tt.TestBaslangicTarih IS NOT NULL
GROUP BY
    tc.DemirbasNo;
