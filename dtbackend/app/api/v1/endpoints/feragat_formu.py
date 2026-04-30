"""
Feragat Formu (Waiver Form) PDF Generation API
Generates PDF matching the Excel form layout exactly
"""
import io
import json
import os
from typing import Any
from datetime import datetime

import httpx
import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from app.core.auth import check_authenticated
from app.core.config import settings
from app.schemas.user import User

router = APIRouter()


@router.get("/get-user-info")
async def get_user_info(
    username: str = Query(..., description="Username to fetch"),
    current_user: User = Depends(check_authenticated)
):
    """Get user name from Pocketbase by username"""
    try:
        user_info = await get_pocketbase_user(username)
        return {
            "username": username,
            "name": user_info.get("name", ""),
            "fullName": f"{user_info.get('name', '')}".strip()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch user info: {str(e)}")


# Register font with Turkish character support
# DejaVu Sans has excellent Unicode/Turkish support and is commonly available in Docker containers
import os

FONT_NAME = 'Helvetica'
FONT_NAME_BOLD = 'Helvetica-Bold'

# Try to load DejaVu Sans (best for Docker/Linux environments with Turkish support)
font_paths_to_try = [
    # DejaVu Sans (common in Linux/Docker)
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVu Sans'),
    # Liberation Sans (alternative common in Linux)
    ('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 'Liberation Sans'),
    # Windows paths (for local development)
    ('C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf', 'Arial'),
    ('C:/Windows/Fonts/calibri.ttf', 'C:/Windows/Fonts/calibrib.ttf', 'Calibri'),
]

font_loaded = False
for regular_path, bold_path, font_name in font_paths_to_try:
    try:
        if os.path.exists(regular_path) and os.path.exists(bold_path):
            pdfmetrics.registerFont(TTFont('CustomFont', regular_path))
            pdfmetrics.registerFont(TTFont('CustomFont-Bold', bold_path))
            FONT_NAME = 'CustomFont'
            FONT_NAME_BOLD = 'CustomFont-Bold'
            print(f"Successfully loaded {font_name} font with Turkish character support")
            font_loaded = True
            break
    except Exception as e:
        print(f"Could not load {font_name}: {e}")
        continue

if not font_loaded:
    print("WARNING: Using Helvetica fallback (Turkish characters may not display correctly)")
    print("To fix: Install fonts in Docker with 'apt-get install fonts-dejavu' or 'apt-get install fonts-liberation'")
    FONT_NAME = 'Helvetica'
    FONT_NAME_BOLD = 'Helvetica-Bold'

# Database configuration for "seyir" database
SEYIR_DB_CONFIG = {
    'host': '10.60.139.11',
    'port': 5437,
    'database': 'aflow_db',
    'user': 'postgres',
    'password': 'postgres'
}


def get_seyir_connection():
    """Get connection to seyir database"""
    return psycopg2.connect(**SEYIR_DB_CONFIG)


async def get_pocketbase_user(username: str) -> dict:
    """Get user information from PocketBase by username"""
    try:
        async with httpx.AsyncClient() as client:
            # Authenticate as admin
            if settings.POCKETBASE_ADMIN_EMAIL and settings.POCKETBASE_ADMIN_PASSWORD:
                auth_response = await client.post(
                    f"{settings.POCKETBASE_URL}/api/collections/_superusers/auth-with-password",
                    json={
                        "identity": settings.POCKETBASE_ADMIN_EMAIL,
                        "password": settings.POCKETBASE_ADMIN_PASSWORD
                    }
                )
                if auth_response.status_code != 200:
                    return {"name": username}
                
                auth_token = auth_response.json().get("token", "")

                # Get user by username
                user_response = await client.get(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records",
                    params={"filter": f'username="{username}"'},
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                
                if user_response.status_code == 200:
                    users = user_response.json().get("items", [])
                    if users:
                        user = users[0]
                        return {
                            "name": user.get("name", ""),
                        }
        
        return {"name": username}
    except Exception as e:
        print(f"Error fetching PocketBase user {username}: {e}")
        return {"name": username}


def get_step_definitions_data(job_instance_id: str) -> dict:
    """Get step definitions data for sections E, F, G"""
    try:
        print(f"[get_step_definitions_data] Starting with job_instance_id: {job_instance_id}")
        print(f"[get_step_definitions_data] job_instance_id type: {type(job_instance_id)}")
        
        conn = get_seyir_connection()
        cursor = conn.cursor()
        
        try:
            # Query using job_step_instances table
            # Note: Using named parameters to avoid tuple index issues
            query = """
                SELECT 
                    sd.name,
                    si.assignee,
                    si.completed_at
                FROM 
                    job_step_instances si
                LEFT JOIN step_definitions sd ON si.step_definition_id = sd.id
                WHERE si.job_id = %(job_id)s
                AND sd.name LIKE '%%Onayı'
                AND si.status = 'done'
                ORDER BY sd.id
            """
            
            print(f"[get_step_definitions_data] About to execute query")
            print(f"[get_step_definitions_data] Query params: {{'job_id': '{job_instance_id}'}}")
            
            # Execute the query with named parameters
            cursor.execute(query, {'job_id': job_instance_id})
            
            print(f"[get_step_definitions_data] Query executed successfully")
            rows = cursor.fetchall()
            print(f"[get_step_definitions_data] Found {len(rows)} rows")
            
            # Build a dictionary keyed by the Görev name (without " Onayı")
            step_data = {}
            for idx, row in enumerate(rows):
                try:
                    print(f"[get_step_definitions_data] Processing row {idx}: {row}")
                    
                    # Check if row has enough columns
                    if len(row) < 3:
                        print(f"[get_step_definitions_data] Row {idx} has insufficient columns: {len(row)}")
                        continue
                    
                    name = row[0] if row[0] else ""
                    assignee = row[1] if row[1] else ""
                    completed_at = row[2] if len(row) > 2 else None
                    
                    # Remove " Onayı" from the name to get the Görev
                    gorev = name.replace(" Onayı", "").strip()
                    
                    if gorev:  # Only add if we have a valid gorev name
                        step_data[gorev] = {
                            "assignee": assignee,
                            "completed_at": completed_at
                        }
                        print(f"[get_step_definitions_data] Added: {gorev} -> {assignee}")
                except Exception as row_error:
                    import traceback
                    traceback.print_exc()
                    print(f"[get_step_definitions_data] Error processing row {idx}: {row_error}")
                    continue
            
            print(f"[get_step_definitions_data] Returning {len(step_data)} step definitions")
            return step_data
            
        finally:
            cursor.close()
            conn.close()
            
    except Exception as e:
        print(f"[get_step_definitions_data] Error getting step definitions data: {e}")
        import traceback
        traceback.print_exc()
        return {}


def extract_value(jsonb_value: Any) -> str:
    """Extract string value from JSONB field"""
    if not jsonb_value:
        return ''
    
    # If already parsed as list/array by psycopg2
    if isinstance(jsonb_value, list):
        # Get first element if array is not empty
        if len(jsonb_value) > 0:
            first_elem = jsonb_value[0]
            if isinstance(first_elem, dict) and 'name' in first_elem:
                return str(first_elem['name'])
    
    # If already parsed as dict/object by psycopg2
    if isinstance(jsonb_value, dict):
        if 'name' in jsonb_value:
            return str(jsonb_value['name'])
        return json.dumps(jsonb_value, ensure_ascii=False)
    
    # If it's a string, try to parse
    if isinstance(jsonb_value, str):
        try:
            parsed = json.loads(jsonb_value)
            # Handle array
            if isinstance(parsed, list):
                if len(parsed) > 0:
                    first_elem = parsed[0]
                    if isinstance(first_elem, dict) and 'name' in first_elem:
                        return str(first_elem['name'])
                    if isinstance(first_elem, (str, int, float)):
                        return str(first_elem)
                    return json.dumps(first_elem, ensure_ascii=False)
                return ''
            # Handle dict
            if isinstance(parsed, dict) and 'name' in parsed:
                return str(parsed['name'])
            if isinstance(parsed, (str, int, float)):
                return str(parsed)
            return json.dumps(parsed, ensure_ascii=False)
        except (json.JSONDecodeError, TypeError):
            return jsonb_value
    
    return str(jsonb_value)


async def create_feragat_pdf(job_instance_id: str) -> bytes:
    """Generate PDF for Uyarlama Feragat Formu matching Excel screenshot"""
    
    # Query data from database
    conn = get_seyir_connection()
    cursor = conn.cursor()
    
    try:
        query = """
            SELECT 
                ad."name",
                ia.value,
                ia.updated_at
            FROM 
                job_instance_attributes ia
            LEFT JOIN attribute_definitions ad ON ia.attribute_definition_id = ad.id
            WHERE ia.job_instance_id = %s
            ORDER BY ad.id
        """
        
        cursor.execute(query, (job_instance_id,))
        rows = cursor.fetchall()
        
        if not rows:
            raise ValueError(f"No data found for job_instance_id: {job_instance_id}")
        
        # Parse data into dictionary
        form_data = {}
        for row in rows:
            field_name = row[0]
            # Keep array structure for "Hakkında Gerekçeler", "Feragatin Olası Etkileri", and "Feragate Ait Gerekçeler" fields
            if "Hakkında Gerekçeler" in field_name or "Feragatin Olası Etkileri" in field_name or "Feragate Ait Gerekçeler" in field_name:
                form_data[field_name] = row[1]  # Keep raw JSONB value (array)
            else:
                field_value = extract_value(row[1])
                form_data[field_name] = field_value
        
    finally:
        cursor.close()
        conn.close()
    
    # Get step definitions data for E, F, G sections
    step_data = get_step_definitions_data(job_instance_id)
    
    # Fetch user names from PocketBase for each assignee
    user_cache = {}
    for gorev, info in step_data.items():
        assignee = info["assignee"]
        if assignee and assignee not in user_cache:
            user_info = await get_pocketbase_user(assignee)
            user_cache[assignee] = user_info
    
    # Helper to get field value by name
    def get_field(key_part: str) -> str:
        for key, value in form_data.items():
            if key_part.lower() in key.lower():
                return value
        return ''
    
    # Helper to get signature value for a Görev
    def get_signature(gorev: str) -> str:
        # Look for attribute with name like "Görev Onayı"
        signature_key = f"{gorev} Onayı"
        return form_data.get(signature_key, "")
    
    # Helper to parse İşin Sorumlusu/Bölümü field
    def get_isin_sorumlusu_bolumu() -> str:
        """
        Parse İşin Sorumlusu/Bölümü which is an array with one object.
        Extract name from arr[0]['name']
        Extract department from arr[0]['department'], split by '_' and use last 3 items
        Return formatted as: "Name - Dept1 Dept2 Dept3"
        """
        isin_sorumlusu_raw = form_data.get("İşin Sorumlusu", None)
        
        return isin_sorumlusu_raw
    
    # Create PDF with portrait orientation (A4)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.5*cm,
        leftMargin=0.5*cm,
        topMargin=1*cm,
        bottomMargin=1*cm
    )
    
    elements = []
    
    # Colors matching Excel
    blue_header = colors.HexColor('#243b83')
    blue_bg = colors.HexColor('#D3D3D3')
    blue_border = colors.black
    
    # Define column width (Excel has 8 columns total in the layout)
    col_width = 3.5*cm  # Each column is 3.5cm
    
    # Get Feragat Türü to determine layout (needed for header title)
    feragat_turu = form_data.get("Feragat Türü", "")
    print(f"[create_feragat_pdf] Feragat Türü: {feragat_turu}")
    
    # Get Feragat No from form_data
    feragat_no = form_data.get("Feragat No", "")
    
    # Determine header title based on feragat_turu
    header_title = "Alt Yüklenici Feragat Formu" if feragat_turu == "Alt Yüklenici" else "Uyarlama Feragat Formu"
    
    # Logo path - works both locally and in Docker container
    # Get the backend root directory (where main.py is located)
    backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
    logo_path = os.path.join(backend_root, "public", "feragat_aselsan.jpg")
    
    # Alternative: check if running in Docker and use absolute path if needed
    if not os.path.exists(logo_path):
        # Try alternative path for Docker
        logo_path = "/app/public/feragat_aselsan.jpg"
    
    print(f"[DEBUG] Logo path: {logo_path}, exists: {os.path.exists(logo_path)}")
    
    # Create logo image with appropriate dimensions (fits in 2 columns = 5cm width)
    try:
        logo_img = Image(logo_path, width=4.5*cm, height=1.3*cm)
    except Exception as e:
        print(f"[ERROR] Failed to load logo from {logo_path}: {e}")
        # Fallback to text if logo fails to load
        logo_img = Paragraph('<b><font size=11 color="#1e3a8a">aselsan</font></b>', 
                            ParagraphStyle('Logo', fontSize=11, leading=7, alignment=0, fontName=FONT_NAME))
    
    # Define column width (Excel has 8 columns total in the layout)
    # For portrait A4: 21cm - 1cm margins = 20cm / 8 = 2.5cm per column
    col_width = 2.5*cm  # Each column is 2.5cm
    
    # Create header with exact Excel layout
    # Logo area spans 2 columns (2 rows) - narrower
    # Title spans 5 columns (2 rows) - wider
    # No: column has 2 rows - top row blue background, bottom row white
    # Total: 8 columns, 2 rows
    
    header_data = [
        # Row 1: Top row
        [
            logo_img,  # Use logo image instead of text
            '',  # Column 2 (part of logo span)
            Paragraph(f'<b><font size=14 color="#1e3a8a">{header_title}</font></b>', 
                      ParagraphStyle('Title', fontSize=14, alignment=1, leading=16, fontName=FONT_NAME_BOLD)),
            '',  # Column 4 (part of title span)
            '',  # Column 5 (part of title span)
            '',  # Column 6 (part of title span)
            '',  # Column 7 (part of title span)
            Paragraph(f'<b><font size=8 color="#1e3a8a">Feragat No:</font></b>', 
                      ParagraphStyle('No', fontSize=8, alignment=0, fontName=FONT_NAME_BOLD))
        ],
        # Row 2: Bottom row (only for No: column, others span both rows)
        [
            '',  # Logo continues (row span)
            '',  # Logo continues (row span)
            '',  # Title continues (row span)
            '',  # Title continues (row span)
            '',  # Title continues (row span)
            '',  # Title continues (row span)
            '',  # Title continues (row span)
            Paragraph(f'<font size=8 color="#374151">{feragat_no}</font>',
                      ParagraphStyle('NoValue', fontSize=8, alignment=0, fontName=FONT_NAME))
        ]
    ]
    
    # Create table with 8 columns, 2 rows
    header_table = Table(header_data, colWidths=[col_width]*8, rowHeights=[0.8*cm, 0.8*cm])
    header_table.setStyle(TableStyle([
        # Merge cells for logo (columns 0-1, rows 0-1) - spans 2 rows
        ('SPAN', (0, 0), (1, 1)),
        # Merge cells for title (columns 2-6, rows 0-1) - spans 2 rows
        ('SPAN', (2, 0), (6, 1)),
        # Column 7: Row 0 has "No:" with blue background, Row 1 is white
        
        # Background colors
        #('BACKGROUND', (2, 0), (6, 1), colors.HexColor('#D3D3D3')),  # Title background gray
        ('BACKGROUND', (7, 0), (7, 0), blue_bg),  # Light blue for No: row
        ('BACKGROUND', (7, 1), (7, 1), colors.white),  # White for empty row below
        
        # Alignment
        ('ALIGN', (0, 0), (1, 1), 'LEFT'),
        ('ALIGN', (2, 0), (6, 1), 'CENTER'),
        ('ALIGN', (7, 0), (7, 0), 'LEFT'),
        ('VALIGN', (0, 0), (1, 1), 'MIDDLE'),
        ('VALIGN', (2, 0), (6, 1), 'MIDDLE'),
        ('VALIGN', (7, 0), (7, 0), 'TOP'),
        
        # Black borders around all cells
        ('BOX', (0, 0), (1, 1), 1.5, colors.black),
        ('BOX', (2, 0), (6, 1), 1.5, colors.black),
        ('BOX', (7, 0), (7, 1), 1.5, colors.black),
        ('LINEAFTER', (7, 0), (7, 0), 1.5, colors.black),  # Line between No: rows
        
        # Padding
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(header_table)
    
    # Section A header - NO SPACER, directly attached
    section_a = Table([[Paragraph('<b>A. GENEL BİLGİLER</b>', 
                                  ParagraphStyle('SecA', fontSize=10, alignment=1, textColor=colors.white, fontName=FONT_NAME_BOLD))]], 
                      colWidths=[col_width*8])
    section_a.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), blue_header),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(section_a)
    
    # Section A content differs based on Feragat Türü
    if feragat_turu == "Alt Yüklenici":
        # Alt Yüklenici layout
        # Row 1: 3 fields spanning full width
        row1_alt_data = [
            # Sub-row 1: Labels
            [
                Paragraph('<b>1. Firma Adı/Satıcı no</b>', 
                          ParagraphStyle('AL1', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',
                '',
                Paragraph('<b>2. Firmaya Daha Önceden Gerçekleştirilen Tetkik</b>', 
                          ParagraphStyle('AL2', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',
                Paragraph('<b>3. Firmaya Ait Önceden Alınan Feragatler</b>', 
                          ParagraphStyle('AL3', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',
                ''
            ],
            # Sub-row 2: Values
            [
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Firma Adı/ Satıcı No", "")}</font>', 
                          ParagraphStyle('AV1', fontSize=8, fontName=FONT_NAME)),
                '',
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Firmaya Daha Önceden Gerçekleştirilen Tetkik", "")}</font>', 
                          ParagraphStyle('AV2', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Firmaya Ait Önceden Alınan Feragatler", "")}</font>', 
                          ParagraphStyle('AV3', fontSize=8, fontName=FONT_NAME)),
                '',
                ''
            ]
        ]
        
        row1_alt_table = Table(row1_alt_data, colWidths=[col_width]*8)
        row1_alt_table.setStyle(TableStyle([
            ('SPAN', (0, 0), (2, 0)),  # Firma Adı label
            ('SPAN', (3, 0), (4, 0)),  # Tetkik label
            ('SPAN', (5, 0), (7, 0)),  # Feragatlar label
            ('SPAN', (0, 1), (2, 1)),  # Firma Adı value
            ('SPAN', (3, 1), (4, 1)),  # Tetkik value
            ('SPAN', (5, 1), (7, 1)),  # Feragatlar value
            ('GRID', (0, 0), (-1, -1), 1, blue_border),
            ('BACKGROUND', (0, 0), (-1, 0), blue_bg),
            ('BACKGROUND', (0, 1), (-1, 1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(row1_alt_table)
        
        # Row 2: Proje No, Proje Tanımı, Müşteri, Proje Tipi (same as Radar/EH)
        row2_alt_data = [
            [
                Paragraph('<b>4. Proje No</b>', 
                          ParagraphStyle('AL4', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',
                Paragraph('<b>5. Proje Tanımı</b>', 
                          ParagraphStyle('AL5', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',
                Paragraph('<b>6. Müşteri</b>', 
                          ParagraphStyle('AL6', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',
                Paragraph('<b>7. Proje Tipi</b>', 
                          ParagraphStyle('AL7', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                ''
            ],
            [
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje No (Proje kodu ve U-P" + chr(39) + "li kodu XXXX/PYYYYYYY)", "")}</font>', 
                          ParagraphStyle('AV4', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje Tanımı ( Proje Adı)", "")}</font>', 
                          ParagraphStyle('AV5', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Müşteri ( Proje Ana Sözleşmesi" + chr(39) + "nin imza makamı )", "")}</font>', 
                          ParagraphStyle('AV6', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje Tipi", "")}</font>', 
                          ParagraphStyle('AV7', fontSize=8, fontName=FONT_NAME)),
                ''
            ]
        ]
        
        row2_alt_table = Table(row2_alt_data, colWidths=[col_width]*8)
        row2_alt_table.setStyle(TableStyle([
            ('SPAN', (0, 0), (1, 0)),  # Proje No label
            ('SPAN', (2, 0), (3, 0)),  # Proje Tanımı label
            ('SPAN', (4, 0), (5, 0)),  # Müşteri label
            ('SPAN', (6, 0), (7, 0)),  # Proje Tipi label
            ('SPAN', (0, 1), (1, 1)),  # Proje No value
            ('SPAN', (2, 1), (3, 1)),  # Proje Tanımı value
            ('SPAN', (4, 1), (5, 1)),  # Müşteri value
            ('SPAN', (6, 1), (7, 1)),  # Proje Tipi value
            ('GRID', (0, 0), (-1, -1), 1, blue_border),
            ('BACKGROUND', (0, 0), (-1, 0), blue_bg),
            ('BACKGROUND', (0, 1), (-1, 1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(row2_alt_table)
        
        # Row 3: 6 fields
        row3_alt_data = [
            [
                Paragraph('<b>8. Malzeme No</b>', 
                          ParagraphStyle('AL8', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                Paragraph('<b>9. Malzeme Tanımı</b>', 
                          ParagraphStyle('AL9', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',
                Paragraph('<b>10. Alım Türü</b>', 
                          ParagraphStyle('AL10', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                Paragraph('<b>11. Alım Adedi</b>', 
                          ParagraphStyle('AL11', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                Paragraph('<b>12. İşin Sorumlusu/Bölümü</b>', 
                          ParagraphStyle('AL12', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',
                Paragraph('<b>13. Bildirim No</b>', 
                          ParagraphStyle('AL13', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD))
            ],
            [
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Malzeme No", "")}</font>', 
                          ParagraphStyle('AV8', fontSize=8, fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Malzeme Tanımı", "")}</font>', 
                          ParagraphStyle('AV9', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Alım Türü", "")}</font>', 
                          ParagraphStyle('AV10', fontSize=8, fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Alım Adedi", "")}</font>', 
                          ParagraphStyle('AV11', fontSize=8, fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{get_isin_sorumlusu_bolumu()}</font>', 
                          ParagraphStyle('AV12', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Bildirim Numarası", "")}</font>', 
                          ParagraphStyle('AV13', fontSize=8, fontName=FONT_NAME))
            ]
        ]
        
        row3_alt_table = Table(row3_alt_data, colWidths=[col_width]*8)
        row3_alt_table.setStyle(TableStyle([
            # Row 0 (labels) - no spans needed, each cell separate
            ('SPAN', (1, 0), (2, 0)),  # Malzeme Tanımı label
            ('SPAN', (5, 0), (6, 0)),  # İşin Sorumlusu label
            # Row 1 (values)
            ('SPAN', (1, 1), (2, 1)),  # Malzeme Tanımı value
            ('SPAN', (5, 1), (6, 1)),  # İşin Sorumlusu value
            ('GRID', (0, 0), (-1, -1), 1, blue_border),
            ('BACKGROUND', (0, 0), (-1, 0), blue_bg),
            ('BACKGROUND', (0, 1), (-1, 1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(row3_alt_table)
        
    else:
        # Default layout for Radar and Elektronik Harp
        # Row 1: Split into 2 sub-rows - labels and values
        row1_data = [
            # Sub-row 1: Labels (blue background)
            [
                Paragraph('<b>1. Proje No</b>', 
                          ParagraphStyle('L1', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',  # Column 1 (part of Proje No span)
                Paragraph('<b>2. Proje Tanımı</b>', 
                          ParagraphStyle('L2', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',  # Column 3 (part of Proje Tanımı span)
                Paragraph('<b>3. Müşteri</b>', 
                          ParagraphStyle('L3', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',  # Column 5 (part of Müşteri span)
                Paragraph('<b>4. Proje Tipi</b>', 
                          ParagraphStyle('L4', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',  # Column 7 (part of Proje Tipi span)
            ],
            # Sub-row 2: Values from database (white background)
            [
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje No (Proje kodu ve U-P" + chr(39) + "li kodu XXXX/PYYYYYYY)", "")}</font>', 
                          ParagraphStyle('V1', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                '',  # Column 1 (part of value span)
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje Tanımı ( Proje Adı)", "")}</font>', 
                          ParagraphStyle('V2', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                '',  # Column 3 (part of value span)
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Müşteri ( Proje Ana Sözleşmesi" + chr(39) + "nin imza makamı )", "")}</font>', 
                          ParagraphStyle('V3', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                '',  # Column 5 (part of value span)
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje Tipi", "")}</font>', 
                          ParagraphStyle('V4', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                '',  # Column 7 (part of value span)
            ]
        ]
        
        row1_table = Table(row1_data, colWidths=[col_width]*8)
        row1_table.setStyle(TableStyle([
            # Spans for both rows
            # Row 0 (labels):
            ('SPAN', (0, 0), (1, 0)),  # Proje No
            ('SPAN', (2, 0), (3, 0)),  # Proje Tanımı
            ('SPAN', (4, 0), (5, 0)),  # Müşteri
            ('SPAN', (6, 0), (7, 0)),  # Proje Tipi
            
            # Row 1 (values):
            ('SPAN', (0, 1), (1, 1)),  # Proje No value
            ('SPAN', (2, 1), (3, 1)),  # Proje Tanımı value
            ('SPAN', (4, 1), (5, 1)),  # Müşteri value
            ('SPAN', (6, 1), (7, 1)),  # Proje Tipi value
            
            # Borders
            ('GRID', (0, 0), (-1, -1), 1, blue_border),
            
            # Background: Row 0 (labels) blue, Row 1 (values) white
            ('BACKGROUND', (0, 0), (-1, 0), blue_bg),  # All labels blue
            ('BACKGROUND', (0, 1), (-1, 1), colors.white),  # All values white
            
            # Alignment
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(row1_table)
        
        # Row 2: 8 columns with different layout
        # Columns 0-1: Proje Aşaması (2 cols)
        # Columns 2-3: Proje Süresi (2 cols)
        # Columns 4-5: İlgili Süreçler + Feragat Sorumlusu/AY Sorumlusu (under Müşteri, 2 cols total)
        # Columns 6-7: Feragat Bildirim Numarası (under Proje Tipi, 2 cols)
        
        # Determine which sorumlu attribute to use based on feragat_turu
        sorumlu_label = "AY Sorumlusu" if feragat_turu == "Alt Yüklenici" else "Feragat Sorumlusu"
        sorumlu_attr = "AY Sorumlusu" if feragat_turu == "Alt Yüklenici" else "Feragat Sorumlusu"
        
        # Row 2: Split into 2 sub-rows to separate labels from values
        # Sub-row 1: Labels with blue background
        # Sub-row 2: Values with white background
        row2_data = [
            # Sub-row 1: Labels (blue background for attribute names)
            [
                Paragraph('<b>5. Proje Aşaması</b>', 
                          ParagraphStyle('L5', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',  # Column 1 (part of Proje Aşaması span)
                Paragraph('<b>6. Proje Süresi (ay)</b>', 
                          ParagraphStyle('L6', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',  # Column 3 (part of Proje Süresi span)
                Paragraph('<b>7. İlgili Süreçler</b>', 
                          ParagraphStyle('L7', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                Paragraph(f'<b>{sorumlu_label}</b>', 
                          ParagraphStyle('L8', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                Paragraph('<b>9. Feragat Bildirim Numarası</b>', 
                          ParagraphStyle('L9', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',  # Column 7 (part of Feragat Bildirim span)
            ],
            # Sub-row 2: Values from database (white background)
            [
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje Aşaması", "")}</font>', 
                          ParagraphStyle('V5', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                '',  # Column 1 (part of value span)
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje Süresi (ay)", "")}</font>', 
                          ParagraphStyle('V6', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                '',  # Column 3 (part of value span)
                Paragraph(f'<font size=8 color="#374151">{form_data.get("İlgili Süreçler ( Hangi Süreçler Etkileniyor? )", "")}</font>', 
                          ParagraphStyle('V7', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{form_data.get(sorumlu_attr, "")}</font>', 
                          ParagraphStyle('V8', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Feragat Bildirim Numarası", "")}</font>', 
                          ParagraphStyle('V9', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                '',  # Column 7 (part of value span)
            ]
        ]
        
        row2_table = Table(row2_data, colWidths=[col_width]*8)
        row2_table.setStyle(TableStyle([
            # Spans for both rows
            # Row 0 (labels):
            ('SPAN', (0, 0), (1, 0)),  # Proje Aşaması - columns 0-1
            ('SPAN', (2, 0), (3, 0)),  # Proje Süresi - columns 2-3
            # İlgili Süreçler - column 4 (1 col)
            # Feragat Sorumlusu/AY Sorumlusu - column 5 (1 col)
            ('SPAN', (6, 0), (7, 0)),  # Feragat Bildirim - columns 6-7
            
            # Row 1 (values):
            ('SPAN', (0, 1), (1, 1)),  # Proje Aşaması value - columns 0-1
            ('SPAN', (2, 1), (3, 1)),  # Proje Süresi value - columns 2-3
            # İlgili Süreçler value - column 4 (1 col)
            # Feragat Sorumlusu/AY Sorumlusu value - column 5 (1 col)
            ('SPAN', (6, 1), (7, 1)),  # Feragat Bildirim value - columns 6-7
            
            # Borders
            ('GRID', (0, 0), (-1, -1), 1, blue_border),
            
            # Background: Row 0 (labels) blue, Row 1 (values) white
            ('BACKGROUND', (0, 0), (-1, 0), blue_bg),  # All labels blue
            ('BACKGROUND', (0, 1), (-1, 1), colors.white),  # All values white
            
            # Alignment
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(row2_table)
    
    # Section B header - Different content based on Feragat Türü
    if feragat_turu == "Alt Yüklenici":
        # Alt Yüklenici specific Section B
        section_b = Table([[Paragraph('<b>B. FERAGATE AİT DEĞERLENDİRMELER</b>', 
                                      ParagraphStyle('SecB', fontSize=10, alignment=1, textColor=colors.white, fontName=FONT_NAME_BOLD))]], 
                          colWidths=[col_width*8])
        section_b.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), blue_header),
            ('BOX', (0, 0), (-1, -1), 1.5, colors.black),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(section_b)
        
        # Alt Yüklenici - 3 column table with B1, B2, B3... rows
        # Get the attribute values for the questions
        degerlendirme_question_1 = "Firmanın onaylı olduğu bir faaliyet var mı, varsa nelerdir?"
        degerlendirme_value_1 = form_data.get("Firmanın onaylı olduğu bir faaliyet var mı, varsa nelerdir?", "")
        
        degerlendirme_question_2 = "Firma hangi faaliyet alanlarında feragat alacaktır?"
        degerlendirme_value_2 = form_data.get("Firma hangi faaliyet alanlarında feragat alacaktır?", "")
        
        degerlendirme_question_3 = "Firmaya daha önce bir tetkik / ön ziyaret gerçekleştirildi mi ?"
        degerlendirme_value_3_raw = form_data.get("Firmaya daha önce bir tetkik / ön ziyaret gerçekleştirildi mi ?", "")
        
        # Check if value is true
        is_tetkik_true = False
        if isinstance(degerlendirme_value_3_raw, bool):
            is_tetkik_true = degerlendirme_value_3_raw
        elif isinstance(degerlendirme_value_3_raw, str):
            if degerlendirme_value_3_raw.lower() in ['true', '1', 'yes', 'evet']:
                is_tetkik_true = True
        
        # Build the question and answer text for B3
        if is_tetkik_true:
            # Get additional values
            tetkik_tarihi = form_data.get("Tetkik Tarihi", "")
            tetkik_tespitler = form_data.get("Tetkikte ortaya çıkan başlıca tespitler nelerdir ?", "")
            
            # Create a sub-table for proper alignment
            # Question column - create nested table
            question_sub_data = [
                [Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_3}</font>', 
                          ParagraphStyle('DQ3a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">a) Tetkik Tarihi</font>', 
                          ParagraphStyle('DQ3b', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">b) Tetkikte ortaya çıkan başlıca tespitler nelerdir ?</font>', 
                          ParagraphStyle('DQ3c', fontSize=8, fontName=FONT_NAME))]
            ]
            question_sub_table = Table(question_sub_data, colWidths=[col_width*3.7])
            question_sub_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after main question
                ('BOTTOMPADDING', (0, 1), (0, 1), 4),  # Space after a)
                ('BOTTOMPADDING', (0, 2), (0, 2), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            # Answer column - create nested table
            value_sub_data = [
                [Paragraph(f'<font size=8 color="#374151">Evet</font>', 
                          ParagraphStyle('DV3a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">{tetkik_tarihi}</font>', 
                          ParagraphStyle('DV3b', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">{tetkik_tespitler}</font>', 
                          ParagraphStyle('DV3c', fontSize=8, fontName=FONT_NAME))]
            ]
            value_sub_table = Table(value_sub_data, colWidths=[col_width*3.5])
            value_sub_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after Evet
                ('BOTTOMPADDING', (0, 1), (0, 1), 4),  # Space after date
                ('BOTTOMPADDING', (0, 2), (0, 2), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            degerlendirme_question_3_cell = question_sub_table
            degerlendirme_value_3_cell = value_sub_table
        else:
            degerlendirme_question_3_cell = Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_3}</font>', 
                          ParagraphStyle('DQ3', fontSize=8, fontName=FONT_NAME))
            degerlendirme_value_3_cell = Paragraph(f'<font size=8 color="#374151">Hayır</font>', 
                          ParagraphStyle('DV3', fontSize=8, fontName=FONT_NAME))
        
        # B4 - Firmaya Ait Önceden Alınan Feragat
        degerlendirme_question_4 = "Firmaya Ait Önceden Alınan Feragat var mı ?"
        degerlendirme_value_4_raw = form_data.get("Firmaya Ait Önceden Alınan Feragat var mı ?", "")
        
        # Check if value is true
        is_feragat_true = False
        if isinstance(degerlendirme_value_4_raw, bool):
            is_feragat_true = degerlendirme_value_4_raw
        elif isinstance(degerlendirme_value_4_raw, str):
            if degerlendirme_value_4_raw.lower() in ['true', '1', 'yes', 'evet']:
                is_feragat_true = True
        
        # Build the question and answer text for B4
        if is_feragat_true:
            # Get additional values
            feragat_tarihi = form_data.get("Feragat Tarihi", "")
            feragat_konu = form_data.get("Feragat Alınan Konu (X birimi tasarımı/üretimi vb.)", "")
            feragat_odeme = form_data.get("Feragatlere konulan ödeme şerhi var mı? Varsa son durumu nedir?", "")
            
            # Create a sub-table for proper alignment
            # Question column - create nested table
            question_sub_data_4 = [
                [Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_4}</font>', 
                          ParagraphStyle('DQ4a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">a) Feragat Tarihi</font>', 
                          ParagraphStyle('DQ4b', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">b) Feragat Alınan Konu (X birimi tasarımı/üretimi vb.)</font>', 
                          ParagraphStyle('DQ4c', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">c) Feragatlere konulan ödeme şerhi var mı? Varsa son durumu nedir?</font>', 
                          ParagraphStyle('DQ4d', fontSize=8, fontName=FONT_NAME))]
            ]
            question_sub_table_4 = Table(question_sub_data_4, colWidths=[col_width*3.7])
            question_sub_table_4.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after main question
                ('BOTTOMPADDING', (0, 1), (0, 1), 4),  # Space after a)
                ('BOTTOMPADDING', (0, 2), (0, 2), 4),  # Space after b)
                ('BOTTOMPADDING', (0, 3), (0, 3), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            # Answer column - create nested table
            value_sub_data_4 = [
                [Paragraph(f'<font size=8 color="#374151">Evet</font>', 
                          ParagraphStyle('DV4a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">{feragat_tarihi}</font>', 
                          ParagraphStyle('DV4b', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">{feragat_konu}</font>', 
                          ParagraphStyle('DV4c', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">{feragat_odeme}</font>', 
                          ParagraphStyle('DV4d', fontSize=8, fontName=FONT_NAME))]
            ]
            value_sub_table_4 = Table(value_sub_data_4, colWidths=[col_width*3.5])
            value_sub_table_4.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after Evet
                ('BOTTOMPADDING', (0, 1), (0, 1), 4),  # Space after date
                ('BOTTOMPADDING', (0, 2), (0, 2), 4),  # Space after konu
                ('BOTTOMPADDING', (0, 3), (0, 3), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            degerlendirme_question_4_cell = question_sub_table_4
            degerlendirme_value_4_cell = value_sub_table_4
        else:
            degerlendirme_question_4_cell = Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_4}</font>', 
                          ParagraphStyle('DQ4', fontSize=8, fontName=FONT_NAME))
            degerlendirme_value_4_cell = Paragraph(f'<font size=8 color="#374151">Hayır</font>', 
                          ParagraphStyle('DV4', fontSize=8, fontName=FONT_NAME))
        
        # B5 - Sipariş geçilmeden önce onaylı AY başvurusu sağlandı mı ?
        degerlendirme_question_5 = "Sipariş geçilmeden önce onaylı AY başvurusu sağlandı mı ?"
        degerlendirme_value_5_raw = form_data.get("Sipariş geçilmeden önce onaylı AY başvurusu sağlandı mı ?", "")
        
        # Check if value is true
        is_basvuru_true = False
        if isinstance(degerlendirme_value_5_raw, bool):
            is_basvuru_true = degerlendirme_value_5_raw
        elif isinstance(degerlendirme_value_5_raw, str):
            if degerlendirme_value_5_raw.lower() in ['true', '1', 'yes', 'evet']:
                is_basvuru_true = True
        
        # Build the question and answer text for B5
        if is_basvuru_true:
            # Get additional value
            basvuru_tarihi = form_data.get("Başvuru Tarihi", "")
            
            # Create a sub-table for proper alignment
            # Question column - create nested table
            question_sub_data_5 = [
                [Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_5}</font>', 
                          ParagraphStyle('DQ5a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">a) Başvuru Tarihi</font>', 
                          ParagraphStyle('DQ5b', fontSize=8, fontName=FONT_NAME))]
            ]
            question_sub_table_5 = Table(question_sub_data_5, colWidths=[col_width*3.7])
            question_sub_table_5.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after main question
                ('BOTTOMPADDING', (0, 1), (0, 1), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            # Answer column - create nested table
            value_sub_data_5 = [
                [Paragraph(f'<font size=8 color="#374151">Evet</font>', 
                          ParagraphStyle('DV5a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">{basvuru_tarihi}</font>', 
                          ParagraphStyle('DV5b', fontSize=8, fontName=FONT_NAME))]
            ]
            value_sub_table_5 = Table(value_sub_data_5, colWidths=[col_width*3.5])
            value_sub_table_5.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after Evet
                ('BOTTOMPADDING', (0, 1), (0, 1), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            degerlendirme_question_5_cell = question_sub_table_5
            degerlendirme_value_5_cell = value_sub_table_5
        else:
            degerlendirme_question_5_cell = Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_5}</font>', 
                          ParagraphStyle('DQ5', fontSize=8, fontName=FONT_NAME))
            degerlendirme_value_5_cell = Paragraph(f'<font size=8 color="#374151">Hayır</font>', 
                          ParagraphStyle('DV5', fontSize=8, fontName=FONT_NAME))
        
        # B6 - Teklif dönemi/öncesinde, teknik isterlerin yanı sıra idari/kalite isterleri firmaya iletildi mi?
        degerlendirme_question_6 = "Teklif dönemi/öncesinde, teknik isterlerin yanı sıra idari/kalite isterleri firmaya iletildi mi?"
        degerlendirme_value_6_raw = form_data.get("Teklif dönemi/öncesinde, teknik isterlerin yanı sıra idari/kalite isterleri firmaya iletildi mi?", "")
        
        # Check if value is true
        is_kgk_true = False
        if isinstance(degerlendirme_value_6_raw, bool):
            is_kgk_true = degerlendirme_value_6_raw
        elif isinstance(degerlendirme_value_6_raw, str):
            if degerlendirme_value_6_raw.lower() in ['true', '1', 'yes', 'evet']:
                is_kgk_true = True
        
        # Build the question and answer text for B6
        if is_kgk_true:
            # If true, show "Firmaya iletilen KGK'lar"
            kgk_iletilen = form_data.get("Firmaya iletilen KGK'lar", "")
            
            # Create a sub-table for proper alignment
            # Question column - create nested table
            question_sub_data_6 = [
                [Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_6}</font>', 
                          ParagraphStyle('DQ6a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">a) Firmaya iletilen KGK\'lar</font>', 
                          ParagraphStyle('DQ6b', fontSize=8, fontName=FONT_NAME))]
            ]
            question_sub_table_6 = Table(question_sub_data_6, colWidths=[col_width*3.7])
            question_sub_table_6.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after main question
                ('BOTTOMPADDING', (0, 1), (0, 1), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            # Answer column - create nested table
            value_sub_data_6 = [
                [Paragraph(f'<font size=8 color="#374151">Evet</font>', 
                          ParagraphStyle('DV6a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">{kgk_iletilen}</font>', 
                          ParagraphStyle('DV6b', fontSize=8, fontName=FONT_NAME))]
            ]
            value_sub_table_6 = Table(value_sub_data_6, colWidths=[col_width*3.5])
            value_sub_table_6.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after Evet
                ('BOTTOMPADDING', (0, 1), (0, 1), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            degerlendirme_question_6_cell = question_sub_table_6
            degerlendirme_value_6_cell = value_sub_table_6
        else:
            # If false, show "Firmaya KGK'ların nasıl aktarılacağı bilgisi"
            kgk_aktarilacak = form_data.get("Firmaya KGK'ların nasıl aktarılacağı bilgisi", "")
            
            # Create a sub-table for proper alignment
            # Question column - create nested table
            question_sub_data_6 = [
                [Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_6}</font>', 
                          ParagraphStyle('DQ6a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">a) Firmaya KGK\'ların nasıl aktarılacağı bilgisi</font>', 
                          ParagraphStyle('DQ6b', fontSize=8, fontName=FONT_NAME))]
            ]
            question_sub_table_6 = Table(question_sub_data_6, colWidths=[col_width*3.7])
            question_sub_table_6.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after main question
                ('BOTTOMPADDING', (0, 1), (0, 1), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            # Answer column - create nested table
            value_sub_data_6 = [
                [Paragraph(f'<font size=8 color="#374151">Hayır</font>', 
                          ParagraphStyle('DV6a', fontSize=8, fontName=FONT_NAME))],
                [Paragraph(f'<font size=8 color="#374151">{kgk_aktarilacak}</font>', 
                          ParagraphStyle('DV6b', fontSize=8, fontName=FONT_NAME))]
            ]
            value_sub_table_6 = Table(value_sub_data_6, colWidths=[col_width*3.5])
            value_sub_table_6.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 8),  # Space after Hayır
                ('BOTTOMPADDING', (0, 1), (0, 1), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            degerlendirme_question_6_cell = question_sub_table_6
            degerlendirme_value_6_cell = value_sub_table_6
        
        # Build degerlendirme data (can be extended with more questions)
        degerlendirme_data = [
            [
                'B1',
                Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_1}</font>', 
                          ParagraphStyle('DQ1', fontSize=8, fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{degerlendirme_value_1}</font>', 
                          ParagraphStyle('DV1', fontSize=8, fontName=FONT_NAME))
            ],
            [
                'B2',
                Paragraph(f'<font size=8 color="#374151">{degerlendirme_question_2}</font>', 
                          ParagraphStyle('DQ2', fontSize=8, fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{degerlendirme_value_2}</font>', 
                          ParagraphStyle('DV2', fontSize=8, fontName=FONT_NAME))
            ],
            [
                'B3',
                degerlendirme_question_3_cell,
                degerlendirme_value_3_cell
            ],
            [
                'B4',
                degerlendirme_question_4_cell,
                degerlendirme_value_4_cell
            ],
            [
                'B5',
                degerlendirme_question_5_cell,
                degerlendirme_value_5_cell
            ],
            [
                'B6',
                degerlendirme_question_6_cell,
                degerlendirme_value_6_cell
            ]
        ]
        
        # Create table: Column widths - BX (narrow), Question (wider), Answer (narrower)
        # No fixed rowHeights - let table auto-calculate based on content
        degerlendirme_table = Table(degerlendirme_data, 
                                     colWidths=[col_width*0.8, col_width*3.7, col_width*3.5])
        degerlendirme_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#D3D3D3')),  # Gray background for BX column
            ('BACKGROUND', (1, 0), (-1, -1), colors.white),  # White background for other columns
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('FONTNAME', (0, 0), (0, -1), FONT_NAME_BOLD),
            ('FONTSIZE', (0, 0), (0, -1), 10),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('VALIGN', (0, 0), (0, -1), 'MIDDLE'),
        ]))
        elements.append(degerlendirme_table)
        
    else:
        # Original Section B for other Feragat Türü types
        section_b = Table([[Paragraph('<b>B. TALEP EDİLEN FERAGAT</b>', 
                                      ParagraphStyle('SecB', fontSize=10, alignment=1, textColor=colors.white, fontName=FONT_NAME_BOLD))]], 
                          colWidths=[col_width*8])
        section_b.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), blue_header),
            ('BOX', (0, 0), (-1, -1), 1.5, colors.black),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(section_b)
        
        # Talep items - DYNAMIC: Show all "Talep Edilen Feragat" attributes from database
        # Find all attributes that start with "Talep Edilen Feragat" but exclude "Hakkında Gerekçeler"
        talep_items = []
        for key, value in form_data.items():
            if "Detaylı açıklayınız" in key:
                talep_items.append(value)
        
        # If no talep items found, show at least 2 empty rows as default
        if not talep_items:
            talep_items = ["", ""]
        
        # Build talep data dynamically
        talep_data = []
        for idx, talep_value in enumerate(talep_items, start=1):
            talep_data.append([
                str(idx), 
                Paragraph(f'<font size=8 color="#374151">{talep_value}</font>', 
                          ParagraphStyle(f'T{idx}', fontSize=8, fontName=FONT_NAME)),
                '', '', '', '', '', ''  # Fill remaining columns
            ])
        
        # No fixed rowHeights - let table auto-calculate based on content
        talep_table = Table(talep_data, colWidths=[col_width] + [col_width]*7)
        talep_table.setStyle(TableStyle([
            # Span content across columns 1-7 for all rows (leaving column 0 for number)
            *[('SPAN', (1, i), (7, i)) for i in range(len(talep_data))],
            
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (0, -1), 10),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ]))
        elements.append(talep_table)
    
    # Section C: FERAGATE AIT GEREKÇELER
    section_c = Table([[Paragraph('<b>C. FERAGATE AIT GEREKÇELER</b>', 
                                  ParagraphStyle('SecC', fontSize=10, alignment=1, textColor=colors.white, fontName=FONT_NAME_BOLD))]], 
                      colWidths=[col_width*8])
    section_c.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), blue_header),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(section_c)
    
    # Different Section C design for Alt Yüklenici
    if feragat_turu == "Alt Yüklenici":
        # Alt Yüklenici: 2 column table (CX, content)
        gerekce_attr_value = form_data.get("Feragate Ait Gerekçeler", None)
        
        print(f"[DEBUG] Alt Yüklenici - Feragate Ait Gerekçeler type: {type(gerekce_attr_value)}")
        print(f"[DEBUG] Alt Yüklenici - Feragate Ait Gerekçeler: {gerekce_attr_value}")
        
        gerekce_data = []
        
        if gerekce_attr_value:
            gerekce_list = []
            
            # Parse the array (should already be a list from database)
            if isinstance(gerekce_attr_value, list):
                print(f"[DEBUG] gerekce_attr_value is a list with {len(gerekce_attr_value)} items")
                for item in gerekce_attr_value:
                    if isinstance(item, dict):
                        # Each object has one key:value, get the value
                        for k, v in item.items():
                            gerekce_list.append(str(v))
                    elif isinstance(item, str):
                        gerekce_list.append(item)
            elif isinstance(gerekce_attr_value, str):
                # If it's a string, try to parse as JSON
                try:
                    parsed_value = json.loads(gerekce_attr_value)
                    if isinstance(parsed_value, list):
                        for item in parsed_value:
                            if isinstance(item, dict):
                                for k, v in item.items():
                                    gerekce_list.append(str(v))
                            elif isinstance(item, str):
                                gerekce_list.append(item)
                except (json.JSONDecodeError, TypeError) as e:
                    print(f"[DEBUG] Failed to parse JSON: {e}")
            
            print(f"[DEBUG] Alt Yüklenici gerekce_list: {gerekce_list}")
            
            # Create rows dynamically - each array item is a row
            for idx, value in enumerate(gerekce_list, start=1):
                gerekce_data.append([
                    f'C{idx}',
                    Paragraph(f'<font size=8 color="#374151">{value}</font>', 
                              ParagraphStyle(f'C{idx}', fontSize=8, fontName=FONT_NAME))
                ])
        
        # If no data, show at least 1 empty row
        if not gerekce_data:
            gerekce_data = [['C1', '']]
        
        print(f"[DEBUG] Alt Yüklenici total gerekce rows: {len(gerekce_data)}")
        
        # 2 columns: CX (narrow), Content (wide)
        # No fixed rowHeights - let table auto-calculate based on content
        gerekce_table = Table(gerekce_data, colWidths=[col_width*0.8, col_width*7.2])
        gerekce_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#D3D3D3')),  # Gray background for CX column
            ('BACKGROUND', (1, 0), (-1, -1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('FONTNAME', (0, 0), (0, -1), FONT_NAME_BOLD),
            ('FONTSIZE', (0, 0), (0, -1), 10),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('VALIGN', (0, 0), (0, -1), 'MIDDLE'),
        ]))
        elements.append(gerekce_table)
        
    else:
        # Original Section C for other Feragat Türü types
        # C Section items - Dynamic: Show all "Talep Edilen Feragat Hakkında Gerekçeler" attributes
        gerekce_items = {}
        for key, value in form_data.items():
            if "Hakkında Gerekçeler" in key:
                gerekce_items[key] = value
        
        # Sort gerekce_items by the number in the key (e.g., Feragat-1, Feragat-2)
        sorted_gerekce_items = {}
        for key in sorted(gerekce_items.keys(), key=lambda k: int(k.split('-')[-1].split()[0]) if '-' in k and k.split('-')[-1].split()[0].isdigit() else 0):
            sorted_gerekce_items[key] = gerekce_items[key]
        gerekce_items = sorted_gerekce_items
        
        print(f"[DEBUG] gerekce_items keys (sorted): {list(gerekce_items.keys())}")
        
        # Build gerekce data dynamically - value is now an array of objects
        if gerekce_items:
            gerekce_data = []
            for feragat_key, gerekce_value in gerekce_items.items():
                # Extract the feragat number (e.g., "Talep Edilen Feragat-1 Hakkında Gerekçeler" -> "Talep Edilen Feragat-1")
                feragat_name = feragat_key.replace(" Hakkında Gerekçeler", "")
                
                print(f"[DEBUG] Processing {feragat_name}")
                print(f"[DEBUG] gerekce_value type: {type(gerekce_value)}")
                print(f"[DEBUG] gerekce_value: {gerekce_value}")
                
                # Parse the array of objects (each object has one key:value pair)
                gerekce_list = []
                
                # gerekce_value should be a list (array) from the database
                if isinstance(gerekce_value, list):
                    print(f"[DEBUG] gerekce_value is a list with {len(gerekce_value)} items")
                    for idx, item in enumerate(gerekce_value):
                        print(f"[DEBUG] Item {idx}: type={type(item)}, value={item}")
                        if isinstance(item, dict):
                            # Each object has one key:value, get the value
                            for k, v in item.items():
                                print(f"[DEBUG] Extracting key={k}, value={v}")
                                # Only add non-empty values
                                if v and str(v).strip():
                                    gerekce_list.append(str(v))
                        elif isinstance(item, str):
                            # Only add non-empty strings
                            if item.strip():
                                gerekce_list.append(item)
                elif isinstance(gerekce_value, str):
                    # If it's a string, try to parse as JSON
                    try:
                        parsed_value = json.loads(gerekce_value)
                        print(f"[DEBUG] Parsed JSON string to: {parsed_value}")
                        if isinstance(parsed_value, list):
                            for item in parsed_value:
                                if isinstance(item, dict):
                                    for k, v in item.items():
                                        # Only add non-empty values
                                        if v and str(v).strip():
                                            gerekce_list.append(str(v))
                                elif isinstance(item, str):
                                    # Only add non-empty strings
                                    if item.strip():
                                        gerekce_list.append(item)
                        else:
                            gerekce_list.append(str(parsed_value))
                    except (json.JSONDecodeError, TypeError) as e:
                        print(f"[DEBUG] Failed to parse JSON: {e}")
                        gerekce_list.append(str(gerekce_value))
                else:
                    print(f"[DEBUG] Unknown type, converting to string")
                    gerekce_list.append(str(gerekce_value))
                
                print(f"[DEBUG] gerekce_list for {feragat_name}: {gerekce_list}")
                
                # Skip this feragat section if there are no values
                if not gerekce_list:
                    print(f"[DEBUG] Skipping {feragat_name} - no gerekce values")
                    continue
                
                # Add dynamic rows based on the array length
                num_rows = len(gerekce_list)
                print(f"[DEBUG] Creating {num_rows} rows for {feragat_name}")
                
                for i in range(num_rows):
                    row_value = gerekce_list[i]
                    gerekce_data.append([
                        Paragraph(f'<b>{feragat_name}<br/>Hakkında Gerekçeler</b>', 
                                  ParagraphStyle('GH', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'))) if i == 0 else '',
                        str(i + 1),
                        Paragraph(f'<font size=8 color="#374151">{row_value}</font>', 
                                  ParagraphStyle(f'G{i}', fontSize=8, fontName=FONT_NAME))
                    ])
            
            print(f"[DEBUG] Total gerekce_data rows: {len(gerekce_data)}")
            
            # 3 columns: Left (feragat name), Middle (number), Right (content)
            # No fixed rowHeights - let table auto-calculate based on content
            gerekce_table = Table(gerekce_data, colWidths=[col_width*2, col_width, col_width*5])
            
            # Build style commands dynamically - span left column for each feragat group
            style_commands = []
            row_idx = 0
            for feragat_key, gerekce_value in gerekce_items.items():
                # Calculate how many rows this feragat has
                feragat_rows = 1
                if isinstance(gerekce_value, list):
                    feragat_rows = len(gerekce_value) if len(gerekce_value) > 0 else 1
                elif isinstance(gerekce_value, str):
                    try:
                        parsed_value = json.loads(gerekce_value)
                        if isinstance(parsed_value, list):
                            feragat_rows = len(parsed_value) if len(parsed_value) > 0 else 1
                    except:
                        feragat_rows = 1
                
                print(f"[DEBUG] Spanning rows {row_idx} to {row_idx + feragat_rows - 1}")
                
                # Span left column for this feragat's rows
                if feragat_rows > 1:
                    style_commands.append(('SPAN', (0, row_idx), (0, row_idx + feragat_rows - 1)))
                row_idx += feragat_rows
            
            gerekce_table.setStyle(TableStyle([
                *style_commands,
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#D3D3D3')),  # Left column (feragat names)
                ('BACKGROUND', (1, 0), (-1, -1), colors.white),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('FONTNAME', (1, 0), (1, -1), FONT_NAME_BOLD),
                ('FONTSIZE', (1, 0), (1, -1), 10),
                ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ]))
            elements.append(gerekce_table)
    
    # Section D: FERAGATİN OLASI ETKİLERİ
    section_d = Table([[Paragraph('<b>D. FERAGATİN OLASI ETKİLERİ</b>', 
                                  ParagraphStyle('SecD', fontSize=10, alignment=1, textColor=colors.white, fontName=FONT_NAME_BOLD))]], 
                      colWidths=[col_width*8])
    section_d.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), blue_header),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(section_d)
    
    # Different Section D design for Alt Yüklenici
    if feragat_turu == "Alt Yüklenici":
        # Alt Yüklenici: 3 separate tables for İdari, Teknik, Kalite risks
        # Helper function to create risk table
        def create_risk_table(title, attribute_name, row_prefix):
            # Add subtitle
            subtitle_table = Table([[Paragraph(f'<b>{title}</b>', 
                                              ParagraphStyle('RiskTitle', fontSize=9, alignment=1, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD))]], 
                                  colWidths=[col_width*8])
            subtitle_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#E5E7EB')),
                ('BOX', (0, 0), (-1, -1), 1, colors.black),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(subtitle_table)
            
            # Header row with 4 columns (prefix separate)
            header_data = [[
                '',  # Empty for prefix column
                Paragraph('<b>Riskler</b>', 
                          ParagraphStyle('RH1', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
                Paragraph('<b>Risk Azaltıcı/Önleyici Faaliyetler/Eylem Planı</b>', 
                          ParagraphStyle('RH2', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
                Paragraph('<b>Sorumlu</b>', 
                          ParagraphStyle('RH3', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1))
            ]]
            
            header_table = Table(header_data, colWidths=[col_width*0.8, col_width*2.7, col_width*2.8, col_width*1.7])
            header_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D3D3D3')),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ]))
            elements.append(header_table)
            
            # Get data from attribute
            risk_attr_value = form_data.get(attribute_name, None)
            print(f"[DEBUG] {attribute_name} type: {type(risk_attr_value)}")
            print(f"[DEBUG] {attribute_name}: {risk_attr_value}")
            
            risk_data = []
            
            if risk_attr_value:
                risk_list = []
                
                # Parse the array
                if isinstance(risk_attr_value, list):
                    risk_list = risk_attr_value
                elif isinstance(risk_attr_value, str):
                    try:
                        parsed_value = json.loads(risk_attr_value)
                        if isinstance(parsed_value, list):
                            risk_list = parsed_value
                    except (json.JSONDecodeError, TypeError) as e:
                        print(f"[DEBUG] Failed to parse JSON: {e}")
                
                # Process each risk item
                for idx, item in enumerate(risk_list, start=1):
                    if isinstance(item, dict):
                        # Extract values
                        sorumlu_raw = item.get('sorumlu', '')
                        riskler = item.get('riskler', '')
                        eylem_plani = item.get('risk_azaltici_onleyici_faaliyetler_eylem_plani', '')
                        
                        # Extract name from sorumlu array: sorumlu[0]["name"]
                        sorumlu_name = ''
                        if isinstance(sorumlu_raw, list) and len(sorumlu_raw) > 0:
                            first_item = sorumlu_raw[0]
                            if isinstance(first_item, dict):
                                sorumlu_name = first_item.get('name', '')
                        elif isinstance(sorumlu_raw, str):
                            sorumlu_name = sorumlu_raw
                        
                        # Add row with 4 columns (prefix separate)
                        risk_data.append([
                            f'{row_prefix}.{idx}',
                            Paragraph(f'<font size=8 color="#374151">{riskler}</font>', 
                                      ParagraphStyle(f'R{idx}', fontSize=8, fontName=FONT_NAME)),
                            Paragraph(f'<font size=8 color="#374151">{eylem_plani}</font>', 
                                      ParagraphStyle(f'E{idx}', fontSize=8, fontName=FONT_NAME)),
                            Paragraph(f'<font size=8 color="#374151">{sorumlu_name}</font>', 
                                      ParagraphStyle(f'S{idx}', fontSize=8, fontName=FONT_NAME))
                        ])
            
            # If no data, show 1 empty row
            if not risk_data:
                risk_data = [[f'{row_prefix}.1', '', '', '']]
            
            # Create table with 4 columns
            # No fixed rowHeights - let table auto-calculate based on content
            risk_table = Table(risk_data, colWidths=[col_width*0.8, col_width*2.7, col_width*2.8, col_width*1.7])
            risk_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#D3D3D3')),  # Gray background for prefix column
                ('BACKGROUND', (1, 0), (-1, -1), colors.white),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('FONTNAME', (0, 0), (0, -1), FONT_NAME_BOLD),
                ('FONTSIZE', (0, 0), (0, -1), 9),
                ('ALIGN', (0, 0), (0, -1), 'CENTER'),
                ('VALIGN', (0, 0), (0, -1), 'MIDDLE'),
            ]))
            elements.append(risk_table)
            # No spacer - tables are directly connected
        
        # Create 3 tables
        create_risk_table("İdari Riskler/Eylem Planı", "Feragatin Olası Etkileri (İdari Riskler/Eylem Planı)", "İR")
        create_risk_table("Teknik Riskler/Eylem Planı", "Feragatin Olası Etkileri (Teknik Riskler/Eylem Planı)", "TR")
        create_risk_table("Kalite Riskleri/Eylem Planı", "Feragatin Olası Etkileri (Kalite Riskleri/Eylem Planı)", "KR")
        
    else:
        # Original Section D for other Feragat Türü types
        # D Section: Riskler/Eylem Planı table with 4 columns
        # Column 1: R.1/R.2/R.3 labels
        # Column 2: Riskler/Riziko No content
        # Column 3: Risk Azaltıcı/Önleyici Faaliyetler/Eylem Planı
        # Column 4: Sorumlu
        d_header_data = [[
            Paragraph('<b>Riskler/Riziko No</b>', 
                      ParagraphStyle('DH1', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
            '',  # Second part of Riskler/Riziko No (will be spanned)
            Paragraph('<b>Risk Azaltıcı/Önleyici Faaliyetler/Eylem Planı</b>', 
                      ParagraphStyle('DH2', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
            Paragraph('<b>Sorumlu</b>', 
                      ParagraphStyle('DH3', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1))
        ]]
        
        d_header_table = Table(d_header_data, colWidths=[col_width*0.8, col_width*1.87, col_width*2.67, col_width*2.66])
        d_header_table.setStyle(TableStyle([
            ('SPAN', (0, 0), (1, 0)),  # Span Riskler/Riziko No across two columns
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D3D3D3')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(d_header_table)
        
        # D Section: Risk rows - Get from "Feragatin Olası Etkileri (Riskler/Eylem Planı)" attribute
        risk_data_attr = form_data.get("Feragatin Olası Etkileri (Riskler/Eylem Planı)", None)
        
        print(f"[DEBUG] risk_data_attr type: {type(risk_data_attr)}")
        print(f"[DEBUG] risk_data_attr: {risk_data_attr}")
        
        # Build risk data dynamically from array
        d_risk_data = []
        
        if risk_data_attr:
            risk_list = []
            
            # Parse the array (should already be a list from database)
            if isinstance(risk_data_attr, list):
                print(f"[DEBUG] risk_data_attr is a list with {len(risk_data_attr)} items")
                risk_list = risk_data_attr
            elif isinstance(risk_data_attr, str):
                # If it's a string, try to parse as JSON
                try:
                    parsed_value = json.loads(risk_data_attr)
                    print(f"[DEBUG] Parsed JSON string to: {parsed_value}")
                    if isinstance(parsed_value, list):
                        risk_list = parsed_value
                except (json.JSONDecodeError, TypeError) as e:
                    print(f"[DEBUG] Failed to parse JSON: {e}")
            
            # Process each risk item (each is an object with 3 keys)
            for idx, item in enumerate(risk_list):
                print(f"[DEBUG] Risk item {idx}: type={type(item)}, value={item}")
                
                if isinstance(item, dict):
                    # Extract the three keys
                    sorumlu_raw = item.get('sorumlu', '')
                    riskler = item.get('riskler_riziko_no', '')
                    eylem_plani = item.get('risk_azaltici_onleyici_faaliyetler_eylem_plani', '')
                    
                    # Extract name from sorumlu array: sorumlu[0]["name"]
                    sorumlu_name = ''
                    if isinstance(sorumlu_raw, list) and len(sorumlu_raw) > 0:
                        first_item = sorumlu_raw[0]
                        if isinstance(first_item, dict):
                            sorumlu_name = first_item.get('name', '')
                    elif isinstance(sorumlu_raw, str):
                        # Fallback: if it's already a string, use it
                        sorumlu_name = sorumlu_raw
                    
                    print(f"[DEBUG] Risk {idx+1}: sorumlu_raw={sorumlu_raw}, sorumlu_name={sorumlu_name}, riskler={riskler}, eylem_plani={eylem_plani}")
                    
                    # Add row with R.1, R.2, R.3, etc.
                    d_risk_data.append([
                        f'R.{idx + 1}',
                        Paragraph(f'<font size=8 color="#374151">{riskler}</font>', 
                                  ParagraphStyle(f'DR{idx}', fontSize=8, fontName=FONT_NAME)),
                        Paragraph(f'<font size=8 color="#374151">{eylem_plani}</font>', 
                                  ParagraphStyle(f'DF{idx}', fontSize=8, fontName=FONT_NAME)),
                        Paragraph(f'<font size=8 color="#374151">{sorumlu_name}</font>', 
                                  ParagraphStyle(f'DS{idx}', fontSize=8, fontName=FONT_NAME))
                    ])
        
        # If no risk data found, show 3 empty rows as default
        if not d_risk_data:
            print("[DEBUG] No risk data found, using default 3 empty rows")
            d_risk_data = [
                ['R.1', '', '', ''],
                ['R.2', '', '', ''],
                ['R.3', '', '', '']
            ]
        
        print(f"[DEBUG] Total risk rows: {len(d_risk_data)}")
        
        # No fixed rowHeights - let table auto-calculate based on content
        d_risk_table = Table(d_risk_data, colWidths=[col_width*0.8, col_width*1.87, col_width*2.67, col_width*2.66])
        d_risk_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#D3D3D3')),  # Gray background for R.1, R.2, R.3 cells
            ('BACKGROUND', (1, 0), (-1, -1), colors.white),  # White background for other cells
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('FONTNAME', (0, 0), (0, -1), FONT_NAME_BOLD),
            ('FONTSIZE', (0, 0), (0, -1), 9),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('VALIGN', (0, 0), (0, -1), 'MIDDLE'),
        ]))
        elements.append(d_risk_table)
    
    # Section E: HAZIRLAYAN
    section_e = Table([[Paragraph('<b>E. HAZIRLAYAN</b>', 
                                  ParagraphStyle('SecE', fontSize=10, alignment=1, textColor=colors.white, fontName=FONT_NAME_BOLD))]], 
                      colWidths=[col_width*8])
    section_e.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), blue_header),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(section_e)
    
    # E Section: Header row with column names
    e_header_data = [[
        Paragraph('<b>Görev</b>', 
                  ParagraphStyle('EH1', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>Ad/Soyad</b>', 
                  ParagraphStyle('EH2', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>Tarih</b>', 
                  ParagraphStyle('EH3', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>İmza</b>', 
                  ParagraphStyle('EH4', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1))
    ]]
    
    e_header_table = Table(e_header_data, colWidths=[col_width*2, col_width*2, col_width*2, col_width*2])
    e_header_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D3D3D3')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(e_header_table)
    
    # E Section: Data rows (Proje Yöneticisi, Feragat Sorumlusu, Sorumlu Bölge Müdürü)
    e_gorev_list = ["Proje Yönetici", "AY Sorumlusu", "Sorumlu Müdür"] if feragat_turu == "Alt Yüklenici" else ["Proje Yönetici", "Feragat Sorumlusu", "Sorumlu Müdür"]
    e_data = []
    
    for gorev in e_gorev_list:
        if gorev in step_data and step_data[gorev]["assignee"] in user_cache:
            assignee = step_data[gorev]["assignee"]
            user_info = user_cache[assignee]
            full_name = f"{user_info['name']}".strip()
            completed_at = step_data[gorev]["completed_at"]
            tarih = completed_at.strftime("%d-%m-%Y") if completed_at else ""
        else:
            full_name = ""
            tarih = ""
        
        # Get signature value from form_data
        imza = get_signature(gorev)
        
        e_data.append([
            Paragraph(f'<b>{gorev}</b>', 
                      ParagraphStyle('EGorev', fontSize=8, fontName=FONT_NAME_BOLD)),
            Paragraph(f'<font size=7>{full_name}</font>', 
                      ParagraphStyle('EName', fontSize=7, fontName=FONT_NAME)),
            Paragraph(f'<font size=7>{tarih}</font>', 
                      ParagraphStyle('ETarih', fontSize=7, fontName=FONT_NAME)),
            Paragraph(f'<font size=7>{imza}</font>', 
                      ParagraphStyle('EImza', fontSize=7, fontName=FONT_NAME))
        ])
    
    # No fixed rowHeights - let table auto-calculate based on content
    e_table = Table(e_data, colWidths=[col_width*2, col_width*2, col_width*2, col_width*2])
    e_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#D3D3D3')),  # Gray background for Görev column
        ('BACKGROUND', (1, 0), (-1, -1), colors.white),  # White background for other cells
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(e_table)
    
    # Section F: KONTROL
    section_f = Table([[Paragraph('<b>F. KONTROL</b>', 
                                  ParagraphStyle('SecF', fontSize=10, alignment=1, textColor=colors.white, fontName=FONT_NAME_BOLD))]], 
                      colWidths=[col_width*8])
    section_f.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), blue_header),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(section_f)
    
    # Get Görev list based on Feragat Türü
    proje_turu = form_data.get("Proje Türü", "")
    gorev_list = []
    
    if proje_turu == "Radar":
        gorev_list = [
            "Radar Program Dir.",
            "Radar Sistem Müh. Dir.",
            "Radom Düşük Gör. ve İleri Malz. Tsr. Dir.",
            "Yazılım Mühendisliği Dir.",
            "Mekanik Sis. Ve Platform Ent. Tsr. Dir.",
            "Süreç Tasarım ve Ürün Yön. Dir.",
            "Test ve Doğrulama Dir.",
            "Üretim Dir.",
            "Entegre Lojistik Destek Dir.",
            "Kalite Yönetim Dir."
        ]
    elif proje_turu == "Elektronik Harp":
        gorev_list = [
            "Elektronik Harp Prog. Dir",
            "Hab. EH ve Kendini Kor. Sis. Müh. Dir.",
            "Radar Elektronik Harp Sis. Müh. Dir.",
            "Donanım Tasarım Dir.",
            "Radom Düşük Gör. ve İleri Malz. Tsr. Dir.",
            "Yazılım Mühendisliği Dir.",
            "Mekanik Sis. Ve Platform Ent. Tsr. Dir.",
            "Süreç Tasarım ve Ürün Yön. Dir.",
            "Test ve Doğrulama Dir.",
            "Üretim Dir.",
            "Entegre Lojistik Destek Dir.",
            "Kalite Yönetim Dir."
        ]
    
    # F Section: Header row with 4 columns
    f_header_data = [[
        Paragraph('<b>Görev</b>', 
                  ParagraphStyle('FH1', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>Ad/Soyad</b>', 
                  ParagraphStyle('FH2', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>Tarih</b>', 
                  ParagraphStyle('FH3', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>İmza</b>', 
                  ParagraphStyle('FH4', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1))
    ]]
    
    f_header_table = Table(f_header_data, colWidths=[col_width*2, col_width*2, col_width*2, col_width*2])
    f_header_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D3D3D3')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(f_header_table)
    
    # F Section: Data rows based on Feragat Türü
    if gorev_list:
        f_data = []
        for gorev in gorev_list:
            # Check if we have data for this Görev
            if gorev in step_data and step_data[gorev]["assignee"] in user_cache:
                assignee = step_data[gorev]["assignee"]
                user_info = user_cache[assignee]
                full_name = f"{user_info['name']}".strip()
                completed_at = step_data[gorev]["completed_at"]
                tarih = completed_at.strftime("%d-%m-%Y") if completed_at else ""
            else:
                full_name = ""
                tarih = ""
            
            # Get signature value from form_data
            imza = get_signature(gorev)
            
            f_data.append([
                Paragraph(f'<font size=7>{gorev}</font>', 
                          ParagraphStyle('FGorev', fontSize=7, fontName=FONT_NAME)),
                Paragraph(f'<font size=7>{full_name}</font>', 
                          ParagraphStyle('FName', fontSize=7, fontName=FONT_NAME)),
                Paragraph(f'<font size=7>{tarih}</font>', 
                          ParagraphStyle('FTarih', fontSize=7, fontName=FONT_NAME)),
                Paragraph(f'<font size=7>{imza}</font>', 
                          ParagraphStyle('FImza', fontSize=7, fontName=FONT_NAME))
            ])
        
        # No fixed rowHeights - let table auto-calculate based on content
        f_table = Table(f_data, colWidths=[col_width*2, col_width*2, col_width*2, col_width*2])
        f_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(f_table)
    
    # Section G: ONAY
    section_g = Table([[Paragraph('<b>G. ONAY</b>', 
                                  ParagraphStyle('SecG', fontSize=10, alignment=1, textColor=colors.white, fontName=FONT_NAME_BOLD))]], 
                      colWidths=[col_width*8])
    section_g.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), blue_header),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(section_g)
    
    # G Section: Header row with column names
    g_header_data = [[
        Paragraph('<b>Görev</b>', 
                  ParagraphStyle('GH1', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>Ad/Soyad</b>', 
                  ParagraphStyle('GH2', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>Tarih</b>', 
                  ParagraphStyle('GH3', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>İmza</b>', 
                  ParagraphStyle('GH4', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1))
    ]]
    
    g_header_table = Table(g_header_data, colWidths=[col_width*2, col_width*2, col_width*2, col_width*2])
    g_header_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D3D3D3')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(g_header_table)
    
    # G Section: Data row (REHİS Sektör Başkanı)
    gorev_g = "REHİS Sektör Başkanı"
    
    if gorev_g in step_data and step_data[gorev_g]["assignee"] in user_cache:
        assignee = step_data[gorev_g]["assignee"]
        user_info = user_cache[assignee]
        full_name = f"{user_info['name']}".strip()
        completed_at = step_data[gorev_g]["completed_at"]
        tarih = completed_at.strftime("%d-%m-%Y") if completed_at else ""
    else:
        full_name = ""
        tarih = ""
    
    # Get signature value from form_data
    imza_g = get_signature(gorev_g)
    
    g_data = [[
        Paragraph(f'<b>{gorev_g}</b>', 
                  ParagraphStyle('G1', fontSize=8, fontName=FONT_NAME_BOLD)),
        Paragraph(f'<font size=7>{full_name}</font>', 
                  ParagraphStyle('GName', fontSize=7, fontName=FONT_NAME)),
        Paragraph(f'<font size=7>{tarih}</font>', 
                  ParagraphStyle('GTarih', fontSize=7, fontName=FONT_NAME)),
        Paragraph(f'<font size=7>{imza_g}</font>', 
                  ParagraphStyle('GImza', fontSize=7, fontName=FONT_NAME))
    ]]
    
    # No fixed rowHeights - let table auto-calculate based on content
    g_table = Table(g_data, colWidths=[col_width*2, col_width*2, col_width*2, col_width*2])
    g_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#D3D3D3')),  # Gray background for Görev column
        ('BACKGROUND', (1, 0), (-1, -1), colors.white),  # White background for other cells
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(g_table)
    
    # Build PDF
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes


@router.get("/download-pdf")
async def download_feragat_pdf(
    job_instance_id: str = Query(..., description="Job Instance ID"),
    current_user: User = Depends(check_authenticated)
):
    """
    Download Uyarlama Feragat Formu as PDF
    
    Parameters:
    - job_instance_id: Job instance ID (string)
    
    Example: GET /api/v1/feragat-formu/download-pdf?job_instance_id=test
    """
    try:
        pdf_bytes = await create_feragat_pdf(job_instance_id)
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=Uyarlama_Feragat_Formu_{job_instance_id}.pdf"
            }
        )
    
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except psycopg2.Error as pe:
        raise HTTPException(status_code=500, detail=f"Veritabanı hatası: {str(pe)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF oluşturma hatası: {str(e)}")
