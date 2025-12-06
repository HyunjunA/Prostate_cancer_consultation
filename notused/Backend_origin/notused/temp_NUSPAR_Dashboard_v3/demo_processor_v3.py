import pandas as pd
import json


# data_file_path = '/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Demographic/Demographic_combined.csv'
# Read CSV file
df = pd.read_csv('/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Demographic/Demographic_combined.csv')

# Current date for age calculation
from datetime import datetime
now = datetime.now()

# Add age column
df['demo_dob'] = pd.to_datetime(df['demo_dob'], errors='coerce')
df['age'] = df['demo_dob'].apply(lambda dob: now.year - dob.year if pd.notnull(dob) else None)

# Convert data to JSON format for visualization
data = {
    "age_distribution": df['age'].dropna().tolist(),
    "gender_identity_distribution": df['demo_gender_identity'].value_counts().to_dict(),
    "legal_sex_distribution": df['demo_legal_sex'].value_counts().to_dict(),
    "sexual_orientation_distribution": df['demo_sexual_orientation'].value_counts().to_dict(),
    "marital_status_distribution": df['demo_marital_status'].value_counts().to_dict(),
    "veteran_status_distribution": df['demo_veteran_status'].value_counts().to_dict(),
    "ethnicity_distribution": df['demo_ethnicity'].value_counts().to_dict(),
    "race_distribution": df['demo_race'].value_counts().to_dict(),
    "language_distribution": df['demo_languages'].value_counts().to_dict(),
    "interpreter_needed": df['demo_need_interpreter'].value_counts().to_dict(),
    "religion_distribution": df['demo_religion'].value_counts().to_dict(),
    "location_distribution": df[['demo_state', 'demo_country']].value_counts().reset_index(name='counts').to_dict(orient='records'),
    "occupation_distribution": df['demo_occupation'].value_counts().to_dict(),
    "employer_distribution": df['demo_employer'].value_counts().to_dict()
}

# Save as JSON file
with open('demographic_data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)

print("JSON file created successfully: demographic_data.json")