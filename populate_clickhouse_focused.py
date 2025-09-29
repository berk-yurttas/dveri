#!/usr/bin/env python3
"""
Focused script to populate ClickHouse tables with specific test data structure:
- 10 products
- 5 serial numbers per product (50 total)
- 5 consistent tests across all products
- 5 measurement locations
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


class FocusedClickHouseDataGenerator:
    def __init__(self, host='localhost', port=9000, database='default', user='default', password=''):
        """Initialize the ClickHouse client and data generators."""
        self.client = Client(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password
        )
        
        # Focused configuration
        self.config = {
            'product_count': 10,
            'serial_per_product': 5,
            'test_count': 5,
            'measurement_locations': 5,
            'personel_count': 10,
            'pc_count': 5,
            'cihaz_count': 10,
            'tyy_count': 5,
            'test_yazilim_count': 5,
            'hash_count': 100
        }
        
        # Predefined test structure
        self.test_structure = {
            'test_names': ['Gerilim Testi', 'Akım Testi', 'Frekans Testi', 'Sıcaklık Testi', 'Güç Testi'],
            'test_statuses': ['GECTI', 'KALDI'],
            'measurement_locations': ['Giriş', 'Çıkış', 'Kontrol', 'Güç', 'Sinyal'],
            'process_names': ['Fonksiyon Testi', 'Performans Testi', 'Kalite Testi'],
            'process_statuses': ['Başarılı', 'Başarısız']
        }
        
        # Sample data for realistic generation
        self.sample_data = {
            'turkish_names': ['Ahmet', 'Mehmet', 'Ali', 'Ayşe', 'Fatma'],
            'turkish_surnames': ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik'],
            'companies': ['ASELSAN', 'ASELSANNET', 'HTR', 'KAREL', 'MELSİS'],
            'test_modes': ['Manual', 'Automatic', 'Semi-Automatic'],
            'device_types': ['Multimetre', 'Osiloskop', 'Güç Kaynağı', 'Frekans Sayacı', 'Spektrum Analizörü'],
            'os_versions': ['Windows 10 Pro', 'Windows 11 Pro', 'Ubuntu 20.04']
        }

    def generate_hash(self, input_string: str = None) -> str:
        """Generate a hash string."""
        if input_string is None:
            input_string = str(uuid.uuid4())
        return hashlib.md5(input_string.encode()).hexdigest()

    def generate_datetime(self, start_days_ago: int = 30, end_days_ago: int = 0) -> datetime:
        """Generate a random datetime within the specified range."""
        start_date = datetime.now() - timedelta(days=start_days_ago)
        end_date = datetime.now() - timedelta(days=end_days_ago)
        time_between = end_date - start_date
        days_between = time_between.days
        random_days = random.randrange(days_between + 1)
        random_seconds = random.randrange(86400)
        return start_date + timedelta(days=random_days, seconds=random_seconds)

    def clear_tables(self):
        """Clear all tables before populating."""
        print("Clearing existing data...")
        tables = [
            'REHIS_TestKayit_Test_TabloLog',
            'REHIS_TestKayit_Test_TabloTestAdimi',
            'REHIS_TestKayit_Test_TabloTest',
            'REHIS_TestKayit_Test_TabloTestGrup',
            'REHIS_TestKayit_Test_TabloTestYazilimSetup',
            'REHIS_TestKayit_Test_TabloTestCihazSetup',
            'REHIS_TestKayit_Test_TabloPCSetup',
            'REHIS_TestTanim_Test_TabloTestPlan',
            'REHIS_TestKayit_Test_TabloTEU',
            'REHIS_TestTanim_Test_TabloTestYazilimi',
            'REHIS_TestKayit_Test_TabloIsEmri',
            'REHIS_TestKayit_Test_TabloHash',
            'REHIS_TestTanim_Test_TabloTestYonetimYazilimi',
            'REHIS_TestTanim_Test_TabloTestCihaz',
            'REHIS_TestTanim_Test_TabloPC',
            'REHIS_TestTanim_Test_TabloPersonel',
            'REHIS_TestTanim_Test_TabloUrun'
        ]
        
        for table in tables:
            try:
                self.client.execute(f"TRUNCATE TABLE {table}")
                print(f"  Cleared {table}")
            except Exception as e:
                print(f"  Warning: Could not clear {table}: {e}")

    def populate_urun_table(self):
        """Populate 10 products."""
        print("Populating 10 products...")
        data = []
        for i in range(1, self.config['product_count'] + 1):
            data.append((
                i,  # UrunID
                f"PRD-{i:03d}",  # StokNo
                f"Test Ürünü {i} - Elektronik Modül",  # Tanim
                f"UDK-{i:03d}"  # UDKNo
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloUrun VALUES",
            data
        )

    def populate_personel_table(self):
        """Populate personnel table."""
        print("Populating personnel...")
        data = []
        for i in range(1, self.config['personel_count'] + 1):
            name = self.sample_data['turkish_names'][i % len(self.sample_data['turkish_names'])]
            surname = self.sample_data['turkish_surnames'][i % len(self.sample_data['turkish_surnames'])]
            company = self.sample_data['companies'][i % len(self.sample_data['companies'])]
            
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
        """Populate PC table."""
        print("Populating PCs...")
        data = []
        for i in range(1, self.config['pc_count'] + 1):
            os_version = self.sample_data['os_versions'][i % len(self.sample_data['os_versions'])]
            
            data.append((
                i,  # PCID
                f"PC-TEST-{i:02d}",  # PCAdi
                '64-bit',  # OsKacBit
                os_version  # OsVersiyon
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloPC VALUES",
            data
        )

    def populate_test_cihaz_table(self):
        """Populate test devices."""
        print("Populating test devices...")
        data = []
        for i in range(1, self.config['cihaz_count'] + 1):
            device_type = self.sample_data['device_types'][i % len(self.sample_data['device_types'])]
            calibration_end = (datetime.now() + timedelta(days=365)).date()
            
            data.append((
                i,  # CihazID
                f"DMB-{i:06d}",  # DemirbasNo
                calibration_end,  # KalibrasyonBitis
                device_type,  # CihazTipi
                f"Model-{device_type}-{i}"  # CihazModeli
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloTestCihaz VALUES",
            data
        )

    def populate_tyy_table(self):
        """Populate test management software."""
        print("Populating test management software...")
        data = []
        for i in range(1, self.config['tyy_count'] + 1):
            data.append((
                i,  # TYYID
                f"TYY-{i:03d}",  # TYYStok
                f"Test Yönetim Yazılımı {i}",  # TYYTanim
                f"v{i}.0.0"  # TYYVersiyon
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloTestYonetimYazilimi VALUES",
            data
        )

    def populate_hash_table(self):
        """Populate hash table."""
        print("Populating hash table...")
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
        """Populate work orders."""
        print("Populating work orders...")
        data = []
        for i in range(1, 50 + 1):  # 50 work orders for 50 serial numbers
            data.append((
                i,  # IsEmriID
                f"IE-{i:08d}",  # IsEmriNo
                f"BLD-{i:06d}"  # BildirimNo
            ))

        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloIsEmri VALUES",
            data
        )

    def populate_test_yazilimi_table(self):
        """Populate test software."""
        print("Populating test software...")
        data = []
        for i in range(1, self.config['test_yazilim_count'] + 1):
            tyy_id = (i % self.config['tyy_count']) + 1
            
            data.append((
                i,  # TestYazilimID
                f"TY-{i:05d}",  # TestYazilimStokNo
                f"Test Yazılımı {i}",  # TestYazilimTanimi
                f"v{i}.0",  # TestYazilimVersiyon
                f"tasarimci{i}",  # TestTasarlayanKullaniciAdi
                tyy_id  # TYYID
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloTestYazilimi VALUES",
            data
        )

    def populate_teu_table(self):
        """Populate TEU table - 5 serial numbers per product."""
        print("Populating TEU table (5 serial numbers per product)...")
        data = []
        teu_id = 1
        
        for product_id in range(1, self.config['product_count'] + 1):
            for serial_num in range(1, self.config['serial_per_product'] + 1):
                data.append((
                    teu_id,  # TEUID
                    product_id,  # UrunID
                    f"SN{product_id:02d}{serial_num:03d}",  # SeriNo (e.g., SN01001, SN01002, etc.)
                    f"IE-{teu_id:08d}"  # IsEmriNo
                ))
                teu_id += 1
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTEU VALUES",
            data
        )

    def populate_test_plan_table(self):
        """Populate test plan with 5 tests × 5 measurement locations = 25 test plan entries."""
        print("Populating test plan (5 tests × 5 measurement locations)...")
        data = []
        tp_adim_id = 1
        
        for test_name in self.test_structure['test_names']:
            for measurement_location in self.test_structure['measurement_locations']:
                for test_status in self.test_structure['test_statuses']:
                    tp_hash_id = random.randint(1, self.config['hash_count'])
                    process_name = random.choice(self.test_structure['process_names'])
                    process_status = random.choice(self.test_structure['process_statuses'])
                    
                    # Generate measurement parameters
                    alt_limit = f"{random.uniform(0, 50):.2f}"
                    ust_limit = f"{random.uniform(51, 100):.2f}"
                    birim = random.choice(['V', 'A', 'Hz', '°C', 'dB'])
                    veri_tipi = 'numerical_comp'

                    data.append((
                        tp_adim_id,  # TPAdimID
                        tp_hash_id,  # TPHashID
                        process_name,  # SurecAdi
                        process_status,  # SurecDurum
                        test_name,  # TestAdi
                        test_status,  # TestDurum
                        measurement_location,  # OlcumYeri
                        alt_limit,  # AltLimit
                        ust_limit,  # UstLimit
                        birim,  # Birim
                        veri_tipi  # VeriTipi
                    ))
                    tp_adim_id += 1

        self.client.execute(
            "INSERT INTO REHIS_TestTanim_Test_TabloTestPlan VALUES",
            data
        )

    def populate_setup_tables(self):
        """Populate setup tables."""
        print("Populating setup tables...")
        
        # PC Setup
        pc_setup_data = []
        for i in range(1, 20):
            pc_id = ((i - 1) % self.config['pc_count']) + 1
            setup_hash_id = random.randint(1, self.config['hash_count'])
            pc_setup_data.append((pc_id, setup_hash_id))
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloPCSetup VALUES",
            pc_setup_data
        )
        
        # Test Cihaz Setup
        cihaz_setup_data = []
        for i in range(1, 20):
            cihaz_id = ((i - 1) % self.config['cihaz_count']) + 1
            setup_hash_id = random.randint(1, self.config['hash_count'])
            alias = f"Alias_{i}"
            cihaz_setup_data.append((cihaz_id, setup_hash_id, alias))
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTestCihazSetup VALUES",
            cihaz_setup_data
        )
        
        # Test Yazilim Setup
        yazilim_setup_data = []
        for i in range(1, 20):
            test_yazilim_id = ((i - 1) % self.config['test_yazilim_count']) + 1
            setup_hash_id = random.randint(1, self.config['hash_count'])
            yazilim_setup_data.append((test_yazilim_id, setup_hash_id))
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTestYazilimSetup VALUES",
            yazilim_setup_data
        )

    def populate_test_grup_table(self):
        """Populate test groups - multiple groups per TEU."""
        print("Populating test groups...")
        data = []
        test_grup_id = 1
        
        # For each TEU (50 total), create multiple test groups
        for teu_id in range(1, 51):  # 50 TEUs (10 products × 5 serials)
            # Create 3-5 test groups per TEU
            groups_for_this_teu = random.randint(3, 5)
            
            for group_num in range(groups_for_this_teu):
                setup_hash_id = random.randint(1, self.config['hash_count'])
                tp_hash_id = random.randint(1, self.config['hash_count'])
                personel_id = random.randint(1, self.config['personel_count'])
                test_mode = random.choice(self.sample_data['test_modes'])
                process_name = random.choice(self.test_structure['process_names'])
                process_status = random.choice(self.test_structure['process_statuses'])

                bitis_tarih = self.generate_datetime(30, 0)
                yukleme_tarih = self.generate_datetime(29, 0)
                toplam_sure = f"{random.randint(0, 2):02d}:{random.randint(0, 59):02d}:{random.randint(0, 59):02d}"
                genel_gecik = random.choice(['GECTI', 'KALDI', 'YAPILMADI', 'TAMAMLANMADI'])

                data.append((
                    test_grup_id,  # TestGrupID
                    setup_hash_id,  # SetupHashID
                    tp_hash_id,  # TPHashID
                    teu_id,  # TEUID
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

        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTestGrup VALUES",
            data
        )

    def populate_test_table(self):
        """Populate tests - create multiple test instances for meaningful line charts."""
        print("Populating tests...")
        data = []
        test_id = 1
        
        # Get the number of test groups created
        result = self.client.execute("SELECT COUNT(*) FROM REHIS_TestKayit_Test_TabloTestGrup")
        test_grup_count = result[0][0]
        
        # For each test group, create multiple test instances for each test type
        for test_grup_id in range(1, test_grup_count + 1):
            for test_name in self.test_structure['test_names']:
                # Create 5-8 test instances for each test type to show progression over time
                num_test_instances = random.randint(5, 8)
                
                for instance in range(num_test_instances):
                    # Generate timestamps spread over the last 30 days
                    days_ago = 30 - (instance * 4)  # Spread tests over time
                    if days_ago < 0:
                        days_ago = random.randint(0, 5)
                    
                    test_start = self.generate_datetime(days_ago, days_ago - 1 if days_ago > 0 else 0)
                    test_duration = f"{random.randint(0, 1):02d}:{random.randint(1, 59):02d}:{random.randint(0, 59):02d}"
                    test_result = random.choice(['KALDI', 'GECTI', 'YAPILMADI'])

                    data.append((
                        test_id,  # TestID
                        test_grup_id,  # TestGrupID
                        test_name,  # TestAdi
                        test_start,  # TestBaslangicTarih
                        test_duration,  # TestSuresi
                        test_result  # TestGectiKladi
                    ))

                    test_id += 1

        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTest VALUES",
            data
        )

    def populate_test_adimi_table(self):
        """Populate test steps - create measurements with realistic trends for each test."""
        print("Populating test steps...")
        data = []
        
        # Get all tests with their timestamps for trend generation
        tests = self.client.execute("SELECT TestID, TestAdi, TestGrupID, TestBaslangicTarihi FROM REHIS_TestKayit_Test_TabloTest ORDER BY TestGrupID, TestAdi, TestBaslangicTarihi")
        
        # Group tests by TestGrupID and TestAdi to create consistent trends per serial number
        test_groups = {}
        for test_id, test_name, test_grup_id, test_start in tests:
            key = (test_grup_id, test_name)
            if key not in test_groups:
                test_groups[key] = []
            test_groups[key].append((test_id, test_start))
        
        # Generate measurements with trends for each group
        for (test_grup_id, test_name), test_list in test_groups.items():
            # Sort tests by timestamp to create proper trend
            test_list.sort(key=lambda x: x[1])
            
            for measurement_location in self.test_structure['measurement_locations']:
                # Find matching test plan entry
                query = f"SELECT TPAdimID, AltLimit, UstLimit FROM REHIS_TestTanim_Test_TabloTestPlan WHERE TestAdi = '{test_name}' AND OlcumYeri = '{measurement_location}' LIMIT 1"
                tp_result = self.client.execute(query)
                
                if tp_result:
                    tp_adim_id, alt_limit, ust_limit = tp_result[0]
                    alt_limit = float(alt_limit)
                    ust_limit = float(ust_limit)
                    
                    # Generate base value for this serial number and measurement location
                    base_value = random.uniform(alt_limit + 5, ust_limit - 5)
                    trend_direction = random.choice([-1, 0, 1])  # Declining, stable, or improving
                    
                    for i, (test_id, test_start) in enumerate(test_list):
                        # Create trend over time
                        trend_factor = trend_direction * (i * 0.5)  # Gradual change
                        noise = random.uniform(-2, 2)  # Random variation
                        
                        measured_value = base_value + trend_factor + noise
                        
                        # Ensure value stays within reasonable bounds
                        measured_value = max(alt_limit - 10, min(ust_limit + 10, measured_value))
                        
                        # Determine test result based on limits
                        if alt_limit <= measured_value <= ust_limit:
                            test_result = random.choice(['GECTI', 'GECTI', 'GECTI', 'KALDI'])  # Mostly pass
                        else:
                            test_result = random.choice(['KALDI', 'KALDI', 'GECTI'])  # Mostly fail
                        
                        sonuc_ozet_hash_id = random.randint(1, self.config['hash_count'])

                        data.append((
                            tp_adim_id,  # TPAdimID
                            test_id,  # TestID
                            f"{measured_value:.3f}",  # OlculenDeger
                            test_result,  # TestAdimiGectiKaldi
                            sonuc_ozet_hash_id  # SonucOzetHashID
                        ))

        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloTestAdimi VALUES",
            data
        )

    def populate_log_table(self):
        """Populate log table."""
        print("Populating logs...")
        data = []
        for i in range(1, 1000):
            log_date = self.generate_datetime(30, 0)
            log_level = random.choice(['INFO', 'WARNING', 'ERROR'])
            
            messages = [
                "Test başlatıldı",
                "Cihaz bağlantısı kuruldu",
                "Ölçüm tamamlandı",
                "Test sonucu kaydedildi"
            ]
            message = random.choice(messages)
            log_source = f"TestModule_{random.randint(1, 5)}"
            
            # Get a random test plan ID
            tp_result = self.client.execute("SELECT TPAdimID FROM REHIS_TestTanim_Test_TabloTestPlan ORDER BY rand() LIMIT 1")
            tp_admin_id = tp_result[0][0] if tp_result else 1

            data.append((
                i,  # Id
                log_date,  # Date
                log_level,  # LogLevel
                message,  # Message
                log_source,  # LogSource
                tp_admin_id  # TPAdminID
            ))
        
        self.client.execute(
            "INSERT INTO REHIS_TestKayit_Test_TabloLog VALUES",
            data
        )

    def populate_all_tables(self):
        """Populate all tables in the correct order."""
        print("Starting focused data population...")
        print("=" * 50)
        
        try:
            # Clear existing data
            self.clear_tables()
            
            # Level 1: Base tables
            self.populate_urun_table()
            self.populate_personel_table()
            self.populate_pc_table()
            self.populate_test_cihaz_table()
            self.populate_tyy_table()
            self.populate_hash_table()
            self.populate_is_emri_table()
            
            # Level 2: Dependent tables
            self.populate_test_yazilimi_table()
            self.populate_teu_table()
            self.populate_test_plan_table()
            
            # Level 3: Setup tables
            self.populate_setup_tables()
            
            # Level 4: Test execution
            self.populate_test_grup_table()
            self.populate_test_table()
            self.populate_test_adimi_table()
            
            # Level 5: Logging
            self.populate_log_table()
            
            print("=" * 50)
            print("Focused data population completed successfully!")
            
            # Print summary
            print("\nData structure created:")
            print(f"  Products: {self.config['product_count']}")
            print(f"  Serial numbers per product: {self.config['serial_per_product']}")
            print(f"  Total serial numbers: {self.config['product_count'] * self.config['serial_per_product']}")
            print(f"  Test types: {len(self.test_structure['test_names'])}")
            print(f"  Measurement locations: {len(self.test_structure['measurement_locations'])}")
            print(f"  Test names: {', '.join(self.test_structure['test_names'])}")
            print(f"  Measurement locations: {', '.join(self.test_structure['measurement_locations'])}")
            
        except Exception as e:
            print(f"Error occurred: {e}")
            raise


def main():
    """Main function to run the focused data population script."""
    print("Focused ClickHouse Data Population Script")
    print("=" * 50)
    
    # Configuration
    CLICKHOUSE_CONFIG = {
        'host': 'localhost',
        'port': 9000,
        'database': 'default',
        'user': 'default',
        'password': 'ClickHouse@2024'
    }
    
    try:
        # Initialize the data generator
        generator = FocusedClickHouseDataGenerator(**CLICKHOUSE_CONFIG)
        
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
