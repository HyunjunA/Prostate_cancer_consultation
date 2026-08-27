

# import data to the REDCap test project
import requests
import json
from dotenv import load_dotenv
import os
load_dotenv()

api_url = os.getenv('api_url', 'https://iredcap.csmc.edu/api/')
api_key = os.getenv('test_project_api_key', '')

# ============ Define the data to submit ============
# Fill in a value for each field

records_to_import = [
    {
        # Patient Info
        'record_id': '3',  # required: unique id
        'name': 'test_John Doe',
        'mrn': '12345678',
        
        # Medical History
        'dx_name_1': 'Hypertension',
        'dx_date_1': '2020-01-15',
        'dx_name_2': 'Diabetes',
        'dx_date_2': '2021-03-20',
        'dx_name_3': '',
        'dx_date_3': '',
        
        # Visit Information
        'date_of_visit': '2024-01-10',
        'provider': '1',  # 1=Dr. Yoohoo, 2=Dr. Poptart, 3=Dr. Mario, 4=Dr. Nice
        'visit_notes': 'Patient presents with controlled blood pressure.',
        
        # Labs
        'lab_1': '2024-01-10',
        
        # Calculations
        'pat_name': 'John Doe',
        'pat_email': 'john.doe@email.com',
        'proc_1': '100',
        'proc_2': '200',
        'proc_3': '150',
        # total_proc is a calc field, so REDCap computes it
        'proc_1_rb': '1829',  # one of the choices
        'proc_2_rb': '2883',
        'proc_3_rb': '4933',
        'exercise': '7',   # 7=Every other day
        'sleep': '8',      # 8=8 hours
        # health_score is a calc field, so REDCap computes it
        'appt_date': '2024-02-01',
        'dob': '1985-05-15',
        # age_calc is a calc field, so REDCap computes it
        'admission_date': '2024-01-08',
        'discharge_date': '2024-01-12',
        # los is a calc field, so REDCap computes it
    },
    # add further records here if you have any
    # {
    #     'record_id': '2',
    #     'name': 'Jane Smith',
    #     ...
    # }
]

# ============ Import into REDCap ============
def import_records(api_url, api_key, records):
    """Import records into REDCap"""
    
    data = {
        'token': api_key,
        'content': 'record',
        'format': 'json',
        'type': 'flat',
        'overwriteBehavior': 'normal',  # switch to 'overwrite' to replace existing data
        'forceAutoNumber': 'false',
        'data': json.dumps(records),
        'returnContent': 'ids',
        'returnFormat': 'json'
    }
    
    response = requests.post(api_url, data=data)
    
    return response

# Run the import
print("=" * 60)
print("📤 Importing data into REDCap...")
print("=" * 60)

response = import_records(api_url, api_key, records_to_import)

if response.status_code == 200:
    result = response.json()
    print(f"✅ Import succeeded!")
    print(f"   Imported record ids: {result}")
else:
    print(f"❌ Import failed!")
    print(f"   Status Code: {response.status_code}")
    print(f"   Error: {response.text}")

# ============ Verify the import ============
print("\n" + "=" * 60)
print("🔍 Checking the imported data:")
print("=" * 60)

# fetch the record we just imported
response = requests.post(api_url, data={
    'token': api_key,
    'content': 'record',
    'format': 'json',
    'type': 'flat',
    'records[0]': '1',  # record_id to check
    'returnFormat': 'json'
})

if response.status_code == 200:
    imported_data = response.json()
    for record in imported_data:
        print(f"\nRecord ID: {record.get('record_id')}")
        for key, value in record.items():
            if value:  # only print fields that have a value
                print(f"   {key}: {value}")