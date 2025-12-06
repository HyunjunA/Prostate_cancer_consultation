import pandas as pd
import json
from datetime import datetime

# Read CSV file
data_file_path = '/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Diagnosis/Diagnosis_combined.csv'
output_file_path = "/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/Flu_VE_dashboard/backend/temp_NUSPAR_Dashboard/Diagnosis_statistics.json"
df = pd.read_csv(data_file_path)

# Convert date format
df['diagnosis_date'] = pd.to_datetime(df['diagnosis_date'], format='%m/%d/%y', errors='coerce')

# Generate simple statistics
stats = {
    "total_records": len(df),
    "data_period": {
        "start_date": str(df['diagnosis_date'].min()) if pd.notna(df['diagnosis_date'].min()) else None,
        "end_date": str(df['diagnosis_date'].max()) if pd.notna(df['diagnosis_date'].max()) else None
    },
    "disease_class_counts": df['diagnosis_disease_class'].value_counts().to_dict(),
    "completion_status_counts": df['diagnosis_complete'].value_counts().to_dict(),
    "monthly_diagnosis_counts": {},
    "disease_class_statistics": {
        "unique_disease_classes": df['diagnosis_disease_class'].nunique(),
        "most_common_disease_class": int(df['diagnosis_disease_class'].mode()[0]) if len(df['diagnosis_disease_class'].mode()) > 0 else None
    }
}

# Calculate monthly diagnosis counts
df['year_month'] = df['diagnosis_date'].dt.strftime('%Y-%m')
monthly_counts = df.groupby('year_month').size().to_dict()
stats["monthly_diagnosis_counts"] = monthly_counts

# Calculate disease class percentages
total = len(df[df['diagnosis_disease_class'].notna()])
if total > 0:
    disease_percentages = {}
    for disease, count in stats["disease_class_counts"].items():
        disease_percentages[str(disease)] = round((count / total) * 100, 2)
    stats["disease_class_percentages"] = disease_percentages

# Save to JSON file
output_path = output_file_path.replace('.csv', '_statistics.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(stats, f, ensure_ascii=False, indent=2)

print(f"Statistics saved to: {output_path}")
print("\n=== Key Statistics ===")
print(f"Total records: {stats['total_records']}")
print(f"Disease class counts: {stats['disease_class_counts']}")
print(f"Data period: {stats['data_period']['start_date']} ~ {stats['data_period']['end_date']}")