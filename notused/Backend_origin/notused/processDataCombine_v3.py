import json
import pandas as pd

# 첫 번째 데이터 (Twitter X)
with open('/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/twitter_flu_weekly_data.json', 'r') as file:
    twitter_data = json.load(file)

# 두 번째 데이터 (CDC)
cdc_df = pd.read_csv('/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/backend/Output/who_nrevss_weekly_positive.csv')
cdc_data = cdc_df.to_dict(orient='records')

# 데이터 결합
def merge_data(twitter_data, cdc_data):
    cdc_lookup = {(d['year'], d['week']): d['percent_positive_cdc'] for d in cdc_data}
    merged_data = []

    for entry in twitter_data:
        year = int(entry['week_start'][:4])
        week = entry['week']
        percent_cdc = cdc_lookup.get((year, week), -1.0)
        entry['year'] = year
        entry['percent_positive_cdc'] = percent_cdc
        merged_data.append(entry)

    return merged_data

# 결합된 데이터 생성
combined_data = merge_data(twitter_data, cdc_data)

# 결과를 JSON 파일로 저장
with open('temp_output.json', 'w', encoding='utf-8') as outfile:
    json.dump(combined_data, outfile, indent=2, ensure_ascii=False)

# 저장 확인 메시지
print("데이터가 temp_output.json 파일로 저장되었습니다.")
