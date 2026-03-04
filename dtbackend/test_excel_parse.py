import pandas as pd
import sys

# Test Excel parsing
if len(sys.argv) < 2:
    print("Usage: python test_excel_parse.py <excel_file_path>")
    sys.exit(1)

excel_file = sys.argv[1]

# Read Excel file
df = pd.read_excel(excel_file, header=None)

print("=" * 80)
print("Excel File Structure")
print("=" * 80)
print(f"Total rows: {len(df)}")
print(f"Total columns: {len(df.columns)}")
print("\n")

# Print first 20 rows with their content
for i in range(min(20, len(df))):
    row = df.iloc[i]
    print(f"Row {i}:")
    for col_idx in range(min(10, len(row))):
        if pd.notna(row[col_idx]):
            print(f"  [{chr(65 + col_idx)}{i+1}] = {row[col_idx]} (type: {type(row[col_idx]).__name__})")
    print()

print("=" * 80)
print("Looking for patterns...")
print("=" * 80)

# Find potential company rows
for i in range(len(df)):
    row = df.iloc[i]
    if pd.notna(row[0]) and str(row[0]).strip():
        if "Personel" not in str(row[0]):
            print(f"Row {i}: Potential company name in A: '{row[0]}'")

print("\n")

# Find rows with "Personel Sayısı"
for i in range(len(df)):
    row = df.iloc[i]
    if pd.notna(row[0]) and "Personel" in str(row[0]):
        print(f"Row {i}: Found 'Personel Sayısı' label")
        # Print the count values
        for col_idx in range(1, min(10, len(row))):
            if pd.notna(row[col_idx]) and row[col_idx] != 0:
                print(f"  Column {chr(65 + col_idx)}: {row[col_idx]}")
