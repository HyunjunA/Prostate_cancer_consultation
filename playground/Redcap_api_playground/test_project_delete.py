import requests
from dotenv import load_dotenv
import os
load_dotenv()

api_url = os.getenv('api_url', 'https://iredcap.csmc.edu/api/')
api_key = os.getenv('test_project_api_key', '')

# ============ Record ids to delete ============
records_to_delete = ['3']  # list of record_ids to delete

# ============ Delete records from REDCap ============
def delete_records(api_url, api_key, record_ids):
    """Delete records from REDCap"""
    
    data = {
        'token': api_key,
        'action': 'delete',
        'content': 'record',
        'returnFormat': 'json'
    }
    
    # add the record ids to delete
    for i, record_id in enumerate(record_ids):
        data[f'records[{i}]'] = record_id
    
    response = requests.post(api_url, data=data)
    return response

# Run the delete
print("=" * 60)
print("🗑️  Deleting records from REDCap...")
print("=" * 60)
print(f"   Targets: {records_to_delete}")

response = delete_records(api_url, api_key, records_to_delete)

if response.status_code == 200:
    result = response.json()
    print(f"✅ Delete succeeded!")
    print(f"   Records deleted: {result}")
else:
    print(f"❌ Delete failed!")
    print(f"   Status Code: {response.status_code}")
    print(f"   Error: {response.text}")

# ============ Verify the delete ============
print("\n" + "=" * 60)
print("🔍 Verifying the delete (all current records):")
print("=" * 60)

response = requests.post(api_url, data={
    'token': api_key,
    'content': 'record',
    'format': 'json',
    'type': 'flat',
    'fields[0]': 'record_id',
    'fields[1]': 'name',
    'returnFormat': 'json'
})

if response.status_code == 200:
    remaining = response.json()
    if remaining:
        print(f"   Records remaining: {len(remaining)}")
        for r in remaining:
            print(f"   - Record {r.get('record_id')}: {r.get('name', 'N/A')}")
    else:
        print("   No records remaining")