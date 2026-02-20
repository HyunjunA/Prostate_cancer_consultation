
# ===== Step 4: Patient Interface Class Summary 점수 매기기 =====

import pandas as pd
import random
import os

# ===== 경로 설정 =====
base_dir = os.path.dirname(os.path.abspath(__file__))
input_path = os.path.join(base_dir, "Patient_interface_class_summary.csv")
output_path = os.path.join(base_dir, "Patient_interface_class_summary_scoring.csv")

# ===== Step 1. CSV 읽기 =====
df = pd.read_csv(input_path, encoding="utf-8-sig")

# ===== Step 2. 결과 테이블 초기화 =====
scoring_records = []

# ===== Step 3. 각 행 반복 =====
for _, row in df.iterrows():
    record = {
        "file": row["file"],
        "Speaker": row["Speaker"]
    }

    # 각 Class_n / Summary_class_n 검사
    for n in range(1, 6):
        summary_col = f"Summary_class_{n}"
        scoring_col = f"Class_{n}_Patient_scoring"

        # Summary 존재 여부 확인
        if summary_col in row and pd.notna(row[summary_col]) and str(row[summary_col]).strip() != "":
            record[scoring_col] = random.randint(1, 5)  # ✅ 1~5 사이 점수
        else:
            record[scoring_col] = None  # summary가 없으면 빈칸

    scoring_records.append(record)

# ===== Step 4. DataFrame 생성 및 저장 =====
scoring_df = pd.DataFrame(scoring_records)
scoring_df.to_csv(output_path, index=False, encoding="utf-8-sig")

print(f"✅ 완료! '{output_path}' 파일이 생성되었습니다.")
print("📊 미리보기:")
print(scoring_df.head())