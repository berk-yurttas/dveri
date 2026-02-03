-- MS SQL Server Table Creation Script
-- Based on REHIS test data structure from ClickHouse schema and widget queries

-- ==========================================
-- REHIS_TestTanim_Test Database Tables
-- ==========================================

USE REHIS_TestTanim_Test;
GO

-- Table: TabloUrun (Products)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloUrun]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloUrun] (
    [UrunID] INT PRIMARY KEY,
    [StokNo] NVARCHAR(50) NOT NULL,
    [Tanim] NVARCHAR(255),
    [UDKNo] NVARCHAR(50)
);
END
GO

-- Table: TabloPersonel (Personnel)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloPersonel]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloPersonel] (
    [PersonelID] INT PRIMARY KEY,
    [Sicil] NVARCHAR(20) NOT NULL,
    [Ad] NVARCHAR(100),
    [Soyad] NVARCHAR(100),
    [Firma] NVARCHAR(100),
    [PCKullaniciAdi] NVARCHAR(100)
);
END
GO

-- Table: TabloPC (Computers)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloPC]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloPC] (
    [PCID] INT PRIMARY KEY,
    [PCAdi] NVARCHAR(100) NOT NULL,
    [OsKacBit] NVARCHAR(10),
    [OsVersiyon] NVARCHAR(100)
);
END
GO

-- Table: TabloTestCihaz (Test Devices)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTestCihaz]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTestCihaz] (
    [CihazID] INT PRIMARY KEY,
    [DemirbasNo] NVARCHAR(50) NOT NULL,
    [KalibrasyonBitis] DATE,
    [CihazTipi] NVARCHAR(100),
    [CihazModeli] NVARCHAR(100)
);
END
GO

-- Table: TabloTestYonetimYazilimi (Test Management Software)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTestYonetimYazilimi]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTestYonetimYazilimi] (
    [TYYID] INT PRIMARY KEY,
    [TYYStok] NVARCHAR(50) NOT NULL,
    [TYYTanim] NVARCHAR(255),
    [TYYVersiyon] NVARCHAR(50)
);
END
GO

-- Table: TabloTestYazilimi (Test Software)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTestYazilimi]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTestYazilimi] (
    [TestYazilimID] INT PRIMARY KEY,
    [TestYazilimStokNo] NVARCHAR(50) NOT NULL,
    [TestYazilimTanimi] NVARCHAR(255),
    [TestYazilimVersiyon] NVARCHAR(50),
    [TestTasarlayanKullaniciAdi] NVARCHAR(100),
    [TYYID] INT
);
END
GO

-- Table: TabloTestPlan (Test Plan)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTestPlan]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTestPlan] (
    [TPAdimID] INT PRIMARY KEY,
    [TPHashID] INT,
    [SurecAdi] NVARCHAR(255),
    [SurecDurum] NVARCHAR(100),
    [TestAdi] NVARCHAR(255) NOT NULL,
    [TestDurum] NVARCHAR(100),
    [OlcumYeri] NVARCHAR(255),
    [AltLimit] NVARCHAR(50),
    [UstLimit] NVARCHAR(50),
    [Birim] NVARCHAR(50),
    [VeriTipi] NVARCHAR(50)
);
END
GO

-- ==========================================
-- REHIS_TestKayit_Test Database Tables
-- ==========================================

USE REHIS_TestKayit_Test;
GO

-- Table: TabloHash (Hash values)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloHash]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloHash] (
    [HashID] INT PRIMARY KEY,
    [Hash] NVARCHAR(255) NOT NULL
);
END
GO

-- Table: TabloIsEmri (Work Orders)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloIsEmri]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloIsEmri] (
    [IsEmriID] INT PRIMARY KEY,
    [IsEmriNo] NVARCHAR(50) NOT NULL,
    [BildirimNo] NVARCHAR(50)
);
END
GO

-- Table: TabloTEU (Test Equipment Under Test - Serial Numbers)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTEU]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTEU] (
    [TEUID] INT PRIMARY KEY,
    [UrunID] INT NOT NULL,
    [SeriNo] NVARCHAR(100) NOT NULL,
    [IsEmriNo] NVARCHAR(50)
);
END
GO

-- Table: TabloPCSetup (PC Setup)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloPCSetup]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloPCSetup] (
    [PCID] INT NOT NULL,
    [SetupHashID] INT NOT NULL,
    PRIMARY KEY ([PCID], [SetupHashID])
);
END
GO

-- Table: TabloTestCihazSetup (Test Device Setup)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTestCihazSetup]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTestCihazSetup] (
    [CihazID] INT NOT NULL,
    [SetupHashID] INT NOT NULL,
    [Alias] NVARCHAR(100),
    PRIMARY KEY ([CihazID], [SetupHashID])
);
END
GO

-- Table: TabloTestYazilimSetup (Test Software Setup)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTestYazilimSetup]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTestYazilimSetup] (
    [TestYazilimID] INT NOT NULL,
    [SetupHashID] INT NOT NULL,
    PRIMARY KEY ([TestYazilimID], [SetupHashID])
);
END
GO

-- Table: TabloTestGrup (Test Groups)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTestGrup]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTestGrup] (
    [TestGrupID] INT PRIMARY KEY,
    [SetupHashID] INT,
    [TPHashID] INT,
    [TEUID] INT NOT NULL,
    [PersonelID] INT,
    [TestModu] NVARCHAR(50),
    [SurecAdi] NVARCHAR(255),
    [SurecDurum] NVARCHAR(100),
    [BitisTarihi] DATETIME,
    [YuklenmeTarihi] DATETIME,
    [ToplamSure] NVARCHAR(20),
    [GenelGectiKaldi] NVARCHAR(50)
);
END
GO

-- Table: TabloTest (Tests)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTest]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTest] (
    [TestID] INT PRIMARY KEY,
    [TestGrupID] INT NOT NULL,
    [TestAdi] NVARCHAR(255) NOT NULL,
    [TestBaslangicTarihi] DATETIME,
    [TestSuresi] NVARCHAR(20),
    [TestGectiKaldi] NVARCHAR(50)
);
END
GO

-- Add index on TestBaslangicTarihi for better query performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TabloTest_TestBaslangicTarihi' AND object_id = OBJECT_ID('[dbo].[TabloTest]'))
BEGIN
CREATE INDEX IX_TabloTest_TestBaslangicTarihi ON [dbo].[TabloTest]([TestBaslangicTarihi]);
END
GO

-- Add index on TestAdi for better query performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TabloTest_TestAdi' AND object_id = OBJECT_ID('[dbo].[TabloTest]'))
BEGIN
CREATE INDEX IX_TabloTest_TestAdi ON [dbo].[TabloTest]([TestAdi]);
END
GO

-- Table: TabloTestAdimi (Test Steps - Measurements)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloTestAdimi]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloTestAdimi] (
    [TPAdimID] INT NOT NULL,
    [TestID] INT NOT NULL,
    [OlculenDeger] NVARCHAR(100),
    [TestAdimiGectiKaldi] NVARCHAR(50),
    [SonucOzetHashID] INT,
    PRIMARY KEY ([TPAdimID], [TestID])
);
END
GO

-- Table: TabloLog (Logs)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TabloLog]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[TabloLog] (
    [Id] INT PRIMARY KEY,
    [Date] DATETIME NOT NULL,
    [LogLevel] NVARCHAR(50),
    [Message] NVARCHAR(MAX),
    [LogSource] NVARCHAR(255),
    [TPAdminID] INT
);
END
GO

PRINT 'All REHIS tables created successfully!';
GO
