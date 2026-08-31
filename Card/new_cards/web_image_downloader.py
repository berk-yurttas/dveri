import os
import openpyxl
import shutil
import time
import random
import platform
import subprocess
from PIL import Image
from icrawler.builtin import BingImageCrawler
from rembg import remove

EXCEL_FILE = 'aselsan_kart_oyunu (1).xlsx'
PRODUCT_IMAGES_DIR = 'product_images'
TEMP_DIR = 'temp_download'

def is_valid_image(filepath):
    try:
        with Image.open(filepath) as img:
            img.verify()
        return True
    except Exception:
        return False

def open_image(filepath):
    """Opens an image using the default OS viewer."""
    if platform.system() == 'Windows':
        os.startfile(filepath)
    elif platform.system() == 'Darwin':
        subprocess.call(['open', filepath])
    else:
        subprocess.call(['xdg-open', filepath])

def search_and_verify_image(product_name):
    query = f"{product_name} site:aselsan.com"
    print(f"\n==================================================")
    print(f"Searching Bing for: {query}")
    print(f"==================================================")
    
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR)
    os.makedirs(TEMP_DIR)
    
    try:
        sleep_time = random.uniform(1.5, 3.5)
        print(f"  -> Waiting {sleep_time:.2f}s to be polite...")
        time.sleep(sleep_time)
        
        # Download top 5 results
        crawler = BingImageCrawler(storage={'root_dir': TEMP_DIR})
        crawler.crawl(keyword=query, max_num=5)
        
        downloaded_files = os.listdir(TEMP_DIR)
        if not downloaded_files:
            print(f"  -> No image found for {product_name}")
            return False
            
        # Try each downloaded image interactively
        for filename in downloaded_files:
            temp_filepath = os.path.join(TEMP_DIR, filename)
            
            if not is_valid_image(temp_filepath):
                continue
                
            print(f"\n  [?] Opening image {filename} for {product_name}...")
            open_image(temp_filepath)
            
            while True:
                choice = input(f"  Is this the correct image for '{product_name}'? (y/n/skip): ").strip().lower()
                if choice in ['y', 'n', 'skip', 'yes', 'no']:
                    break
                print("  Invalid choice. Please type 'y', 'n', or 'skip'.")
                
            if choice in ['y', 'yes']:
                final_filepath = os.path.join(PRODUCT_IMAGES_DIR, f"{product_name}.png")
                print(f"  -> Accepted! Removing background...")
                try:
                    with Image.open(temp_filepath) as img:
                        transparent_img = remove(img)
                        transparent_img.save(final_filepath, format="PNG")
                    print(f"  -> Success! Saved as {final_filepath}")
                except Exception as bg_e:
                    print(f"  -> Background removal failed ({bg_e}). Saving original.")
                    shutil.copy(temp_filepath, final_filepath)
                return True
                
            elif choice == 'skip':
                print(f"  -> Skipping {product_name} entirely.")
                return False
                
            else:
                print("  -> Rejected. Opening the next search result...")
                
        print(f"  -> Exhausted all 5 search results for {product_name}.")
        return False
        
    except Exception as e:
        print(f"  -> Search error: {e}")
        return False
    finally:
        if os.path.exists(TEMP_DIR):
            shutil.rmtree(TEMP_DIR)

def main():
    if not os.path.exists(PRODUCT_IMAGES_DIR):
        os.makedirs(PRODUCT_IMAGES_DIR)

    workbook = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
    sheet = workbook.active

    success_count = 0
    fail_count = 0

    for row in sheet.iter_rows(min_row=2, values_only=True):
        if not row or row[1] is None:
            continue
            
        urun_adi = str(row[1]).strip().replace('/', '-')
        filepath = os.path.join(PRODUCT_IMAGES_DIR, f"{urun_adi}.png")
        
        if os.path.exists(filepath) and is_valid_image(filepath):
            # Already exists and is valid
            continue
        elif os.path.exists(filepath):
            # Corrupted/invalid file
            os.remove(filepath)
            
        if search_and_verify_image(urun_adi):
            success_count += 1
        else:
            fail_count += 1

    print(f"\nWeb Download Complete. Successfully processed: {success_count}, Missing/Skipped: {fail_count}")

if __name__ == "__main__":
    main()
