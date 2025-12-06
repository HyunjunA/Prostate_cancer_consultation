import pandas as pd

# Load the TSV file into a DataFrame
file_path = "./pattern_v3_export_12-09-2024_processed_llm_neg_pos.tsv"
df = pd.read_csv(file_path, sep="\t")

# Convert 'created_at' to datetime format
df['created_at'] = pd.to_datetime(df['created_at'])

# Filter data to include only from 10.05.2024 onward
df = df[df['created_at'] >= pd.Timestamp('2024-10-05')]

# Create a new column for the week ending date (Saturday)
df['week_ending'] = df['created_at'] + pd.offsets.Week(weekday=5)

# Group by week ending and pred_label, and count occurrences
weekly_counts = df.groupby(['week_ending', 'pred_label']).size().unstack(fill_value=0).reset_index()

# Rename columns for clarity
weekly_counts = weekly_counts.rename(columns={"Negative": "Negative_count", "Positive": "Positive_count"})

print(weekly_counts)

# save the DataFrame to a new csv file
weekly_counts.to_csv('weekly_counts.csv', index=False)