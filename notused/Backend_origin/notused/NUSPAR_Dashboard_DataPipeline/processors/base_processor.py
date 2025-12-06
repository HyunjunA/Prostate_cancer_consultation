import pandas as pd
import json
import re
import os
from datetime import datetime

class BaseProcessor:
    def __init__(self, csv_path, saving_path):
        self.csv_path = csv_path
        self.saving_path = saving_path
        self.df = pd.read_csv(csv_path)
        os.makedirs(self.saving_path, exist_ok=True)

    # def extract_organization(self, column='patient_record_id'):
    #     self.df['organization'] = self.df[column].apply(
    #         lambda x: re.sub(r'\d+', '', str(x)) if pd.notna(x) else 'Unknown'
    #     )

    def extract_organization(self, column='patient_record_id'):
        self.df['organization'] = self.df[column].apply(
            lambda x: 'CEDARS' if pd.notna(x) and str(x).startswith('CS') 
                    else (re.sub(r'\d+', '', str(x)) if pd.notna(x) else 'Unknown')
        )

    def save_json(self, data, filename):
        filepath = os.path.join(self.saving_path, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        print(f"Saved JSON: {filepath}")
