import pandas as pd
import json
import re
import os
from datetime import datetime

# Read CSV file
df = pd.read_csv('/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Demographic/Demographic_combined.csv')

# Extract organization from patient_record_id (remove numbers)
df['organization'] = df['patient_record_id'].apply(lambda x: re.sub(r'\d+', '', str(x)) if pd.notna(x) else 'Unknown')

# Calculate age from demo_dob
now = datetime.now()
df['demo_dob'] = pd.to_datetime(df['demo_dob'], errors='coerce')
df['age'] = df['demo_dob'].apply(lambda dob: now.year - dob.year if pd.notnull(dob) else None)

# Create age groups
def get_age_group(age):
    """
    Categorize age into specified groups
    """
    if pd.isna(age):
        return None
    if 20 <= age <= 34:
        return "20-34"
    elif 35 <= age <= 44:
        return "35-44"
    elif 45 <= age <= 54:
        return "45-54"
    elif 55 <= age <= 64:
        return "55-64"
    else:
        return "Other"  # Outside specified ranges

df['age_group'] = df['age'].apply(get_age_group)

# Function to create age group distribution by organization
def create_age_group_distribution(df):
    """
    Creates age group distribution by organization
    Returns a dictionary with organization as keys and list of category data as values
    """
    result = {}
    
    # Define the order of age groups
    age_group_order = ["20-34", "35-44", "45-54", "55-64", "Other"]
    
    # First, add ALL data (total data)
    counts_all = df['age_group'].value_counts()
    total_all = counts_all.sum()
    
    all_data = []
    # Add data in specified order
    for age_group in age_group_order:
        if age_group in counts_all.index:
            count = counts_all[age_group]
            all_data.append({
                "category": age_group,
                "count": int(count),
                "percentage": round((count / total_all * 100), 1) if total_all > 0 else 0
            })
        else:
            all_data.append({
                "category": age_group,
                "count": 0,
                "percentage": 0.0
            })
    
    result["ALL"] = all_data
    
    # Then, group by each organization
    for org in df['organization'].unique():
        if pd.notna(org) and org != 'Unknown':  # Skip NaN and Unknown organizations
            org_df = df[df['organization'] == org]
            
            # Get value counts for age groups
            counts = org_df['age_group'].value_counts()
            total = counts.sum()
            
            # Create list of dictionaries with category, count, and percentage
            org_data = []
            # Add data in specified order
            for age_group in age_group_order:
                if age_group in counts.index:
                    count = counts[age_group]
                    org_data.append({
                        "category": age_group,
                        "count": int(count),
                        "percentage": round((count / total * 100), 1) if total > 0 else 0
                    })
                else:
                    org_data.append({
                        "category": age_group,
                        "count": 0,
                        "percentage": 0.0
                    })
            
            result[str(org)] = org_data
    
    return result

# Create age group distribution
age_group_distribution = create_age_group_distribution(df)

# Define saving path
saving_path = "/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/Flu_VE_dashboard/backend/temp_NUSPAR_Dashboard_v5"

# Create directory if it doesn't exist
os.makedirs(saving_path, exist_ok=True)

# Save age group distribution as JSON
with open(os.path.join(saving_path, 'NUSPAR_age_group_distribution.json'), 'w', encoding='utf-8') as f:
    json.dump(age_group_distribution, f, ensure_ascii=False, indent=4)

print(f"Age group distribution saved: {os.path.join(saving_path, 'NUSPAR_age_group_distribution.json')}")
print(f"Total records processed: {len(df)}")
print(f"Total records with valid age: {df['age_group'].notna().sum()}")
print(f"Organizations found: {sorted([org for org in df['organization'].unique() if org != 'Unknown'])}")

# Print sample to verify format
print("\nSample age group distribution:")

# Show ALL data first
if 'ALL' in age_group_distribution:
    print("\nALL (total):")
    for item in age_group_distribution['ALL']:
        if item['count'] > 0:  # Only show groups with data
            print(f"  - {item['category']}: {item['count']} ({item['percentage']}%)")

# Then show organization-specific data
for org in sorted([k for k in age_group_distribution.keys() if k != 'ALL'])[:2]:  # Show first 2 organizations
    print(f"\n{org}:")
    for item in age_group_distribution[org]:
        if item['count'] > 0:  # Only show groups with data
            print(f"  - {item['category']}: {item['count']} ({item['percentage']}%)")