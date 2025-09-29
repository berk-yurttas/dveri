#!/usr/bin/env python3
"""
Script to populate ClickHouse tables with sample data for REHIS test management system.
This script generates realistic sample data for all tables defined in clickhouse.sql.
"""

import random
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Any
import uuid

try:
    from clickhouse_driver import Client
except ImportError:
    print("clickhouse-driver not found. Install with: pip install clickhouse-driver")
    exit(1)


class ClickHouseDataGenerator:
    def __init__(self, host='localhost', port=9000, database='default', user='default', password=''):
        """Initialize the ClickHouse client and data generators."""
        self.client = Client(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password
        )
        
        # Batch size for bulk inserts to improve performance
        self.batch_size = 1000
        
        # Configuration for number of records to generate
        self.config = {
            'urun_count': 500,           # Increased from 50 to 500
            'personel_count': 100,       # Increased from 20 to 100
            'pc_count': 50,              # Increased from 10 to 50
            'cihaz_count': 150,          # Increased from 15 to 150
            'tyy_count': 25,             # Increased from 5 to 25
            'test_yazilim_count': 100,   # Increased from 10 to 100
            'hash_count': 10000,         # Increased from 100 to 10,000
            'is_emri_count': 1000,       # Increased from 30 to 1,000
            'teu_count': 5000,           # Increased from 100 to 5,000
            'test_plan_count': 2000,     # Increased from 50 to 2,000
            'setup_count': 1000,         # Increased from 25 to 1,000
            'test_grup_count': 50000,    # Increased from 200 to 50,000
            'test_count': 500000,        # Increased from 1,000 to 500,000
            'log_count': 100000,         # Increased from 500 to 100,000
            'tests_per_teu': 10          # Multiple tests per TEU
        }
        
        # Sample data for realistic generation
        self.sample_data = {
            'turkish_names': ['Ahmet', 'Mehmet', 'Ali', 'Ayşe', 'Fatma', 'Hatice', 'Mustafa', 'Hüseyin', 'İbrahim', 'Zeynep'],
            'turkish_surnames': ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Özkan', 'Aydın', 'Özdemir', 'Arslan', 'Doğan'],
            'companies': ['ASELSAN', 'ROKETSAN', 'TAI', 'HAVELSAN', 'STM', 'FNSS', 'BMC', 'OTOKAR'],
            'test_modes': ['Manual', 'Automatic', 'Semi-Automatic'],
            'process_names': ['Fonksiyon Testi', 'Performans Testi', 'Dayanıklılık Testi', 'Çevre Testi', 'EMC Testi'],
            'process_status': ['Başarılı', 'Başarısız', 'Kısmi', 'İptal'],
            'test_names': ['Gerilim Testi', 'Akım Testi', 'Frekans Testi', 'Sıcaklık Testi', 'Titreşim Testi'],
            'device_types': ['Multimetre', 'Osiloskop', 'Güç Kaynağı', 'Frekans Sayacı', 'Spektrum Analizörü'],
            'device_models': ['Keysight 34465A', 'Tektronix MSO64', 'Rohde&Schwarz NGM202', 'Agilent 53230A'],
            'os_versions': ['Windows 10 Pro', 'Windows 11 Pro', 'Ubuntu 20.04', 'CentOS 8'],
            'log_levels': ['INFO', 'WARNING', 'ERROR', 'DEBUG', 'CRITICAL']
        }

    def generate_hash(self, input_string: str = None) -> str:
        """Generate a hash string."""
        if input_string is None:
            input_string = str(uuid.uuid4())
        return hashlib.md5(input_string.encode()).hexdigest()

    def generate_datetime(self, start_days_ago: int = 365, end_days_ago: int = 0) -> datetime:
        """Generate a random datetime within the specified range."""
        start_date = datetime.now() - timedelta(days=start_days_ago)
        end_date = datetime.now() - timedelta(days=end_days_ago)
        time_between = end_date - start_date
        days_between = time_between.days
        random_days = random.randrange(days_between + 1)
        random_seconds = random.randrange(86400)  # seconds in a day
        return start_date + timedelta(days=random_days, seconds=random_seconds)

    def batch_insert(self, table_name: str, data: List[tuple], batch_size: int = None):
        """Insert data in batches for better performance with large datasets."""
        if batch_size is None:
            batch_size = self.batch_size
            
        total_records = len(data)
        print(f"  Inserting {total_records} records in batches of {batch_size}...")
        
        for i in range(0, total_records, batch_size):
            batch = data[i:i + batch_size]
            self.client.execute(f"INSERT INTO {table_name} VALUES", batch)
            
            if i + batch_size < total_records:
                print(f"    Progress: {i + batch_size}/{total_records} ({((i + batch_size)/total_records)*100:.1f}%)")
            else:
                print(f"    Completed: {total_records}/{total_records} (100.0%)")

    def populate_urun_table(self):
        """Populate REHIS_TestTanim_Test_TabloUrun table."""
        print("Populating Urun table...")
        data = []
        for i in range(1, self.config['urun_count'] + 1):
            data.append((
                i,  # UrunID
                f"STK-{i:05d}",  # StokNo
                f"Ürün {i} - Test Cihazı",  # Tanim
                f"UDK-{i:04d}"  # UDKNo
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloUrun VALUES",
            data
        )

    def populate_personel_table(self):
        """Populate REHIS_TestTanim_Test_TabloPersonel table."""
        print("Populating Personel table...")
        data = []
        for i in range(1, self.config['personel_count'] + 1):
            name = random.choice(self.sample_data['turkish_names'])
            surname = random.choice(self.sample_data['turkish_surnames'])
            company = random.choice(self.sample_data['companies'])
            
            data.append((
                i,  # PersonelID
                f"{i:06d}",  # Sicil
                name,  # Ad
                surname,  # Soyad
                company,  # Firma
                f"{name.lower()}.{surname.lower()}"  # PCKullaniciAdi
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloPersonel VALUES",
            data
        )

    def populate_pc_table(self):
        """Populate REHIS_TestTanim_Test_TabloPC table."""
        print("Populating PC table...")
        data = []
        for i in range(1, self.config['pc_count'] + 1):
            os_version = random.choice(self.sample_data['os_versions'])
            bit_version = random.choice(['64-bit', '32-bit'])
            
            data.append((
                i,  # PCID
                f"PC-TEST-{i:03d}",  # PCAdi
                bit_version,  # OsKacBit
                os_version  # OsVersiyon
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloPC VALUES",
            data
        )

    def populate_test_cihaz_table(self):
        """Populate REHIS_TestTanim_Test_TabloTestCihaz table."""
        print("Populating TestCihaz table...")
        data = []
        for i in range(1, self.config['cihaz_count'] + 1):
            device_type = random.choice(self.sample_data['device_types'])
            device_model = random.choice(self.sample_data['device_models'])
            calibration_end = (datetime.now() + timedelta(days=random.randint(30, 365))).date()
            
            data.append((
                i,  # CihazID
                f"DMB-{i:06d}",  # DemirbasNo
                calibration_end,  # KalibrasyonBitis
                device_type,  # CihazTipi
                device_model  # CihazModeli
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloTestCihaz VALUES",
            data
        )

    def populate_tyy_table(self):
        """Populate REHIS_TestTanim_Test_TabloTestYonetimYazilimi table."""
        print("Populating TestYonetimYazilimi table...")
        data = []
        for i in range(1, self.config['tyy_count'] + 1):
            data.append((
                i,  # TYYID
                f"TYY-{i:03d}",  # TYYStok
                f"Test Yönetim Yazılımı {i}",  # TYYTanim
                f"v{random.randint(1,5)}.{random.randint(0,9)}.{random.randint(0,9)}"  # TYYVersiyon
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloTestYonetimYazilimi VALUES",
            data
        )

    def populate_hash_table(self):
        """Populate REHIS_TestKayit_Test_TabloHash table."""
        print("Populating Hash table...")
        data = []
        for i in range(1, self.config['hash_count'] + 1):
            data.append((
                i,  # HashID
                self.generate_hash(f"hash_{i}")  # Hash
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloHash VALUES",
            data
        )

    def populate_is_emri_table(self):
        """Populate REHIS_TestKayit_Test_TabloIsEmri table."""
        print("Populating IsEmri table...")
        data = []
        for i in range(1, self.config['is_emri_count'] + 1):
            bildirim_no = f"BLD-{i:06d}"  # Always provide a value, no nulls

            data.append((
                i,  # IsEmriID
                f"IE-{i:08d}",  # IsEmriNo
                bildirim_no  # BildirimNo
            ))

        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloIsEmri VALUES",
            data
        )

    def populate_test_yazilimi_table(self):
        """Populate REHIS_TestTanim_Test_TabloTestYazilimi table."""
        print("Populating TestYazilimi table...")
        data = []
        for i in range(1, self.config['test_yazilim_count'] + 1):
            tyy_id = random.randint(1, self.config['tyy_count'])
            
            data.append((
                i,  # TestYazilimID
                f"TY-{i:05d}",  # TestYazilimStokNo
                f"Test Yazılımı {i} - Fonksiyon Testi",  # TestYazilimTanimi
                f"v{random.randint(1,3)}.{random.randint(0,9)}",  # TestYazilimVersiyon
                f"tasarimci{i}",  # TestTasarlayanKullaniciAdi
                tyy_id  # TYYID
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloTestYazilimi VALUES",
            data
        )

    def populate_teu_table(self):
        """Populate REHIS_TestKayit_Test_TabloTEU table."""
        print("Populating TEU table...")
        data = []
        for i in range(1, self.config['teu_count'] + 1):
            urun_id = random.randint(1, self.config['urun_count'])
            
            data.append((
                i,  # TEUID
                urun_id,  # UrunID
                f"SN{i:08d}"  # SeriNo
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTEU VALUES",
            data
        )

    def populate_test_plan_table(self):
        """Populate REHIS_TestTanim_Test_TabloTestPlan table."""
        print("Populating TestPlan table...")
        data = []
        for i in range(1, self.config['test_plan_count'] + 1):
            tp_hash_id = random.randint(1, self.config['hash_count'])
            process_name = random.choice(self.sample_data['process_names'])
            process_status = random.choice(self.sample_data['process_status'])  # Always provide a value
            test_name = random.choice(self.sample_data['test_names'])
            test_status = random.choice(self.sample_data['process_status'])  # Always provide a value

            # Generate measurement parameters - always provide values
            alt_limit = f"{random.uniform(0, 50):.2f}"
            ust_limit = f"{random.uniform(51, 100):.2f}"
            birim = random.choice(['V', 'A', 'Hz', '°C', 'dB'])
            veri_tipi = random.choice(['Float', 'Integer', 'String'])

            data.append((
                i,  # TPAdimID
                tp_hash_id,  # TPHashID
                process_name,  # SurecAdi
                process_status,  # SurecDurum
                test_name,  # TestAdi
                test_status,  # TestDurum
                f"Ölçüm Noktası {i}",  # OlcumYeri
                alt_limit,  # AltLimit
                ust_limit,  # UstLimit
                birim,  # Birim
                veri_tipi  # VeriTipi
            ))

        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloTestPlan VALUES",
            data
        )

    def populate_setup_tables(self):
        """Populate setup-related tables."""
        print("Populating setup tables...")
        
        # PC Setup
        pc_setup_data = []
        for i in range(1, self.config['setup_count'] + 1):
            pc_id = random.randint(1, self.config['pc_count'])
            setup_hash_id = random.randint(1, self.config['hash_count'])
            pc_setup_data.append((pc_id, setup_hash_id))
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloPCSetup VALUES",
            pc_setup_data
        )
        
        # Test Cihaz Setup
        cihaz_setup_data = []
        for i in range(1, self.config['setup_count'] + 1):
            cihaz_id = random.randint(1, self.config['cihaz_count'])
            setup_hash_id = random.randint(1, self.config['hash_count'])
            alias = f"Alias_{i}"  # Always provide a value, no nulls
            cihaz_setup_data.append((cihaz_id, setup_hash_id, alias))
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTestCihazSetup VALUES",
            cihaz_setup_data
        )
        
        # Test Yazilim Setup
        yazilim_setup_data = []
        for i in range(1, self.config['setup_count'] + 1):
            test_yazilim_id = random.randint(1, self.config['test_yazilim_count'])
            setup_hash_id = random.randint(1, self.config['hash_count'])
            yazilim_setup_data.append((test_yazilim_id, setup_hash_id))
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTestYazilimSetup VALUES",
            yazilim_setup_data
        )

    def populate_test_grup_table(self):
        """Populate REHIS_TestKayit_Test_TabloTestGrup table with multiple groups per TEU."""
        print("Populating TestGrup table...")
        data = []
        test_grup_id = 1

        # Generate multiple test groups for each TEU to ensure proper relationships
        for teu_id in range(1, self.config['teu_count'] + 1):
            # Generate 3-8 test groups per TEU
            groups_for_this_teu = random.randint(3, 8)

            for group_num in range(groups_for_this_teu):
                setup_hash_id = random.randint(1, self.config['hash_count'])
                tp_hash_id = random.randint(1, self.config['hash_count'])
                personel_id = random.randint(1, self.config['personel_count'])
                test_mode = random.choice(self.sample_data['test_modes'])
                process_name = random.choice(self.sample_data['process_names'])
                process_status = random.choice(self.sample_data['process_status'])

                bitis_tarih = self.generate_datetime(30, 0)
                yukleme_tarih = self.generate_datetime(29, 0)  # Always provide a value

                # Generate duration strings in HH:MM:SS format
                toplam_sure = f"{random.randint(0, 23):02d}:{random.randint(0, 59):02d}:{random.randint(0, 59):02d}"
                # Use correct status values: GECTI, KALDI, YAPILMADI, TAMAMLANMADI
                genel_gecik = random.choice(['GECTI', 'KALDI', 'YAPILMADI', 'TAMAMLANMADI'])

                data.append((
                    test_grup_id,  # TestGrupID
                    setup_hash_id,  # SetupHashID
                    tp_hash_id,  # TPHashID
                    teu_id,  # TEUID (ensuring each TEU has multiple groups)
                    personel_id,  # PersonelID
                    test_mode,  # TestModu
                    process_name,  # SurecAdi
                    process_status,  # SurecDurum
                    bitis_tarih,  # BitisTarih
                    yukleme_tarih,  # YuklenmeTarihi
                    toplam_sure,  # ToplamSure
                    genel_gecik  # GenelGecikKaldi
                ))

                test_grup_id += 1
                if test_grup_id > self.config['test_grup_count']:
                    break

            if test_grup_id > self.config['test_grup_count']:
                break

        # Use batch insert for large dataset
        self.batch_insert("REHIS_TestKayit_Test_TabloTestGrup", data)

    def populate_test_table(self):
        """Populate REHIS_TestKayit_Test_TabloTest table with proper relationships to test groups."""
        print("Populating Test table...")
        data = []
        test_id = 1

        # Generate tests for each test group (ensuring proper relationships)
        for test_grup_id in range(1, min(self.config['test_grup_count'], self.config['test_count'] // 3) + 1):
            # Generate 2-5 tests per test group
            tests_for_this_group = random.randint(2, 5)

            for test_num in range(tests_for_this_group):
                test_name = random.choice(self.sample_data['test_names'])

                test_start = self.generate_datetime(30, 0)  # Always provide a value
                # Generate test duration in HH:MM:SS format
                test_duration = f"{random.randint(0, 23):02d}:{random.randint(0, 59):02d}:{random.randint(0, 59):02d}"  # Always provide a value
                # Use correct status values: KALDI, GECTI, YAPILMADI
                test_result = random.choice(['KALDI', 'GECTI', 'YAPILMADI'])

                data.append((
                    test_id,  # TestID
                    test_grup_id,  # TestGrupID (properly linked)
                    test_name,  # TestAdi
                    test_start,  # TestBaslangicTarih
                    test_duration,  # TestSuresi
                    test_result  # TestGectiKladi
                ))

                test_id += 1
                if test_id > self.config['test_count']:
                    break

            if test_id > self.config['test_count']:
                break

        print(f"Generated {test_id - 1} tests linked to {min(self.config['test_grup_count'], self.config['test_count'] // 3)} test groups")

        # Use batch insert for large dataset
        self.batch_insert("REHIS_TestKayit_Test_TabloTest", data)

    def populate_test_adimi_table(self):
        """Populate REHIS_TestKayit_Test_TabloTestAdimi table."""
        print("Populating TestAdimi table...")
        data = []
        for i in range(1, self.config['test_count']):  # Generate test steps
            tp_admin_id = random.randint(1, self.config['test_plan_count'])
            test_id = random.randint(1, self.config['test_count'])
            measured_value = f"{random.uniform(0, 100):.3f}"
            # Use correct status values: GECTI, KALDI, YAPILMADI - always provide a value
            test_result = random.choice(['GECTI', 'KALDI', 'YAPILMADI'])
            sonuc_ozet_hash_id = random.randint(1, self.config['hash_count'])  # Always provide a value

            data.append((
                tp_admin_id,  # TPAdimID (corrected field name)
                test_id,  # TestID
                measured_value,  # OlculenDeger
                test_result,  # TestAdimiGectiKaldi
                sonuc_ozet_hash_id  # SonucOzetHashID
            ))

        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTestAdimi VALUES",
            data
        )

    def populate_log_table(self):
        """Populate REHIS_TestKayit_Test_TabloLog table."""
        print("Populating Log table...")
        data = []
        for i in range(1, self.config['log_count'] + 1):
            log_date = self.generate_datetime(30, 0)
            log_level = random.choice(self.sample_data['log_levels'])
            
            # Generate realistic log messages
            messages = [
                "Test başlatıldı",
                "Cihaz bağlantısı kuruldu",
                "Ölçüm tamamlandı",
                "Test sonucu kaydedildi",
                "Hata: Cihaz yanıt vermiyor",
                "Uyarı: Kalibrasyon süresi dolmak üzere",
                "Test grubu tamamlandı"
            ]
            message = random.choice(messages)
            log_source = f"TestModule_{random.randint(1, 10)}"
            tp_admin_id = random.randint(1, self.config['test_plan_count'])  # Always provide a value

            data.append((
                i,  # Id
                log_date,  # Date
                log_level,  # LogLevel
                message,  # Message
                log_source,  # LogSource
                tp_admin_id  # TPAdminID
            ))
        
        # Use batch insert for large dataset
        self.batch_insert("REHIS_TestKayit_Test_TabloLog", data)

    def populate_all_tables(self):
        """Populate all tables in the correct dependency order."""
        print("Starting to populate ClickHouse tables...")
        print("=" * 50)
        
        try:
            # Level 1: Base tables (no dependencies)
            self.populate_urun_table()
            self.populate_personel_table()
            self.populate_pc_table()
            self.populate_test_cihaz_table()
            self.populate_tyy_table()
            self.populate_hash_table()
            self.populate_is_emri_table()
            
            # Level 2: Tables with single dependencies
            self.populate_test_yazilimi_table()
            self.populate_teu_table()
            self.populate_test_plan_table()
            
            # Level 3: Setup tables
            self.populate_setup_tables()
            
            # Level 4: Test execution tables
            self.populate_test_grup_table()
            self.populate_test_table()
            self.populate_test_adimi_table()
            
            # Level 5: Logging
            self.populate_log_table()
            
            print("=" * 50)
            print("All tables populated successfully!")
            
            # Print summary
            print("\nSummary of generated records:")
            for table_name, count_key in [
                ("Urun", "urun_count"),
                ("Personel", "personel_count"),
                ("PC", "pc_count"),
                ("TestCihaz", "cihaz_count"),
                ("TestYonetimYazilimi", "tyy_count"),
                ("Hash", "hash_count"),
                ("IsEmri", "is_emri_count"),
                ("TestYazilimi", "test_yazilim_count"),
                ("TEU", "teu_count"),
                ("TestPlan", "test_plan_count"),
                ("Setup tables", "setup_count"),
                ("TestGrup", "test_grup_count"),
                ("Test", "test_count"),
                ("Log", "log_count")
            ]:
                print(f"  {table_name}: {self.config[count_key]} records")
            
        except Exception as e:
            print(f"Error occurred: {e}")
            raise


def main():
    """Main function to run the data population script."""
    print("ClickHouse Table Population Script")
    print("=" * 50)
    
    # Configuration - modify these values as needed
    CLICKHOUSE_CONFIG = {
        'host': 'localhost',
        'port': 9000,  # Native TCP port for clickhouse-driver
        'database': 'default',
        'user': 'default',
        'password': 'ClickHouse@2024'
    }
    
    try:
        # Initialize the data generator
        generator = ClickHouseDataGenerator(**CLICKHOUSE_CONFIG)
        
        # Test connection
        print("Testing ClickHouse connection...")
        result = generator.client.execute("SELECT 1")
        print(f"Connection successful: {result}")
        
        # Populate all tables
        generator.populate_all_tables()
        
    except Exception as e:
        print(f"Failed to populate tables: {e}")
        print("Please check your ClickHouse connection settings and ensure the tables exist.")
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
