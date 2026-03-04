-- Create personel schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'personel')
BEGIN
    EXEC('CREATE SCHEMA personel')
END
GO

-- Create personel_count table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'personel_count' AND schema_id = SCHEMA_ID('personel'))
BEGIN
    CREATE TABLE personel.personel_count (
        id INT IDENTITY(1,1) PRIMARY KEY,
        firma_adi NVARCHAR(100) NOT NULL,
        ust_birim NVARCHAR(100) NOT NULL,
        birim NVARCHAR(100) NULL,
        personel_sayisi INT NOT NULL,
        created_at DATETIME DEFAULT GETDATE()
    )
END
GO

-- Create index for better query performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_personel_count_firma_adi' AND object_id = OBJECT_ID('personel.personel_count'))
BEGIN
    CREATE INDEX IX_personel_count_firma_adi ON personel.personel_count(firma_adi)
END
GO
