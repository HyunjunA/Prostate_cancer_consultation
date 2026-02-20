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

# api_url = 'https://iredcap.csmc.edu/api/'
# api_key = 'BB714F7B3BFE9ED3A93101639911D26A'

# # 찾고자 하는 Instrument들
# target_instruments = [
#     'Decisional Conflict Survey',
#     'Shared Decision Making (SDM)',
#     'Post Risk Perception',
#     'Patient Satisfaction'
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
#     # 정확히 일치하거나 포함되어 있는지 확인
#     exact_match = target in instrument_labels
#     partial_match = any(target.lower() in label.lower() for label in instrument_labels)
    
#     if exact_match:
#         print(f"  ✅ {target} - 존재함")
#     elif partial_match:
#         matched = [l for l in instrument_labels if target.lower() in l.lower()]
#         print(f"  ⚠️  {target} - 유사한 이름 발견: {matched}")
#     else:
#         print(f"  ❌ {target} - 없음")

# # 메타데이터로 각 Instrument의 필드 상세 보기
# print("\n" + "=" * 60)
# print("📊 타겟 Instrument 필드 상세:")
# print("=" * 60)

# response = requests.post(api_url, data={
#     'token': api_key,
#     'content': 'metadata',
#     'format': 'json'
# })
# metadata = pd.DataFrame(response.json())

# # instrument_name 매핑
# name_to_label = {inst['instrument_name']: inst['instrument_label'] for inst in instruments}

# for form_name, form_label in name_to_label.items():
#     # 타겟 중 하나와 매칭되는지 확인
#     if any(t.lower() in form_label.lower() for t in target_instruments):
#         fields = metadata[metadata['form_name'] == form_name]
#         print(f"\n📋 {form_label} ({form_name})")
#         print(f"   필드 수: {len(fields)}")
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

# 찾고자 하는 Instrument들
target_instruments = [
    'Decisional Conflict Survey',
    'Shared Decision Making (SDM)',
    'Post Risk Perception',
    'Patient Satisfaction'
]

# Instrument 목록 가져오기
response = requests.post(api_url, data={
    'token': api_key,
    'content': 'instrument',
    'format': 'json'
})
instruments = response.json()

# 현재 프로젝트의 모든 Instrument 출력
print("=" * 60)
print("📋 프로젝트 내 모든 Instruments:")
print("=" * 60)
for inst in instruments:
    print(f"  • {inst['instrument_label']} ({inst['instrument_name']})")

# 타겟 Instrument 존재 여부 확인
print("\n" + "=" * 60)
print("🔍 타겟 Instrument 존재 여부:")
print("=" * 60)

instrument_labels = [inst['instrument_label'] for inst in instruments]

for target in target_instruments:
    exact_match = target in instrument_labels
    partial_match = any(target.lower() in label.lower() for label in instrument_labels)
    
    if exact_match:
        print(f"  ✅ {target} - 존재함")
    elif partial_match:
        matched = [l for l in instrument_labels if target.lower() in l.lower()]
        print(f"  ⚠️  {target} - 유사한 이름 발견: {matched}")
    else:
        print(f"  ❌ {target} - 없음")

# 메타데이터 가져오기
response = requests.post(api_url, data={
    'token': api_key,
    'content': 'metadata',
    'format': 'json'
})
metadata = pd.DataFrame(response.json())

# instrument_name 매핑
name_to_label = {inst['instrument_name']: inst['instrument_label'] for inst in instruments}

# 타겟 Instrument 필드 상세
print("\n" + "=" * 60)
print("📊 타겟 Instrument 필드 상세:")
print("=" * 60)

for form_name, form_label in name_to_label.items():
    if any(t.lower() in form_label.lower() for t in target_instruments):
        fields = metadata[metadata['form_name'] == form_name]
        print(f"\n📋 {form_label} ({form_name})")
        print(f"   필드 수: {len(fields)}")
        print("-" * 50)
        for _, f in fields.iterrows():
            print(f"   [{f['field_type']:12}] {f['field_name']}")

# ============ 추가: 설문 포맷 상세 보기 ============
print("\n" + "=" * 70)
print("📝 타겟 Instrument 설문 포맷 상세:")
print("=" * 70)

for form_name, form_label in name_to_label.items():
    if any(t.lower() in form_label.lower() for t in target_instruments):
        fields = metadata[metadata['form_name'] == form_name]
        
        print(f"\n{'='*70}")
        print(f"📋 {form_label}")
        print(f"{'='*70}")
        
        for idx, (_, f) in enumerate(fields.iterrows(), 1):
            print(f"\n  Q{idx}. [{f['field_name']}]")
            print(f"      질문: {f['field_label']}")
            print(f"      타입: {f['field_type']}")
            
            # 선택지가 있는 경우 파싱해서 보여주기
            choices = f.get('select_choices_or_calculations', '')
            if choices and f['field_type'] in ['radio', 'dropdown', 'checkbox']:
                print(f"      선택지:")
                # REDCap 선택지 형식: "1, Option1 | 2, Option2 | 3, Option3"
                for choice in choices.split('|'):
                    choice = choice.strip()
                    if choice:
                        print(f"         • {choice}")