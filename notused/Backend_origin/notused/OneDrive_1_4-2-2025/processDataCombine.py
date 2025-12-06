import json
import pandas as pd
import os
import numpy as np

def load_json_data(file_path):
    """
    Function to load JSON file

    Args:
        file_path (str): Path to JSON file

    Returns:
        dict or list: Loaded JSON data
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return json.load(file)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
        return None
    except json.JSONDecodeError:
        print(f"Error: File '{file_path}' contains invalid JSON.")
        return None

def merge_data_by_week_outer(data1, data2):
    """
    Merge two datasets based on the 'week' field (using the dataset with more unique weeks as reference)
    Replace NaN values with -1

    Args:
        data1 (list): First dataset (list format)
        data2 (list): Second dataset (list format)

    Returns:
        list: Merged data
    """
    # Ensure both datasets are lists
    if not isinstance(data1, list):
        if isinstance(data1, dict):
            data1 = [data1]
        else:
            print("Unsupported format for first dataset.")
            return []

    if not isinstance(data2, list):
        if isinstance(data2, dict):
            data2 = [data2]
        else:
            print("Unsupported format for second dataset.")
            return []

    # Convert to DataFrame
    df1 = pd.DataFrame(data1)
    df2 = pd.DataFrame(data2)

    # Check 'week' field presence
    if 'week' not in df1.columns:
        print("First dataset lacks 'week' field.")
        return []

    if 'week' not in df2.columns:
        print("Second dataset lacks 'week' field.")
        return []

    # Count unique weeks
    unique_weeks_df1 = df1['week'].nunique()
    unique_weeks_df2 = df2['week'].nunique()

    print(f"Unique 'week' count in first dataset: {unique_weeks_df1}")
    print(f"Unique 'week' count in second dataset: {unique_weeks_df2}")

    # Determine merging based on dataset with more unique weeks
    if unique_weeks_df1 >= unique_weeks_df2:
        print("Merging based on the first dataset (processed_data_twitter_x.json).")
        how_to_merge = 'left'
        suffixes = ('', '_who')
    else:
        print("Merging based on the second dataset (who_nrevss_weekly_positive.json).")
        df1, df2 = df2, df1
        how_to_merge = 'left'
        suffixes = ('_who', '')

    # Merge dataframes on 'week'
    merged_df = pd.merge(df1, df2, on='week', how=how_to_merge, suffixes=suffixes)

    # Replace NaN values with -1
    merged_df = merged_df.fillna(-1)

    # Convert result to list
    merged_data = merged_df.to_dict(orient='records')

    return merged_data

def main():
    # File paths
    processed_data_file = "./Output/processed_data_twitter_x.json"
    who_nrevss_file = "./Output/who_nrevss_weekly_positive.json"
    output_file = "./Output/merged_weekly_data.json"

    # Check and create directory if needed
    output_dir = os.path.dirname(output_file)
    if not os.path.exists(output_dir) and output_dir:
        os.makedirs(output_dir)
        print(f"Created directory '{output_dir}'.")

    # Load data from files
    processed_data = load_json_data(processed_data_file)
    who_nrevss_data = load_json_data(who_nrevss_file)

    if not processed_data or not who_nrevss_data:
        print("Unable to load data. Exiting program.")
        return

    # Data format and summary information
    print(f"Successfully loaded processed_data_twitter_x.json")
    print(f"Number of entries: {len(processed_data) if isinstance(processed_data, list) else 'Unknown'}")

    print(f"\nSuccessfully loaded who_nrevss_weekly_positive.json")
    print(f"Number of entries: {len(who_nrevss_data) if isinstance(who_nrevss_data, list) else 'Unknown'}")

    # Merge datasets based on 'week'
    merged_data = merge_data_by_week_outer(processed_data, who_nrevss_data)

    # Display result information
    print(f"\nNumber of merged entries: {len(merged_data)}")

    # Print keys of first merged entry if exists
    if merged_data:
        print(f"Keys of the first merged entry: {list(merged_data[0].keys())}")

    # Save merged data to JSON file
    with open(output_file, 'w', encoding='utf-8') as file:
        json.dump(merged_data, file, indent=4, ensure_ascii=False)

    print(f"\nMerged data saved to '{output_file}'.")

    # Statistical information of merged data
    merged_df = pd.DataFrame(merged_data)
    print("\nMerged data statistics:")
    print(f"Total rows: {len(merged_df)}")
    print(f"Total columns: {len(merged_df.columns)}")

    # Confirm NaN replacement
    print("NaN values replaced with -1.")

    # Display range of 'week' values
    if 'week' in merged_df.columns and not merged_df.empty:
        min_week = merged_df['week'].min()
        max_week = merged_df['week'].max()
        print(f"'week' range: {min_week} ~ {max_week}")
        print(f"Total unique weeks: {merged_df['week'].nunique()}")

if __name__ == "__main__":
    main()