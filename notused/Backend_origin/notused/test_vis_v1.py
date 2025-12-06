import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
import os

# Create directory to save output
output_dir = "json_output_and_static_vis"
os.makedirs(output_dir, exist_ok=True)

# Load CSV file
df = pd.read_csv('NUSPARV12-Demographic_DATA_2024-11-11_1357.csv')

# demo_gender_identity - gender identity distribution
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_gender_identity')
plt.title('Gender Identity Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/gender_identity_distribution.png')
plt.close()

# demo_legal_sex 
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_legal_sex')
plt.title('Legal Sex Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/legal_sex_distribution.png')
plt.close()

# demo_sexual_orientation 
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_sexual_orientation')
plt.title('Sexual Orientation Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/sexual_orientation_distribution.png')
plt.close()

# demo_marital_status 
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_marital_status')
plt.title('Marital Status Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/marital_status_distribution.png')
plt.close()

# demo_veteran_status
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_veteran_status')
plt.title('Veteran Status')
plt.savefig(f'{output_dir}/veteran_status.png')
plt.close()

# demo_race
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_race', order=df['demo_race'].value_counts().index)
plt.title('Race Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/race_distribution.png')
plt.close()

# demo_ethnicity
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_ethnicity')
plt.title('Ethnicity Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/ethnicity_distribution.png')
plt.close()

# demo_languages
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_languages', order=df['demo_languages'].value_counts().index)
plt.title('Languages Spoken')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/languages_spoken.png')
plt.close()

# demo_need_interpreter
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_need_interpreter')
plt.title('Need for Interpreter')
plt.savefig(f'{output_dir}/need_interpreter.png')
plt.close()

# demo_religion
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_religion', order=df['demo_religion'].value_counts().index)
plt.title('Religion Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/religion_distribution.png')
plt.close()

# demo_state
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_state', order=df['demo_state'].value_counts().index)
plt.title('State Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/state_distribution.png')
plt.close()

# demo_county
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_county', order=df['demo_county'].value_counts().index)
plt.title('County Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/county_distribution.png')
plt.close()

# demo_country
plt.figure(figsize=(10, 6))
sns.countplot(data=df, x='demo_country', order=df['demo_country'].value_counts().index)
plt.title('Country Distribution')
plt.xticks(rotation=45)
plt.savefig(f'{output_dir}/country_distribution.png')
plt.close()

# # 연령 계산 - 날짜 형식을 자동으로 인식하여 datetime으로 변환 후 계산
# 날짜 형식 변환 후 연령 계산
# df['demo_dob'] = pd.to_datetime(df['demo_dob'], errors='coerce')  # 날짜 형식을 변환, 변환 실패 시 NaT로 설정
# df['demo_age'] = df['demo_dob'].apply(lambda dob: datetime.now().year - dob.year if pd.notnull(dob) else None)

# # demo_age가 정상적으로 생성되었는지 확인
# if 'demo_age' in df.columns:
#     print("demo_age column created successfully.")

# # 연령대 구분 (10년 단위 구간 생성)
# bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
# labels = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90+']
# df['age_group'] = pd.cut(df['demo_age'], bins=bins, labels=labels, right=False)

# # age_group이 정상적으로 생성되었는지 확인
# if 'age_group' in df.columns:
#     print("age_group column created successfully.")

# # 연령대 분포 시각화
# plt.figure(figsize=(10, 6))
# sns.countplot(data=df, x='age_group', order=labels)
# plt.title('Age Group Distribution')
# plt.xlabel('Age Group')
# plt.ylabel('Frequency')
# plt.savefig(f'{output_dir}/age_group_distribution.png')
# plt.close()

# 기존의 나이 계산 부분
# 기존의 나이 계산 부분
df['demo_dob'] = pd.to_datetime(df['demo_dob'], errors='coerce')
df['demo_age'] = df['demo_dob'].apply(lambda dob: datetime.now().year - dob.year if pd.notnull(dob) else None)

# 1. 히스토그램과 KDE(커널 밀도 추정) 결합
plt.figure(figsize=(12, 8))
sns.histplot(data=df, x='demo_age', bins=30, stat='density', alpha=0.5)
sns.kdeplot(data=df, x='demo_age', color='red', linewidth=2)
plt.title('Age Distribution with Density Estimation')
plt.xlabel('Age')
plt.ylabel('Density')
plt.savefig(f'{output_dir}/age_distribution_histogram_kde.png')
plt.close()

# 2. 바이올린 플롯
plt.figure(figsize=(10, 6))
sns.violinplot(data=df, y='demo_age', orient='v')
plt.title('Age Distribution (Violin Plot)')
plt.ylabel('Age')
plt.savefig(f'{output_dir}/age_distribution_violin.png')
plt.close()

# 3. 박스플롯과 스트립 플롯 결합
plt.figure(figsize=(10, 6))
sns.boxplot(data=df, y='demo_age', color='lightgray')
sns.stripplot(data=df, y='demo_age', color='blue', alpha=0.3, size=4)
plt.title('Age Distribution (Box Plot with Strip Plot)')
plt.ylabel('Age')
plt.savefig(f'{output_dir}/age_distribution_box_strip.png')
plt.close()

# 4. 러그 플롯이 있는 KDE (수정된 버전)
plt.figure(figsize=(12, 6))
sns.kdeplot(data=df, x='demo_age', fill=True)
sns.rugplot(data=df, x='demo_age', alpha=0.2)  # plt.rugs를 sns.rugplot으로 수정
plt.title('Age Distribution with Rug Plot')
plt.xlabel('Age')
plt.ylabel('Density')
plt.savefig(f'{output_dir}/age_distribution_kde_rug.png')
plt.close()



# 도시 분포 시각화
plt.figure(figsize=(10, 6))
sns.countplot(data=df, y='demo_city', order=df['demo_city'].value_counts().index[:20])  # 상위 20개 도시만 표시
plt.title('City Distribution ')
plt.xlabel('Frequency')
plt.ylabel('City')
plt.savefig(f'{output_dir}/city_distribution.png')
plt.close()

# 직업 분포 시각화
plt.figure(figsize=(10, 6))
sns.countplot(data=df, y='demo_occupation', order=df['demo_occupation'].value_counts().index[:20])  # 상위 20개 직업만 표시
plt.title('Occupation Distribution ')
plt.xlabel('Frequency')
plt.ylabel('Occupation')
plt.savefig(f'{output_dir}/occupation_distribution.png')
plt.close()
