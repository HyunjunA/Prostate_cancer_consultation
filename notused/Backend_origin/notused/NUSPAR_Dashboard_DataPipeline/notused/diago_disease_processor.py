import pandas as pd
import json
import re
import os

# Read diagnosis CSV file
df = pd.read_csv('/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Diagnosis/Diagnosis_combined.csv')

# Extract organization from patient_record_id (remove numbers)
df['organization'] = df['patient_record_id'].apply(lambda x: re.sub(r'\d+', '', str(x)) if pd.notna(x) else 'Unknown')

# Define disease class mapping
disease_class_mapping = {
    10: "Acromegaly",
    20: "Cushing Disease",
    30: "Prolactinoma",
    40: "TSHoma",
    45: "LH/FSH-oma",
    50: "Non-Functioning Adenoma"
}

# Convert disease class codes to names
df['disease_name'] = df['diagnosis_disease_class'].map(disease_class_mapping)

# Function to create disease distribution by organization
def create_disease_distribution(df):
    """
    Creates disease distribution by organization
    Returns a dictionary with organization as keys and list of category data as values
    """
    result = {}
    
    # Define the order of diseases based on code order
    disease_order = ["Acromegaly", "Cushing Disease", "Prolactinoma", "TSHoma", "LH/FSH-oma", "Non-Functioning Adenoma"]
    
    # First, add ALL data (total data)
    counts_all = df['disease_name'].value_counts()
    total_all = counts_all.sum()
    
    all_data = []
    # Add data in specified order
    for disease in disease_order:
        if disease in counts_all.index:
            count = counts_all[disease]
            all_data.append({
                "category": disease,
                "count": int(count),
                "percentage": round((count / total_all * 100), 1) if total_all > 0 else 0
            })
        else:
            all_data.append({
                "category": disease,
                "count": 0,
                "percentage": 0.0
            })
    
    result["ALL"] = all_data
    
    # Then, group by each organization
    for org in df['organization'].unique():
        if pd.notna(org) and org != 'Unknown':  # Skip NaN and Unknown organizations
            org_df = df[df['organization'] == org]
            
            # Get value counts for diseases
            counts = org_df['disease_name'].value_counts()
            total = counts.sum()
            
            # Create list of dictionaries with category, count, and percentage
            org_data = []
            # Add data in specified order
            for disease in disease_order:
                if disease in counts.index:
                    count = counts[disease]
                    org_data.append({
                        "category": disease,
                        "count": int(count),
                        "percentage": round((count / total * 100), 1) if total > 0 else 0
                    })
                else:
                    org_data.append({
                        "category": disease,
                        "count": 0,
                        "percentage": 0.0
                    })
            
            result[str(org)] = org_data
    
    return result

# Create disease distribution
disease_distribution = create_disease_distribution(df)

# Define saving path
saving_path = "/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/Flu_VE_dashboard/backend/temp_NUSPAR_Dashboard_v5"

# Create directory if it doesn't exist
os.makedirs(saving_path, exist_ok=True)

# Save disease distribution as JSON
with open(os.path.join(saving_path, 'NUSPAR_disease_distribution.json'), 'w', encoding='utf-8') as f:
    json.dump(disease_distribution, f, ensure_ascii=False, indent=4)

print(f"Disease distribution saved: {os.path.join(saving_path, 'NUSPAR_disease_distribution.json')}")
print(f"Total records processed: {len(df)}")
print(f"Total records with valid disease class: {df['disease_name'].notna().sum()}")
print(f"Organizations found: {sorted([org for org in df['organization'].unique() if org != 'Unknown'])}")

# Print sample to verify format
print("\nSample disease distribution:")

# Show ALL data first
if 'ALL' in disease_distribution:
    print("\nALL (total):")
    for item in disease_distribution['ALL']:
        if item['count'] > 0:  # Only show diseases with data
            print(f"  - {item['category']}: {item['count']} ({item['percentage']}%)")

# Then show organization-specific data
for org in sorted([k for k in disease_distribution.keys() if k != 'ALL'])[:2]:  # Show first 2 organizations
    print(f"\n{org}:")
    for item in disease_distribution[org]:
        if item['count'] > 0:  # Only show diseases with data
            print(f"  - {item['category']}: {item['count']} ({item['percentage']}%)")

# Also print summary by disease code
print("\nSummary by disease code:")
code_counts = df.groupby('diagnosis_disease_class').size()
for code in sorted(disease_class_mapping.keys()):
    if code in code_counts.index:
        print(f"  {code} ({disease_class_mapping[code]}): {code_counts[code]} cases")
    else:
        print(f"  {code} ({disease_class_mapping[code]}): 0 cases")