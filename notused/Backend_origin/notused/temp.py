import pandas as pd

# CSV 파일 경로
csv_file_path = 'Processed_Data_DB.csv'
# 출력 텍스트 파일 경로
output_txt_file_path = 'repositories.txt'
# 컬럼 이름
column_name = 'Repository'

# CSV 읽기
df = pd.read_csv(csv_file_path)

# Repository 컬럼에서 값 추출 -> set으로 변환해 중복 제거 -> 다시 list로 변환
repositories = list(set(df[column_name].dropna().astype(str)))

# 정렬 (선택 사항: 결과를 알파벳 순서로 보기 좋게 정렬)
repositories.sort()

# TXT 파일로 저장 (한 줄에 하나씩)
with open(output_txt_file_path, 'w', encoding='utf-8') as f:
    for repo in repositories:
        f.write(repo + '\n')

print(f"총 {len(repositories)}개의 고유 repository 이름을 {output_txt_file_path}에 저장했습니다.")
