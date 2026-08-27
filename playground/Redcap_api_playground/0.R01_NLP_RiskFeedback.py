# #!/usr/bin/env python
# import requests
# data = {
#     'token': 'BB714F7B3BFE9ED3A93101639911D26A',
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
# api_key = 'BB714F7B3BFE9ED3A93101639911D26A'

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

# api_url = 'https://iredcap.csmc.edu/api/'
# api_key = 'BB714F7B3BFE9ED3A93101639911D26A'

# # Instruments we are looking for
# target_instruments = [
#     'Decisional Conflict Survey',
#     'Shared Decision Making (SDM)',
#     'Post Risk Perception',
#     'Patient Satisfaction'
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
#     # check for an exact match or a substring match
#     exact_match = target in instrument_labels
#     partial_match = any(target.lower() in label.lower() for label in instrument_labels)
    
#     if exact_match:
#         print(f"  ✅ {target} - found")
#     elif partial_match:
#         matched = [l for l in instrument_labels if target.lower() in l.lower()]
#         print(f"  ⚠️  {target} - similar name found: {matched}")
#     else:
#         print(f"  ❌ {target} - missing")

# # Use the metadata to inspect each instrument's fields
# print("\n" + "=" * 60)
# print("📊 Target instrument field detail:")
# print("=" * 60)

# response = requests.post(api_url, data={
#     'token': api_key,
#     'content': 'metadata',
#     'format': 'json'
# })
# metadata = pd.DataFrame(response.json())

# # instrument_name mapping
# name_to_label = {inst['instrument_name']: inst['instrument_label'] for inst in instruments}

# for form_name, form_label in name_to_label.items():
#     # check whether it matches one of the targets
#     if any(t.lower() in form_label.lower() for t in target_instruments):
#         fields = metadata[metadata['form_name'] == form_name]
#         print(f"\n📋 {form_label} ({form_name})")
#         print(f"   Fields: {len(fields)}")
#         print("-" * 50)
#         for _, f in fields.iterrows():
#             print(f"   [{f['field_type']:12}] {f['field_name']}")













import requests
import pandas as pd
# load variables from .env if needed
from dotenv import load_dotenv
import os
load_dotenv()


# get api_url from .env
api_url = os.getenv('api_url', 'https://iredcap.csmc.edu/api/') 
api_key = os.getenv('r01_nlp_risk_feedback_api_key', '')

# Instruments we are looking for
target_instruments = [
    'Decisional Conflict Survey',
    'Shared Decision Making (SDM)',
    'Post Risk Perception',
    'Patient Satisfaction'
]

# Fetch the instrument list
response = requests.post(api_url, data={
    'token': api_key,
    'content': 'instrument',
    'format': 'json'
})
instruments = response.json()

# Print every instrument in the current project
print("=" * 60)
print("📋 All instruments in the project:")
print("=" * 60)
for inst in instruments:
    print(f"  • {inst['instrument_label']} ({inst['instrument_name']})")

# Check whether the target instruments exist
print("\n" + "=" * 60)
print("🔍 Target instruments present?")
print("=" * 60)

instrument_labels = [inst['instrument_label'] for inst in instruments]

for target in target_instruments:
    exact_match = target in instrument_labels
    partial_match = any(target.lower() in label.lower() for label in instrument_labels)
    
    if exact_match:
        print(f"  ✅ {target} - found")
    elif partial_match:
        matched = [l for l in instrument_labels if target.lower() in l.lower()]
        print(f"  ⚠️  {target} - similar name found: {matched}")
    else:
        print(f"  ❌ {target} - missing")

# Fetch the metadata
response = requests.post(api_url, data={
    'token': api_key,
    'content': 'metadata',
    'format': 'json'
})
metadata = pd.DataFrame(response.json())

# instrument_name mapping
name_to_label = {inst['instrument_name']: inst['instrument_label'] for inst in instruments}

# Target instrument field detail
print("\n" + "=" * 60)
print("📊 Target instrument field detail:")
print("=" * 60)

for form_name, form_label in name_to_label.items():
    if any(t.lower() in form_label.lower() for t in target_instruments):
        fields = metadata[metadata['form_name'] == form_name]
        print(f"\n📋 {form_label} ({form_name})")
        print(f"   Fields: {len(fields)}")
        print("-" * 50)
        for _, f in fields.iterrows():
            print(f"   [{f['field_type']:12}] {f['field_name']}")

# ============ extra: survey format detail ============
print("\n" + "=" * 70)
print("📝 Target instrument survey format detail:")
print("=" * 70)

for form_name, form_label in name_to_label.items():
    if any(t.lower() in form_label.lower() for t in target_instruments):
        fields = metadata[metadata['form_name'] == form_name]
        
        print(f"\n{'='*70}")
        print(f"📋 {form_label}")
        print(f"{'='*70}")
        
        for idx, (_, f) in enumerate(fields.iterrows(), 1):
            print(f"\n  Q{idx}. [{f['field_name']}]")
            print(f"      Question: {f['field_label']}")
            print(f"      Type: {f['field_type']}")
            
            # parse and display the choices when there are any
            choices = f.get('select_choices_or_calculations', '')
            if choices and f['field_type'] in ['radio', 'dropdown', 'checkbox']:
                print(f"      Choices:")
                # REDCap choice format: "1, Option1 | 2, Option2 | 3, Option3"
                for choice in choices.split('|'):
                    choice = choice.strip()
                    if choice:
                        print(f"         • {choice}")