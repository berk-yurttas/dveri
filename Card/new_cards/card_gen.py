import os
import openpyxl
from PIL import Image, ImageDraw, ImageFont

# --- CONFIGURATION ---
EXCEL_FILE = 'aselsan_kart_oyunu (1).xlsx'
PRODUCT_IMAGES_DIR = 'product_images'
OUTPUT_DIR = 'generated_cards'
TEMPLATE_IMAGE_PATH = 'card_templates/template_without_joker.png'

# Layout settings
NAME_Y_POS = 70 # Y coordinate for the product name
NAME_X_POS = 150 # X coordinate for left-aligned product name
TEXT_COLOR = (255, 255, 255) # White

# Max dimensions for product image to ensure it fits nicely above the XP bar
MAX_IMAGE_WIDTH = 850
MAX_IMAGE_HEIGHT = 600
IMAGE_CENTER_Y = 480 # The center Y coordinate of the empty space above the XP bar
# ---------------------

def create_card(row_data):
    try:
        # Extract data
        urun_adi = str(row_data[1]).strip().replace('/', '-')
        
        product_img_path = os.path.join(PRODUCT_IMAGES_DIR, f"{urun_adi}.png")
        
        # Check if product image exists
        if not os.path.exists(product_img_path):
            print(f"Skipping {urun_adi} - Product image not found.")
            return False

        # Load Template
        template = Image.open(TEMPLATE_IMAGE_PATH).convert("RGBA")
        template_width, template_height = template.size
        
        # Load Product Image
        product_img = Image.open(product_img_path).convert("RGBA")
        
        # Crop transparent borders to get the true size of the vehicle
        bbox = product_img.getbbox()
        if bbox:
            product_img = product_img.crop(bbox)
        
        # Resize product image while keeping aspect ratio to fit the bounding box (scale up or down)
        img_width, img_height = product_img.size
        ratio = min(MAX_IMAGE_WIDTH / img_width, MAX_IMAGE_HEIGHT / img_height)
        new_size = (int(img_width * ratio), int(img_height * ratio))
        product_img = product_img.resize(new_size, Image.Resampling.LANCZOS)
        img_width, img_height = product_img.size

        # Calculate position for the product image (centered horizontally, vertically aligned to IMAGE_CENTER_Y)
        paste_x = (template_width - img_width) // 2
        paste_y = IMAGE_CENTER_Y - (img_height // 2)

        # Paste product image onto template using its alpha channel as a mask
        template.paste(product_img, (paste_x, paste_y), product_img)
        
        # Prepare drawing context
        draw = ImageDraw.Draw(template)
        
        # Try to load a bold font
        try:
            # Try to load Arial Bold or fallback to Arial
            font_name = ImageFont.truetype("arialbd.ttf", 55)
        except IOError:
            try:
                font_name = ImageFont.truetype("arial.ttf", 55)
            except IOError:
                font_name = ImageFont.load_default()

        # Draw Product Name (Left aligned to match MİLKAR)
        draw.text((NAME_X_POS, NAME_Y_POS), urun_adi.upper(), fill=TEXT_COLOR, font=font_name)
        
        # Save the result
        if not os.path.exists(OUTPUT_DIR):
            os.makedirs(OUTPUT_DIR)
            
        output_path = os.path.join(OUTPUT_DIR, f"{urun_adi}.png")
        template.save(output_path)
        print(f"Success: Generated {output_path}")
        return True
        
    except Exception as e:
        print(f"Error generating card for {row_data[1]}: {e}")
        return False

def main():
    if not os.path.exists(TEMPLATE_IMAGE_PATH):
        print(f"Error: Template image not found at {TEMPLATE_IMAGE_PATH}")
        return

    try:
        workbook = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
        sheet = workbook.active
    except Exception as e:
        print(f"Failed to load Excel file: {e}")
        return

    print("Starting card generation...")
    success_count = 0
    
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if not row or row[1] is None:
            continue
            
        if create_card(row):
            success_count += 1
            
    print(f"\nDone! Generated {success_count} cards.")

if __name__ == "__main__":
    main()
