# import pandas as pd
# import random
# from datetime import datetime, timedelta
# import os

# # ===== 절대경로 기반으로 CSV 로드 =====
# base_dir = os.path.dirname(os.path.abspath(__file__))
# csv_path = os.path.join(base_dir, "docter_interface_render.csv")

# print("📂 현재 스크립트 경로:", base_dir)
# print("📄 CSV 경로:", csv_path)

# if not os.path.exists(csv_path):
#     raise FileNotFoundError(f"❌ CSV 파일을 찾을 수 없습니다: {csv_path}")

# # ===== Step 1. CSV 읽기 (Mac에서 생성된 파일 대비) =====
# # Mac Excel, Numbers, TextEdit 등에서 만든 CSV는 대부분 Latin1(ISO-8859-1)
# df = pd.read_csv(csv_path, encoding="latin1")
# print("✅ CSV 파일 읽기 성공 (latin1 인코딩 사용)")

# # ===== Step 2. class 컬럼 생성 =====
# # score가 0이 아니면 [1~5] 중 랜덤 부여, 0이면 -1
# df["class"] = df["score"].apply(lambda x: random.choice([1, 2, 3, 4, 5]) if x != 0 else -1)

# # ===== Step 3. time 컬럼 생성 =====
# # 시작 시간을 임의로 지정 (순차 증가)
# start_time = datetime(2025, 1, 1, 9, 0, 0)
# df["time"] = [start_time + timedelta(minutes=i) for i in range(len(df))]

# # ===== Step 4. 결과 저장 =====
# output_path = os.path.join(base_dir, "docter_interface_render_processed.csv")
# df.to_csv(output_path, index=False, encoding="utf-8-sig")

# print(f"✅ 완료! 처리된 CSV가 저장되었습니다: {output_path}")
# print("📊 결과 예시:")
# print(df.head(5))




import pandas as pd
import random
from datetime import datetime, timedelta
import os

# ===== Load CSV based on absolute path =====
base_dir = os.path.dirname(os.path.abspath(__file__))
csv_path = os.path.join(base_dir, "docter_interface_render.csv")

print("📂 Current script path:", base_dir)
print("📄 CSV path:", csv_path)

if not os.path.exists(csv_path):
    raise FileNotFoundError(f"❌ CSV file not found: {csv_path}")

# ===== Step 1. Read CSV =====
df = pd.read_csv(csv_path, encoding="latin1")
print("✅ CSV file loaded successfully (using latin1 encoding)")

# ===== Step 2. Create class column (ensure at least one of each 1~5 per file) =====
df["class"] = -1  # Initialize with default value

for file_name in df["file"].unique():
    # Get indices of rows where file matches and score != 0
    mask = (df["file"] == file_name) & (df["score"] != 0)
    indices = df[mask].index.tolist()
    
    if len(indices) == 0:
        continue
    
    if len(indices) >= 5:
        # If 5 or more rows: assign 1,2,3,4,5 first, then random for the rest
        random.shuffle(indices)
        mandatory_classes = [1, 2, 3, 4, 5]
        
        for i, cls in enumerate(mandatory_classes):
            df.loc[indices[i], "class"] = cls
        
        for idx in indices[5:]:
            df.loc[idx, "class"] = random.choice([1, 2, 3, 4, 5])
    else:
        # If fewer than 5 rows: assign as many unique classes as possible
        available_classes = random.sample([1, 2, 3, 4, 5], len(indices))
        for idx, cls in zip(indices, available_classes):
            df.loc[idx, "class"] = cls

# ===== Step 3. Create time column =====
start_time = datetime(2025, 1, 1, 9, 0, 0)
df["time"] = [start_time + timedelta(minutes=i) for i in range(len(df))]

# ===== Step 4. Save results =====
output_path = os.path.join(base_dir, "docter_interface_render_processed.csv")
df.to_csv(output_path, index=False, encoding="utf-8-sig")

print(f"✅ Done! Processed CSV saved to: {output_path}")
print("📊 Sample output:")
print(df.head(10))

# ===== Verification: Check class distribution per file =====
print("\n📈 Class distribution per file:")
for file_name in df["file"].unique():
    subset = df[(df["file"] == file_name) & (df["class"] != -1)]
    class_counts = subset["class"].value_counts().sort_index()
    print(f"  {file_name}: {class_counts.to_dict()}")