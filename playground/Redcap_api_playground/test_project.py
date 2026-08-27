# #!/usr/bin/env python
# import requests
# data = {
#     'token': '635CDB5A538AE7761A9AC473F251696C',
#     'content': 'project',
#     'format': 'json',
#     'returnFormat': 'json'
# }
# r = requests.post('https://iredcap.csmc.edu/api/',data=data)
# print('HTTP Status: ' + str(r.status_code))
# print(r.json())




# import redcap
# import pandas as pd
# from collections import defaultdict

# api_url = 'https://iredcap.csmc.edu/api/'
# api_key = '635CDB5A538AE7761A9AC473F251696C'

# project = redcap.Project(api_url, api_key)

# # Fetch the metadata
# metadata = project.export_metadata()
# meta_df = pd.DataFrame(metadata)

# # Group the fields by instrument
# instruments = meta_df.groupby('form_name')

# for form_name, fields in instruments:
#     print(f"\n{'='*60}")
#     print(f"📋 Instrument: {form_name}")
#     print(f"{'='*60}")
#     print(f"Fields: {len(fields)}\n")
    
#     for _, field in fields.iterrows():
#         field_type = field['field_type']
#         field_name = field['field_name']
#         field_label = field['field_label'][:50] + '...' if len(field['field_label']) > 50 else field['field_label']
        
#         # for choice fields, also show the options
#         choices = field.get('select_choices_or_calculations', '')
        
#         print(f"  • {field_name}")
#         print(f"    Type: {field_type} | Label: {field_label}")
        
#         if choices and field_type in ['dropdown', 'radio', 'checkbox']:
#             print(f"    Choices: {choices[:80]}{'...' if len(choices) > 80 else ''}")
#         print()








# import requests
# import pandas as pd
# # load variables from .env if needed
# from dotenv import load_dotenv
# import os
# load_dotenv()


# # get api_url from .env
# api_url = os.getenv('api_url', 'https://iredcap.csmc.edu/api/') 
# api_key = os.getenv('test_project_api_key', '')

# # Instruments we are looking for
# target_instruments = [
#     'Patient Info',
#     'Medical History',
#     'Visit Information',
#     'Labs',
#     'Calculations'
# ]

# # Fetch the instrument list
# response = requests.post(api_url, data={
#     'token': api_key,
#     'content': 'instrument',
#     'format': 'json'
# })
# instruments = response.json()

# # Print every instrument in the current project
# print("=" * 60)
# print("📋 All instruments in the project:")
# print("=" * 60)
# for inst in instruments:
#     print(f"  • {inst['instrument_label']} ({inst['instrument_name']})")

# # Check whether the target instruments exist
# print("\n" + "=" * 60)
# print("🔍 Target instruments present?")
# print("=" * 60)

# instrument_labels = [inst['instrument_label'] for inst in instruments]

# for target in target_instruments:
#     exact_match = target in instrument_labels
#     partial_match = any(target.lower() in label.lower() for label in instrument_labels)
    
#     if exact_match:
#         print(f"  ✅ {target} - found")
#     elif partial_match:
#         matched = [l for l in instrument_labels if target.lower() in l.lower()]
#         print(f"  ⚠️  {target} - similar name found: {matched}")
#     else:
#         print(f"  ❌ {target} - missing")

# # Fetch the metadata
# response = requests.post(api_url, data={
#     'token': api_key,
#     'content': 'metadata',
#     'format': 'json'
# })
# metadata = pd.DataFrame(response.json())

# # instrument_name mapping
# name_to_label = {inst['instrument_name']: inst['instrument_label'] for inst in instruments}

# # Target instrument field detail
# print("\n" + "=" * 60)
# print("📊 Target instrument field detail:")
# print("=" * 60)

# for form_name, form_label in name_to_label.items():
#     if any(t.lower() in form_label.lower() for t in target_instruments):
#         fields = metadata[metadata['form_name'] == form_name]
#         print(f"\n📋 {form_label} ({form_name})")
#         print(f"   Fields: {len(fields)}")
#         print("-" * 50)
#         for _, f in fields.iterrows():
#             print(f"   [{f['field_type']:12}] {f['field_name']}")

# # ============ extra: survey format detail ============
# print("\n" + "=" * 70)
# print("📝 Target instrument survey format detail:")
# print("=" * 70)

# for form_name, form_label in name_to_label.items():
#     if any(t.lower() in form_label.lower() for t in target_instruments):
#         fields = metadata[metadata['form_name'] == form_name]
        
#         print(f"\n{'='*70}")
#         print(f"📋 {form_label}")
#         print(f"{'='*70}")
        
#         for idx, (_, f) in enumerate(fields.iterrows(), 1):
#             print(f"\n  Q{idx}. [{f['field_name']}]")
#             print(f"      Question: {f['field_label']}")
#             print(f"      Type: {f['field_type']}")
            
#             # parse and display the choices when there are any
#             choices = f.get('select_choices_or_calculations', '')
#             if choices and f['field_type'] in ['radio', 'dropdown', 'checkbox']:
#                 print(f"      Choices:")
#                 # REDCap choice format: "1, Option1 | 2, Option2 | 3, Option3"
#                 for choice in choices.split('|'):
#                     choice = choice.strip()
#                     if choice:
#                         print(f"         • {choice}")





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