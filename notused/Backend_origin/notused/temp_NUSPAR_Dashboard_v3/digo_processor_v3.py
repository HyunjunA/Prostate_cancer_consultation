import pandas as pd
import numpy as np
import json

data_file_path = '/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Diagnosis/Diagnosis_combined.csv'

# Read CSV file
df = pd.read_csv(data_file_path)

# NaN 값을 명시적으로 None 또는 빈문자열로 바꿔줍니다.
df = df.replace({np.nan: None})

patient_dict = {}

for _, row in df.iterrows():
    patient_id = row['patient_record_id']
    event = {
        'redcap_event_name': row['redcap_event_name'],
        'redcap_repeat_instrument': row['redcap_repeat_instrument'],
        'redcap_repeat_instance': row['redcap_repeat_instance'],
        'diagnosis_date': row['diagnosis_date'],
        'diagnosis_disease_class': row['diagnosis_disease_class'],
        'diagnosis_complete': row['diagnosis_complete']
    }

    if patient_id not in patient_dict:
        patient_dict[patient_id] = []

    patient_dict[patient_id].append(event)

# 저장 시 json.dumps로 NaN값이 제거되었음을 확인합니다.
with open('demo_data.json', 'w', encoding='utf-8') as json_file:
    json.dump(patient_dict, json_file, ensure_ascii=False, indent=4)

print('JSON file created successfully.')