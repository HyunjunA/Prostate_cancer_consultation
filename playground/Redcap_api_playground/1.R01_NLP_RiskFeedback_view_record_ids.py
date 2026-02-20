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
        event_name = events[0]['unique_event_name']
        print(f"   Event to use: {event_name}")

# ============ Get All Record IDs in Project ============
print("\n" + "=" * 70)
print("📋 All Record IDs in Project:")
print("=" * 70)

response = requests.post(api_url, data={
    'token': api_key,
    'content': 'record',
    'format': 'json',
    'type': 'flat',
    'fields[0]': 'record_id',
    'returnFormat': 'json'
})

if response.status_code == 200:
    all_records = response.json()
    
    # Remove duplicates and sort
    unique_ids = sorted(list(set(r.get('record_id') for r in all_records)))
    
    print(f"\n   Total Records: {len(unique_ids)}")
    print("-" * 50)
    
    if unique_ids:
        for idx, record_id in enumerate(unique_ids, 1):
            print(f"   {idx:4}. {record_id}")
    else:
        print("   (No records found)")
else:
    print(f"❌ Query Failed!")
    print(f"   Status Code: {response.status_code}")
    print(f"   Error: {response.text}")

# ============ Check Target Instrument Data Status ============
print("\n" + "=" * 70)
print("📊 Target Instrument Data Status:")
print("=" * 70)

# Target fields
target_fields = [
    'dcs1_v2',  # Decisional Conflict Survey first field
    'sdmp_options',  # SDM first field
    'risk_percep_1_1',  # Risk Perception first field
    'pt_satisfaction'  # Patient Satisfaction
]

response = requests.post(api_url, data={
    'token': api_key,
    'content': 'record',
    'format': 'json',
    'type': 'flat',
    'fields[0]': 'record_id',
    'fields[1]': 'dcs1_v2',
    'fields[2]': 'sdmp_options',
    'fields[3]': 'risk_percep_1_1',
    'fields[4]': 'pt_satisfaction',
    'returnFormat': 'json'
})

if response.status_code == 200:
    records = response.json()
    
    # Check data presence for each record
    print(f"\n   {'Record ID':<20} {'DCS':<8} {'SDM':<8} {'Risk':<8} {'Satisfaction':<12}")
    print("   " + "-" * 60)
    
    seen_ids = set()
    records_with_data = 0
    
    for record in records:
        record_id = record.get('record_id', '')
        if record_id in seen_ids:
            continue
        seen_ids.add(record_id)
        
        dcs = "✓" if record.get('dcs1_v2') else "✗"
        sdm = "✓" if record.get('sdmp_options') else "✗"
        risk = "✓" if record.get('risk_percep_1_1') else "✗"
        satisfaction = "✓" if record.get('pt_satisfaction') else "✗"
        
        has_any_data = any([
            record.get('dcs1_v2'),
            record.get('sdmp_options'),
            record.get('risk_percep_1_1'),
            record.get('pt_satisfaction')
        ])
        
        if has_any_data:
            records_with_data += 1
        
        print(f"   {record_id:<20} {dcs:<8} {sdm:<8} {risk:<8} {satisfaction:<12}")
    
    print("\n" + "-" * 50)
    print(f"   Records with target data: {records_with_data} / {len(seen_ids)}")

# ============ Summary ============
print("\n" + "=" * 70)
print("📊 Summary:")
print("=" * 70)
print(f"   • Project: {project_info.get('project_title')}")
print(f"   • Total Records: {len(unique_ids)}")
print(f"   • Longitudinal: {is_longitudinal}")
if is_longitudinal:
    print(f"   • Event: {event_name}")
