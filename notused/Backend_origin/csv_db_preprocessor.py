import pandas as pd

def fix_csv_publication_year():
    """
    Complete script to fix the publication.year column in a CSV file
    - Remove empty rows
    - Change 202 to 2020
    - Convert the column to integer type
    - Save the modified CSV
    """
    
    # CSV file path
    # csv_file = "Processed_Data_DB.csv"
    csv_file = "Metadata_Framework_Data.csv"
    
    try:
        # Try different encodings
        encodings = ['utf-8', 'latin-1', 'cp949', 'euc-kr', 'utf-16', 'iso-8859-1']
        df = None
        used_encoding = None
        
        print(f"Reading CSV file: {csv_file}")
        for encoding in encodings:
            try:
                df = pd.read_csv(csv_file, encoding=encoding)
                used_encoding = encoding
                print(f"✓ Successfully read with encoding: {encoding}")
                break
            except UnicodeDecodeError:
                continue
            except Exception as e:
                continue
        
        if df is None:
            # Last resort: ignore errors
            print("Trying with error handling...")
            df = pd.read_csv(csv_file, encoding='utf-8', errors='ignore')
            used_encoding = 'utf-8 (with errors ignored)'
            print(f"✓ Read with error handling")
        
        print(f"Total rows read: {len(df)}")
        
        # Check and remove empty rows
        print("\n=== Checking for empty rows ===")
        initial_row_count = len(df)
        
        # Check completely empty rows (all columns are NaN)
        completely_empty = df.isnull().all(axis=1).sum()
        print(f"Completely empty rows (all columns NaN): {completely_empty}")
        
        # Check mostly empty rows (e.g., 90% or more columns are NaN)
        threshold = 0.9
        mostly_empty = (df.isnull().sum(axis=1) / len(df.columns) >= threshold).sum()
        print(f"Mostly empty rows (≥{threshold*100}% columns NaN): {mostly_empty}")
        
        # Remove completely empty rows
        df = df.dropna(how='all')
        rows_removed = initial_row_count - len(df)
        
        if rows_removed > 0:
            print(f"\n✓ Removed {rows_removed} completely empty row(s)")
            print(f"Remaining rows: {len(df)}")
        else:
            print("\n✓ No completely empty rows found")
        
        # Check current status
        print("\n=== Before publication.year modification ===")
        print("publication.year column exists:", 'publication.year' in df.columns)
        
        if 'publication.year' not in df.columns:
            print("\nAvailable columns:")
            for col in df.columns:
                print(f"  - {col}")
            print("\nError: publication.year column not found!")
            return
        
        print("Data type:", df['publication.year'].dtype)
        print("Unique values:", sorted([x for x in df['publication.year'].unique() if pd.notna(x)]))
        
        # Check count of 202 values
        count_202_before = (df['publication.year'] == 202).sum()
        print(f"Number of 202 values: {count_202_before}")
        
        # Change 202 to 2020
        print("\n=== Modifying publication.year data ===")
        df.loc[df['publication.year'] == 202, 'publication.year'] = 2020
        print("202 → 2020 modification complete")
        
        # Convert publication.year column to integer
        # Keep NaN values, convert valid values to int
        df['publication.year'] = df['publication.year'].astype('Int64')  # nullable integer
        print("Converted to integer type")
        
        # Check status after modification
        print("\n=== After modification ===")
        print("Data type:", df['publication.year'].dtype)
        print("Unique values:", sorted([x for x in df['publication.year'].unique() if pd.notna(x)]))
        
        # Check if 202 was modified
        count_202_after = (df['publication.year'] == 202).sum()
        count_2020_after = (df['publication.year'] == 2020).sum()
        print(f"Number of 202 values (after): {count_202_after}")
        print(f"Number of 2020 values (after): {count_2020_after}")
        
        # Check first 10 values
        print("\nFirst 10 values:")
        print(df['publication.year'].head(10))
        
        # Statistics by year
        print("\n=== Statistics by year ===")
        year_counts = df['publication.year'].value_counts().sort_index()
        for year, count in year_counts.items():
            if pd.notna(year):
                print(f"{year}: {count}")
        
        null_count = df['publication.year'].isnull().sum()
        if null_count > 0:
            print(f"NULL values: {null_count}")
        
        # Save modified CSV
        print(f"\n=== Saving CSV file ===")
        # Save with UTF-8 encoding
        df.to_csv(csv_file, index=False, encoding='utf-8')
        print(f"CSV file successfully updated: {csv_file}")
        print(f"Saved with encoding: utf-8")
        
        # Final summary
        print("\n=== Final summary ===")
        print(f"- File encoding used for reading: {used_encoding}")
        print(f"- Initial records: {initial_row_count}")
        print(f"- Empty rows removed: {rows_removed}")
        print(f"- Final records: {len(df)}")
        print(f"- 202 → 2020 changed: {count_202_before}")
        print(f"- Data type: {df['publication.year'].dtype}")
        print(f"- Valid year range: {df['publication.year'].min()} ~ {df['publication.year'].max()}")
        
    except FileNotFoundError:
        print(f"Error: {csv_file} file not found.")
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    fix_csv_publication_year()