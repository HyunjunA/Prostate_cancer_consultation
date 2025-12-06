# import pandas as pd
# import matplotlib.pyplot as plt
# import seaborn as sns
# from datetime import datetime
# import os

# # 저장할 디렉토리 생성
# output_dir = "temp_static_vis_v2"
# os.makedirs(output_dir, exist_ok=True)


# # CSV 파일 불러오기 추가
# df = pd.read_csv('NUSPARV12-Demographic_DATA_2024-11-11_1357.csv')

# # first drop any rows where demo_subject_id is null
# df = df.dropna(subset=['demo_subject_id'])



# def create_distribution_plots(df, column, title, rotation=45, figsize=(15, 6), top_n=None):
#     """
#     주어진 열에 대해 카운트플롯과 파이차트를 생성하는 함수
#     """
#     # 데이터 준비
#     if top_n:
#         value_counts = df[column].value_counts().head(top_n)
#         other_count = df[column].value_counts()[top_n:].sum()
#         if other_count > 0:
#             value_counts['Others'] = other_count
#     else:
#         value_counts = df[column].value_counts()
    
#     # 전체 비율 계산
#     total = value_counts.sum()
#     percentages = value_counts / total * 100

#     # 서브플롯 생성
#     fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)
#     fig.suptitle(title, fontsize=16, y=1.05)

#     # 카운트플롯
#     sns.barplot(x=value_counts.index, y=value_counts.values, ax=ax1)
#     ax1.set_xticklabels(ax1.get_xticklabels(), rotation=rotation)
#     ax1.set_title('Count Distribution')
#     ax1.set_ylabel('Count')

#     # 파이차트
#     wedges, texts, autotexts = ax2.pie(percentages, 
#                                       labels=value_counts.index,
#                                       autopct='%1.1f%%',
#                                       textprops={'fontsize': 8})
#     ax2.set_title('Percentage Distribution')

#     # 범례 추가 (파이차트가 복잡한 경우)
#     if len(value_counts) > 5:
#         ax2.legend(wedges, value_counts.index,
#                   title="Categories",
#                   loc="center left",
#                   bbox_to_anchor=(1, 0, 0.5, 1))

#     plt.tight_layout()
#     plt.savefig(f'{output_dir}/{column}_distribution.png', bbox_inches='tight')
#     plt.close()

# # 각 demographic 변수에 대한 시각화 생성
# demographic_columns = {
#     'demo_gender_identity': 'Gender Identity Distribution',
#     'demo_legal_sex': 'Legal Sex Distribution',
#     'demo_sexual_orientation': 'Sexual Orientation Distribution',
#     'demo_marital_status': 'Marital Status Distribution',
#     'demo_veteran_status': 'Veteran Status Distribution',
#     'demo_race': 'Race Distribution',
#     'demo_ethnicity': 'Ethnicity Distribution',
#     'demo_languages': 'Languages Distribution',
#     'demo_need_interpreter': 'Need for Interpreter Distribution',
#     'demo_religion': 'Religion Distribution',
#     'demo_state': 'State Distribution',
#     'demo_country': 'Country Distribution'
# }

# # 각 변수에 대해 시각화 생성
# for column, title in demographic_columns.items():
#     create_distribution_plots(df, column, title)

# # 도시와 직업은 상위 20개만 표시
# create_distribution_plots(df, 'demo_city', 'City Distribution', top_n=20, figsize=(20, 8))
# create_distribution_plots(df, 'demo_occupation', 'Occupation Distribution', top_n=20, figsize=(20, 8))

# # 연령 분포 시각화 (기존 코드 유지)
# df['demo_dob'] = pd.to_datetime(df['demo_dob'], errors='coerce')
# df['demo_age'] = df['demo_dob'].apply(lambda dob: datetime.now().year - dob.year if pd.notnull(dob) else None)

# # 연령 분포 시각화 (4가지 방법)
# # 1. 히스토그램과 KDE
# plt.figure(figsize=(12, 8))
# sns.histplot(data=df, x='demo_age', bins=30, stat='density', alpha=0.5)
# sns.kdeplot(data=df, x='demo_age', color='red', linewidth=2)
# plt.title('Age Distribution with Density Estimation')
# plt.xlabel('Age')
# plt.ylabel('Density')
# plt.savefig(f'{output_dir}/age_distribution_histogram_kde.png')
# plt.close()

# # 2. 바이올린 플롯
# plt.figure(figsize=(10, 6))
# sns.violinplot(data=df, y='demo_age', orient='v')
# plt.title('Age Distribution (Violin Plot)')
# plt.ylabel('Age')
# plt.savefig(f'{output_dir}/age_distribution_violin.png')
# plt.close()

# # 3. 박스플롯과 스트립 플롯
# plt.figure(figsize=(10, 6))
# sns.boxplot(data=df, y='demo_age', color='lightgray')
# sns.stripplot(data=df, y='demo_age', color='blue', alpha=0.3, size=4)
# plt.title('Age Distribution (Box Plot with Strip Plot)')
# plt.ylabel('Age')
# plt.savefig(f'{output_dir}/age_distribution_box_strip.png')
# plt.close()

# # 4. 러그 플롯이 있는 KDE
# plt.figure(figsize=(12, 6))
# sns.kdeplot(data=df, x='demo_age', fill=True)
# sns.rugplot(data=df, x='demo_age', alpha=0.2)
# plt.title('Age Distribution with Rug Plot')
# plt.xlabel('Age')
# plt.ylabel('Density')
# plt.savefig(f'{output_dir}/age_distribution_kde_rug.png')
# plt.close()




# import pandas as pd
# import matplotlib.pyplot as plt
# import seaborn as sns
# from datetime import datetime
# import os

# # 저장할 디렉토리 생성
# output_dir = "temp_static_vis_v2"
# os.makedirs(output_dir, exist_ok=True)

# # CSV 파일 불러오기 추가
# df = pd.read_csv('NUSPARV12-Demographic_DATA_2024-11-11_1357.csv')

# # first drop any rows where demo_subject_id is null
# df = df.dropna(subset=['demo_subject_id'])

# # Categorical columns 정의
# categorical_columns = {
#     'demo_gender_identity': 'Gender Identity Distribution',
#     'demo_legal_sex': 'Legal Sex Distribution',
#     'demo_sexual_orientation': 'Sexual Orientation Distribution',
#     'demo_marital_status': 'Marital Status Distribution',
#     'demo_veteran_status': 'Veteran Status Distribution',
#     'demo_race': 'Race Distribution',
#     'demo_ethnicity': 'Ethnicity Distribution',
#     'demo_languages': 'Languages Distribution',
#     'demo_need_interpreter': 'Need for Interpreter Distribution',
#     'demo_religion': 'Religion Distribution',
#     'demo_state': 'State Distribution',
#     'demo_country': 'Country Distribution',
#     'demo_city': 'City Distribution',
#     'demo_occupation': 'Occupation Distribution'
# }

# # 연속형/날짜형 변수 정의
# continuous_date_columns = ['demo_dob']

# # categorical columns에 대해서만 'Unknown' 처리
# for column in categorical_columns.keys():
#     df[column] = df[column].fillna('Unknown')

# def create_distribution_plots(df, column, title, rotation=45, figsize=(15, 6), top_n=None):
#     """
#     주어진 열에 대해 카운트플롯과 파이차트를 생성하는 함수
#     """
#     # 데이터 준비
#     if top_n:
#         value_counts = df[column].value_counts().head(top_n)
#         other_count = df[column].value_counts()[top_n:].sum()
#         if other_count > 0:
#             value_counts['Others'] = other_count
#     else:
#         value_counts = df[column].value_counts()
    
#     # 전체 비율 계산
#     total = value_counts.sum()
#     percentages = value_counts / total * 100

#     # 서브플롯 생성
#     fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)
#     fig.suptitle(title, fontsize=16, y=1.05)

#     # 카운트플롯
#     sns.barplot(x=value_counts.index, y=value_counts.values, ax=ax1)
#     ax1.set_xticklabels(ax1.get_xticklabels(), rotation=rotation)
#     ax1.set_title('Count Distribution')
#     ax1.set_ylabel('Count')

#     # 파이차트
#     wedges, texts, autotexts = ax2.pie(percentages, 
#                                       labels=value_counts.index,
#                                       autopct='%1.1f%%',
#                                       textprops={'fontsize': 8})
#     ax2.set_title('Percentage Distribution')

#     # 범례 추가 (파이차트가 복잡한 경우)
#     if len(value_counts) > 5:
#         ax2.legend(wedges, value_counts.index,
#                   title="Categories",
#                   loc="center left",
#                   bbox_to_anchor=(1, 0, 0.5, 1))

#     plt.tight_layout()
#     plt.savefig(f'{output_dir}/{column}_distribution.png', bbox_inches='tight')
#     plt.close()

# # Categorical 변수들에 대해 시각화 생성 (city와 occupation 제외)
# for column, title in categorical_columns.items():
#     if column not in ['demo_city', 'demo_occupation']:
#         create_distribution_plots(df, column, title)

# # 도시와 직업은 상위 20개만 표시
# create_distribution_plots(df, 'demo_city', 'City Distribution', top_n=20, figsize=(20, 8))
# create_distribution_plots(df, 'demo_occupation', 'Occupation Distribution', top_n=20, figsize=(20, 8))

# # 연령 분포 시각화를 위한 날짜 처리
# df['demo_dob'] = pd.to_datetime(df['demo_dob'], errors='coerce')
# df['demo_age'] = df['demo_dob'].apply(lambda dob: datetime.now().year - dob.year if pd.notnull(dob) else None)

# # 연령 분포 시각화 (4가지 방법)
# # 1. 히스토그램과 KDE
# plt.figure(figsize=(12, 8))
# sns.histplot(data=df, x='demo_age', bins=30, stat='density', alpha=0.5)
# sns.kdeplot(data=df, x='demo_age', color='red', linewidth=2)
# plt.title('Age Distribution with Density Estimation')
# plt.xlabel('Age')
# plt.ylabel('Density')
# plt.savefig(f'{output_dir}/age_distribution_histogram_kde.png')
# plt.close()

# # 2. 바이올린 플롯
# plt.figure(figsize=(10, 6))
# sns.violinplot(data=df, y='demo_age', orient='v')
# plt.title('Age Distribution (Violin Plot)')
# plt.ylabel('Age')
# plt.savefig(f'{output_dir}/age_distribution_violin.png')
# plt.close()

# # 3. 박스플롯과 스트립 플롯
# plt.figure(figsize=(10, 6))
# sns.boxplot(data=df, y='demo_age', color='lightgray')
# sns.stripplot(data=df, y='demo_age', color='blue', alpha=0.3, size=4)
# plt.title('Age Distribution (Box Plot with Strip Plot)')
# plt.ylabel('Age')
# plt.savefig(f'{output_dir}/age_distribution_box_strip.png')
# plt.close()

# # 4. 러그 플롯이 있는 KDE
# plt.figure(figsize=(12, 6))
# sns.kdeplot(data=df, x='demo_age', fill=True)
# sns.rugplot(data=df, x='demo_age', alpha=0.2)
# plt.title('Age Distribution with Rug Plot')
# plt.xlabel('Age')
# plt.ylabel('Density')
# plt.savefig(f'{output_dir}/age_distribution_kde_rug.png')
# plt.close()










import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
import os
import json

# 저장할 디렉토리 생성
output_dir = "temp_static_vis_v2"
json_dir = os.path.join(output_dir, "json_data")
os.makedirs(output_dir, exist_ok=True)
os.makedirs(json_dir, exist_ok=True)

# CSV 파일 불러오기 추가
df = pd.read_csv('NUSPARV12-Demographic_DATA_2024-11-11_1357.csv')

# first drop any rows where demo_subject_id is null
df = df.dropna(subset=['demo_subject_id'])

# Categorical columns 정의
categorical_columns = {
    'demo_gender_identity': 'Gender Identity Distribution',
    'demo_legal_sex': 'Legal Sex Distribution',
    'demo_sexual_orientation': 'Sexual Orientation Distribution',
    'demo_marital_status': 'Marital Status Distribution',
    'demo_veteran_status': 'Veteran Status Distribution',
    'demo_race': 'Race Distribution',
    'demo_ethnicity': 'Ethnicity Distribution',
    'demo_languages': 'Languages Distribution',
    'demo_need_interpreter': 'Need for Interpreter Distribution',
    'demo_religion': 'Religion Distribution',
    'demo_state': 'State Distribution',
    'demo_country': 'Country Distribution',
    'demo_city': 'City Distribution',
    'demo_occupation': 'Occupation Distribution'
}

# 연속형/날짜형 변수 정의
continuous_date_columns = ['demo_dob']

# categorical columns에 대해서만 'Unknown' 처리
for column in categorical_columns.keys():
    df[column] = df[column].fillna('Unknown')

def create_distribution_plots(df, column, title, rotation=45, figsize=(15, 6), top_n=None):
    """
    주어진 열에 대해 카운트플롯과 파이차트를 생성하는 함수
    """
    # 데이터 준비
    if top_n:
        value_counts = df[column].value_counts().head(top_n)
        other_count = df[column].value_counts()[top_n:].sum()
        if other_count > 0:
            value_counts['Others'] = other_count
    else:
        value_counts = df[column].value_counts()
    
    # 전체 비율 계산
    total = value_counts.sum()
    percentages = value_counts / total * 100
    
    # JSON 데이터 생성
    json_data = {
        'title': title,
        'data': [
            {
                'category': str(category),
                'count': int(count),
                'percentage': float(percentage)
            }
            for category, count, percentage in zip(value_counts.index, value_counts.values, percentages)
        ]
    }
    
    # JSON 파일 저장
    with open(f'{json_dir}/{column}_distribution.json', 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    # 서브플롯 생성
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)
    fig.suptitle(title, fontsize=16, y=1.05)

    # 카운트플롯
    sns.barplot(x=value_counts.index, y=value_counts.values, ax=ax1)
    ax1.set_xticklabels(ax1.get_xticklabels(), rotation=rotation)
    ax1.set_title('Count Distribution')
    ax1.set_ylabel('Count')

    # 파이차트
    wedges, texts, autotexts = ax2.pie(percentages, 
                                      labels=value_counts.index,
                                      autopct='%1.1f%%',
                                      textprops={'fontsize': 8})
    ax2.set_title('Percentage Distribution')

    # 범례 추가 (파이차트가 복잡한 경우)
    if len(value_counts) > 5:
        ax2.legend(wedges, value_counts.index,
                  title="Categories",
                  loc="center left",
                  bbox_to_anchor=(1, 0, 0.5, 1))

    plt.tight_layout()
    plt.savefig(f'{output_dir}/{column}_distribution.png', bbox_inches='tight')
    plt.close()

# Categorical 변수들에 대해 시각화 생성 (city와 occupation 제외)
for column, title in categorical_columns.items():
    if column not in ['demo_city', 'demo_occupation']:
        create_distribution_plots(df, column, title)

# 도시와 직업은 상위 20개만 표시
create_distribution_plots(df, 'demo_city', 'City Distribution', top_n=20, figsize=(20, 8))
create_distribution_plots(df, 'demo_occupation', 'Occupation Distribution', top_n=20, figsize=(20, 8))

# 연령 분포 시각화를 위한 날짜 처리
df['demo_dob'] = pd.to_datetime(df['demo_dob'], errors='coerce')
df['demo_age'] = df['demo_dob'].apply(lambda dob: datetime.now().year - dob.year if pd.notnull(dob) else None)

# 연령 데이터 JSON으로 저장
age_data = df['demo_age'].dropna().tolist()
age_json = {
    'title': 'Age Distribution',
    'data': [float(age) for age in age_data]
}
with open(f'{json_dir}/age_distribution.json', 'w') as f:
    json.dump(age_json, f, indent=2)

# 연령 분포 시각화 (4가지 방법)
# 1. 히스토그램과 KDE
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

# 3. 박스플롯과 스트립 플롯
plt.figure(figsize=(10, 6))
sns.boxplot(data=df, y='demo_age', color='lightgray')
sns.stripplot(data=df, y='demo_age', color='blue', alpha=0.3, size=4)
plt.title('Age Distribution (Box Plot with Strip Plot)')
plt.ylabel('Age')
plt.savefig(f'{output_dir}/age_distribution_box_strip.png')
plt.close()

# 4. 러그 플롯이 있는 KDE
plt.figure(figsize=(12, 6))
sns.kdeplot(data=df, x='demo_age', fill=True)
sns.rugplot(data=df, x='demo_age', alpha=0.2)
plt.title('Age Distribution with Rug Plot')
plt.xlabel('Age')
plt.ylabel('Density')
plt.savefig(f'{output_dir}/age_distribution_kde_rug.png')
plt.close()