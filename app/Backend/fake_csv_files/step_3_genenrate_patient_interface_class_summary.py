
# # ===== Patient_interface_class_summary.csv 생성 =====



# import pandas as pd
# import os

# # ===== 경로 설정 =====
# base_dir = os.path.dirname(os.path.abspath(__file__))
# input_path = os.path.join(base_dir, "docter_interface_ai_rewriting_history.csv")
# output_path = os.path.join(base_dir, "Patient_interface_class_summary.csv")

# # ===== Step 1. CSV 읽기 =====
# df = pd.read_csv(input_path, encoding="utf-8-sig")

# # ===== Step 2. selected=True 행만 사용 =====
# df = df[df["selected"] == True].copy()

# # ===== Step 3. class별로 문장 요약 생성 =====
# summaries = []
# for file_name, group in df.groupby("file"):
#     # file별 전체 문장 요약
#     entire_summary = " ".join(group["revised_sentence"].astype(str).tolist())

#     # class별 요약 생성
#     class_summaries = {}
#     for cls, subgrp in group.groupby("class"):
#         class_summaries[f"Class_{cls}"] = cls
#         class_summaries[f"Summary_class_{cls}"] = " ".join(subgrp["revised_sentence"].astype(str).tolist())

#     # 병합용 딕셔너리
#     entry = {"file": file_name, "Speaker": "Patient_" + file_name.split(".")[0], "Entire_summary": entire_summary}
#     entry.update(class_summaries)
#     summaries.append(entry)

# # ===== Step 4. DataFrame 생성 =====
# result_df = pd.DataFrame(summaries)

# # ===== Step 5. 저장 =====
# result_df.to_csv(output_path, index=False, encoding="utf-8-sig")

# print(f"✅ 완료! 파일 생성됨: {output_path}")
# print(result_df.head(3))




# ===== Generate Patient_interface_class_summary.csv =====
import pandas as pd
import os

# ===== Path configuration =====
base_dir = os.path.dirname(os.path.abspath(__file__))
input_path = os.path.join(base_dir, "docter_interface_ai_rewriting_history.csv")
output_path = os.path.join(base_dir, "Patient_interface_class_summary.csv")

# ===== Step 1. Read CSV =====
df = pd.read_csv(input_path, encoding="utf-8-sig")

# ===== Step 2. Use only rows where selected=True =====
df = df[df["selected"] == True].copy()

# ===== Step 3. Generate summaries by class =====
summaries = []

for file_name, group in df.groupby("file"):
    # Generate class-level summaries first
    class_summaries = {}
    class_summary_texts = []  # List for building Entire_summary
    
    for cls, subgrp in group.groupby("class"):
        summary_text = " ".join(subgrp["revised_sentence"].astype(str).tolist())
        class_summaries[f"Class_{cls}"] = cls
        class_summaries[f"Summary_class_{cls}"] = summary_text
        class_summary_texts.append(summary_text)
    
    # Combine class summaries to create Entire_summary
    entire_summary = " ".join(class_summary_texts)
    
    # Dictionary for merging
    entry = {"file": file_name, "Speaker": "Patient_" + file_name.split(".")[0], "Entire_summary": entire_summary}
    entry.update(class_summaries)
    summaries.append(entry)

# ===== Step 4. Create DataFrame =====
result_df = pd.DataFrame(summaries)

# ===== Step 5. Save results =====
result_df.to_csv(output_path, index=False, encoding="utf-8-sig")

print(f"✅ Done! File created: {output_path}")
print(result_df.head(3))