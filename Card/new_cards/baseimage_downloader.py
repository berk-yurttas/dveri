import os
import requests
import openpyxl

# Excel dosyanın tam adını buraya yazmalısın
EXCEL_FILE = 'aselsan_kart_oyunu (1).xlsx'
OUTPUT_DIR = 'product_images'

# Eğer klasör yoksa oluştur
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)
    print(f"'{OUTPUT_DIR}' klasörü oluşturuldu.")

try:
    # Excel dosyasını yükle (data_only=True formülleri değil sadece değerleri alır)
    workbook = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
    sheet = workbook.active

    basarili_sayisi = 0
    hata_sayisi = 0

    # Satırları dön (ilk satırı başlık varsayarak 2. satırdan (min_row=2) başlıyoruz)
    for row in sheet.iter_rows(min_row=2, values_only=True):
        # Satır boşsa veya 2. sütun (Ürün adı) boşsa atla
        if not row or row[1] is None:
            continue
        
        urun_adi = str(row[1]).strip() # 2. sütun (Index 1) Ürün Adı
        
        # Satırdaki hücreler içinde 'http' ile başlayan URL'yi bul
        img_url = None
        for col in row:
            if col and isinstance(col, str) and col.strip().startswith('http'):
                print(col.strip())
                img_url = col.strip()
                break
        
        if img_url:
            dosya_ismi = f"{urun_adi}.png"
            dosya_yolu = os.path.join(OUTPUT_DIR, dosya_ismi)
            
            # Eğer dosya zaten inmişse tekrar indirme (kaldığı yerden devam edebilmesi için)
            if os.path.exists(dosya_yolu):
                print(f"Zaten mevcut, atlanıyor: {urun_adi}")
                basarili_sayisi += 1
                continue
                
            print(f"İndiriliyor: {urun_adi}...")
            try:
                # Resmi internetten çek
                response = requests.get(img_url, timeout=10)
                response.raise_for_status() # HTTP hatası varsa exception fırlat
                
                # Dosyaya yaz
                with open(dosya_yolu, 'wb') as img_file:
                    img_file.write(response.content)
                basarili_sayisi += 1
                    
            except Exception as e:
                print(f"  -> Hata! {urun_adi} indirilemedi: {e}")
                hata_sayisi += 1
        else:
            print(f"Uyarı: '{urun_adi}' için URL bulunamadı, satır atlandı.")
            hata_sayisi += 1

    print("-" * 30)
    print(f"İşlem tamamlandı! Toplam Başarılı: {basarili_sayisi}, Hatalı/Eksik: {hata_sayisi}")

except FileNotFoundError:
    print(f"Hata: '{EXCEL_FILE}' dosyası bulunamadı. Lütfen script ile aynı klasörde olduğundan emin ol.")
except Exception as e:
    print(f"Beklenmeyen bir hata oluştu: {e}")