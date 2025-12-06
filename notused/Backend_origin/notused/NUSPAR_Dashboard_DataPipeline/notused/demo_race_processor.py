import pandas as pd
import json
import re
from datetime import datetime

# Read CSV file
df = pd.read_csv('/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Demographic/Demographic_combined.csv')

saving_path = "/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/Flu_VE_dashboard/backend/temp_NUSPAR_Dashboard_v5"

# Extract organization from patient_record_id (remove numbers)
import re
df['organization'] = df['patient_record_id'].apply(lambda x: re.sub(r'\d+', '', str(x)) if pd.notna(x) else 'Unknown')

# Current date for age calculation
now = datetime.now()

# Add age column
df['demo_dob'] = pd.to_datetime(df['demo_dob'], errors='coerce')
df['age'] = df['demo_dob'].apply(lambda dob: now.year - dob.year if pd.notnull(dob) else None)

# Function to create distribution by organization
def create_distribution_by_org(df, column_name, org_column='organization'):
    """
    Creates a distribution of values by organization
    Returns a dictionary with organization as keys and list of category data as values
    """
    result = {}
    
    # First, add ALL data (전체 데이터)
    counts_all = df[column_name].value_counts()
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
    for org in df[org_column].unique():
        if pd.notna(org) and org != 'Unknown':  # Skip NaN and Unknown organizations
            org_df = df[df[org_column] == org]
            
            # Get value counts for the specific column
            counts = org_df[column_name].value_counts()
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

# Function to create simple distribution (not by organization)
def create_simple_distribution(series):
    """
    Creates a simple distribution with category, count, and percentage
    """
    counts = series.value_counts()
    total = counts.sum()
    
    distribution = []
    for category, count in counts.items():
        if pd.notna(category):
            distribution.append({
                "category": str(category),
                "count": int(count),
                "percentage": round((count / total * 100), 1) if total > 0 else 0
            })
    
    return distribution

# Create comprehensive data structure
data = {
    # Age distribution (simple list)
    "age_distribution": {
        "ages": df['age'].dropna().tolist(),
        "statistics": {
            "mean": round(df['age'].mean(), 1) if not df['age'].isna().all() else None,
            "median": round(df['age'].median(), 1) if not df['age'].isna().all() else None,
            "min": int(df['age'].min()) if not df['age'].isna().all() else None,
            "max": int(df['age'].max()) if not df['age'].isna().all() else None
        }
    },
    
    # Distributions by organization (assuming 'organization' column exists)
    "race_distribution": create_distribution_by_org(df, 'demo_race'),
    "gender_identity_distribution": create_distribution_by_org(df, 'demo_gender_identity'),
    "legal_sex_distribution": create_distribution_by_org(df, 'demo_legal_sex'),
    "sexual_orientation_distribution": create_distribution_by_org(df, 'demo_sexual_orientation'),
    "marital_status_distribution": create_distribution_by_org(df, 'demo_marital_status'),
    "veteran_status_distribution": create_distribution_by_org(df, 'demo_veteran_status'),
    "ethnicity_distribution": create_distribution_by_org(df, 'demo_ethnicity'),
    "language_distribution": create_distribution_by_org(df, 'demo_languages'),
    "religion_distribution": create_distribution_by_org(df, 'demo_religion'),
    
    # Simple distributions (not grouped by organization)
    "interpreter_needed": create_simple_distribution(df['demo_need_interpreter']),
    "occupation_distribution": create_simple_distribution(df['demo_occupation'])[:20],  # Top 20
    "employer_distribution": create_simple_distribution(df['demo_employer'])[:20],  # Top 20
    
    # Location distribution with counts
    "location_distribution": {
        "by_state": create_simple_distribution(df['demo_state'])[:10],  # Top 10 states
        "by_country": create_simple_distribution(df['demo_country'])[:10]  # Top 10 countries
    },
    
    # Summary statistics
    "summary": {
        "total_records": len(df),
        "organizations": ["ALL"] + sorted([org for org in df['organization'].unique() if org != 'Unknown']),
        "organization_counts": {
            "ALL": len(df),
            **{
                org: len(df[df['organization'] == org]) 
                for org in df['organization'].unique() 
                if org != 'Unknown'
            }
        },
        "data_completeness": {
            column: round((df[column].notna().sum() / len(df) * 100), 1)
            for column in df.columns if column.startswith('demo_')
        }
    }
}

# Save as JSON file
with open('demographic_data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)

print("JSON file created successfully: demographic_data.json")
print(f"Total records processed: {len(df)}")
print(f"Organizations found: {sorted([org for org in df['organization'].unique() if org != 'Unknown'])}")

# Print sample of race distribution to verify format
if 'race_distribution' in data and data['race_distribution']:
    print("\nSample race distribution:")
    # Show ALL data first
    if 'ALL' in data['race_distribution']:
        print("\nALL (전체):")
        for item in data['race_distribution']['ALL'][:3]:  # Show first 3 categories
            print(f"  - {item['category']}: {item['count']} ({item['percentage']}%)")
    
    # Then show organization-specific data
    for org in sorted([k for k in data['race_distribution'].keys() if k != 'ALL'])[:2]:  # Show first 2 organizations
        dist = data['race_distribution'][org]
        print(f"\n{org}:")
        for item in dist[:3]:  # Show first 3 categories
            print(f"  - {item['category']}: {item['count']} ({item['percentage']}%)")

# If you want to save only race distribution in the exact format you specified
race_only_data = data['race_distribution']
with open(f'{saving_path}/NUSPAR_race_distribution.json', 'w', encoding='utf-8') as f:
    json.dump(race_only_data, f, ensure_ascii=False, indent=4)

print("\nRace distribution saved separately as: NUSPAR_race_distribution.json")