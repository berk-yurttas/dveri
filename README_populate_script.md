# ClickHouse Table Population Script

This script populates the REHIS test management system tables in ClickHouse with realistic sample data.

## Prerequisites

1. ClickHouse server running and accessible
2. Tables created using the `clickhouse.sql` file
3. Python 3.6+ installed

## Installation

1. Install the required dependencies:
```bash
pip install -r populate_requirements.txt
```

## Usage

### Basic Usage
```bash
python populate_clickhouse_tables.py
```

### Configuration

The script uses default ClickHouse connection settings:
- Host: localhost
- Port: 9000
- Database: default
- User: default
- Password: (empty)

To modify these settings, edit the `CLICKHOUSE_CONFIG` dictionary in the `main()` function:

```python
CLICKHOUSE_CONFIG = {
    'host': 'your_host',
    'port': 9000,
    'database': 'your_database',
    'user': 'your_user',
    'password': 'your_password'
}
```

### Data Generation Configuration

You can modify the number of records generated for each table by editing the `config` dictionary in the `ClickHouseDataGenerator` class:

```python
self.config = {
    'urun_count': 50,        # Number of products
    'personel_count': 20,    # Number of personnel
    'pc_count': 10,          # Number of PCs
    'cihaz_count': 15,       # Number of test devices
    'test_count': 1000,      # Number of tests
    # ... etc
}
```

## Generated Data

The script generates realistic sample data for all 17 tables in the REHIS system:

### Definition Tables (TestTanim)
- **TabloUrun**: Product definitions with stock numbers and descriptions
- **TabloPersonel**: Personnel with Turkish names, employee IDs, and companies
- **TabloPC**: Test PCs with OS information
- **TabloTestCihaz**: Test devices with calibration dates and models
- **TabloTestPlan**: Test plans with measurement parameters and limits
- **TabloTestYazilimi**: Test software definitions
- **TabloTestYonetimYazilimi**: Test management software

### Test Recording Tables (TestKayit)
- **TabloTest**: Individual test executions
- **TabloTestGrup**: Test groups with execution details
- **TabloTestAdimi**: Test step results with measured values
- **TabloHash**: Hash values for data integrity
- **TabloIsEmri**: Work orders
- **TabloLog**: System logs with different severity levels
- **TabloTEU**: Test equipment under test
- **TabloPCSetup**: PC setup configurations
- **TabloTestCihazSetup**: Test device setup configurations
- **TabloTestYazilimSetup**: Test software setup configurations

## Data Relationships

The script respects all foreign key relationships and populates tables in the correct dependency order:

1. Base definition tables (no dependencies)
2. Tables with single dependencies
3. Setup and configuration tables
4. Test execution tables
5. Logging tables

## Sample Data Features

- **Turkish Context**: Uses Turkish names, companies, and terminology
- **Realistic Values**: Generates appropriate test measurements, dates, and durations
- **Proper Relationships**: Maintains referential integrity between related tables
- **Configurable Volume**: Easy to adjust the number of records per table
- **Error Handling**: Includes connection testing and error reporting

## Output

The script provides detailed progress information and a summary of generated records:

```
ClickHouse Table Population Script
==================================================
Testing ClickHouse connection...
Connection successful: [(1,)]
Starting to populate ClickHouse tables...
==================================================
Populating Urun table...
Populating Personel table...
...
==================================================
All tables populated successfully!

Summary of generated records:
  Urun: 50 records
  Personel: 20 records
  PC: 10 records
  ...
```

## Troubleshooting

### Connection Issues
- Verify ClickHouse server is running
- Check host, port, and credentials
- Ensure network connectivity

### Table Not Found Errors
- Run the `clickhouse.sql` script first to create tables
- Verify you're connecting to the correct database

### Permission Issues
- Ensure the user has INSERT permissions on all tables
- Check database access rights

## Customization

The script is designed to be easily customizable:

1. **Add new sample data**: Modify the `sample_data` dictionary
2. **Change data patterns**: Update the generation logic in individual populate methods
3. **Adjust relationships**: Modify the foreign key generation logic
4. **Add validation**: Include data validation before insertion

## License

This script is provided as-is for populating test data in REHIS ClickHouse tables.
