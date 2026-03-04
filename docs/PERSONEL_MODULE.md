# Personel Sayıları Modülü

## Kurulum

### 1. Veritabanı Kurulumu

SQL Server Management Studio veya Azure Data Studio kullanarak aşağıdaki script'i çalıştırın:

```bash
# SQL dosyasını çalıştırın
sqlcmd -S 10.60.139.2,1433 -U sa -P sapass-1 -d AFLOW -i dtbackend/sql/create_personel_table.sql
```

Veya SSMS'te `dtbackend/sql/create_personel_table.sql` dosyasını açıp çalıştırın.

### 2. Backend API

API endpoint'leri zaten eklenmiş durumda:
- `POST /api/v1/personel/upload-excel` - Excel dosyası yükle
- `GET /api/v1/personel/data` - Mevcut verileri getir

### 3. Frontend Sayfası

Sayfa şu URL'de erişilebilir:
- `/{platform}/personel` (örn: `/ivme/personel`, `/seyir/personel`)

## Kullanım

### Excel Dosyası Formatı

Excel dosyası aşağıdaki formatta olmalıdır:

```
Row 1: (Boş)
Row 2: [Firma Adı] | [Boş] | [Üretim] | | | [Boş] | | |
Row 3: | Geçici Kabul | RF Üretim | CX Üretim | Birim İçi Üretim | Test | Kalite | Planlama | İdari
Row 4: Personel Sayısı | [sayı] | [sayı] | [sayı] | [sayı] | [sayı] | [sayı] | [sayı] | [sayı]
Row 5: (Boş)
Row 6: (Boş)
Row 7: [Firma Adı 2] ...
```

**Önemli Kurallar:**
1. Veri 2. satırdan başlar
2. Sütunlar A'dan I'ye kadar (9 sütun)
3. Firmalar arasında 2 satır boşluk olmalı
4. Her firma için 4 satır veri var:
   - Satır 1: Firma adı ve üst birim başlıkları
   - Satır 2: Alt birim isimleri
   - Satır 3: "Personel Sayısı" etiketi ve sayılar
   - Satır 4: Boş

### Sütun Yapısı

| Sütun | İçerik | Üst Birim | Birim |
|-------|--------|-----------|-------|
| A | Firma Adı | - | - |
| B | Geçici Kabul | Geçici Kabul | - |
| C | RF Üretim | Üretim | RF Üretim |
| D | CX Üretim | Üretim | CX Üretim |
| E | Birim İçi Üretim | Üretim | Birim İçi Üretim |
| F | Test | Test | - |
| G | Kalite | Kalite | - |
| H | Planlama | Planlama | - |
| I | İdari | İdari | - |

### Dosya Yükleme Süreci

1. Personel sayfasına gidin (`/{platform}/personel`)
2. "Dosya Seç" butonuna tıklayın
3. Excel dosyasını seçin (.xlsx veya .xls)
4. "Yükle ve Güncelle" butonuna tıklayın
5. Sistem otomatik olarak:
   - Mevcut tüm verileri siler (TRUNCATE)
   - Yeni verileri ekler
   - Başarı mesajı gösterir
   - Sayfayı yeni verilerle günceller

## Veritabanı Yapısı

### Tablo: personel.personel_count

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| id | INT | Primary key (auto increment) |
| firma_adi | NVARCHAR(100) | Firma adı (3EN, TERA, vb.) |
| ust_birim | NVARCHAR(100) | Üst birim (Üretim, Test, Kalite, vb.) |
| birim | NVARCHAR(100) | Alt birim (RF Üretim, CX Üretim, vb.) - NULL olabilir |
| personel_sayisi | INT | Personel sayısı |
| created_at | DATETIME | Kayıt oluşturulma tarihi |

## Örnek Veriler

```sql
INSERT INTO personel.personel_count (firma_adi, ust_birim, birim, personel_sayisi)
VALUES 
    ('3EN', 'Geçici Kabul', NULL, 2),
    ('3EN', 'Üretim', 'RF Üretim', 9),
    ('3EN', 'Üretim', 'CX Üretim', 24),
    ('3EN', 'Üretim', 'Birim İçi Üretim', 51),
    ('3EN', 'Test', NULL, 5),
    ('3EN', 'Kalite', NULL, 3),
    ('3EN', 'Planlama', NULL, 2),
    ('3EN', 'İdari', NULL, 4);
```

## Hata Ayıklama

### Backend Hataları

```bash
# Backend loglarını kontrol edin
cd dtbackend
# Backend'i geliştirme modunda çalıştırın
uvicorn app.main:app --reload --log-level debug
```

### Frontend Hataları

```bash
# Frontend loglarını kontrol edin
cd dtfrontend
npm run dev
```

### Veritabanı Bağlantı Testi

```python
import pyodbc

try:
    conn = pyodbc.connect(
        'DRIVER={ODBC Driver 17 for SQL Server};'
        'SERVER=10.60.139.2,1433;'
        'DATABASE=AFLOW;'
        'UID=sa;'
        'PWD=sapass-1'
    )
    print("Bağlantı başarılı!")
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM personel.personel_count")
    count = cursor.fetchone()[0]
    print(f"Toplam kayıt sayısı: {count}")
    conn.close()
except Exception as e:
    print(f"Hata: {e}")
```

## Güvenlik Notları

⚠️ **Önemli:** Veritabanı şifresi kod içinde sabit olarak tanımlanmıştır. Üretim ortamında:
1. Şifreyi environment variable'a taşıyın
2. `.env` dosyasını `.gitignore`'a ekleyin
3. Güvenli bir secrets management sistemi kullanın

## Geliştirme Notları

- Excel parsing mantığı `dtbackend/app/api/v1/endpoints/personel.py` dosyasında
- Frontend komponenti `dtfrontend/src/app/[platform]/personel/page.tsx` dosyasında
- Veritabanı bağlantısı `dtbackend/app/core/database.py` dosyasında

## Lisans

Bu modül DT Report projesinin bir parçasıdır.
