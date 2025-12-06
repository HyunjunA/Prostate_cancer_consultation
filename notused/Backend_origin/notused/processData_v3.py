import pandas as pd

# Load the TSV file into a DataFrame
file_path = "./pattern_v3_export_12-09-2024_processed_llm_neg_pos.tsv"
df = pd.read_csv(file_path, sep="\t")

# Convert 'created_at' to datetime format and remove timezone info
df['created_at'] = pd.to_datetime(df['created_at']).dt.tz_localize(None)

# Calculate week ending (Saturday) for each date
df['week_ending'] = df['created_at'].dt.to_period('W-SAT').dt.end_time

# Group by week ending and pred_label, and count occurrences
weekly_counts = df.groupby(['week_ending', 'pred_label']).size().unstack(fill_value=0)

# Convert the index to datetime for proper merging
weekly_counts.index = pd.to_datetime(weekly_counts.index)

# Rename columns for clarity
weekly_counts = weekly_counts.rename(columns={"Negative": "Negative_count", "Positive": "Positive_count"}).reset_index()

# Create week_start column
weekly_counts['week_start'] = weekly_counts['week_ending'] - pd.Timedelta(days=6)

# Convert dates to string format with YYYY-MM-DD
weekly_counts['week_start'] = weekly_counts['week_start'].dt.strftime('%Y-%m-%d')
weekly_counts['week_ending'] = weekly_counts['week_ending'].dt.strftime('%Y-%m-%d')

# Reorder columns
weekly_counts = weekly_counts[['week_start', 'week_ending', 'Negative_count', 'Positive_count']]

# Save the DataFrame to a new CSV file
weekly_counts.to_csv('weekly_counts_with_ranges.csv', index=False)

print(weekly_counts)


# 2024-09-29 부터 2024-10-05 Negative_count: 0 Positive_count: 0 
# 2024-10-06 부터 2024-10-12 Negative_count: 0 Positive_count: 0 
# 2024-10-13 부터 2024-10-19 Negative_count: 0 Positive_count: 0