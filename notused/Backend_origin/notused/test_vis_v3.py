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










# import pandas as pd
# import matplotlib.pyplot as plt
# import seaborn as sns
# from datetime import datetime
# import os
# import json

# # 저장할 디렉토리 생성
# output_dir = "temp_static_vis_v2"
# json_dir = os.path.join(output_dir, "json_data")
# os.makedirs(output_dir, exist_ok=True)
# os.makedirs(json_dir, exist_ok=True)

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

# #  all columns
# print(df.columns)




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
    
#     # JSON 데이터 생성
#     json_data = {
#         'title': title,
#         'data': [
#             {
#                 'category': str(category),
#                 'count': int(count),
#                 'percentage': float(percentage)
#             }
#             for category, count, percentage in zip(value_counts.index, value_counts.values, percentages)
#         ]
#     }
    
#     # JSON 파일 저장
#     with open(f'{json_dir}/{column}_distribution.json', 'w', encoding='utf-8') as f:
#         json.dump(json_data, f, ensure_ascii=False, indent=2)

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
# # df['demo_dob'] = pd.to_datetime(df['demo_dob'], errors='coerce')
# df['demo_dob'] = pd.to_datetime(df['demo_dob'], format='mixed').dt.strftime('%Y-%m-%d')

# # df['demo_age'] = df['demo_dob'].apply(lambda dob: datetime.now().year - dob.year if pd.notnull(dob) else None)

# # 나이 계산 함수
# def calculate_age(birth_date):
#     birth_date = datetime.strptime(birth_date, '%Y-%m-%d')
#     today = datetime.today()
#     age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
#     return age

# # 나이 계산 및 추가
# df['demo_age'] = df['demo_dob'].apply(calculate_age)


# # 연령 데이터 JSON으로 저장
# age_data = df['demo_age'].dropna().tolist()
# age_json = {
#     'title': 'Age Distribution',
#     'data': [float(age) for age in age_data]
# }


# # ['patient_record_id', 'redcap_event_name', 'redcap_repeat_instrument',
# #        'redcap_repeat_instance', 'demo_subject_id', 'demo_dob',
# #        'demo_gender_identity', 'demo_legal_sex', 'demo_sexual_orientation',
# #        'demo_marital_status', 'demo_veteran_status', 'demo_race',
# #        'demo_ethnicity', 'demo_languages', 'demo_need_interpreter',
# #        'demo_religion', 'demo_address', 'demo_city', 'demo_state', 'demo_zip',
# #        'demo_county', 'demo_country', 'demo_preferred_phone',
# #        'demo_occupation', 'demo_employer', 'demographics_complete']


# # demo_age and demo_marital_status
# # demo_age 

# print(df)



# with open(f'{json_dir}/age_distribution.json', 'w') as f:
#     json.dump(age_json, f, indent=2)

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

# categorical columns에 대해서만 'Unknown' 처리
for column in categorical_columns.keys():
    df[column] = df[column].fillna('Unknown')

def save_json_data(column, title, value_counts, percentages):
    """
    JSON 데이터 저장 함수
    """
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
    with open(f'{json_dir}/{column}_distribution.json', 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

def save_image_data(column, title, value_counts, percentages, rotation=45, figsize=(15, 6)):
    """
    시각화 이미지를 저장하는 함수
    """
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

def create_distribution_plots(df, column, title, rotation=45, figsize=(15, 6), top_n=None):
    """
    주어진 열에 대해 JSON 데이터와 이미지 데이터를 각각 저장하는 함수
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

    # JSON 저장
    save_json_data(column, title, value_counts, percentages)

    # 이미지 저장
    save_image_data(column, title, value_counts, percentages, rotation, figsize)

# Categorical 변수들에 대해 시각화 생성 (city와 occupation 제외)
for column, title in categorical_columns.items():
    if column not in ['demo_city', 'demo_occupation']:
        create_distribution_plots(df, column, title)

# 도시와 직업은 상위 20개만 표시
create_distribution_plots(df, 'demo_city', 'City Distribution', top_n=20, figsize=(20, 8))
create_distribution_plots(df, 'demo_occupation', 'Occupation Distribution', top_n=20, figsize=(20, 8))

# 연령 분포 시각화를 위한 데이터 처리
df['demo_dob'] = pd.to_datetime(df['demo_dob'], format='mixed', errors='coerce').dt.strftime('%Y-%m-%d')

def calculate_age(birth_date):
    """
    나이를 계산하는 함수
    """
    if pd.isnull(birth_date):
        return None
    birth_date = datetime.strptime(birth_date, '%Y-%m-%d')
    today = datetime.today()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    return age

df['demo_age'] = df['demo_dob'].apply(calculate_age)

# 연령 데이터 JSON 저장
age_data = df['demo_age'].dropna().tolist()
age_json = {
    'title': 'Age Distribution',
    'data': [float(age) for age in age_data]
}
with open(f'{json_dir}/age_distribution.json', 'w') as f:
    json.dump(age_json, f, indent=2)

# 연령 분포 이미지 저장
def save_age_plots():
    """
    연령 분포 이미지 생성 및 저장
    """
    # 히스토그램과 KDE
    plt.figure(figsize=(12, 8))
    sns.histplot(data=df, x='demo_age', bins=30, stat='density', alpha=0.5)
    sns.kdeplot(data=df, x='demo_age', color='red', linewidth=2)
    plt.title('Age Distribution with Density Estimation')
    plt.xlabel('Age')
    plt.ylabel('Density')
    plt.savefig(f'{output_dir}/age_distribution_histogram_kde.png')
    plt.close()

    # 바이올린 플롯
    plt.figure(figsize=(10, 6))
    sns.violinplot(data=df, y='demo_age', orient='v')
    plt.title('Age Distribution (Violin Plot)')
    plt.ylabel('Age')
    plt.savefig(f'{output_dir}/age_distribution_violin.png')
    plt.close()

    # 박스플롯과 스트립 플롯
    plt.figure(figsize=(10, 6))
    sns.boxplot(data=df, y='demo_age', color='lightgray')
    sns.stripplot(data=df, y='demo_age', color='blue', alpha=0.3, size=4)
    plt.title('Age Distribution (Box Plot with Strip Plot)')
    plt.ylabel('Age')
    plt.savefig(f'{output_dir}/age_distribution_box_strip.png')
    plt.close()

    # 러그 플롯이 있는 KDE
    plt.figure(figsize=(12, 6))
    sns.kdeplot(data=df, x='demo_age', fill=True)
    sns.rugplot(data=df, x='demo_age', alpha=0.2)
    plt.title('Age Distribution with Rug Plot')
    plt.xlabel('Age')
    plt.ylabel('Density')
    plt.savefig(f'{output_dir}/age_distribution_kde_rug.png')
    plt.close()

save_age_plots()



# drop patient_record_id, redcap_event_name, redcap_repeat_instrument, redcap_repeat_instance, demo_subject_id, demo_preferred_phone, demo_address, demo_zip, demographics_complete from df
df = df.drop(['patient_record_id', 'redcap_event_name', 'redcap_repeat_instrument', 'redcap_repeat_instance', 'demo_subject_id', 'demo_preferred_phone', 'demo_address', 'demo_zip', 'demographics_complete'], axis=1)


# stacked bar chart for age and marital status
age_bins = pd.cut(df['demo_age'], bins=[20, 40, 60, 80, 100], labels=["20-40", "40-60", "60-80", "80-100"])
age_marital_count = df.groupby([age_bins, 'demo_marital_status']).size().unstack().fillna(0)

# Reformatting the data to a list of dictionaries for a stacked bar chart
stacked_bar_data = [
    {
        "age_group": age_group,
        **{marital_status: int(count) for marital_status, count in counts.items()}
    }
    for age_group, counts in age_marital_count.iterrows()
]

# Save the data to a JSON file
with open(f'{json_dir}/age_marital_status_distribution.json', 'w') as f:
    json.dump(stacked_bar_data, f, indent=2)


# veteran and gender - 성별 기준으로 변경
veteran_gender_count = df.groupby(['demo_legal_sex', 'demo_veteran_status']).size().unstack().fillna(0)

veteran_gender_data = [
    {
        "demo_legal_sex": gender,
        **{veteran_status: int(count) for veteran_status, count in counts.items()}
    }
    for gender, counts in veteran_gender_count.iterrows()
]

with open(f'{json_dir}/veteran_gender_distribution.json', 'w') as f:
    json.dump(veteran_gender_data, f, indent=2)


# race and religion
race_religion_count = df.groupby(['demo_race', 'demo_religion']).size().unstack().fillna(0)

# Reformatting the data to a list of dictionaries for a stacked bar chart
race_religion_data = [
    {
        "race": race,
        **{religion: int(count) for religion, count in counts.items()}
    }
    for race, counts in race_religion_count.iterrows()
]

with open(f'{json_dir}/race_religion_distribution.json', 'w') as f:
    json.dump(race_religion_data, f, indent=2)


# state and race
state_race_count = df.groupby(['demo_state', 'demo_race']).size().unstack().fillna(0)

state_race_data = [
    {
        "state": state,
        **{race: int(count) for race, count in counts.items()}
    }
    for state, counts in state_race_count.iterrows()
]

with open(f'{json_dir}/state_race_distribution.json', 'w') as f:
    json.dump(state_race_data, f, indent=2)


# save df to csv
df.to_csv('temp_static_vis_v2/processed_NUSPARV12-Demographic_DATA_2024-11-11_1357.csv', index=False)