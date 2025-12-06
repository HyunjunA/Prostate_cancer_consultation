import pandas as pd
import json
import os

# Create output directory if it doesn't exist
os.makedirs("./Output", exist_ok=True)

def process_who_nrevss_data(input_file, output_file, start_date_str=None, end_date_str=None):
    """
    Process WHO_NREVSS_Clinical_Labs.csv file to extract YEAR, WEEK, and PERCENT POSITIVE 
    and create a JSON file with just the week and percent positive values.
    
    Args:
        input_file (str): Path to the input CSV file
        output_file (str): Path to save the output JSON file
        start_date_str (str, optional): Start date in 'YYYY-MM-DD' format (not used in this version)
        end_date_str (str, optional): End date in 'YYYY-MM-DD' format (not used in this version)
    """
    print(f"Processing {input_file}...")
    
    try:
        # Skip the first row which contains a description comment
        df = pd.read_csv(input_file, skiprows=1)
        
        print(f"Loaded data with {len(df)} rows and {len(df.columns)} columns")
        print(f"Columns: {df.columns.tolist()}")
        
        # Extract only the required columns
        if 'YEAR' in df.columns and 'WEEK' in df.columns and 'PERCENT POSITIVE' in df.columns:
            # Create a new DataFrame with just the columns we need
            result_df = df[['YEAR', 'WEEK', 'PERCENT POSITIVE']].copy()
            
            # Convert data types
            result_df['YEAR'] = result_df['YEAR'].astype(int)
            result_df['WEEK'] = result_df['WEEK'].astype(int)
            result_df['PERCENT POSITIVE'] = pd.to_numeric(result_df['PERCENT POSITIVE'], errors='coerce')
            
            # Rename columns for clarity
            result_df = result_df.rename(columns={
                'YEAR': 'year',
                'WEEK': 'week',
                'PERCENT POSITIVE': 'percent_positive_cdc'
            })

            # Prepare weekly data mapping starting from 2024-09-29
            # Perform static mapping here if needed

            # Convert to JSON
            print("Converting to JSON...")
            json_data = result_df.to_dict(orient='records')
            
            # Debug check
            print(f"JSON data contains {len(json_data)} records")
            if len(json_data) > 0:
                print("First record keys:", list(json_data[0].keys()))
            
            # Save to file
            with open(output_file, 'w') as f:
                json.dump(json_data, f, indent=2)
                
            print(f"Successfully saved data to {output_file}")
            print(f"Extracted {len(json_data)} records")
            
            # Also save as CSV for easy viewing
            csv_output = output_file.replace('.json', '.csv')
            result_df.to_csv(csv_output, index=False)
            print(f"Also saved data to {csv_output}")
            
            # Display sample of the data
            print("\nSample of processed data:")
            if len(json_data) > 0:
                sample_data = json_data[0].copy()
                print(json.dumps(sample_data, indent=2))
                
            return True
        else:
            print("ERROR: Required columns not found in the data")
            print(f"Available columns: {df.columns.tolist()}")
            print("Need YEAR, WEEK, and PERCENT POSITIVE columns")
            return False
    except Exception as e:
        print(f"ERROR: An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    input_file = "./Data/FluViewPhase2Data/WHO_NREVSS_Clinical_Labs.csv"
    output_file = "./Output/who_nrevss_weekly_positive.json"
    
    success = process_who_nrevss_data(input_file, output_file)
    
    if success:
        print("\nProcess completed successfully!")
    else:
        print("\nProcess failed. Please check error messages above.")