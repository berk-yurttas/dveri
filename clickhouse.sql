-- 1. REHIS_TestKayit_Test_TabloTest
CREATE TABLE REHIS_TestKayit_Test_TabloTest
(
    TestID Int64,
    TestGrupID Int64,
    TestAdi String,
    TestBaslangicTarihi Nullable(DateTime64(3)),
    TestSuresi Nullable(String),
    TestGectiKaldi String
)
ENGINE = MergeTree
ORDER BY TestID;

-- 1. REHIS_TestKayit_Test_TabloTestGrup
CREATE TABLE REHIS_TestKayit_Test_TabloTestGrup
(
    TestGrupID Int64,
    SetupHashID Int64,
    TPHashID Int64,
    TEUID Int64,
    PersonelID Int64,
    TestModu String,
    SurecAdi String,
    SurecDurum String,
    BitisTarihi DateTime64(3),
    YuklenmeTarihi Nullable(DateTime64(3)),
    ToplamSure String,
    GenelGectiKaldi String
)
ENGINE = MergeTree
ORDER BY TestGrupID;

-- 2. REHIS_TestKayit_Test_TabloHash
CREATE TABLE REHIS_TestKayit_Test_TabloHash
(
    HashID Int64,
    Hash String
)
ENGINE = MergeTree
ORDER BY HashID;

-- 3. REHIS_TestKayit_Test_TabloIsEmri
CREATE TABLE REHIS_TestKayit_Test_TabloIsEmri
(
    IsEmriID Int64,
    IsEmriNo String,
    BildirimNo Nullable(String)
)
ENGINE = MergeTree
ORDER BY IsEmriID;

-- 4. REHIS_TestKayit_Test_TabloLog
CREATE TABLE REHIS_TestKayit_Test_TabloLog
(
    Id Int32,
    Date DateTime64(3),
    LogLevel String,
    Message String,
    LogSource String,
    TPAdimID Nullable(Int64)
)
ENGINE = MergeTree
ORDER BY Id;

-- 5. REHIS_TestKayit_Test_TabloPCSetup
CREATE TABLE REHIS_TestKayit_Test_TabloPCSetup
(
    PCID Int64,
    SetupHashID Int64
)
ENGINE = MergeTree
ORDER BY PCID;

-- 6. REHIS_TestKayit_Test_TabloTEU
CREATE TABLE REHIS_TestKayit_Test_TabloTEU
(
    TEUID Int64,
    UrunID Int64,
    SeriNo String,
    IsEmriNo String
)
ENGINE = MergeTree
ORDER BY TEUID;

-- 7. REHIS_TestKayit_Test_TabloTestAdimi
CREATE TABLE REHIS_TestKayit_Test_TabloTestAdimi
(
    TPAdimID Int64,
    TestID Int64,
    OlculenDeger String,
    TestAdimiGectiKaldi Nullable(String),
    SonucOzetHashID Nullable(Int64)
)
ENGINE = MergeTree
ORDER BY TPAdimID;

-- 1. REHIS_TestKayit_Test_TabloTestCihazSetup
CREATE TABLE REHIS_TestKayit_Test_TabloTestCihazSetup
(
    CihazID Int64,
    SetupHashID Int64,
    Alias Nullable(String)
)
ENGINE = MergeTree
ORDER BY CihazID;

-- 2. REHIS_TestKayit_Test_TabloTestYazilimSetup
CREATE TABLE REHIS_TestKayit_Test_TabloTestYazilimSetup
(
    TestYazilimID Int64,
    SetupHashID Int64
)
ENGINE = MergeTree
ORDER BY TestYazilimID;

-- 3. REHIS_TestTanim_Test_TabloPC
CREATE TABLE REHIS_TestTanim_Test_TabloPC
(
    PCID Int64,
    PCAdi String,
    OsKacBit String,
    OsVersiyon String
)
ENGINE = MergeTree
ORDER BY PCID;

-- 4. REHIS_TestTanim_Test_TabloPersonel
CREATE TABLE REHIS_TestTanim_Test_TabloPersonel
(
    PersonelID Int64,
    Sicil String,
    Ad String,
    Soyad String,
    Firma String,
    PCKullaniciAdi String
)
ENGINE = MergeTree
ORDER BY PersonelID;

-- 5. REHIS_TestTanim_Test_TabloTestCihaz
CREATE TABLE REHIS_TestTanim_Test_TabloTestCihaz
(
    CihazID Int64,
    DemirbasNo String,
    KalibrasyonBitis Date,
    CihazTipi String,
    CihazModeli String
)
ENGINE = MergeTree
ORDER BY CihazID;

-- 6. REHIS_TestTanim_Test_TabloTestPlan
CREATE TABLE REHIS_TestTanim_Test_TabloTestPlan
(
    TPAdimID Int64,
    TPHashID Int64,
    SurecAdi String,
    SurecDurum Nullable(String),
    TestAdi String,
    TestDurum Nullable(String),
    OlcumYeri String,
    AltLimit Nullable(String),
    UstLimit Nullable(String),
    Birim Nullable(String),
    VeriTipi Nullable(String)
)
ENGINE = MergeTree
ORDER BY TPAdimID;

-- 7. REHIS_TestTanim_Test_TabloTestYazilimi
CREATE TABLE REHIS_TestTanim_Test_TabloTestYazilimi
(
    TestYazilimID Int64,
    TestYazilimStokNo String,
    TestYazilimTanimi String,
    TestYazilimVersiyon String,
    TestTasarlayanKullaniciAdi String,
    TYYID Int64
)
ENGINE = MergeTree
ORDER BY TestYazilimID;

-- 8. REHIS_TestTanim_Test_TabloTestYonetimYazilimi
CREATE TABLE REHIS_TestTanim_Test_TabloTestYonetimYazilimi
(
    TYYID Int64,
    TYYStok String,
    TYYTanim String,
    TYYVersiyon String
)
ENGINE = MergeTree
ORDER BY TYYID;

-- 9. REHIS_TestTanim_Test_TabloUrun
CREATE TABLE REHIS_TestTanim_Test_TabloUrun
(
    UrunID Int64,
    StokNo String,
    Tanim String,
    UDKNo String
)
ENGINE = MergeTree
ORDER BY UrunID;
