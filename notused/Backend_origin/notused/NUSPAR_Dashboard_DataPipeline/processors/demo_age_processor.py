
from datetime import datetime
import pandas as pd
from .base_processor import BaseProcessor  # Assuming BaseProcessor is in the same directory

class AgeProcessor(BaseProcessor):
    # def calculate_age(self, dob_column='demo_dob'):
    #     now = datetime.now()
    #     self.df[dob_column] = pd.to_datetime(self.df[dob_column], errors='coerce')
    #     self.df['age'] = self.df[dob_column].apply(
    #         lambda dob: now.year - dob.year if pd.notnull(dob) else None
    #     )


    def calculate_age(self, dob_column='demo_dob'):
        now = datetime.now()


        def parse_date(date_str):
            formats = ['%Y-%m-%d', '%m/%d/%Y', '%Y/%m/%d', '%d-%m-%Y', '%m-%d-%Y']
            for fmt in formats:
                try:
                    return datetime.strptime(date_str, fmt)
                except (ValueError, TypeError):
                    continue
            return pd.NaT

        
        # parse_date 함수 적용
        self.df[dob_column] = self.df[dob_column].apply(parse_date)
        
        # 나이 계산
        self.df['age'] = self.df[dob_column].apply(
            lambda dob: now.year - dob.year if pd.notnull(dob) else None
        )

    def get_age_group(self, age):
        if pd.isna(age):
            return None
        if 20 <= age <= 34:
            return "20-34"
        elif 35 <= age <= 44:
            return "35-44"
        elif 45 <= age <= 54:
            return "45-54"
        elif 55 <= age <= 64:
            return "55-64"
        elif 65 <= age <= 74:
            return "65-74"
        elif 75 <= age :
            return "75+"

    def generate_distribution(self):
        self.df['age_group'] = self.df['age'].apply(self.get_age_group)
        age_groups = ["20-34", "35-44", "45-54", "55-64", "65-74", "75+"]
        distribution = {"ALL": self.get_group_counts(self.df, 'age_group', age_groups)}

        for org in self.df['organization'].unique():
            if org != 'Unknown':
                org_df = self.df[self.df['organization'] == org]
                distribution[org] = self.get_group_counts(org_df, 'age_group', age_groups)

        return distribution

    def get_group_counts(self, df, column, categories):
        counts = df[column].value_counts()
        total = counts.sum()
        return [
            {
                "category": category,
                "count": int(counts.get(category, 0)),
                "percentage": round((counts.get(category, 0) / total) * 100, 1) if total else 0
            } for category in categories
        ]
