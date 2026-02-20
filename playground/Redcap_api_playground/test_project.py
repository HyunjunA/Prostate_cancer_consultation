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

# # 메타데이터 가져오기
# metadata = project.export_metadata()
# meta_df = pd.DataFrame(metadata)

# # Instrument별 필드 그룹화
# instruments = meta_df.groupby('form_name')

# for form_name, fields in instruments:
#     print(f"\n{'='*60}")
#     print(f"📋 Instrument: {form_name}")
#     print(f"{'='*60}")
#     print(f"필드 수: {len(fields)}\n")
    
#     for _, field in fields.iterrows():
#         field_type = field['field_type']
#         field_name = field['field_name']
#         field_label = field['field_label'][:50] + '...' if len(field['field_label']) > 50 else field['field_label']
        
#         # 선택형 필드의 경우 옵션도 표시
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

# # 찾고자 하는 Instrument들
# target_instruments = [
#     'Patient Info',
#     'Medical History',
#     'Visit Information',
#     'Labs',
#     'Calculations'
# ]

# # Instrument 목록 가져오기
# response = requests.post(api_url, data={
#     'token': api_key,
#     'content': 'instrument',
#     'format': 'json'
# })
# instruments = response.json()

# # 현재 프로젝트의 모든 Instrument 출력
# print("=" * 60)
# print("📋 프로젝트 내 모든 Instruments:")
# print("=" * 60)
# for inst in instruments:
#     print(f"  • {inst['instrument_label']} ({inst['instrument_name']})")

# # 타겟 Instrument 존재 여부 확인
# print("\n" + "=" * 60)
# print("🔍 타겟 Instrument 존재 여부:")
# print("=" * 60)

# instrument_labels = [inst['instrument_label'] for inst in instruments]

# for target in target_instruments:
#     exact_match = target in instrument_labels
#     partial_match = any(target.lower() in label.lower() for label in instrument_labels)
    
#     if exact_match:
#         print(f"  ✅ {target} - 존재함")
#     elif partial_match:
#         matched = [l for l in instrument_labels if target.lower() in l.lower()]
#         print(f"  ⚠️  {target} - 유사한 이름 발견: {matched}")
#     else:
#         print(f"  ❌ {target} - 없음")

# # 메타데이터 가져오기
# response = requests.post(api_url, data={
#     'token': api_key,
#     'content': 'metadata',
#     'format': 'json'
# })
# metadata = pd.DataFrame(response.json())

# # instrument_name 매핑
# name_to_label = {inst['instrument_name']: inst['instrument_label'] for inst in instruments}

# # 타겟 Instrument 필드 상세
# print("\n" + "=" * 60)
# print("📊 타겟 Instrument 필드 상세:")
# print("=" * 60)

# for form_name, form_label in name_to_label.items():
#     if any(t.lower() in form_label.lower() for t in target_instruments):
#         fields = metadata[metadata['form_name'] == form_name]
#         print(f"\n📋 {form_label} ({form_name})")
#         print(f"   필드 수: {len(fields)}")
#         print("-" * 50)
#         for _, f in fields.iterrows():
#             print(f"   [{f['field_type']:12}] {f['field_name']}")

# # ============ 추가: 설문 포맷 상세 보기 ============
# print("\n" + "=" * 70)
# print("📝 타겟 Instrument 설문 포맷 상세:")
# print("=" * 70)

# for form_name, form_label in name_to_label.items():
#     if any(t.lower() in form_label.lower() for t in target_instruments):
#         fields = metadata[metadata['form_name'] == form_name]
        
#         print(f"\n{'='*70}")
#         print(f"📋 {form_label}")
#         print(f"{'='*70}")
        
#         for idx, (_, f) in enumerate(fields.iterrows(), 1):
#             print(f"\n  Q{idx}. [{f['field_name']}]")
#             print(f"      질문: {f['field_label']}")
#             print(f"      타입: {f['field_type']}")
            
#             # 선택지가 있는 경우 파싱해서 보여주기
#             choices = f.get('select_choices_or_calculations', '')
#             if choices and f['field_type'] in ['radio', 'dropdown', 'checkbox']:
#                 print(f"      선택지:")
#                 # REDCap 선택지 형식: "1, Option1 | 2, Option2 | 3, Option3"
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