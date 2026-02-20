import pandas as pd
import random
import os

# ===== 경로 설정 =====
base_dir = os.path.dirname(os.path.abspath(__file__))
input_path = os.path.join(base_dir, "Patient_interface_class_summary.csv")
output_path = os.path.join(base_dir, "Patient_interface_questions_responses.csv")

# ===== Step 1. CSV 읽기 =====
df = pd.read_csv(input_path, encoding="utf-8-sig")

# ===== Step 2. 가능한 응답 템플릿 정의 =====
possible_answers = [
    "I understand the doctor’s explanation well.",
    "I feel more confident about my condition now.",
    "The summary was clear and easy to understand.",
    "I want to know more about treatment options.",
    "I plan to follow the doctor’s recommendation.",
    "I appreciate the detailed explanation.",
    "I still have some questions about the diagnosis.",
    "I agree with the proposed plan.",
    "I would like to receive a follow-up message soon.",
    "The conversation helped me feel reassured."
]

# ===== Step 3. 각 환자(file)별로 임의 응답 생성 =====
responses = []
for _, row in df.iterrows():
    record = {
        "file": row["file"],
        "Speaker": row["Speaker"]
    }

    # 5개의 임의 응답 선택
    selected_answers = random.sample(possible_answers, 5)
    for i, ans in enumerate(selected_answers, start=1):
        record[f"Answer_{i}"] = ans

    responses.append(record)

# ===== Step 4. DataFrame 저장 =====
responses_df = pd.DataFrame(responses)
responses_df.to_csv(output_path, index=False, encoding="utf-8-sig")

print(f"✅ 완료! '{output_path}' 파일이 생성되었습니다.")
print("📊 예시:")
print(responses_df.head(3))