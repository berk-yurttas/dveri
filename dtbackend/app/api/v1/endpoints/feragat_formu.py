"""
Feragat Formu (Waiver Form) PDF Generation API
Generates PDF matching the Excel form layout exactly
"""
import io
import json
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

# Register Trebuchet MS font for Turkish characters
try:
    # Register Trebuchet MS from Windows fonts directory
    pdfmetrics.registerFont(TTFont('Trebuchet', 'C:/Windows/Fonts/trebuc.ttf'))
    pdfmetrics.registerFont(TTFont('Trebuchet-Bold', 'C:/Windows/Fonts/trebucbd.ttf'))
    FONT_NAME = 'Trebuchet'
    FONT_NAME_BOLD = 'Trebuchet-Bold'
    print("Successfully loaded Trebuchet MS font")
except Exception as e:
    print(f"Warning: Could not load Trebuchet MS font: {e}")
    try:
        # Try alternative paths
        pdfmetrics.registerFont(TTFont('Trebuchet', 'trebuc.ttf'))
        pdfmetrics.registerFont(TTFont('Trebuchet-Bold', 'trebucbd.ttf'))
        FONT_NAME = 'Trebuchet'
        FONT_NAME_BOLD = 'Trebuchet-Bold'
        print("Successfully loaded Trebuchet MS font from relative path")
    except Exception as e2:
        print(f"Warning: Could not load Trebuchet MS font from relative path: {e2}")
        # Fallback to Helvetica if Trebuchet not available
        FONT_NAME = 'Helvetica'
        FONT_NAME_BOLD = 'Helvetica-Bold'
        print("Using Helvetica as fallback font")

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
                    return {"name": username, "surname": ""}
                
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
                            "surname": user.get("surname", "")
                        }
        
        return {"name": username, "surname": ""}
    except Exception as e:
        print(f"Error fetching PocketBase user {username}: {e}")
        return {"name": username, "surname": ""}


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
                WHERE si.job_instance_id = %(job_id)s
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
    
    # If already parsed as dict/object by psycopg2
    if isinstance(jsonb_value, dict):
        if 'name' in jsonb_value:
            return str(jsonb_value['name'])
        return json.dumps(jsonb_value, ensure_ascii=False)
    
    # If it's a string, try to parse
    if isinstance(jsonb_value, str):
        try:
            parsed = json.loads(jsonb_value)
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
    
    # Create header with exact Excel layout
    # Logo area spans 2 columns (2 rows) - narrower
    # Title spans 5 columns (2 rows) - wider
    # No: spans 1 column (2 rows) with light blue background
    # Total: 8 columns
    
    header_data = [
        [
            Paragraph('<b><font size=11 color="#1e3a8a">aselsan</font></b><br/><font size=5 color="#6b7280">POWER AND ELECTRONIC<br/>RADAR AND ELECTRONIC<br/>WARFARE SYSTEMS</font>', 
                      ParagraphStyle('Logo', fontSize=5, leading=7, alignment=0, fontName=FONT_NAME)),
            '',  # Column 2 (part of logo span)
            Paragraph('<b><font size=14 color="#1e3a8a">Uyarlama Feragat Formu</font></b>', 
                      ParagraphStyle('Title', fontSize=14, alignment=1, leading=16, fontName=FONT_NAME_BOLD)),
            '',  # Column 4 (part of title span)
            '',  # Column 5 (part of title span)
            '',  # Column 6 (part of title span)
            '',  # Column 7 (part of title span)
            Paragraph('<b><font size=8 color="#1e3a8a">No:</font></b>', 
                      ParagraphStyle('No', fontSize=8, alignment=0, leftIndent=5, fontName=FONT_NAME_BOLD))
        ]
    ]
    
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
            Paragraph('<b><font size=11 color="#1e3a8a">aselsan</font></b><br/><font size=5 color="#6b7280">POWER AND ELECTRONIC<br/>RADAR AND ELECTRONIC<br/>WARFARE SYSTEMS</font>', 
                      ParagraphStyle('Logo', fontSize=5, leading=7, alignment=0, fontName=FONT_NAME)),
            '',  # Column 2 (part of logo span)
            Paragraph('<b><font size=14 color="#1e3a8a">Uyarlama Feragat Formu</font></b>', 
                      ParagraphStyle('Title', fontSize=14, alignment=1, leading=16, fontName=FONT_NAME_BOLD)),
            '',  # Column 4 (part of title span)
            '',  # Column 5 (part of title span)
            '',  # Column 6 (part of title span)
            '',  # Column 7 (part of title span)
            Paragraph('<b><font size=8 color="#1e3a8a">No:</font></b>', 
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
            ''   # Empty white area below "No:"
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
    
    # Get Feragat Türü to determine layout
    feragat_turu = form_data.get("Feragat Türü", "")
    print(f"[create_feragat_pdf] Feragat Türü: {feragat_turu}")
    
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
                Paragraph('<b>3. Firmaya Ait Önceden Alınan Feragatlar</b>', 
                          ParagraphStyle('AL3', fontSize=7, textColor=colors.HexColor('#1e3a8a'), fontName=FONT_NAME_BOLD)),
                '',
                ''
            ],
            # Sub-row 2: Values
            [
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Firma Adı/Satıcı no", "")}</font>', 
                          ParagraphStyle('AV1', fontSize=8, fontName=FONT_NAME)),
                '',
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Firmaya Daha Önceden Gerçekleştirilen Tetkik", "")}</font>', 
                          ParagraphStyle('AV2', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Firmaya Ait Önceden Alınan Feragatlar", "")}</font>', 
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
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje No", "")}</font>', 
                          ParagraphStyle('AV4', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje Tanımı", "")}</font>', 
                          ParagraphStyle('AV5', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Müşteri", "")}</font>', 
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
                Paragraph(f'<font size=8 color="#374151">{form_data.get("İşin Sorumlusu/Bölümü", "")}</font>', 
                          ParagraphStyle('AV12', fontSize=8, fontName=FONT_NAME)),
                '',
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Bildirim No", "")}</font>', 
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
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje No (Proje dörtlü kodu ve U-P" + chr(39) + "li kodu)", "")}</font>', 
                          ParagraphStyle('V1', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                '',  # Column 1 (part of value span)
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Proje Tanımı ( Proje Adı )", "")}</font>', 
                          ParagraphStyle('V2', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                '',  # Column 3 (part of value span)
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Müşteri (Proje Ana Sözleşmesi" + chr(39) + "nin imza makamı)", "")}</font>', 
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
        # Columns 4-5: İlgili Süreçler + Feragat Sorumlusu (under Müşteri, 2 cols total)
        # Columns 6-7: Feragat Bildirim Numarası (under Proje Tipi, 2 cols)
        
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
                Paragraph('<b>8. Feragat Sorumlusu</b>', 
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
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Feragat Sorumlusu", "")}</font>', 
                          ParagraphStyle('V8', fontSize=8, textColor=colors.HexColor('#374151'), fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{form_data.get("Feragat Bildirim Numarası (Feragatin koordinasyonu için başlatılan bildirim numarası)", "")}</font>', 
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
            # Feragat Sorumlusu - column 5 (1 col)
            ('SPAN', (6, 0), (7, 0)),  # Feragat Bildirim - columns 6-7
            
            # Row 1 (values):
            ('SPAN', (0, 1), (1, 1)),  # Proje Aşaması value - columns 0-1
            ('SPAN', (2, 1), (3, 1)),  # Proje Süresi value - columns 2-3
            # İlgili Süreçler value - column 4 (1 col)
            # Feragat Sorumlusu value - column 5 (1 col)
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
    
    # Section B header - NO SPACER, directly attached
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
        if key.startswith("Talep Edilen Feragat") and "Hakkında Gerekçeler" not in key:
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
    
    # Calculate row heights dynamically (minimum 2.5cm per row)
    row_heights = [2.5*cm] * len(talep_data)
    
    talep_table = Table(talep_data, colWidths=[col_width] + [col_width]*7, rowHeights=row_heights)
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
    
    # C Section items - Dynamic: Show all "Talep Edilen Feragat Hakkında Gerekçeler" attributes
    gerekce_items = {}
    for key, value in form_data.items():
        if "Hakkında Gerekçeler" in key:
            gerekce_items[key] = value
    
    # Build gerekce data dynamically (each feragat can have multiple gerekce items numbered 1,2,3,4)
    if gerekce_items:
        gerekce_data = []
        for feragat_key, gerekce_value in gerekce_items.items():
            # Extract the feragat number (e.g., "Talep Edilen Feragat-1 Hakkında Gerekçeler" -> "Talep Edilen Feragat-1")
            feragat_name = feragat_key.replace(" Hakkında Gerekçeler", "")
            
            # Add 4 numbered rows for this feragat
            for i in range(1, 5):
                gerekce_data.append([
                    Paragraph(f'<b>{feragat_name}<br/>Hakkında Gerekçeler</b>', 
                              ParagraphStyle('GH', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'))) if i == 1 else '',
                    str(i),
                    Paragraph(f'<font size=8 color="#374151">{gerekce_value if i == 1 else ""}</font>', 
                              ParagraphStyle(f'G{i}', fontSize=8, fontName=FONT_NAME))
                ])
        
        # Calculate row heights and spans
        num_rows = len(gerekce_data)
        gerekce_row_heights = [1.5*cm] * num_rows
        
        # 3 columns: Left (feragat name), Middle (number), Right (content)
        gerekce_table = Table(gerekce_data, colWidths=[col_width*2, col_width, col_width*5], rowHeights=gerekce_row_heights)
        
        # Build style commands dynamically
        style_commands = []
        
        # Span left column for each group of 4 rows
        for feragat_idx in range(len(gerekce_items)):
            start_row = feragat_idx * 4
            end_row = start_row + 3
            style_commands.append(('SPAN', (0, start_row), (0, end_row)))  # Span left column (feragat name)
        
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
    
    # Page break before Section D
    from reportlab.platypus import PageBreak
    elements.append(PageBreak())
    
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
    
    # D Section: Risk rows - DYNAMIC: Get all risk attributes from database
    # Collect risk items dynamically
    risk_items = {}
    for key, value in form_data.items():
        # Match patterns like "Risk Sorumlusu - 1", "Risk Azaltıcı/Önleyici Faaliyetler -1", etc.
        if "Risk Sorumlusu -" in key or "Risk Azaltıcı/Önleyici Faaliyetler -" in key or "Riskler / Riziko No" in key:
            # Extract risk number (e.g., "Risk Sorumlusu - 1" -> "1")
            parts = key.split("-")
            if len(parts) >= 2:
                risk_num = parts[-1].strip()
                if risk_num not in risk_items:
                    risk_items[risk_num] = {}
                
                if "Risk Sorumlusu" in key:
                    risk_items[risk_num]['sorumlu'] = value
                elif "Risk Azaltıcı/Önleyici Faaliyetler" in key:
                    risk_items[risk_num]['faaliyetler'] = value
                elif "Riskler / Riziko No" in key:
                    risk_items[risk_num]['riziko'] = value
    
    # Build risk data dynamically
    d_risk_data = []
    if risk_items:
        # Sort by risk number
        sorted_risk_nums = sorted(risk_items.keys(), key=lambda x: int(x) if x.isdigit() else x)
        for risk_num in sorted_risk_nums:
            risk_info = risk_items[risk_num]
            d_risk_data.append([
                f'R.{risk_num}',
                Paragraph(f'<font size=8 color="#374151">{risk_info.get("riziko", "")}</font>', 
                          ParagraphStyle(f'DR{risk_num}', fontSize=8, fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{risk_info.get("faaliyetler", "")}</font>', 
                          ParagraphStyle(f'DF{risk_num}', fontSize=8, fontName=FONT_NAME)),
                Paragraph(f'<font size=8 color="#374151">{risk_info.get("sorumlu", "")}</font>', 
                          ParagraphStyle(f'DS{risk_num}', fontSize=8, fontName=FONT_NAME))
            ])
    else:
        # Default: show 3 empty rows if no risk data found
        d_risk_data = [
            ['R.1', '', '', ''],
            ['R.2', '', '', ''],
            ['R.3', '', '', '']
        ]
    
    # Calculate row heights dynamically
    d_risk_row_heights = [1.5*cm] * len(d_risk_data)
    
    d_risk_table = Table(d_risk_data, colWidths=[col_width*0.8, col_width*1.87, col_width*2.67, col_width*2.66], rowHeights=d_risk_row_heights)
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
    e_gorev_list = ["Proje Yöneticisi", "Feragat Sorumlusu", "Sorumlu Müdür"]
    e_data = []
    
    for gorev in e_gorev_list:
        if gorev in step_data and step_data[gorev]["assignee"] in user_cache:
            assignee = step_data[gorev]["assignee"]
            user_info = user_cache[assignee]
            full_name = f"{user_info['name']} {user_info['surname']}".strip()
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
    
    e_table = Table(e_data, colWidths=[col_width*2, col_width*2, col_width*2, col_width*2], rowHeights=[1.5*cm, 1.5*cm, 1.5*cm])
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
        Paragraph('<b>İmza</b>', 
                  ParagraphStyle('FH3', fontSize=8, fontName=FONT_NAME_BOLD, textColor=colors.HexColor('#1e3a8a'), alignment=1)),
        Paragraph('<b>Tarih</b>', 
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
                full_name = f"{user_info['name']} {user_info['surname']}".strip()
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
                Paragraph(f'<font size=7>{imza}</font>', 
                          ParagraphStyle('FImza', fontSize=7, fontName=FONT_NAME)),
                Paragraph(f'<font size=7>{tarih}</font>', 
                          ParagraphStyle('FTarih', fontSize=7, fontName=FONT_NAME))
            ])
        
        f_table = Table(f_data, colWidths=[col_width*2, col_width*2, col_width*2, col_width*2], 
                        rowHeights=[1*cm] * len(f_data))
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
        full_name = f"{user_info['name']} {user_info['surname']}".strip()
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
    
    g_table = Table(g_data, colWidths=[col_width*2, col_width*2, col_width*2, col_width*2], rowHeights=[1.5*cm])
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
