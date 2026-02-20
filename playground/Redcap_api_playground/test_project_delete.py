import requests
from dotenv import load_dotenv
import os
load_dotenv()

api_url = os.getenv('api_url', 'https://iredcap.csmc.edu/api/')
api_key = os.getenv('test_project_api_key', '')

# ============ 삭제할 레코드 ID ============
records_to_delete = ['3']  # 삭제할 record_id 리스트

# ============ REDCap에서 레코드 삭제 ============
def delete_records(api_url, api_key, record_ids):
    """REDCap에서 레코드 삭제"""
    
    data = {
        'token': api_key,
        'action': 'delete',
        'content': 'record',
        'returnFormat': 'json'
    }
    
    # 삭제할 레코드 ID들 추가
    for i, record_id in enumerate(record_ids):
        data[f'records[{i}]'] = record_id
    
    response = requests.post(api_url, data=data)
    return response

# 삭제 실행
print("=" * 60)
print("🗑️  REDCap에서 레코드 삭제 중...")
print("=" * 60)
print(f"   삭제 대상: {records_to_delete}")

response = delete_records(api_url, api_key, records_to_delete)

if response.status_code == 200:
    result = response.json()
    print(f"✅ 삭제 성공!")
    print(f"   삭제된 레코드 수: {result}")
else:
    print(f"❌ 삭제 실패!")
    print(f"   Status Code: {response.status_code}")
    print(f"   Error: {response.text}")

# ============ 삭제 확인 ============
print("\n" + "=" * 60)
print("🔍 삭제 확인 (현재 모든 레코드):")
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
        print(f"   남은 레코드 수: {len(remaining)}")
        for r in remaining:
            print(f"   - Record {r.get('record_id')}: {r.get('name', 'N/A')}")
    else:
        print("   남은 레코드 없음")