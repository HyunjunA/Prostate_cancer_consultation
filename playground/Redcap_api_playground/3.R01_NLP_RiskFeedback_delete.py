import requests
import json
import pandas as pd
from dotenv import load_dotenv
import os
load_dotenv()

api_url = os.getenv('api_url', 'https://iredcap.csmc.edu/api/')
api_key = os.getenv('r01_nlp_risk_feedback_api_key', '')

# ============ Define Record IDs to Delete ============
records_to_delete = ['TEST002']  # List of record_ids to delete

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
print(f"   Project Name: {project_info.get('project_title')}")

# ============ Verify Records Before Deletion ============
print("\n" + "=" * 70)
print("🔍 Verifying Records Before Deletion:")
print("=" * 70)

export_fields = ['record_id', 'dcs1_v2', 'sdmp_options', 'risk_percep_1_1', 'pt_satisfaction']

for record_id in records_to_delete:
    data = {
        'token': api_key,
        'content': 'record',
        'format': 'json',
        'type': 'flat',
        'records[0]': record_id,
        'returnFormat': 'json'
    }
    for i, field in enumerate(export_fields):
        data[f'fields[{i}]'] = field
    
    response = requests.post(api_url, data=data)
    
    if response.status_code == 200:
        records = response.json()
        if records:
            print(f"\n  ✓ {record_id}: Exists")
            for key in export_fields[1:]:  # Exclude record_id
                value = records[0].get(key, '')
                if value:
                    print(f"      {key}: {value[:40]}{'...' if len(str(value)) > 40 else ''}")
        else:
            print(f"\n  ✗ {record_id}: Does not exist")
    else:
        print(f"\n  ⚠️ {record_id}: Query failed - {response.text}")

# ============ Delete Records ============
print("\n" + "=" * 70)
print("🗑️  Deleting Records from REDCap...")
print("=" * 70)
print(f"   Target for deletion: {records_to_delete}")

data = {
    'token': api_key,
    'action': 'delete',
    'content': 'record',
    'returnFormat': 'json'
}

# Add record IDs to delete
for i, record_id in enumerate(records_to_delete):
    data[f'records[{i}]'] = record_id

response = requests.post(api_url, data=data)

if response.status_code == 200:
    result = response.json()
    print(f"\n✅ Deletion Successful!")
    print(f"   Number of records deleted: {result}")
else:
    print(f"\n❌ Deletion Failed!")
    print(f"   Status Code: {response.status_code}")
    print(f"   Error: {response.text}")

# ============ Verify After Deletion ============
print("\n" + "=" * 70)
print("🔍 Verifying After Deletion:")
print("=" * 70)

for record_id in records_to_delete:
    data = {
        'token': api_key,
        'content': 'record',
        'format': 'json',
        'type': 'flat',
        'records[0]': record_id,
        'fields[0]': 'record_id',
        'returnFormat': 'json'
    }
    
    response = requests.post(api_url, data=data)
    
    if response.status_code == 200:
        records = response.json()
        if records:
            print(f"  ⚠️ {record_id}: Still exists (deletion failed)")
        else:
            print(f"  ✓ {record_id}: Deletion complete")
    else:
        print(f"  ✓ {record_id}: Deletion complete (or does not exist)")

# ============ Current Remaining Records ============
print("\n" + "=" * 70)
print("📋 Current Records in Project:")
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
    unique_ids = list(set(r.get('record_id') for r in all_records))
    unique_ids.sort()
    
    print(f"   Total records: {len(unique_ids)}")
    if unique_ids:
        print(f"   Record ID list:")
        for rid in unique_ids[:20]:  # Display max 20
            print(f"      • {rid}")
        if len(unique_ids) > 20:
            print(f"      ... and {len(unique_ids) - 20} more")
    else:
        print("   (No records)")

# ============ Summary ============
print("\n" + "=" * 70)
print("📊 Deletion Summary:")
print("=" * 70)
print(f"   • Deletion requested: {records_to_delete}")
print(f"   • Number deleted: {result if response.status_code == 200 else 0}")