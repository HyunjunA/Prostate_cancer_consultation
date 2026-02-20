# ===== Step 2: AI 문장 재작성 이력 생성 =====

import pandas as pd
import random
import os

# ===== 경로 설정 =====
base_dir = os.path.dirname(os.path.abspath(__file__))
input_path = os.path.join(base_dir, "docter_interface_render_processed.csv")
output_path = os.path.join(base_dir, "docter_interface_ai_rewriting_history.csv")

print("📂 현재 경로:", base_dir)

# ===== Step 1. CSV 읽기 =====
df = pd.read_csv(input_path, encoding="utf-8-sig")

# ===== Step 2. 컬럼 이름 변경 및 복사 =====
df = df.rename(columns={"sentences": "original_sentence"})
df["revised_sentence"] = df["original_sentence"]
df["original_score"] = df["score"]  # 👈 추가!

# ===== Step 3. class = -1 제거 =====
df = df[df["class"] != -1].copy()

# ===== Step 4. 각 (file, class) 그룹에서 하나의 행만 랜덤 선택 =====
selected_rows = (
    df.groupby(["file", "class"], group_keys=False)
      .apply(lambda x: x.sample(n=1, random_state=random.randint(0, 99999)))
      .reset_index(drop=True)
)

# ===== Step 5. 선택된 행만 남기고 selected=True =====
selected_rows["selected"] = True

# ===== Step 6. 컬럼 순서 정리 =====
ordered_columns = [
    "file",
    "i",
    "i2",
    "speaker",
    "time",
    "original_sentence",
    "original_score",
    "revised_sentence",
    "score",
    "class",
    "selected"
]
selected_rows = selected_rows[ordered_columns]

# ===== Step 7. 결과 저장 =====
selected_rows.to_csv(output_path, index=False, encoding="utf-8-sig")

print(f"✅ 완료! {len(selected_rows)}개의 행이 선택되어 저장되었습니다.")
print(f"📄 결과 파일: {output_path}")
print("📊 결과 예시:")
print(selected_rows.head(10))