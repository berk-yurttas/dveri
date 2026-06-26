-- Seed urunum_nerede_mes_sources (run after Alembic migration d5e6f7a8b9c0).
-- `company` MUST match the Hedef Firma name in company_integrations.company.
-- filter_column/filter_value are optional (NULL = no base filter).
-- Adjust company names / table names / filters to the live environment.

INSERT INTO urunum_nerede_mes_sources (company, table_name, filter_column, filter_value)
VALUES
    ('Bosan',    'Mes_ProductionOrders_bosan',    NULL, NULL),
    ('Mekasan',  'Mes_ProductionOrders_mekasan',  NULL, NULL),
    ('Teknopar', 'Mes_ProductionOrders_teknopar', NULL, NULL)
ON CONFLICT (company) DO UPDATE
    SET table_name = EXCLUDED.table_name,
        filter_column = EXCLUDED.filter_column,
        filter_value = EXCLUDED.filter_value;
