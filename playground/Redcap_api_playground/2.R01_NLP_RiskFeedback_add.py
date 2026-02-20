import requests
import json
import pandas as pd
from dotenv import load_dotenv
import os
load_dotenv()

api_url = os.getenv('api_url', 'https://iredcap.csmc.edu/api/')
api_key = os.getenv('r01_nlp_risk_feedback_api_key', '')

# Target Instruments
target_instruments = [
    'Decisional Conflict Survey',
    'Shared Decision Making (SDM)',
    'Post Risk Perception',
    'Patient Satisfaction'
]

# ============ Project Information ============
print("=" * 70)
print("📌 Project Information:")
print("=" * 70)

response = requests.post(api_url, data={
    'token': api_key,
    'content': 'project',
    'format': 'json'
})
project_info = response.json()
is_longitudinal = project_info.get('is_longitudinal', 0) == 1
print(f"   Project Name: {project_info.get('project_title')}")
print(f"   Longitudinal: {is_longitudinal}")

# Get event info if longitudinal
event_name = None
if is_longitudinal:
    response = requests.post(api_url, data={
        'token': api_key,
        'content': 'event',
        'format': 'json'
    })
    events = response.json()
    if events:
        event_name = events[0]['unique_event_name']  # Use first event
        print(f"   Event to use: {event_name}")

# ============ Get Instrument List ============
print("\n" + "=" * 70)
print("📋 All Instruments in Project:")
print("=" * 70)

response = requests.post(api_url, data={
    'token': api_key,
    'content': 'instrument',
    'format': 'json'
})
instruments = response.json()

for inst in instruments:
    print(f"  • {inst['instrument_label']} ({inst['instrument_name']})")

# ============ Get Metadata ============
response = requests.post(api_url, data={
    'token': api_key,
    'content': 'metadata',
    'format': 'json'
})
metadata = pd.DataFrame(response.json())

name_to_label = {inst['instrument_name']: inst['instrument_label'] for inst in instruments}

# ============ Target Instrument Field Details ============
print("\n" + "=" * 70)
print("📊 Target Instrument Field Details:")
print("=" * 70)

target_fields = []  # Store field list for import

for form_name, form_label in name_to_label.items():
    if any(t.lower() in form_label.lower() for t in target_instruments):
        fields = metadata[metadata['form_name'] == form_name]
        print(f"\n📋 {form_label} ({form_name})")
        print(f"   Number of fields: {len(fields)}")
        print("-" * 50)
        for _, f in fields.iterrows():
            print(f"   [{f['field_type']:12}] {f['field_name']}")
            target_fields.append(f['field_name'])

# ============ Survey Format Details ============
print("\n" + "=" * 70)
print("📝 Target Instrument Survey Format Details:")
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
            
            choices = f.get('select_choices_or_calculations', '')
            if choices and f['field_type'] in ['radio', 'dropdown', 'checkbox', 'yesno']:
                print(f"      Choices:")
                for choice in choices.split('|'):
                    choice = choice.strip()
                    if choice:
                        print(f"         • {choice}")

# ============ Define Data to Import ============
print("\n" + "=" * 70)
print("📤 Preparing Data for Import:")
print("=" * 70)

record_data = {
    # 'record_id': 'TEST001',
    'record_id': 'TEST002',
    
    # Decisional Conflict Survey (16 questions)
    # 1=Strongly Agree, 2=Agree, 3=Neither, 4=Disagree, 5=Strongly Disagree
    'dcs1_v2': '1',   # I know which options are available to me.
    'dcs2_v2': '2',   # I know the benefits of each option.
    'dcs3_v2': '2',   # I know the risks and side effects.
    'dcs4_v2': '2',   # I am clear about which benefits matter most.
    'dcs5_v2': '3',   # I am clear about which risks matter most.
    'dcs6_v2': '2',   # Clear about what is more important.
    'dcs7_v2': '1',   # I have enough support from others.
    'dcs8_v2': '1',   # I am choosing without pressure.
    'dcs9_v2': '2',   # I have enough advice.
    'dcs10_v2': '2',  # I am clear about the best choice.
    'dcs11_v2': '3',  # I feel sure about what to choose.
    'dcs12_v2': '4',  # This decision is easy for me.
    'dcs13_v2': '2',  # I feel I have made an informed choice.
    'dcs14_v2': '1',  # My decision shows what is important.
    'dcs15_v2': '2',  # I expect to stick with my decision.
    'dcs16_v2': '2',  # I am satisfied with my decision.
    
    # Shared Decision Making (SDM) (4 questions)
    # yesno: 1=Yes, 0=No
    # radio: 1=A lot, 2=Some, 3=A little, 4=Not at all
    'sdmp_options': '1',  # Did provider explain choices? (Yes)
    'sdm_ptos': '1',      # Reasons TO have intervention? (A lot)
    'sdm_cons': '2',      # Reasons NOT to have intervention? (Some)
    'sdm_pref': '1',      # Did provider ask preference? (Yes)
    
    # Post Risk Perception (5 questions)
    'risk_percep_1_1': '3',   # Risk if don't treat (20/100)
    'risk_percept2_2': '1',   # Risk if do treat (5/100)
    'risk_percept_3_3': '3',  # Erectile dysfunction risk (50/100)
    'risk_percept_4_4': '2',  # Urinary incontinence risk (10/100)
    'risk_percep_5_5': '2',   # Irritative urinary symptoms risk (10/100)
    
    # Patient Satisfaction (1 question)
    'pt_satisfaction': 'The NLP report was very helpful in understanding my treatment options. It clearly explained the risks and benefits of each approach.',
}

# Add event_name if longitudinal
if is_longitudinal and event_name:
    record_data['redcap_event_name'] = event_name

records_to_import = [record_data]

print(f"   Record ID: {record_data['record_id']}")
print(f"   Total fields: {len(record_data) - 1}")  # Exclude record_id
if is_longitudinal:
    print(f"   Event: {event_name}")

# ============ Import to REDCap ============
print("\n" + "=" * 70)
print("📤 Importing Data to REDCap...")
print("=" * 70)

response = requests.post(api_url, data={
    'token': api_key,
    'content': 'record',
    'format': 'json',
    'type': 'flat',
    'overwriteBehavior': 'normal',
    'forceAutoNumber': 'false',
    'data': json.dumps(records_to_import),
    'returnContent': 'ids',
    'returnFormat': 'json'
})

if response.status_code == 200:
    result = response.json()
    print(f"✅ Import Successful!")
    print(f"   Imported Record ID: {result}")
else:
    print(f"❌ Import Failed!")
    print(f"   Status Code: {response.status_code}")
    print(f"   Error: {response.text}")

# ============ Verify Imported Data ============
print("\n" + "=" * 70)
print("🔍 Verifying Imported Data:")
print("=" * 70)

# Get only target fields for the record
export_fields = ['record_id'] + [
    'dcs1_v2', 'dcs2_v2', 'dcs3_v2', 'dcs4_v2', 'dcs5_v2',
    'dcs6_v2', 'dcs7_v2', 'dcs8_v2', 'dcs9_v2', 'dcs10_v2',
    'dcs11_v2', 'dcs12_v2', 'dcs13_v2', 'dcs14_v2', 'dcs15_v2', 'dcs16_v2',
    'sdmp_options', 'sdm_ptos', 'sdm_cons', 'sdm_pref',
    'risk_percep_1_1', 'risk_percept2_2', 'risk_percept_3_3',
    'risk_percept_4_4', 'risk_percep_5_5',
    'pt_satisfaction'
]

data = {
    'token': api_key,
    'content': 'record',
    'format': 'json',
    'type': 'flat',
    'records[0]': record_data['record_id'],
    'returnFormat': 'json'
}

# Add fields
for i, field in enumerate(export_fields):
    data[f'fields[{i}]'] = field

response = requests.post(api_url, data=data)

if response.status_code == 200:
    imported_data = response.json()
    
    if not imported_data:
        print("   ⚠️ Record not found.")
    else:
        for record in imported_data:
            print(f"\n📋 Record ID: {record.get('record_id')}")
            
            # Decisional Conflict Survey
            print("\n  ┌─────────────────────────────────────────────────────────┐")
            print("  │ Decisional Conflict Survey                              │")
            print("  └─────────────────────────────────────────────────────────┘")
            for i in range(1, 17):
                key = f'dcs{i}_v2'
                value = record.get(key, '')
                value_label = {
                    '1': 'Strongly Agree',
                    '2': 'Agree', 
                    '3': 'Neither',
                    '4': 'Disagree',
                    '5': 'Strongly Disagree'
                }.get(value, value)
                status = "✓" if value else "✗"
                print(f"    {status} {key}: {value} ({value_label})")
            
            # Shared Decision Making
            print("\n  ┌─────────────────────────────────────────────────────────┐")
            print("  │ Shared Decision Making (SDM)                            │")
            print("  └─────────────────────────────────────────────────────────┘")
            
            for key, labels in [
                ('sdmp_options', {'1': 'Yes', '0': 'No'}),
                ('sdm_ptos', {'1': 'A lot', '2': 'Some', '3': 'A little', '4': 'Not at all'}),
                ('sdm_cons', {'1': 'A lot', '2': 'Some', '3': 'A little', '4': 'Not at all'}),
                ('sdm_pref', {'1': 'Yes', '0': 'No'})
            ]:
                value = record.get(key, '')
                value_label = labels.get(value, value)
                status = "✓" if value else "✗"
                print(f"    {status} {key}: {value} ({value_label})")
            
            # Post Risk Perception
            print("\n  ┌─────────────────────────────────────────────────────────┐")
            print("  │ Post Risk Perception                                    │")
            print("  └─────────────────────────────────────────────────────────┘")
            for key in ['risk_percep_1_1', 'risk_percept2_2', 'risk_percept_3_3', 
                        'risk_percept_4_4', 'risk_percep_5_5']:
                value = record.get(key, '')
                status = "✓" if value else "✗"
                print(f"    {status} {key}: {value}")
            
            # Patient Satisfaction
            print("\n  ┌─────────────────────────────────────────────────────────┐")
            print("  │ Patient Satisfaction                                    │")
            print("  └─────────────────────────────────────────────────────────┘")
            value = record.get('pt_satisfaction', '')
            status = "✓" if value else "✗"
            if value:
                print(f"    {status} pt_satisfaction: {value[:60]}...")
            else:
                print(f"    {status} pt_satisfaction: (empty)")

else:
    print(f"❌ Query Failed!")
    print(f"   Status Code: {response.status_code}")
    print(f"   Error: {response.text}")

# ============ Summary ============
print("\n" + "=" * 70)
print("📊 Import Summary:")
print("=" * 70)
print(f"   • Decisional Conflict Survey: 16 fields")
print(f"   • Shared Decision Making: 4 fields")
print(f"   • Post Risk Perception: 5 fields")
print(f"   • Patient Satisfaction: 1 field")
print(f"   • Total: 26 fields")