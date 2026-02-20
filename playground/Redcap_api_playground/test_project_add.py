

# import data to the REDCap test project
import requests
import json
from dotenv import load_dotenv
import os
load_dotenv()

api_url = os.getenv('api_url', 'https://iredcap.csmc.edu/api/')
api_key = os.getenv('test_project_api_key', '')

# ============ 입력할 데이터 정의 ============
# 각 필드에 맞는 값을 채워넣으세요

records_to_import = [
    {
        # Patient Info
        'record_id': '3',  # 필수: 고유 ID
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
        # total_proc는 calc 타입이므로 자동 계산됨
        'proc_1_rb': '1829',  # 선택지 중 하나
        'proc_2_rb': '2883',
        'proc_3_rb': '4933',
        'exercise': '7',   # 7=Every other day
        'sleep': '8',      # 8=8 hours
        # health_score는 calc 타입이므로 자동 계산됨
        'appt_date': '2024-02-01',
        'dob': '1985-05-15',
        # age_calc는 calc 타입이므로 자동 계산됨
        'admission_date': '2024-01-08',
        'discharge_date': '2024-01-12',
        # los는 calc 타입이므로 자동 계산됨
    },
    # 추가 레코드가 있으면 여기에 더 넣으세요
    # {
    #     'record_id': '2',
    #     'name': 'Jane Smith',
    #     ...
    # }
]

# ============ REDCap에 Import ============
def import_records(api_url, api_key, records):
    """REDCap에 레코드 import"""
    
    data = {
        'token': api_key,
        'content': 'record',
        'format': 'json',
        'type': 'flat',
        'overwriteBehavior': 'normal',  # 'overwrite'로 바꾸면 기존 데이터 덮어씀
        'forceAutoNumber': 'false',
        'data': json.dumps(records),
        'returnContent': 'ids',
        'returnFormat': 'json'
    }
    
    response = requests.post(api_url, data=data)
    
    return response

# Import 실행
print("=" * 60)
print("📤 REDCap으로 데이터 Import 중...")
print("=" * 60)

response = import_records(api_url, api_key, records_to_import)

if response.status_code == 200:
    result = response.json()
    print(f"✅ Import 성공!")
    print(f"   Import된 레코드 ID: {result}")
else:
    print(f"❌ Import 실패!")
    print(f"   Status Code: {response.status_code}")
    print(f"   Error: {response.text}")

# ============ Import 확인 ============
print("\n" + "=" * 60)
print("🔍 Import된 데이터 확인:")
print("=" * 60)

# 방금 import한 레코드 다시 가져오기
response = requests.post(api_url, data={
    'token': api_key,
    'content': 'record',
    'format': 'json',
    'type': 'flat',
    'records[0]': '1',  # 확인할 record_id
    'returnFormat': 'json'
})

if response.status_code == 200:
    imported_data = response.json()
    for record in imported_data:
        print(f"\nRecord ID: {record.get('record_id')}")
        for key, value in record.items():
            if value:  # 값이 있는 필드만 출력
                print(f"   {key}: {value}")