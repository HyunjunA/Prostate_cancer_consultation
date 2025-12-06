import pandas as pd

# Load the TSV file into a DataFrame
file_path = "./Data/FromIvan/pattern_v3_export_12-09-2024_processed_llm_neg_pos.tsv"
df = pd.read_csv(file_path, sep="\t")

# Convert 'created_at' to datetime format and remove timezone info
df['created_at'] = pd.to_datetime(df['created_at']).dt.tz_localize(None)

# Calculate week ending (Saturday) for each date
df['week_ending'] = df['created_at'].dt.to_period('W-SAT').dt.end_time

# Group by week ending and pred_label, and count occurrences
weekly_counts = df.groupby(['week_ending', 'pred_label']).size().unstack(fill_value=0)

# Convert the index to datetime for proper merging
weekly_counts.index = pd.to_datetime(weekly_counts.index)

# Create a complete date range from 2024-09-29 to the last date in your data
start_date = pd.Timestamp('2024-09-29')
# end_date = weekly_counts.index.max()
end_date = pd.Timestamp('2025-04-26')

# Generate all week start endings (Saturdays) in the date range
all_weeks = pd.date_range(start=start_date, end=end_date, freq='W-SAT')

# make new_df and each column is like start_date, end_date, positive_count, negative_count
# Create new DataFrame
new_df = pd.DataFrame({
    'week_start': [date - pd.Timedelta(days=6) for date in all_weeks],
    'week_ending': all_weeks
})

# Add week number to the DataFrame - just add this line
new_df['week'] = new_df['week_ending'].dt.isocalendar().week

# Create empty columns for counts
new_df['Negative_count'] = -1
new_df['Positive_count'] = -1

# first entire row of new_df
# for loop with new_df
for index_new_df, new_row in new_df.iterrows():
    for index_weekly_counts, row in weekly_counts.iterrows():
        new_row_week_start = new_row['week_start'].date().strftime('%Y-%m-%d')
        new_row_week_end = new_row['week_ending'].date().strftime('%Y-%m-%d')
        # date from row.name
        row_week_end = row.name.date().strftime('%Y-%m-%d')
        if new_row_week_start <= row_week_end <= new_row_week_end:
            # Initialize Negative_count to 0 if it's not initialized (-1)
            if new_df.at[index_new_df, 'Negative_count'] == -1:
                new_df.at[index_new_df, 'Negative_count'] = 0
            # Initialize Positive_count to 0 if it's not initialized (-1)
            if new_df.at[index_new_df, 'Positive_count'] == -1:
                new_df.at[index_new_df, 'Positive_count'] = 0
            new_df.at[index_new_df, 'Negative_count'] += row['Negative']
            new_df.at[index_new_df, 'Positive_count'] += row['Positive']

# Calculate percent_positive_twitter_x
new_df['percent_positive_twitter_x'] = -1  # Initialize with -1

# Calculate percentage only for rows with valid counts
for index, row in new_df.iterrows():
    if row['Positive_count'] >= 0 and row['Negative_count'] >= 0:
        total_count = row['Positive_count'] + row['Negative_count']
        if total_count > 0:  # Avoid division by zero
            percentage = (row['Positive_count'] / total_count) * 100
            # Round to 1 decimal place
            new_df.at[index, 'percent_positive_twitter_x'] = round(percentage, 1)
        else:
            new_df.at[index, 'percent_positive_twitter_x'] = 0  # If no samples, set to 0

print(new_df)

# Save the DataFrame to a new CSV file
new_df.to_csv('./Output/processed_data_twitter_x.csv', index=False)

# Convert date columns to string format for JSON
new_df['week_start'] = new_df['week_start'].dt.strftime('%Y-%m-%d')
new_df['week_ending'] = new_df['week_ending'].dt.strftime('%Y-%m-%d')

# Save to JSON format
new_df.to_json('./Output/processed_data_twitter_x.json', orient='records', date_format='iso')
print("Done")