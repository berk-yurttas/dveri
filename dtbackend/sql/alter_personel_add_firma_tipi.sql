-- Add firma_tipi column to personel_count table
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('personel.personel_count') 
    AND name = 'firma_tipi'
)
BEGIN
    ALTER TABLE personel.personel_count
    ADD firma_tipi NVARCHAR(20) NULL
END
GO

-- Update existing records to have a default value (if any exist)
UPDATE personel.personel_count
SET firma_tipi = 'kablaj'
WHERE firma_tipi IS NULL
GO

-- Create index for better query performance on firma_tipi
IF NOT EXISTS (
    SELECT * FROM sys.indexes 
    WHERE name = 'IX_personel_count_firma_tipi' 
    AND object_id = OBJECT_ID('personel.personel_count')
)
BEGIN
    CREATE INDEX IX_personel_count_firma_tipi ON personel.personel_count(firma_tipi)
END
GO
