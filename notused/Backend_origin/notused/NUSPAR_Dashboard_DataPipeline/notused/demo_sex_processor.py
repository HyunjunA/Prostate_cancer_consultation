import pandas as pd
import json
import re
import os

# Read CSV file
df = pd.read_csv('/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Demographic/Demographic_combined.csv')

# Extract organization from patient_record_id (remove numbers)
df['organization'] = df['patient_record_id'].apply(lambda x: re.sub(r'\d+', '', str(x)) if pd.notna(x) else 'Unknown')

# Function to create legal sex distribution by organization
def create_legal_sex_distribution(df):
    """
    Creates legal sex distribution by organization
    Returns a dictionary with organization as keys and list of category data as values
    """
    result = {}
    
    # First, add ALL data (total data)
    counts_all = df['demo_legal_sex'].value_counts()
    total_all = counts_all.sum()
    
    all_data = []
    for category, count in counts_all.items():
        if pd.notna(category):  # Skip NaN categories
            all_data.append({
                "category": str(category),
                "count": int(count),
                "percentage": round((count / total_all * 100), 1) if total_all > 0 else 0
            })
    
    result["ALL"] = all_data
    
    # Then, group by each organization
    for org in df['organization'].unique():
        if pd.notna(org) and org != 'Unknown':  # Skip NaN and Unknown organizations
            org_df = df[df['organization'] == org]
            
            # Get value counts for legal sex
            counts = org_df['demo_legal_sex'].value_counts()
            total = counts.sum()
            
            # Create list of dictionaries with category, count, and percentage
            org_data = []
            for category, count in counts.items():
                if pd.notna(category):  # Skip NaN categories
                    org_data.append({
                        "category": str(category),
                        "count": int(count),
                        "percentage": round((count / total * 100), 1) if total > 0 else 0
                    })
            
            result[str(org)] = org_data
    
    return result

# Create legal sex distribution
legal_sex_distribution = create_legal_sex_distribution(df)

# Define saving path
saving_path = "/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/Flu_VE_dashboard/backend/temp_NUSPAR_Dashboard_v5"

# Create directory if it doesn't exist
os.makedirs(saving_path, exist_ok=True)

# Save legal sex distribution as JSON
with open(os.path.join(saving_path, 'NUSPAR_legal_sex_distribution.json'), 'w', encoding='utf-8') as f:
    json.dump(legal_sex_distribution, f, ensure_ascii=False, indent=4)

print(f"Legal sex distribution saved: {os.path.join(saving_path, 'NUSPAR_legal_sex_distribution.json')}")
print(f"Total records processed: {len(df)}")
print(f"Organizations found: {sorted([org for org in df['organization'].unique() if org != 'Unknown'])}")

# Print sample to verify format
print("\nSample legal sex distribution:")

# Show ALL data first
if 'ALL' in legal_sex_distribution:
    print("\nALL (total):")
    for item in legal_sex_distribution['ALL']:
        print(f"  - {item['category']}: {item['count']} ({item['percentage']}%)")

# Then show organization-specific data
for org in sorted([k for k in legal_sex_distribution.keys() if k != 'ALL'])[:2]:  # Show first 2 organizations
    print(f"\n{org}:")
    for item in legal_sex_distribution[org]:
        print(f"  - {item['category']}: {item['count']} ({item['percentage']}%)")