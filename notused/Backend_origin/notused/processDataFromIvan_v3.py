import pandas as pd
import json
from datetime import datetime, timedelta

def process_twitter_flu_data(input_file, output_file):
    """
    Processes tweet data about COVID/flu tests from a TSV file and analyzes it on a weekly basis.
    Produces output matching the specific format with weeks starting at 40.
    
    Args:
        input_file (str): Path to the input TSV file
        output_file (str): Path to the output JSON file
    """
    print(f"Processing {input_file}...")
    
    try:
        # Read TSV file
        df = pd.read_csv(input_file, sep='\t')
        print(f"Loaded data with {len(df)} rows and {len(df.columns)} columns")
        
        # Convert created_at column to datetime (MM/DD/YY HH:MM format)
        df['parsed_date'] = pd.to_datetime(df['created_at'], format="%m/%d/%y %H:%M", errors='coerce')
        
        # Remove rows with invalid dates
        df = df.dropna(subset=['parsed_date'])
        
        # Define fixed start date and week number from the required output format
        start_date = datetime.strptime("2024-09-29", "%Y-%m-%d")  # Sunday
        starting_week_num = 40
        
        # Define exact number of weeks to match the required format (through week 17)
        num_weeks = 30  # 40-52 (13 weeks) + 1-17 (17 weeks)
        
        # Create weekly template
        weekly_data = []
        
        # Generate weekly data
        for week_offset in range(num_weeks):
            current_start = start_date + timedelta(days=7 * week_offset)
            current_end = current_start + timedelta(days=6)
            
            # Calculate week number according to the required pattern
            week_num = starting_week_num + week_offset
            if week_num > 52:
                week_num = week_num - 52
            
            week_data = {
                "week_start": current_start.strftime("%Y-%m-%d"),
                "week_ending": current_end.strftime("%Y-%m-%d"),
                "week": int(week_num),
                "Negative_count": -1,
                "Positive_count": -1,
                "percent_positive_twitter_x": -1.0
            }
            
            weekly_data.append(week_data)
        
        # Map each tweet to its corresponding week start date
        df['week_start'] = df['parsed_date'].apply(
            lambda x: start_date + timedelta(weeks=((x - start_date).days // 7))
        ).dt.strftime("%Y-%m-%d")
        
        # Group by pred_label to get Positive/Negative counts
        positive_counts = df[df['pred_label'] == 'Positive'].groupby('week_start').size()
        negative_counts = df[df['pred_label'] == 'Negative'].groupby('week_start').size()
        
        # Fill template with data
        for entry in weekly_data:
            week_start = entry["week_start"]
            if week_start in positive_counts and week_start in negative_counts:
                pos_count = positive_counts[week_start]
                neg_count = negative_counts[week_start]
                
                entry["Positive_count"] = int(pos_count)
                entry["Negative_count"] = int(neg_count)
                
                # Calculate percentage
                total = pos_count + neg_count
                if total > 0:
                    entry["percent_positive_twitter_x"] = round((pos_count / total) * 100, 1)
        
        # Save JSON file
        with open(output_file, 'w') as f:
            json.dump(weekly_data, f)
            
        print(f"Successfully saved data to {output_file}")
        return True
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    input_file = "/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/backend/Data/FromIvan/pattern_v3_export_12-09-2024_processed_llm_neg_pos.tsv"
    output_file = "twitter_flu_weekly_data.json"
    
    success = process_twitter_flu_data(input_file, output_file)
    
    if success:
        print("Process completed successfully!")
    else:
        print("Process failed. Please check error messages above.")